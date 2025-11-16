const db = require('../db/connection');

// Get all students for a parent
const getStudentsByParent = async (req, res) => {
    try {
        const { userId } = req.params;

        const result = await db.query(
            `SELECT
        s.StudentID as student_id,
        s.StudentName as student_name,
        s.StudentBirthDate as birth_date,
        s.StudentGrade as grade,
        s.StudentSchool as school,
        COUNT(se.EnrollmentID) as total_enrollments,
        COUNT(CASE WHEN se.EnrollmentStatus = 'active' THEN 1 END) as active_enrollments
      FROM Student s
      LEFT JOIN SessionEnrollment se ON s.StudentID = se.StudentID
      WHERE s.UserID = $1
      GROUP BY s.StudentID
      ORDER BY s.StudentName`,
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

// Add new student
const addStudent = async (req, res) => {
    try {
        const { userId } = req.params;
        const { name, birthDate, grade, school, medicalInfo } = req.body;

        // Validation
        if (!name || !birthDate) {
            return res.status(400).json({
                success: false,
                error: 'Name and birth date are required'
            });
        }

        const result = await db.query(
            `INSERT INTO Student (UserID, StudentName, StudentBirthDate, StudentGrade, StudentSchool, MedicalInfo)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *`,
            [userId, name, birthDate, grade, school, medicalInfo]
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

// Get student enrollment history
const getStudentEnrollments = async (req, res) => {
    try {
        const { studentId } = req.params;

        const result = await db.query(
            `SELECT
        se.EnrollmentID as enrollment_id,
        se.EnrollmentStatus as status,
        se.EnrollmentDate as enrollment_date,
        s.SessionName as session_name,
        s.SessionDayOfWeek as day_of_week,
        s.SessionStartTime as start_time,
        s.SessionEndTime as end_time,
        c.CourseName as course_name,
        t.TeacherName as teacher_name,
        ot.OrderTotal as amount_paid
      FROM SessionEnrollment se
      JOIN Session s ON se.SessionID = s.SessionID
      JOIN Course c ON s.CourseID = c.CourseID
      JOIN Teacher t ON s.TeacherID = t.TeacherID
      LEFT JOIN Order_Transaction ot ON se.OrderID = ot.OrderID
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

module.exports = {
    getStudentsByParent,
    addStudent,
    getStudentEnrollments
};