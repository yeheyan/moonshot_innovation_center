const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-this';

// Verify admin JWT token
const verifyAdmin = (req, res, next) => {
    const token = req.headers['authorization']?.split(' ')[1]; // Bearer TOKEN

    if (!token) {
        return res.status(401).json({
            success: false,
            error: 'No token provided'
        });
    }

    try {
        const decoded = jwt.verify(token, JWT_SECRET);

        // Check if token is for admin
        if (!decoded.isAdmin || decoded.role !== 'admin') {
            return res.status(403).json({
                success: false,
                error: 'Access denied. Admin only.'
            });
        }

        req.adminId = decoded.adminId;
        req.adminEmail = decoded.email;
        next();
    } catch (error) {
        return res.status(401).json({
            success: false,
            error: 'Invalid or expired token'
        });
    }
};

module.exports = { verifyAdmin };