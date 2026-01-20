const db = require('../db/connection');

// Get available sessions
exports.getAvailableSessions = async (req, res) => {
    try {
        const { studentId, courseId, dayOfWeek } = req.query;

        let query = `
      SELECT
        s.SessionID as session_id,
        s.SessionName as session_name,
        s.SessionDayOfWeek as day_of_week,
        s.SessionStartTime as start_time,
        s.SessionEndTime as end_time,
        s.SessionStartDate as sessionstartdate,
        s.SessionEndDate as sessionenddate,
        s.EnrolledCount as enrolled_count,
        c.CourseName as course_name,
        c.type as course_type,
        c.min_grade as min_grade,
        c.max_grade as max_grade,
        c.cover_image_url as cover_image_url,
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
        let paramIndex = 1;

        if (studentId) {
            query += `
        AND s.SessionID NOT IN (
          SELECT SessionID FROM SessionEnrollment
          WHERE StudentID = $${paramIndex}
          AND EnrollmentStatus IN ('active', 'waitlisted')
        )`;
            params.push(studentId);
            paramIndex++;
        }

        if (courseId) {
            query += ` AND c.CourseID = $${paramIndex}`;
            params.push(courseId);
            paramIndex++;
        }

        if (dayOfWeek) {
            query += ` AND s.SessionDayOfWeek = $${paramIndex}`;
            params.push(dayOfWeek);
            paramIndex++;
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
exports.getSessionById = async (req, res) => {
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

exports.createSession = async (req, res) => {
    try {
        const {
            courseId,
            teacherId,
            sessionName,
            sessionDayOfWeek,
            sessionStartTime,
            sessionEndTime,
            sessionStartDate
        } = req.body;

        if (!courseId || !teacherId || !sessionName || !sessionDayOfWeek || !sessionStartTime || !sessionEndTime || !sessionStartDate) {
            return res.status(400).json({
                success: false,
                error: 'All fields are required'
            });
        }

        const result = await db.query(
            `INSERT INTO Session (
        CourseID, TeacherID, SessionName, SessionDayOfWeek,
        SessionStartTime, SessionEndTime, SessionStartDate, EnrolledCount
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, 0)
      RETURNING *`,
            [courseId, teacherId, sessionName, sessionDayOfWeek, sessionStartTime, sessionEndTime, sessionStartDate]
        );

        res.status(201).json({
            success: true,
            message: 'Session created successfully',
            data: result.rows[0]
        });
    } catch (error) {
        console.error('Error creating session:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
};

exports.updateSession = async (req, res) => {
    try {
        const { sessionId } = req.params;
        const { sessionName, sessionDayOfWeek, sessionStartTime, sessionEndTime, sessionStartDate, teacherId } = req.body;

        const result = await db.query(
            `UPDATE Session SET
        SessionName = COALESCE($1, SessionName),
        SessionDayOfWeek = COALESCE($2, SessionDayOfWeek),
        SessionStartTime = COALESCE($3, SessionStartTime),
        SessionEndTime = COALESCE($4, SessionEndTime),
        SessionStartDate = COALESCE($5, SessionStartDate),
        TeacherID = COALESCE($6, TeacherID)
      WHERE SessionID = $7
      RETURNING *`,
            [sessionName, sessionDayOfWeek, sessionStartTime, sessionEndTime, sessionStartDate, teacherId, sessionId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                error: 'Session not found'
            });
        }

        res.json({
            success: true,
            message: 'Session updated successfully',
            data: result.rows[0]
        });
    } catch (error) {
        console.error('Error updating session:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
};

exports.deleteSession = async (req, res) => {
    try {
        const { sessionId } = req.params;

        const enrollmentCheck = await db.query(
            'SELECT COUNT(*) FROM SessionEnrollment WHERE SessionID = $1 AND EnrollmentStatus = \'active\'',
            [sessionId]
        );

        if (parseInt(enrollmentCheck.rows[0].count) > 0) {
            return res.status(400).json({
                success: false,
                error: 'Cannot delete session with active enrollments'
            });
        }

        const result = await db.query(
            'DELETE FROM Session WHERE SessionID = $1 RETURNING *',
            [sessionId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                error: 'Session not found'
            });
        }

        res.json({
            success: true,
            message: 'Session deleted successfully'
        });
    } catch (error) {
        console.error('Error deleting session:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
};