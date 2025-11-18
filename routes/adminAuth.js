const express = require('express');
const router = express.Router();
const adminAuthController = require('../controllers/adminAuthController');
const { verifyAdmin } = require('../middleware/adminAuth');

// Public route
router.post('/login', adminAuthController.login);

// Protected route
router.get('/me', verifyAdmin, adminAuthController.getCurrentAdmin);

module.exports = router;