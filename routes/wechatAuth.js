const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const db = require('../db/connection');

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-this';

// WeChat login endpoint
router.post('/wechat-login', async (req, res) => {
    try {
        const { openid, nickName, avatarUrl } = req.body;

        if (!openid) {
            return res.status(400).json({
                success: false,
                error: 'OpenID is required'
            });
        }

        // Check if user exists by openid
        let user = await db.query(
            'SELECT * FROM user_account WHERE wechat_openid = $1',
            [openid]
        );

        if (user.rows.length === 0) {
            // Create new user automatically
            user = await db.query(
                `INSERT INTO user_account (username, wechat_openid)
         VALUES ($1, $2)
         RETURNING *`,
                [nickName || '微信用户', openid]
            );

            console.log('New WeChat user created:', openid);
        } else {
            // Update last login
            await db.query(
                'UPDATE user_account SET last_login = CURRENT_TIMESTAMP WHERE userid = $1',
                [user.rows[0].userid]
            );
        }

        const userData = user.rows[0];

        // Generate JWT token (30 days for WeChat)
        const token = jwt.sign(
            {
                userId: userData.userid,
                openid: openid
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
                    wechatOpenid: openid
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
});

module.exports = router;