const express = require('express');
const router = express.Router();
const orderController = require('../controllers/orderController');
const { verifyToken } = require('../middleware/auth');

// 小程序更新退款状态
router.put('/refunds/:refundId/status', orderController.updateRefundStatus);
router.get('/refunds/pending', orderController.getPendingRefunds);
router.post('/refunds/:refundId/process', orderController.processRefund);
router.post('/refunds/manual', orderController.createManualRefund);

router.post('/calculate', verifyToken, orderController.calculatePrice);


module.exports = router;