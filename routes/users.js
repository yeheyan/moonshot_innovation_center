// routes/users.js

const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');
const { verifyToken } = require('../middleware/auth');

// All routes require authentication
router.use(verifyToken);

// GET /api/users/:userId - Get user profile
router.get('/:userId', userController.getUserProfile);

// PUT /api/users/:userId/profile - Update user profile
router.put('/:userId/profile', userController.updateUserProfile);

// GET /api/users/:userId/enrollments - Get user's course enrollments
router.get('/:userId/enrollments', userController.getUserEnrollments);

// GET /api/users/:userId/enrollments/stats - Get user's enrollment statistics
router.get('/:userId/enrollments/stats', userController.getUserEnrollmentStats);

// GET /api/users/:userId/students - Get user's students (children)
router.get('/:userId/students', userController.getUserStudents);

module.exports = router;