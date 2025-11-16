const express = require('express');
const router = express.Router();
const sessionController = require('../controllers/sessionController');

// GET /api/sessions
router.get('/', sessionController.getAvailableSessions);

// GET /api/sessions/:sessionId
router.get('/:sessionId', sessionController.getSessionById);

module.exports = router;