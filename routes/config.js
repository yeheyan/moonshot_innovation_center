// routes/config.js
const express = require('express');
const router = express.Router();
const configController = require('../controllers/configController');
const { verifyToken } = require('../middleware/auth');

router.use(verifyToken);

// 获取所有配置
router.get('/', configController.getAllConfigs);

// 获取单个配置
router.get('/:key', configController.getConfig);

// 更新单个配置
router.put('/:key', configController.updateConfig);

// 批量更新配置
router.put('/', configController.updateConfigs);

module.exports = router;