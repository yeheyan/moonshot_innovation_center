const express = require('express');
const router = express.Router();
const enrollmentController = require('../controllers/enrollmentController');

// Debug: Check what's imported
console.log('Imported controller functions:', Object.keys(enrollmentController));

// GET /api/enrollments/stats - FIRST
router.get('/stats', enrollmentController.getEnrollmentStats);

// POST /api/enrollments
router.post('/', enrollmentController.createEnrollment);

// PUT /api/enrollments/:enrollmentId/withdraw
router.put('/:enrollmentId/withdraw', enrollmentController.withdrawEnrollment);

module.exports = router;