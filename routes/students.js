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

// PUT /api/students/:studentId - Update student info
router.put('/:studentId', studentController.updateStudent);

// DELETE /api/students/:studentId - Delete student
router.delete('/:studentId', studentController.deleteStudent);

// GET /api/students/:studentId/enrollments - Get student's enrollments
router.get('/:studentId/enrollments', studentController.getStudentEnrollments);

module.exports = router;