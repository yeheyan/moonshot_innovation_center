const db = require('../db/connection');

// Get students by parent (userId from User_Account)
exports.getStudentsByParent = async (req, res) => {
    try {
        const { userId } = req.params;

        const result = await db.query(
            `SELECT
        StudentID,
        StudentName,
        StudentEmail,
        StudentPhone,
        StudentWechat,
        StudentAddress
      FROM Student
      WHERE UserID = $1
      ORDER BY StudentID DESC`,
            [userId]
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
};

// Add a student under a parent
exports.addStudent = async (req, res) => {
    try {
        const { userId } = req.params;
        const { studentName, studentEmail, studentPhone, studentWechat, studentAddress } = req.body;

        // Validate required fields
        if (!studentName) {
            return res.status(400).json({
                success: false,
                error: 'Student name is required'
            });
        }

        const result = await db.query(
            `INSERT INTO Student (
        UserID, StudentName, StudentEmail, StudentPhone, StudentWechat, StudentAddress
      ) VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *`,
            [userId, studentName, studentEmail || null, studentPhone || null, studentWechat || null, studentAddress || null]
        );

        res.status(201).json({
            success: true,
            message: 'Student added successfully',
            data: result.rows[0]
        });

    } catch (error) {
        console.error('Error adding student:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
};

// Get student's enrollments with session details
exports.getStudentEnrollments = async (req, res) => {
    try {
        const { studentId } = req.params;

        const result = await db.query(
            `SELECT
        se.EnrollmentID,
        se.EnrollmentStatus,
        se.EnrollmentDate,
        s.SessionID,
        s.SessionName,
        s.SessionDayOfWeek,
        s.SessionStartTime,
        s.SessionEndTime,
        c.CourseID,
        c.CourseName,
        c.CourseDescription,
        c.CoursePrice,
        t.TeacherName,
        t.TeacherInfo
      FROM SessionEnrollment se
      JOIN Session s ON se.SessionID = s.SessionID
      JOIN Course c ON s.CourseID = c.CourseID
      JOIN Teacher t ON s.TeacherID = t.TeacherID
      WHERE se.StudentID = $1
      ORDER BY se.EnrollmentDate DESC`,
            [studentId]
        );

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
};