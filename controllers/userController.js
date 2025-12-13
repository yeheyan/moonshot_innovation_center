// controllers/userController.js

const db = require('../db/connection');

// Get user profile
exports.getUserProfile = async (req, res) => {
    try {
        const { userId } = req.params;

        const result = await db.query(
            `SELECT userid, username, userphone, userwechat, useraddress, wechat_openid, avatar_url, last_login
             FROM user_account
             WHERE userid = $1`,
            [userId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                error: 'User not found'
            });
        }

        res.json({
            success: true,
            data: result.rows[0]
        });

    } catch (error) {
        console.error('Get user profile error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
};

// Update user profile
exports.updateUserProfile = async (req, res) => {
    try {
        const { userId } = req.params;
        const { userName, realName, userPhone, avatarUrl } = req.body;

        console.log('Updating user profile:', userId, req.body);

        const result = await db.query(
            `UPDATE user_account
             SET username = COALESCE($1, username),
                 userphone = COALESCE($2, userphone),
                 avatar_url = COALESCE($3, avatar_url)
             WHERE userid = $4
             RETURNING userid, username, userphone, avatar_url`,
            [userName, userPhone, avatarUrl, userId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                error: 'User not found'
            });
        }

        res.json({
            success: true,
            message: 'Profile updated successfully',
            data: result.rows[0]
        });

    } catch (error) {
        console.error('Update user profile error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
};

// Get user's enrollment stats
exports.getUserEnrollmentStats = async (req, res) => {
    try {
        const { userId } = req.params;

        const stats = await db.query(`
            SELECT
                COUNT(*) FILTER (WHERE se.enrollmentstatus = 'active' AND ot.orderstatus = 'pending') as pending,
                COUNT(*) FILTER (WHERE se.enrollmentstatus = 'active' AND ot.orderstatus = 'paid') as ongoing,
                COUNT(*) FILTER (WHERE se.enrollmentstatus = 'completed') as completed,
                COUNT(*) as total
            FROM sessionenrollment se
            JOIN order_transaction ot ON se.orderid = ot.orderid
            JOIN student st ON se.studentid = st.studentid
            WHERE st.userid = $1
        `, [userId]);

        res.json({
            success: true,
            data: {
                pending: parseInt(stats.rows[0].pending) || 0,
                ongoing: parseInt(stats.rows[0].ongoing) || 0,
                completed: parseInt(stats.rows[0].completed) || 0,
                total: parseInt(stats.rows[0].total) || 0
            }
        });

    } catch (error) {
        console.error('Get enrollment stats error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
};

// Get user's enrollments (courses)
exports.getUserEnrollments = async (req, res) => {
    try {
        const { userId } = req.params;

        const result = await db.query(`
            SELECT
                se.enrollmentid,
                se.sessionid,
                se.studentid,
                se.orderid,
                se.enrollmentstatus,
                se.enrollmentdate,
                s.sessionname,
                s.sessiondayofweek,
                s.sessionstarttime,
                s.sessionendtime,
                s.SessionStartDate as startdate,
                s.SessionEndDate as enddate,
                c.coursename,
                c.courseprice,
                t.teachername,
                st.studentname,
                ot.ordertotal,
                ot.orderstatus,
                p.paymentstatus
            FROM sessionenrollment se
            JOIN session s ON se.sessionid = s.sessionid
            JOIN course c ON s.courseid = c.courseid
            LEFT JOIN teacher t ON s.teacherid = t.teacherid
            JOIN student st ON se.studentid = st.studentid
            LEFT JOIN order_transaction ot ON se.orderid = ot.orderid
            LEFT JOIN payment p ON ot.orderid = p.orderid
            WHERE st.userid = $1
            AND se.enrollmentstatus != 'withdrawn'
            ORDER BY se.enrollmentdate DESC
        `, [userId]);

        res.json({
            success: true,
            data: result.rows
        });

    } catch (error) {
        console.error('Get user enrollments error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
};

// Get user's students (children/learners)
exports.getUserStudents = async (req, res) => {
    try {
        const { userId } = req.params;

        const result = await db.query(
            `SELECT studentid, studentname, studentage, studentgender, notes, createdat
             FROM student
             WHERE userid = $1
             ORDER BY createdat DESC`,
            [userId]
        );

        res.json({
            success: true,
            data: result.rows
        });

    } catch (error) {
        console.error('Get user students error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
};