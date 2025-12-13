const express = require('express');
const router = express.Router();
const orderController = require('../controllers/orderController');
const { verifyToken } = require('../middleware/auth');

router.post('/calculate', verifyToken, orderController.calculatePrice);

module.exports = router;