const db = require('../db/connection');
const { getConfig } = require('../utils/configHelper');

// ============================================
// HELPER FUNCTIONS
// ============================================

// Generate unique group code
function generateGroupCode() {
    return 'GROUP' + Math.random().toString(36).substr(2, 6).toUpperCase();
}

// Check if user is eligible for loyalty discount
async function checkLoyaltyDiscount(userId, client) {
    // 从数据库获取老用户折扣率
    const loyaltyDiscountRate = await getConfig('loyalty_discount_rate', 0.05);
    const loyaltyPercentage = loyaltyDiscountRate * 100;  // 0.05 -> 5%

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
            percentage: loyaltyPercentage,
            completedCourses: count
        };
    }

    return { eligible: false };
}

// Create new enrollment group
async function createNewGroup(userId, client) {
    const groupCode = generateGroupCode();

    // 从数据库获取默认拼团配置
    const targetCount = await getConfig('default_group_target_count', 3);
    const discountRate = await getConfig('group_discount_rate', 0.1);
    const discountPercentage = discountRate * 100;  // 0.1 -> 10%

    const result = await client.query(
        `INSERT INTO enrollment_group
         (group_code, created_by_user, target_count, discount_type, discount_value, current_count)
         VALUES ($1, $2, $3, 'percentage', $4, 1)
         RETURNING *`,
        [groupCode, userId, targetCount, discountPercentage]
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
        'SELECT current_count, target_count, discount_value FROM enrollment_group WHERE groupid = $1',
        [groupId]
    );
    return result.rows[0] || { current_count: 0, target_count: 3, discount_value: 10 };
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
            "UPDATE enrollment_group SET status = 'completed' WHERE groupid = $1",
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
        const { sessionId, studentId, paymentMethod, groupCode, createGroup } = req.body;

        if (!sessionId || !studentId || !paymentMethod) {
            return res.status(400).json({ success: false, error: 'Session ID, Student ID, and Payment Method are required' });
        }

        const studentInfo = await client.query(
            'SELECT userid FROM student WHERE studentid = $1', [studentId]
        );
        if (studentInfo.rows.length === 0) {
            return res.status(404).json({ success: false, error: 'Student not found' });
        }
        const userId = studentInfo.rows[0].userid;

        await client.query('BEGIN');

        const sessionInfo = await client.query(
            `SELECT s.*, c.coursemaxenroll, c.courseprice, s.enrolledcount
             FROM session s JOIN course c ON s.courseid = c.courseid
             WHERE s.sessionid = $1`,
            [sessionId]
        );
        if (sessionInfo.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ success: false, error: 'Session not found' });
        }

        const { coursemaxenroll, courseprice, enrolledcount } = sessionInfo.rows[0];
        const originalPrice = parseFloat(courseprice);

        // Block duplicate: only check active/waitlisted with a PAID order
        // Also block if there's already a pending enrollment to prevent double-submits
        const duplicate = await client.query(
            `SELECT se.* FROM sessionenrollment se
             JOIN order_transaction ot ON se.orderid = ot.orderid
             WHERE se.studentid = $1 AND se.sessionid = $2
             AND se.enrollmentstatus IN ('active', 'waitlisted', 'pending')
             AND ot.orderstatus IN ('paid', 'pending')`,
            [studentId, sessionId]
        );
        if (duplicate.rows.length > 0) {
            await client.query('ROLLBACK');
            return res.status(400).json({ success: false, error: 'Student is already enrolled or has a pending order for this session' });
        }

        // Calculate discounts
        let totalDiscount = 0;
        let groupId = null;
        let newGroupCode = null;
        let loyaltyInfo = null;

        const loyalty = await checkLoyaltyDiscount(userId, client);
        if (loyalty.eligible) {
            totalDiscount += originalPrice * (loyalty.percentage / 100);
            loyaltyInfo = loyalty;
        }

        if (groupCode) {
            const group = await joinGroup(groupCode, client);
            groupId = group.groupid;
        } else if (createGroup) {
            const newGroup = await createNewGroup(userId, client);
            groupId = newGroup.groupid;
            newGroupCode = newGroup.group_code;
        }

        const finalPrice = originalPrice - totalDiscount;

        // Create order
        const order = await client.query(
            `INSERT INTO order_transaction (userid, ordertotal, discountamount, orderstatus, group_id)
             VALUES ($1, $2, $3, 'pending', $4) RETURNING *`,
            [userId, finalPrice, totalDiscount, groupId]
        );
        const orderId = order.rows[0].orderid;

        // ✅ FIX: enrollment starts as 'pending', NOT 'active'
        // enrolledcount is NOT incremented here — happens in confirmPayment
        const wouldBeWaitlisted = enrolledcount >= coursemaxenroll;
        const enrollment = await client.query(
            `INSERT INTO sessionenrollment (studentid, sessionid, orderid, enrollmentstatus, enrollmentdate)
             VALUES ($1, $2, $3, 'pending', NOW()) RETURNING *`,
            [studentId, sessionId, orderId]
            // 'pending' always — confirmPayment will resolve to 'active' or 'waitlisted'
        );

        const payment = await client.query(
            `INSERT INTO payment (orderid, paymentamount, paymentmethod, paymentstatus)
             VALUES ($1, $2, $3, 'pending') RETURNING *`,
            [orderId, finalPrice, paymentMethod]
        );

        await client.query('COMMIT');

        let groupInfo = null;
        if (groupId) {
            const groupData = await getGroupCount(groupId, client);
            const refundPerPerson = originalPrice * (groupData.discount_value / 100);
            groupInfo = {
                code: newGroupCode || groupCode,
                currentCount: groupData.current_count,
                targetCount: groupData.target_count,
                message: `已有${groupData.current_count}人，还需${groupData.target_count - groupData.current_count}人。完成后每人返¥${refundPerPerson.toFixed(0)}`
            };
        }

        res.status(201).json({
            success: true,
            data: {
                orderId,
                enrollmentId: enrollment.rows[0].enrollmentid,
                paymentId: payment.rows[0].paymentid,
                originalPrice,
                discountAmount: totalDiscount,
                finalPrice,
                loyaltyDiscount: loyaltyInfo,
                groupInfo,
                enrollmentStatus: 'pending',      // always pending until paid
                wouldBeWaitlisted                  // hint to UI: will be waitlisted after payment
            },
            message: 'Order created. Please complete payment.'
        });

    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Enrollment error:', error);
        res.status(500).json({ success: false, error: error.message });
    } finally {
        client.release();
    }
};

