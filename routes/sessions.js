const express = require('express');
const router = express.Router();
const sessionController = require('../controllers/sessionController');
const { verifyAdmin } = require('../middleware/adminAuth');

// Public routes (for parent portal)
router.get('/', sessionController.getAvailableSessions);
router.get('/:sessionId', sessionController.getSessionById);

// Admin routes (protected)
router.post('/', verifyAdmin, sessionController.createSession);
router.put('/:sessionId', verifyAdmin, sessionController.updateSession);
router.delete('/:sessionId', verifyAdmin, sessionController.deleteSession);

module.exports = router;