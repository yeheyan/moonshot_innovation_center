const db = require('../db/connection');

// Get available sessions
const getAvailableSessions = async (req, res) => {
    try {
        const { studentId } = req.query;

        let query = `
      SELECT
        s.SessionID as session_id,
        s.SessionName as session_name,
        s.SessionDayOfWeek as day_of_week,
        s.SessionStartTime as start_time,
        s.SessionEndTime as end_time,
        s.EnrolledCount as enrolled_count,
        c.CourseName as course_name,
        c.CourseDescription as course_description,
        c.CoursePrice as price,
        c.CourseMaxEnroll as max_capacity,
        c.CourseMaxEnroll - s.EnrolledCount as available_spots,
        t.TeacherName as teacher_name,
        CASE
          WHEN c.CourseMaxEnroll - s.EnrolledCount > 0 THEN 'available'
          ELSE 'waitlist_only'
        END as status
      FROM Session s
      JOIN Course c ON s.CourseID = c.CourseID
      JOIN Teacher t ON s.TeacherID = t.TeacherID
      WHERE c.CourseStatus = 'active'`;

        const params = [];

        // If studentId provided, exclude already enrolled sessions
        if (studentId) {
            query += `
        AND s.SessionID NOT IN (
          SELECT SessionID FROM SessionEnrollment
          WHERE StudentID = $1
          AND EnrollmentStatus IN ('active', 'waitlisted')
        )`;
            params.push(studentId);
        }

        query += ' ORDER BY c.CourseName, s.SessionDayOfWeek, s.SessionStartTime';

        const result = await db.query(query, params);

        res.json({
            success: true,
            count: result.rows.length,
            data: result.rows
        });
    } catch (error) {
        console.error('Error fetching sessions:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
};

// Get session details
const getSessionById = async (req, res) => {
    try {
        const { sessionId } = req.params;

        const sessionResult = await db.query(
            `SELECT
        s.*,
        c.CourseName,
        c.CourseDescription,
        c.CoursePrice,
        c.CourseMaxEnroll,
        t.TeacherName,
        t.TeacherInfo
      FROM Session s
      JOIN Course c ON s.CourseID = c.CourseID
      JOIN Teacher t ON s.TeacherID = t.TeacherID
      WHERE s.SessionID = $1`,
            [sessionId]
        );

        if (sessionResult.rows.length === 0) {
            return res.status(404).json({
                success: false,
                error: 'Session not found'
            });
        }

        // Get enrolled students
        const enrolledResult = await db.query(
            `SELECT
        st.StudentName,
        se.EnrollmentStatus,
        se.EnrollmentDate
      FROM SessionEnrollment se
      JOIN Student st ON se.StudentID = st.StudentID
      WHERE se.SessionID = $1
      AND se.EnrollmentStatus IN ('active', 'waitlisted')
      ORDER BY se.EnrollmentDate`,
            [sessionId]
        );

        res.json({
            success: true,
            data: {
                session: sessionResult.rows[0],
                enrolledStudents: enrolledResult.rows
            }
        });
    } catch (error) {
        console.error('Error fetching session:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
};

module.exports = {
    getAvailableSessions,
    getSessionById
};