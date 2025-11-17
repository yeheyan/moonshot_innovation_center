const express = require('express');
const router = express.Router();
const enrollmentController = require('../controllers/enrollmentController');
const { verifyToken } = require('../middleware/auth');

// Public route - get enrollment statistics
router.get('/stats', enrollmentController.getEnrollmentStats);

// Protected routes - require authentication
router.post('/', verifyToken, enrollmentController.createEnrollment);
router.put('/:enrollmentId/withdraw', verifyToken, enrollmentController.withdrawEnrollment);

module.exports = router;