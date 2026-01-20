const express = require('express');
const router = express.Router();
const orderController = require('../controllers/orderController');
const { verifyToken } = require('../middleware/auth');

// 小程序更新退款状态
router.put('/refunds/:refundId/status', orderController.updateRefundStatus);

// 管理员处理退款（批准/拒绝）
router.post('/refunds/:refundId/process', orderController.processRefund);

// 管理员手动创建退款
router.post('/refunds/manual', orderController.createManualRefund);

// 获取待处理退款
router.get('/refunds/pending', orderController.getPendingRefunds);

router.post('/calculate', verifyToken, orderController.calculatePrice);

module.exports = router;