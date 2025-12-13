const jwt = require('jsonwebtoken');
const db = require('../db/connection');

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-this';

// Login or register with WeChat openid
// Login or register with WeChat openid
exports.wechatLogin = async (req, res) => {
    try {
        const { openid, nickName, avatarUrl } = req.body;

        if (!openid) {
            return res.status(400).json({
                success: false,
                error: 'OpenID is required'
            });
        }

        // Check if user exists
        let user = await db.query(
            'SELECT * FROM user_account WHERE wechat_openid = $1',
            [openid]
        );

        if (user.rows.length === 0) {
            // Create new user - 保存 nickName 和 avatarUrl
            user = await db.query(
                `INSERT INTO user_account (username, wechat_openid, avatar_url, userphone)
                 VALUES ($1, $2, $3, NULL)
                 RETURNING *`,
                [nickName || '微信用户', openid, avatarUrl || null]
            );
            console.log('New WeChat user created with name:', nickName);
        } else {
            // Existing user - 只更新登录时间，保留已有资料
            user = await db.query(
                `UPDATE user_account
                 SET last_login = CURRENT_TIMESTAMP
                 WHERE wechat_openid = $1
                 RETURNING *`,
                [openid]
            );
            console.log('WeChat user logged in, preserved existing profile');
        }

        const userData = user.rows[0];

        // Generate JWT token
        const token = jwt.sign(
            {
                userId: userData.userid,
                openid: openid,
                role: 'parent'
            },
            JWT_SECRET,
            { expiresIn: '30d' }
        );

        res.json({
            success: true,
            message: 'Login successful',
            data: {
                user: {
                    userId: userData.userid,
                    userName: userData.username,
                    avatarUrl: userData.avatar_url,  // 添加这行！
                    phone: userData.userphone         // 添加这行！
                },
                token
            }
        });

    } catch (error) {
        console.error('WeChat login error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
};