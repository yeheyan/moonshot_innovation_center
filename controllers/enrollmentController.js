const db = require('../db/connection');

const WITHDRAWAL_DEADLINE_DAYS = process.env.WITHDRAWAL_DEADLINE_DAYS || 7;

// ============================================
// HELPER FUNCTIONS
// ============================================

// Generate unique group code
function generateGroupCode() {
    return 'GROUP' + Math.random().toString(36).substr(2, 6).toUpperCase();
}

// Check if user is eligible for loyalty discount
async function checkLoyaltyDiscount(userId, client) {
    const result = await client.query(
        `SELECT COUNT(DISTINCT se.sessionid) as completed_count
     FROM sessionenrollment se
     JOIN order_transaction ot ON se.orderid = ot.orderid
     WHERE ot.userid = $1
     AND ot.orderstatus = 'paid'`,
        [userId]
    );

    const count = parseInt(result.rows[0].completed_count);

    if (count >= 1) {
        return {
            eligible: true,
            percentage: 5,
            completedCourses: count
        };
    }

    return { eligible: false };
}

// Create new enrollment group
async function createNewGroup(userId, client) {
    const groupCode = generateGroupCode();

    const result = await client.query(
        `INSERT INTO enrollment_group
     (group_code, created_by_user, target_count, discount_type, discount_value, current_count)
     VALUES ($1, $2, 3, 'percentage', 10, 1)
     RETURNING *`,
        [groupCode, userId]
    );

    return result.rows[0];
}

// Join existing group
async function joinGroup(groupCode, client) {
    const group = await client.query(
        `SELECT * FROM enrollment_group
     WHERE group_code = $1
     AND status = 'active'
     AND (expires_at IS NULL OR expires_at > NOW())`,
        [groupCode.toUpperCase()]
    );

    if (group.rows.length === 0) {
        throw new Error('Invalid or expired group code');
    }

    const groupData = group.rows[0];

    if (groupData.current_count >= groupData.target_count) {
        throw new Error('Group is already full');
    }

    // Increment count
    await client.query(
        'UPDATE enrollment_group SET current_count = current_count + 1 WHERE groupid = $1',
        [groupData.groupid]
    );

    return groupData;
}

// Get current group member count
async function getGroupCount(groupId, client) {
    const result = await client.query(
        'SELECT current_count FROM enrollment_group WHERE groupid = $1',
        [groupId]
    );
    return result.rows[0]?.current_count || 0;
}

// Check if group is complete and process refunds
async function checkAndProcessGroupDiscount(groupId, client) {
    const paidCount = await client.query(
        `SELECT COUNT(*) FROM order_transaction
     WHERE group_id = $1 AND orderstatus = 'paid'`,
        [groupId]
    );

    const count = parseInt(paidCount.rows[0].count);

    const group = await client.query(
        'SELECT * FROM enrollment_group WHERE groupid = $1',
        [groupId]
    );

    if (group.rows.length === 0) return;

    const groupData = group.rows[0];

    // If target reached, create refund records
    if (count >= groupData.target_count && groupData.status === 'active') {
        const orders = await client.query(
            `SELECT ot.*, p.paymentid, p.paymentamount
       FROM order_transaction ot
       JOIN payment p ON ot.orderid = p.orderid
       WHERE ot.group_id = $1 AND ot.orderstatus = 'paid'`,
            [groupId]
        );

        // Calculate refund for each person
        for (const order of orders.rows) {
            let refundAmount;

            if (groupData.discount_type === 'percentage') {
                refundAmount = order.ordertotal * (groupData.discount_value / 100);
            } else {
                refundAmount = groupData.discount_value;
            }

            // Create refund record
            await client.query(
                `INSERT INTO refund (payment_id, refund_amount, refund_reason, refund_status)
         VALUES ($1, $2, 'group_discount', 'pending')`,
                [order.paymentid, refundAmount]
            );
        }

        // Mark group as completed
        await client.query(
            'UPDATE enrollment_group SET status = \'completed\' WHERE groupid = $1',
            [groupId]
        );

        console.log(`Group ${groupId} completed - refunds created for ${orders.rows.length} members`);
    }
}

// ============================================
// MAIN ENROLLMENT FUNCTION
// ============================================

