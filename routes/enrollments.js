const express = require('express');
const router = express.Router();
const enrollmentController = require('../controllers/enrollmentController');
const { verifyToken } = require('../middleware/auth');

router.get('/stats', enrollmentController.getEnrollmentStats);
router.post('/', verifyToken, enrollmentController.createEnrollment);
router.put('/:enrollmentId/withdraw', verifyToken, enrollmentController.withdrawEnrollment);

// NEW: Payment confirmation endpoint
router.post('/confirm-payment', verifyToken, enrollmentController.confirmPayment);

module.exports = router;