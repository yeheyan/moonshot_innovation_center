const db = require('../db/connection');

// Create enrollment (enroll in a session)
exports.createEnrollment = async (req, res) => {
    const client = await db.pool.connect();

    try {
        const { sessionId, studentId } = req.body;

        // Validate input
        if (!sessionId || !studentId) {
            return res.status(400).json({
                success: false,
                error: 'Session ID and Student ID are required'
            });
        }

        await client.query('BEGIN');

        // Get session and course info
        const sessionInfo = await client.query(
            `SELECT s.*, c.CourseMaxEnroll, s.EnrolledCount
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

        const { coursemaxenroll, enrolledcount } = sessionInfo.rows[0];

        // Check for duplicate enrollment
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

        // Determine enrollment status
        const enrollmentStatus = enrolledcount < coursemaxenroll ? 'active' : 'waitlisted';

        // Create enrollment
        const enrollment = await client.query(
            `INSERT INTO SessionEnrollment (StudentID, SessionID, EnrollmentStatus, EnrollmentDate)
       VALUES ($1, $2, $3, NOW())
       RETURNING *`,
            [studentId, sessionId, enrollmentStatus]
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
            data: enrollment.rows[0],
            message: enrollmentStatus === 'active'
                ? 'Successfully enrolled in session'
                : 'Added to waitlist - session is full'
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

// Withdraw from enrollment
exports.withdrawEnrollment = async (req, res) => {
    const client = await db.pool.connect();

    try {
        const { enrollmentId } = req.params;

        await client.query('BEGIN');

        // Get enrollment info
        const enrollment = await client.query(
            'SELECT * FROM SessionEnrollment WHERE EnrollmentID = $1',
            [enrollmentId]
        );

        if (enrollment.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({
                success: false,
                error: 'Enrollment not found'
            });
        }

        const { sessionid, enrollmentstatus } = enrollment.rows[0];

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