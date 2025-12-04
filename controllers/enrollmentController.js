const db = require('../db/connection');

// Withdrawal deadline in days (configurable)
const WITHDRAWAL_DEADLINE_DAYS = process.env.WITHDRAWAL_DEADLINE_DAYS || 7;

// Create enrollment (enroll in a session)
exports.createEnrollment = async (req, res) => {
    const client = await db.pool.connect();

    try {
        const { sessionId, studentId, paymentMethod } = req.body;

        // Get userId from student
        const studentInfo = await client.query(
            'SELECT UserID FROM Student WHERE StudentID = $1',
            [studentId]
        );

        if (studentInfo.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({
                success: false,
                error: 'Student not found'
            });
        }

        const userId = studentInfo.rows[0].userid;

        await client.query('BEGIN');

        // Get course price
        const sessionInfo = await client.query(
            `SELECT s.*, c.CourseMaxEnroll, c.CoursePrice, s.EnrolledCount
       FROM Session s
       JOIN Course c ON s.CourseID = c.CourseID
       WHERE s.SessionID = $1`,
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

        // Check duplicate
        const duplicate = await client.query(
            `SELECT * FROM SessionEnrollment
       WHERE StudentID = $1 AND SessionID = $2
       AND EnrollmentStatus IN ('active', 'waitlisted')`,
            [studentId, sessionId]
        );

        if (duplicate.rows.length > 0) {
            await client.query('ROLLBACK');
            return res.status(400).json({
                success: false,
                error: 'Student is already enrolled in this session'
            });
        }

        // Create order
        const order = await client.query(
            `INSERT INTO Order_Transaction (UserID, OrderTotal, DiscountAmount, OrderStatus, orderdate)
 VALUES ($1, $2, 0, 'pending', NOW())
 RETURNING *`,
            [userId, courseprice]
        );

        const orderId = order.rows[0].orderid;

        // Determine enrollment status
        const enrollmentStatus = enrolledcount < coursemaxenroll ? 'active' : 'waitlisted';

        // Create enrollment with OrderID
        const enrollment = await client.query(
            `INSERT INTO SessionEnrollment (StudentID, SessionID, OrderID, EnrollmentStatus, EnrollmentDate)
       VALUES ($1, $2, $3, $4, NOW())
       RETURNING *`,
            [studentId, sessionId, orderId, enrollmentStatus]
        );

        // Generate mock transaction ID
        const transactionId = `TXN-${Date.now()}-${Math.random().toString(36).substr(2, 9).toUpperCase()}`;

        // Payment status based on method
        const paymentStatus = ['wechat', 'alipay'].includes(paymentMethod) ? 'completed' : 'pending';

        // Create payment
        const payment = await client.query(
            `INSERT INTO Payment (OrderID, PaymentAmount, PaymentMethod, PaymentStatus, PaymentDate)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
            [orderId, courseprice, paymentMethod, paymentStatus, paymentStatus === 'completed' ? new Date() : null]
        );

        // Update order status
        await client.query(
            `UPDATE Order_Transaction
       SET OrderStatus = $1
       WHERE OrderID = $2`,
            [paymentStatus === 'completed' ? 'paid' : 'pending', orderId]
        );

        // Update enrolled count if active
        if (enrollmentStatus === 'active') {
            await client.query(
                'UPDATE Session SET EnrolledCount = EnrolledCount + 1 WHERE SessionID = $1',
                [sessionId]
            );
        }

        await client.query('COMMIT');

        res.status(201).json({
            success: true,
            data: {
                enrollment: enrollment.rows[0],
                order: order.rows[0],
                payment: payment.rows[0],
                transactionId: transactionId
            },
            message: enrollmentStatus === 'active'
                ? `Successfully enrolled! Payment ${paymentStatus}.`
                : 'Added to waitlist'
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