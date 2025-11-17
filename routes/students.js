const express = require('express');
const router = express.Router();
const studentController = require('../controllers/studentController');
const { verifyToken } = require('../middleware/auth');

// All routes require authentication
router.use(verifyToken);

// GET /api/students/parent/:userId - Get all students for a parent
router.get('/parent/:userId', studentController.getStudentsByParent);

// POST /api/students/parent/:userId - Add a student under a parent
router.post('/parent/:userId', studentController.addStudent);

// GET /api/students/:studentId/enrollments - Get student's enrollments
router.get('/:studentId/enrollments', studentController.getStudentEnrollments);

module.exports = router;