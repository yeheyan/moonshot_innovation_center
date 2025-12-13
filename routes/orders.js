const express = require('express');
const router = express.Router();
const orderController = require('../controllers/orderController');
const { verifyToken } = require('../middleware/auth');

router.get('/refunds/pending', orderController.getPendingRefunds);
router.post('/refunds/:refundId/process', orderController.processRefund);
router.post('/refunds/manual', orderController.createManualRefund);

router.post('/calculate', verifyToken, orderController.calculatePrice);


module.exports = router;