const express = require('express');
const { Op } = require('sequelize');
const { OperationLog, User } = require('../models');
const { authenticate, authorize } = require('../middleware/auth');

const router = express.Router();

/**
 * 获取操作日志（分页、筛选、导出）
 * GET /api/logs
 */
router.get('/', authenticate, authorize(['admin', 'manager']), async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      user_id,
      module,
      operation_type,
      status,
      start_date,
      end_date,
      keyword
    } = req.query;

    const offset = (parseInt(page) - 1) * parseInt(limit);
    const where = {};

    if (user_id) where.user_id = parseInt(user_id);
    if (module) where.module = module;
    if (operation_type) where.operation_type = operation_type;
    if (status) where.status = status;

    if (start_date || end_date) {
      where.created_at = {};
      if (start_date) where.created_at[Op.gte] = new Date(start_date);
      if (end_date) where.created_at[Op.lte] = new Date(end_date);
    }

    if (keyword) {
      where[Op.or] = [
        { operation_desc: { [Op.like]: `%${keyword}%` } },
        { error_message: { [Op.like]: `%${keyword}%` } },
        { request_path: { [Op.like]: `%${keyword}%` } },
      ];
    }

    const { count, rows } = await OperationLog.findAndCountAll({
      where,
      include: [{ model: User, as: 'user', attributes: ['id', 'username', 'real_name'] }],
      limit: parseInt(limit),
      offset,
      order: [['created_at', 'DESC']]
    });

    res.json({
      success: true,
      data: {
        logs: rows,
        pagination: {
          total: count,
          page: parseInt(page),
          limit: parseInt(limit),
          pages: Math.ceil(count / parseInt(limit))
        }
      }
    });
  } catch (err) {
    console.error('获取操作日志失败:', err);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

/**
 * 获取日志详情
 * GET /api/logs/:id
 */
router.get('/:id', authenticate, authorize(['admin', 'manager']), async (req, res) => {
  try {
    const item = await OperationLog.findByPk(req.params.id, {
      include: [{ model: User, as: 'user', attributes: ['id', 'username', 'real_name'] }]
    });
    if (!item) return res.status(404).json({ success: false, message: '日志不存在' });
    res.json({ success: true, data: { log: item } });
  } catch (err) {
    console.error('获取日志详情失败:', err);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

/**
 * 清理旧日志（按天数）
 * DELETE /api/logs?older_than_days=90
 */
router.delete('/', authenticate, authorize(['admin']), async (req, res) => {
  try {
    const older = parseInt(req.query.older_than_days || '90');
    const threshold = new Date(Date.now() - older * 24 * 60 * 60 * 1000);
    const result = await OperationLog.destroy({ where: { created_at: { [Op.lt]: threshold } } });
    res.json({ success: true, message: `已清理 ${result} 条日志` });
  } catch (err) {
    console.error('清理日志失败:', err);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

module.exports = router;
