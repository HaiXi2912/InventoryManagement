const express = require('express');
const router = express.Router();

// 废弃供应商路由，统一返回404并提示已迁移为工厂模式
router.all('*', (req, res) => {
  res.status(404).json({ success: false, message: '供应商功能已下线，系统已切换为自有工厂模式' });
});

module.exports = router;
