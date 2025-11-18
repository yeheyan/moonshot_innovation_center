const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../db/connection');

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-this';

// Admin login (email-based)
const login = async (req, res) => {
    try {
        const { adminEmail, password } = req.body;

        // Validate input
        if (!adminEmail || !password) {
            return res.status(400).json({
                success: false,
                error: 'Email and password are required'
            });
        }

        // Get admin from database
        const result = await db.query(
            `SELECT AdminID, AdminName, AdminEmail, password_hash, AdminRole
       FROM Admin
       WHERE AdminEmail = $1`,
            [adminEmail]
        );

        if (result.rows.length === 0) {
            return res.status(401).json({
                success: false,
                error: 'Invalid email or password'
            });
        }

        const admin = result.rows[0];

        // Check password
        const passwordMatch = await bcrypt.compare(password, admin.password_hash);

        if (!passwordMatch) {
            return res.status(401).json({
                success: false,
                error: 'Invalid email or password'
            });
        }

        // Update last login
        await db.query(
            'UPDATE Admin SET last_login = CURRENT_TIMESTAMP WHERE AdminID = $1',
            [admin.adminid]
        );

        // Generate JWT token with admin role
        const token = jwt.sign(
            {
                adminId: admin.adminid,
                email: admin.adminemail,
                role: 'admin',
                isAdmin: true
            },
            JWT_SECRET,
            { expiresIn: '7d' }
        );

        res.json({
            success: true,
            message: 'Login successful',
            data: {
                admin: {
                    adminId: admin.adminid,
                    adminName: admin.adminname,
                    adminEmail: admin.adminemail,
                    role: admin.adminrole
                },
                token
            }
        });

    } catch (error) {
        console.error('Admin login error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
};

// Get current admin info
const getCurrentAdmin = async (req, res) => {
    try {
        const result = await db.query(
            `SELECT AdminID, AdminName, AdminEmail, AdminRole, last_login, created_at
       FROM Admin
       WHERE AdminID = $1`,
            [req.adminId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                error: 'Admin not found'
            });
        }

        res.json({
            success: true,
            data: result.rows[0]
        });

    } catch (error) {
        console.error('Get admin error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
};

module.exports = {
    login,
    getCurrentAdmin
};