exports.createEnrollment = async (req, res) => {
    const client = await db.pool.connect();

    try {
        const {
            sessionId,
            studentId,
            paymentMethod,
            groupCode,
            createGroup
        } = req.body;

        if (!sessionId || !studentId || !paymentMethod) {
            return res.status(400).json({
                success: false,
                error: 'Session ID, Student ID, and Payment Method are required'
            });
        }

        // Get userId from student
        const studentInfo = await client.query(
            'SELECT userid FROM student WHERE studentid = $1',
            [studentId]
        );

        if (studentInfo.rows.length === 0) {
            return res.status(404).json({
                success: false,
                error: 'Student not found'
            });
        }

        const userId = studentInfo.rows[0].userid;

        await client.query('BEGIN');

        // Get session and course info
        const sessionInfo = await client.query(
            `SELECT s.*, c.coursemaxenroll, c.courseprice, s.enrolledcount
       FROM session s
       JOIN course c ON s.courseid = c.courseid
       WHERE s.sessionid = $1`,
            [sessionId]
        );

        if (sessionInfo.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({
                success: false,
                error: 'Session not found'
            });
        }

        const { coursemaxenroll, courseprice, enrolledcount } = sessionInfo.rows[0];
        const originalPrice = parseFloat(courseprice);

        // Check duplicate enrollment
        const duplicate = await client.query(
            `SELECT * FROM sessionenrollment
       WHERE studentid = $1 AND sessionid = $2
       AND enrollmentstatus IN ('active', 'waitlisted')`,
            [studentId, sessionId]
        );

        if (duplicate.rows.length > 0) {
            await client.query('ROLLBACK');
            return res.status(400).json({
                success: false,
                error: 'Student is already enrolled in this session'
            });
        }

        // Calculate discounts
        let totalDiscount = 0;
        let groupId = null;
        let newGroupCode = null;
        let loyaltyInfo = null;

        // 1. Check loyalty discount (automatic for returning customers)
        const loyalty = await checkLoyaltyDiscount(userId, client);
        if (loyalty.eligible) {
            const loyaltyDiscount = originalPrice * (loyalty.percentage / 100);
            totalDiscount += loyaltyDiscount;
            loyaltyInfo = loyalty;
            console.log(`Loyalty discount applied: ${loyalty.percentage}% = ¥${loyaltyDiscount}`);
        }

        // 2. Handle group discount
        if (groupCode) {
            const group = await joinGroup(groupCode, client);
            groupId = group.groupid;
            console.log(`Joined group: ${groupCode}`);
        } else if (createGroup) {
            const newGroup = await createNewGroup(userId, client);
            groupId = newGroup.groupid;
            newGroupCode = newGroup.group_code;
            console.log(`Created new group: ${newGroupCode}`);
        }

        const finalPrice = originalPrice - totalDiscount;

        // Create order
        const order = await client.query(
            `INSERT INTO order_transaction
       (userid, ordertotal, discountamount, orderstatus, group_id)
       VALUES ($1, $2, $3, 'pending', $4)
       RETURNING *`,
            [userId, finalPrice, totalDiscount, groupId]
        );

        const orderId = order.rows[0].orderid;

        // Determine enrollment status
        const enrollmentStatus = enrolledcount < coursemaxenroll ? 'active' : 'waitlisted';

        // Create enrollment
        const enrollment = await client.query(
            `INSERT INTO sessionenrollment (studentid, sessionid, orderid, enrollmentstatus, enrollmentdate)
       VALUES ($1, $2, $3, $4, NOW())
       RETURNING *`,
            [studentId, sessionId, orderId, enrollmentStatus]
        );

        // Create payment record (pending until confirmed)
        const payment = await client.query(
            `INSERT INTO payment (orderid, paymentamount, paymentmethod, paymentstatus)
       VALUES ($1, $2, $3, 'pending')
       RETURNING *`,
            [orderId, finalPrice, paymentMethod]
        );

        // Update enrolled count if active
        if (enrollmentStatus === 'active') {
            await client.query(
                'UPDATE session SET enrolledcount = enrolledcount + 1 WHERE sessionid = $1',
                [sessionId]
            );
        }

        await client.query('COMMIT');

        // Prepare response with group info
        let groupInfo = null;
        if (groupId) {
            const currentCount = await getGroupCount(groupId, client);
            const refundPerPerson = originalPrice * 0.1;  // 10% refund when complete

            groupInfo = {
                code: newGroupCode || groupCode,
                currentCount: currentCount,
                targetCount: 3,
                message: `已有${currentCount}人，还需${3 - currentCount}人。完成后每人返¥${refundPerPerson.toFixed(0)}`
            };
        }

        res.status(201).json({
            success: true,
            data: {
                orderId: orderId,
                enrollmentId: enrollment.rows[0].enrollmentid,
                paymentId: payment.rows[0].paymentid,
                originalPrice: originalPrice,
                discountAmount: totalDiscount,
                finalPrice: finalPrice,
                loyaltyDiscount: loyaltyInfo,
                groupInfo: groupInfo,
                enrollmentStatus: enrollmentStatus
            },
            message: 'Order created successfully'
        });

    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Enrollment error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    } finally {
        client.release();
    }
};

