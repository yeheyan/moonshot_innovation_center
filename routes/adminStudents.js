const express = require('express');
const router = express.Router();
const db = require('../db/connection');
const { verifyAdmin } = require('../middleware/adminAuth');

router.use(verifyAdmin);

// Get all students (admin only)
router.get('/students', async (req, res) => {
    try {
        const result = await db.query(
            `SELECT
        s.*,
        u.UserName as parent_name,
        u.UserPhone as parent_phone,
        COUNT(se.EnrollmentID) as enrollment_count
      FROM Student s
      LEFT JOIN User_Account u ON s.UserID = u.UserID
      LEFT JOIN SessionEnrollment se ON s.StudentID = se.StudentID AND se.EnrollmentStatus = 'active'
      GROUP BY s.StudentID, u.UserName, u.UserPhone
      ORDER BY s.created_at DESC`
        );

        res.json({
            success: true,
            count: result.rows.length,
            data: result.rows
        });
    } catch (error) {
        console.error('Error fetching students:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Get all parent accounts (admin only)
router.get('/users', async (req, res) => {
    try {
        const result = await db.query(
            `SELECT
        u.UserID,
        u.UserName,
        u.UserPhone,
        u.UserWechat,
        u.UserAddress,
        u.created_at,
        u.last_login,
        COUNT(DISTINCT s.StudentID) as student_count
      FROM User_Account u
      LEFT JOIN Student s ON u.UserID = s.UserID
      GROUP BY u.UserID
      ORDER BY u.created_at DESC`
        );

        res.json({
            success: true,
            count: result.rows.length,
            data: result.rows
        });
    } catch (error) {
        console.error('Error fetching users:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Get single user with their students
router.get('/users/:userId', async (req, res) => {
    try {
        const { userId } = req.params;

        // Get user info
        const userResult = await db.query(
            `SELECT UserID, UserName, UserPhone, UserWechat, UserAddress, created_at, last_login
       FROM User_Account WHERE UserID = $1`,
            [userId]
        );

        if (userResult.rows.length === 0) {
            return res.status(404).json({
                success: false,
                error: 'User not found'
            });
        }

        // Get user's students
        const studentsResult = await db.query(
            `SELECT s.*,
        COUNT(se.EnrollmentID) as enrollment_count
       FROM Student s
       LEFT JOIN SessionEnrollment se ON s.StudentID = se.StudentID AND se.EnrollmentStatus = 'active'
       WHERE s.UserID = $1
       GROUP BY s.StudentID`,
            [userId]
        );

        res.json({
            success: true,
            data: {
                user: userResult.rows[0],
                students: studentsResult.rows
            }
        });
    } catch (error) {
        console.error('Error fetching user:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Get all enrollments (admin only)
router.get('/enrollments', async (req, res) => {
    try {
        const { status } = req.query;

        let query = `
      SELECT
        se.EnrollmentID,
        se.EnrollmentStatus,
        se.EnrollmentDate,
        s.SessionID,
        s.SessionName,
        s.SessionDayOfWeek,
        s.SessionStartTime,
        s.SessionEndTime,
        s.SessionStartDate,
        c.CourseID,
        c.CourseName,
        c.CoursePrice,
        t.TeacherName,
        st.StudentID,
        st.StudentName,
        u.UserID,
        u.UserName as ParentName,
        u.UserPhone as ParentPhone
      FROM SessionEnrollment se
      JOIN Session s ON se.SessionID = s.SessionID
      JOIN Course c ON s.CourseID = c.CourseID
      JOIN Teacher t ON s.TeacherID = t.TeacherID
      JOIN Student st ON se.StudentID = st.StudentID
      JOIN User_Account u ON st.UserID = u.UserID
    `;

        const params = [];
        if (status) {
            query += ' WHERE se.EnrollmentStatus = $1';
            params.push(status);
        }

        query += ' ORDER BY se.EnrollmentDate DESC';

        const result = await db.query(query, params);

        res.json({
            success: true,
            count: result.rows.length,
            data: result.rows
        });
    } catch (error) {
        console.error('Error fetching enrollments:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Update enrollment status (admin only)
router.put('/enrollments/:enrollmentId/status', async (req, res) => {
    try {
        const { enrollmentId } = req.params;
        const { status } = req.body;

        if (!['active', 'waitlisted', 'withdrawn'].includes(status)) {
            return res.status(400).json({
                success: false,
                error: 'Invalid status. Must be: active, waitlisted, or withdrawn'
            });
        }

        const result = await db.query(
            `UPDATE SessionEnrollment
       SET EnrollmentStatus = $1
       WHERE EnrollmentID = $2
       RETURNING *`,
            [status, enrollmentId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                error: 'Enrollment not found'
            });
        }

        res.json({
            success: true,
            message: 'Enrollment status updated',
            data: result.rows[0]
        });
    } catch (error) {
        console.error('Error updating enrollment:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

module.exports = router;