const express = require('express');
const router = express.Router();
const teacherController = require('../controllers/teacherController');
const { verifyAdmin } = require('../middleware/adminAuth');

router.use(verifyAdmin);

router.get('/', teacherController.getAllTeachers);
router.post('/', teacherController.createTeacher);
router.put('/:teacherId', teacherController.updateTeacher);
router.delete('/:teacherId', teacherController.deleteTeacher);

module.exports = router;