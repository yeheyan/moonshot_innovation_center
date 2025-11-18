const db = require('../db/connection');

// Get all courses with session count
exports.getAllCourses = async (req, res) => {
    try {
        const result = await db.query(
            `SELECT
        c.*,
        COUNT(DISTINCT s.SessionID) as session_count
      FROM Course c
      LEFT JOIN Session s ON c.CourseID = s.CourseID
      GROUP BY c.CourseID
      ORDER BY c.created_at DESC`
        );

        res.json({
            success: true,
            count: result.rows.length,
            data: result.rows
        });
    } catch (error) {
        console.error('Error fetching courses:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
};

// Get single course by ID
exports.getCourseById = async (req, res) => {
    try {
        const { courseId } = req.params;

        const result = await db.query(
            'SELECT * FROM Course WHERE CourseID = $1',
            [courseId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                error: 'Course not found'
            });
        }

        res.json({
            success: true,
            data: result.rows[0]
        });
    } catch (error) {
        console.error('Error fetching course:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
};

// Create new course
exports.createCourse = async (req, res) => {
    try {
        const { courseName, courseDescription, coursePrice, courseMaxEnroll, courseStatus } = req.body;

        if (!courseName || !coursePrice || !courseMaxEnroll) {
            return res.status(400).json({
                success: false,
                error: 'Course name, price, and max enrollment are required'
            });
        }

        const result = await db.query(
            `INSERT INTO Course (CourseName, CourseDescription, CoursePrice, CourseMaxEnroll, CourseStatus)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
            [courseName, courseDescription || null, coursePrice, courseMaxEnroll, courseStatus || 'active']
        );

        res.status(201).json({
            success: true,
            message: 'Course created successfully',
            data: result.rows[0]
        });
    } catch (error) {
        console.error('Error creating course:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
};

// Update course
exports.updateCourse = async (req, res) => {
    try {
        const { courseId } = req.params;
        const { courseName, courseDescription, coursePrice, courseMaxEnroll, courseStatus } = req.body;

        const result = await db.query(
            `UPDATE Course SET
        CourseName = COALESCE($1, CourseName),
        CourseDescription = COALESCE($2, CourseDescription),
        CoursePrice = COALESCE($3, CoursePrice),
        CourseMaxEnroll = COALESCE($4, CourseMaxEnroll),
        CourseStatus = COALESCE($5, CourseStatus)
      WHERE CourseID = $6
      RETURNING *`,
            [courseName, courseDescription, coursePrice, courseMaxEnroll, courseStatus, courseId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                error: 'Course not found'
            });
        }

        res.json({
            success: true,
            message: 'Course updated successfully',
            data: result.rows[0]
        });
    } catch (error) {
        console.error('Error updating course:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
};

// Delete course
exports.deleteCourse = async (req, res) => {
    try {
        const { courseId } = req.params;

        // Check if course has sessions
        const sessionCheck = await db.query(
            'SELECT COUNT(*) FROM Session WHERE CourseID = $1',
            [courseId]
        );

        if (parseInt(sessionCheck.rows[0].count) > 0) {
            return res.status(400).json({
                success: false,
                error: 'Cannot delete course with existing sessions. Please delete all sessions first.'
            });
        }

        const result = await db.query(
            'DELETE FROM Course WHERE CourseID = $1 RETURNING *',
            [courseId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                error: 'Course not found'
            });
        }

        res.json({
            success: true,
            message: 'Course deleted successfully'
        });
    } catch (error) {
        console.error('Error deleting course:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
};