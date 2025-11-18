const db = require('../db/connection');

exports.getAllTeachers = async (req, res) => {
    try {
        const result = await db.query(
            'SELECT * FROM Teacher ORDER BY TeacherName'
        );

        res.json({
            success: true,
            count: result.rows.length,
            data: result.rows
        });
    } catch (error) {
        console.error('Error fetching teachers:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
};

exports.createTeacher = async (req, res) => {
    try {
        const { teacherName, teacherInfo } = req.body;

        if (!teacherName) {
            return res.status(400).json({
                success: false,
                error: 'Teacher name is required'
            });
        }

        const result = await db.query(
            'INSERT INTO Teacher (TeacherName, TeacherInfo) VALUES ($1, $2) RETURNING *',
            [teacherName, teacherInfo || null]
        );

        res.status(201).json({
            success: true,
            message: 'Teacher created successfully',
            data: result.rows[0]
        });
    } catch (error) {
        console.error('Error creating teacher:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
};

exports.updateTeacher = async (req, res) => {
    try {
        const { teacherId } = req.params;
        const { teacherName, teacherInfo } = req.body;

        const result = await db.query(
            `UPDATE Teacher SET
        TeacherName = COALESCE($1, TeacherName),
        TeacherInfo = COALESCE($2, TeacherInfo)
      WHERE TeacherID = $3
      RETURNING *`,
            [teacherName, teacherInfo, teacherId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                error: 'Teacher not found'
            });
        }

        res.json({
            success: true,
            message: 'Teacher updated successfully',
            data: result.rows[0]
        });
    } catch (error) {
        console.error('Error updating teacher:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
};

exports.deleteTeacher = async (req, res) => {
    try {
        const { teacherId } = req.params;

        // Check if teacher has sessions
        const sessionCheck = await db.query(
            'SELECT COUNT(*) FROM Session WHERE TeacherID = $1',
            [teacherId]
        );

        if (parseInt(sessionCheck.rows[0].count) > 0) {
            return res.status(400).json({
                success: false,
                error: 'Cannot delete teacher with assigned sessions'
            });
        }

        const result = await db.query(
            'DELETE FROM Teacher WHERE TeacherID = $1 RETURNING *',
            [teacherId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                error: 'Teacher not found'
            });
        }

        res.json({
            success: true,
            message: 'Teacher deleted successfully'
        });
    } catch (error) {
        console.error('Error deleting teacher:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
};