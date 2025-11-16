const express = require('express');
const router = express.Router();
const studentController = require('../controllers/studentController');

// GET /api/students/parent/:userId
router.get('/parent/:userId', studentController.getStudentsByParent);

// POST /api/students/parent/:userId
router.post('/parent/:userId', studentController.addStudent);

// GET /api/students/:studentId/enrollments
router.get('/:studentId/enrollments', studentController.getStudentEnrollments);

module.exports = router;