const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../db/connection');

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-this';

// Register new user
const register = async (req, res) => {
    const client = await db.pool.connect();

    try {
        const { userName, userPhone, password, userWechat, userAddress } = req.body;

        // Validate input
        if (!userName || !userPhone || !password) {
            return res.status(400).json({
                success: false,
                error: 'Name, phone and password are required'
            });
        }

        // Check if phone already exists
        const existingUser = await client.query(
            'SELECT userid FROM User_Account WHERE userphone = $1',
            [userPhone]
        );

        if (existingUser.rows.length > 0) {
            return res.status(400).json({
                success: false,
                error: 'Phone number already registered'
            });
        }

        // Hash password
        const saltRounds = 10;
        const passwordHash = await bcrypt.hash(password, saltRounds);

        // Start transaction
        await client.query('BEGIN');

        // Insert new user
        const result = await client.query(
            `INSERT INTO User_Account (
        username, userphone, password_hash, userwechat, useraddress
      ) VALUES ($1, $2, $3, $4, $5)
      RETURNING userid, username, userphone`,
            [userName, userPhone, passwordHash, userWechat || null, userAddress || null]
        );

        const newUser = result.rows[0];

        // Generate JWT token
        const token = jwt.sign(
            { userId: newUser.userid, phone: newUser.userphone },
            JWT_SECRET,
            { expiresIn: '7d' }
        );

        await client.query('COMMIT');

        res.status(201).json({
            success: true,
            message: 'Registration successful',
            data: {
                user: {
                    userId: newUser.userid,
                    userName: newUser.username,
                    userPhone: newUser.userphone
                },
                token
            }
        });

    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Registration error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    } finally {
        client.release();
    }
};

// Login
const login = async (req, res) => {
    try {
        const { userPhone, password } = req.body;

        // Validate input
        if (!userPhone || !password) {
            return res.status(400).json({
                success: false,
                error: 'Phone and password are required'
            });
        }

        // Get user from database
        const result = await db.query(
            `SELECT userid, username, userphone, password_hash
       FROM User_Account
       WHERE userphone = $1`,
            [userPhone]
        );

        if (result.rows.length === 0) {
            return res.status(401).json({
                success: false,
                error: 'Invalid phone or password'
            });
        }

        const user = result.rows[0];

        // Check password
        const passwordMatch = await bcrypt.compare(password, user.password_hash);

        if (!passwordMatch) {
            return res.status(401).json({
                success: false,
                error: 'Invalid phone or password'
            });
        }

        // Update last login
        await db.query(
            'UPDATE User_Account SET last_login = CURRENT_TIMESTAMP WHERE userid = $1',
            [user.userid]
        );

        // Generate JWT token
        const token = jwt.sign(
            { userId: user.userid, phone: user.userphone },
            JWT_SECRET,
            { expiresIn: '7d' }
        );

        res.json({
            success: true,
            message: 'Login successful',
            data: {
                user: {
                    userId: user.userid,
                    userName: user.username,
                    userPhone: user.userphone
                },
                token
            }
        });

    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
};

// Get current user info
const getCurrentUser = async (req, res) => {
    try {
        const result = await db.query(
            `SELECT userid, username, userphone, userwechat, useraddress, last_login
       FROM User_Account
       WHERE userid = $1`,
            [req.userId]
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
        console.error('Get user error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
};

module.exports = {
    register,
    login,
    getCurrentUser
};