// ============================================
// PAYMENT CONFIRMATION (After WeChat Pay Success)
// ============================================

exports.confirmPayment = async (req, res) => {
    const client = await db.pool.connect();

    try {
        const { orderId, wechatTransactionId } = req.body;

        if (!orderId) {
            return res.status(400).json({
                success: false,
                error: 'Order ID is required'
            });
        }

        await client.query('BEGIN');

        // Update payment status
        await client.query(
            `UPDATE payment
       SET paymentstatus = 'completed',
           paymentdate = NOW()
       WHERE orderid = $1`,
            [orderId]
        );

        // Update order status
        const orderResult = await client.query(
            `UPDATE order_transaction
       SET orderstatus = 'paid'
       WHERE orderid = $1
       RETURNING group_id`,
            [orderId]
        );

        const groupId = orderResult.rows[0]?.group_id;

        // If part of a group, check if group is complete
        if (groupId) {
            await checkAndProcessGroupDiscount(groupId, client);
        }

        await client.query('COMMIT');

        res.json({
            success: true,
            message: 'Payment confirmed successfully'
        });

    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Payment confirmation error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    } finally {
        client.release();
    }
};

// Withdraw from enrollment (with deadline check)
exports.withdrawEnrollment = async (req, res) => {
    const client = await db.pool.connect();

    try {
        const { enrollmentId } = req.params;

        await client.query('BEGIN');

        // Get enrollment info with session start date
        const enrollment = await client.query(
            `SELECT se.*, s.SessionStartDate, s.SessionName
       FROM SessionEnrollment se
       JOIN Session s ON se.SessionID = s.SessionID
       WHERE se.EnrollmentID = $1`,
            [enrollmentId]
        );

        if (enrollment.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({
                success: false,
                error: 'Enrollment not found'
            });
        }

        const { sessionid, enrollmentstatus, sessionstartdate, sessionname } = enrollment.rows[0];

        // Check if withdrawal is within deadline
        const now = new Date();
        const sessionStart = new Date(sessionstartdate);
        const daysUntilSession = Math.ceil((sessionStart - now) / (1000 * 60 * 60 * 24));

        if (daysUntilSession < WITHDRAWAL_DEADLINE_DAYS) {
            await client.query('ROLLBACK');
            return res.status(400).json({
                success: false,
                error: `Cannot withdraw from "${sessionname}". Withdrawal deadline is ${WITHDRAWAL_DEADLINE_DAYS} days before session start. Only ${daysUntilSession} days remaining.`
            });
        }

        // Update enrollment status to withdrawn
        await client.query(
            `UPDATE SessionEnrollment
       SET EnrollmentStatus = 'withdrawn'
       WHERE EnrollmentID = $1`,
            [enrollmentId]
        );

        // If student was active, decrease count and promote from waitlist
        if (enrollmentstatus === 'active') {
            await client.query(
                'UPDATE Session SET EnrolledCount = EnrolledCount - 1 WHERE SessionID = $1',
                [sessionid]
            );

            // Promote first waitlisted student
            const waitlisted = await client.query(
                `SELECT EnrollmentID FROM SessionEnrollment
         WHERE SessionID = $1 AND EnrollmentStatus = 'waitlisted'
         ORDER BY EnrollmentDate LIMIT 1`,
                [sessionid]
            );

            if (waitlisted.rows.length > 0) {
                await client.query(
                    `UPDATE SessionEnrollment
           SET EnrollmentStatus = 'active'
           WHERE EnrollmentID = $1`,
                    [waitlisted.rows[0].enrollmentid]
                );

                await client.query(
                    'UPDATE Session SET EnrolledCount = EnrolledCount + 1 WHERE SessionID = $1',
                    [sessionid]
                );
            }
        }

        await client.query('COMMIT');

        res.json({
            success: true,
            message: 'Successfully withdrawn from session'
        });

    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Withdrawal error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    } finally {
        client.release();
    }
};

// Get enrollment statistics
exports.getEnrollmentStats = async (req, res) => {
    try {
        const stats = await db.query(
            `SELECT
        COUNT(*) as total_enrollments,
        COUNT(*) FILTER (WHERE EnrollmentStatus = 'active') as active_enrollments,
        COUNT(*) FILTER (WHERE EnrollmentStatus = 'waitlisted') as waitlisted,
        COUNT(*) FILTER (WHERE EnrollmentStatus = 'withdrawn') as withdrawn,
        COUNT(DISTINCT StudentID) as unique_students,
        COUNT(DISTINCT SessionID) as sessions_with_enrollments
       FROM SessionEnrollment`
        );

        res.json({
            success: true,
            data: stats.rows[0]
        });

    } catch (error) {
        console.error('Stats error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
};