// ============================================
// PAYMENT CONFIRMATION
// ============================================
exports.confirmPayment = async (req, res) => {
    const client = await db.pool.connect();
    try {
        const { orderId, wechatTransactionId, outTradeNo } = req.body;

        if (!orderId) {
            return res.status(400).json({ success: false, error: 'Order ID is required' });
        }

        await client.query('BEGIN');

        // Lock the order row
        const orderCheck = await client.query(
            `SELECT ot.*, se.enrollmentid, se.sessionid, se.studentid
             FROM order_transaction ot
             JOIN sessionenrollment se ON se.orderid = ot.orderid
             WHERE ot.orderid = $1
             FOR UPDATE`,
            [orderId]
        );

        if (orderCheck.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ success: false, error: 'Order not found' });
        }

        const orderData = orderCheck.rows[0];

        if (orderData.orderstatus !== 'pending') {
            await client.query('ROLLBACK');
            return res.status(400).json({ success: false, error: `Order is already ${orderData.orderstatus}` });
        }

        // ✅ NOW check real-time capacity (re-read with lock)
        const sessionInfo = await client.query(
            `SELECT s.enrolledcount, c.coursemaxenroll
             FROM session s JOIN course c ON s.courseid = c.courseid
             WHERE s.sessionid = $1
             FOR UPDATE`,
            [orderData.sessionid]
        );
        const { enrolledcount, coursemaxenroll } = sessionInfo.rows[0];
        const finalStatus = enrolledcount < coursemaxenroll ? 'active' : 'waitlisted';

        // Confirm payment — store transaction_id and/or outTradeNo for reconciliation
        await client.query(
            `UPDATE payment SET paymentstatus = 'completed', paymentdate = NOW(),
             wechat_transaction_id = COALESCE($2, wechat_transaction_id),
             out_trade_no = COALESCE($3, out_trade_no)
             WHERE orderid = $1`,
            [orderId, wechatTransactionId || null, outTradeNo || null]
        );

        await client.query(
            `UPDATE order_transaction SET orderstatus = 'paid' WHERE orderid = $1`,
            [orderId]
        );

        // ✅ NOW set enrollment to active/waitlisted
        await client.query(
            `UPDATE sessionenrollment SET enrollmentstatus = $1 WHERE orderid = $2`,
            [finalStatus, orderId]
        );

        // ✅ NOW increment enrolledcount (only for active, not waitlisted)
        if (finalStatus === 'active') {
            await client.query(
                'UPDATE session SET enrolledcount = enrolledcount + 1 WHERE sessionid = $1',
                [orderData.sessionid]
            );
        }

        // Handle group discount check
        if (orderData.group_id) {
            await checkAndProcessGroupDiscount(orderData.group_id, client);
        }

        await client.query('COMMIT');

        res.json({
            success: true,
            message: 'Payment confirmed successfully',
            data: { enrollmentStatus: finalStatus }
        });

    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Payment confirmation error:', error);
        res.status(500).json({ success: false, error: error.message });
    } finally {
        client.release();
    }
};

