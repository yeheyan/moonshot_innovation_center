const db = require('../db/connection');

// Create enrollment
// controllers/enrollmentController.js
const createEnrollment = async (req, res) => {
    try {
        const { userId, studentId, sessionId, paymentAmount, paymentMethod = 'credit_card' } = req.body;

        // Validate input
        if (!userId || !studentId || !sessionId || !paymentAmount) {
            return res.status(400).json({
                success: false,
                error: 'Missing required fields'
            });
        }

        // Validate payment method
        const validPaymentMethods = ['credit_card', 'debit_card', 'wechat', 'alipay', 'cash'];
        if (!validPaymentMethods.includes(paymentMethod)) {
            return res.status(400).json({
                success: false,
                error: `Invalid payment method. Must be one of: ${validPaymentMethods.join(', ')}`
            });
        }

        console.log('Calling enroll_student with:', { userId, studentId, sessionId, paymentAmount, paymentMethod });

        // Call stored procedure with payment method
        const result = await db.query(
            'SELECT * FROM enroll_student($1, $2, $3, $4, $5)',
            [userId, studentId, sessionId, paymentAmount, paymentMethod]
        );

        const response = result.rows[0];

        if (!response.success) {
            return res.status(400).json({
                success: false,
                error: response.message
            });
        }

        res.status(201).json({
            success: true,
            message: response.message,
            data: {
                orderId: response.order_id,
                enrollmentId: response.enrollment_id
            }
        });
    } catch (error) {
        console.error('Error creating enrollment:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
};

// Withdraw enrollment
const withdrawEnrollment = async (req, res) => {
    try {
        const { enrollmentId } = req.params;

        const result = await db.query(
            `UPDATE SessionEnrollment
       SET EnrollmentStatus = 'withdrawn'
       WHERE EnrollmentID = $1
       RETURNING *`,
            [enrollmentId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                error: 'Enrollment not found'
            });
        }

        res.json({
            success: true,
            message: 'Enrollment withdrawn successfully',
            data: result.rows[0]
        });
    } catch (error) {
        console.error('Error withdrawing enrollment:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
};

// Get enrollment statistics - MAKE SURE THIS FUNCTION EXISTS
const getEnrollmentStats = async (req, res) => {
    try {
        const result = await db.query(`
      SELECT
        COUNT(*) as total_enrollments,
        COUNT(*) FILTER (WHERE EnrollmentStatus = 'active') as active_enrollments,
        COUNT(*) FILTER (WHERE EnrollmentStatus = 'waitlisted') as waitlisted,
        COUNT(*) FILTER (WHERE EnrollmentStatus = 'completed') as completed,
        COUNT(*) FILTER (WHERE EnrollmentStatus = 'withdrawn') as withdrawn
      FROM SessionEnrollment
    `);

        res.json({
            success: true,
            data: result.rows[0]
        });
    } catch (error) {
        console.error('Error fetching stats:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
};

// IMPORTANT: Export all three functions
module.exports = {
    createEnrollment,
    withdrawEnrollment,
    getEnrollmentStats  // <- Make sure this is here
};