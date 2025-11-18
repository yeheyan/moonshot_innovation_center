const express = require('express');
const router = express.Router();
const courseController = require('../controllers/courseController');
const { verifyAdmin } = require('../middleware/adminAuth');

// All routes require admin authentication
router.use(verifyAdmin);

router.get('/', courseController.getAllCourses);
router.get('/:courseId', courseController.getCourseById);
router.post('/', courseController.createCourse);
router.put('/:courseId', courseController.updateCourse);
router.delete('/:courseId', courseController.deleteCourse);

module.exports = router;