// ============================================
// WITHDRAW ENROLLMENT
// ============================================
exports.withdrawEnrollment = async (req, res) => {
    const client = await db.pool.connect();

    try {
        const { enrollmentId } = req.params;
        const { reason } = req.body;

        // 从数据库获取退款截止天数
        const REFUND_DEADLINE_DAYS = await getConfig('refund_deadline_days', 7);

        await client.query('BEGIN');

        const enrollment = await client.query(`
            SELECT se.*,
                   ot.orderstatus, ot.ordertotal, ot.orderid,
                   p.paymentid, p.paymentamount, p.wechat_transaction_id, p.out_trade_no,
                   s.sessionstartdate
            FROM sessionenrollment se
            LEFT JOIN order_transaction ot ON se.orderid = ot.orderid
            LEFT JOIN payment p ON ot.orderid = p.orderid
            LEFT JOIN session s ON se.sessionid = s.sessionid
            WHERE se.enrollmentid = $1
        `, [enrollmentId]);

        if (enrollment.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({
                success: false,
                error: 'Enrollment not found'
            });
        }

        const data = enrollment.rows[0];
        const wasPaid = data.orderstatus === 'paid' || data.orderstatus === 'completed';

        let canRefund = false;
        let daysUntilStart = null;

        if (data.sessionstartdate) {
            const startDate = new Date(data.sessionstartdate);
            const now = new Date();
            daysUntilStart = Math.ceil((startDate - now) / (1000 * 60 * 60 * 24));
            canRefund = daysUntilStart >= REFUND_DEADLINE_DAYS;
        } else {
            canRefund = true;
        }

        await client.query(
            `UPDATE sessionenrollment
             SET enrollmentstatus = 'withdrawn'
             WHERE enrollmentid = $1`,
            [enrollmentId]
        );

        let refundId = null;
        let needRefund = false;
        let refundAmount = 0;
        let totalAmount = 0;
        let message = '取消成功';

        if (data.orderid) {
            if (wasPaid && canRefund) {
                refundAmount = parseFloat(data.paymentamount || data.ordertotal);
                totalAmount = parseFloat(data.ordertotal);
                needRefund = true;

                if (data.paymentid) {
                    const refundResult = await client.query(
                        `INSERT INTO refund (payment_id, refund_amount, refund_reason, refund_status, created_at)
                         VALUES ($1, $2, $3, 'processing', CURRENT_TIMESTAMP)
                         RETURNING refundid`,
                        [data.paymentid, refundAmount, reason || '用户取消报名']
                    );
                    refundId = refundResult.rows[0].refundid;
                }

                await client.query(
                    `UPDATE order_transaction
                     SET orderstatus = 'refund_processing'
                     WHERE orderid = $1`,
                    [data.orderid]
                );

                message = `取消成功，退款 ¥${refundAmount.toFixed(2)} 处理中`;

            } else if (wasPaid && !canRefund) {
                await client.query(
                    `UPDATE order_transaction
                     SET orderstatus = 'cancelled_no_refund'
                     WHERE orderid = $1`,
                    [data.orderid]
                );
                message = `取消成功，已超过退款期限（开课前${REFUND_DEADLINE_DAYS}天），无法退款`;

            } else {
                await client.query(
                    `UPDATE order_transaction
                     SET orderstatus = 'cancelled'
                     WHERE orderid = $1`,
                    [data.orderid]
                );
            }
        }

        await client.query(
            `UPDATE session
             SET enrolledcount = GREATEST(enrolledcount - 1, 0)
             WHERE sessionid = $1`,
            [data.sessionid]
        );

        await client.query('COMMIT');

        res.json({
            success: true,
            message: message,
            data: {
                needRefund: needRefund,
                refundId: refundId,
                refundAmount: refundAmount,
                totalAmount: totalAmount,
                wechatTransactionId: data.wechat_transaction_id,
                outTradeNo: data.out_trade_no,
                daysUntilStart: daysUntilStart,
                refundDeadlineDays: REFUND_DEADLINE_DAYS
            }
        });

    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Withdraw enrollment error:', error);
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