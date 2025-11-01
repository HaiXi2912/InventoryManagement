const express = require('express');
const { Op } = require('sequelize');
const { User, WalletTransaction } = require('../models');
const { authenticate, authorize } = require('../middleware/auth');
const { logOperation, saveOldData } = require('../middleware/logger');
const { validateInput, apiLimiter } = require('../middleware/validation');
const bcrypt = require('bcryptjs');
const joi = require('joi');

const router = express.Router();

// 应用API限流
router.use(apiLimiter);

// 验证规则定义
const createUserSchema = joi.object({
  username: joi.string().alphanum().min(3).max(30).required(),
  email: joi.string().email().required(),
  password: joi.string().min(6).pattern(new RegExp('^(?=.*[a-zA-Z])(?=.*\\d)')).required(),
  real_name: joi.string().max(50),
  phone: joi.string().pattern(/^1[3-9]\d{9}$/),
  role: joi.string().valid('admin', 'manager', 'staff', 'customer', 'agent', 'factory').required()
});

const updateUserSchema = joi.object({
  username: joi.string().alphanum().min(3).max(30),
  email: joi.string().email(),
  real_name: joi.string().max(50).allow(''),
  phone: joi.string().pattern(/^1[3-9]\d{9}$/).allow(''),
  role: joi.string().valid('admin', 'manager', 'staff', 'customer', 'agent', 'factory'),
  status: joi.string().valid('active', 'inactive', 'locked')
});

const resetPasswordSchema = joi.object({
  new_password: joi.string().min(6).pattern(new RegExp('^(?=.*[a-zA-Z])(?=.*\\d)')).required()
});

/**
 * 获取用户列表
 * GET /api/users
 */
router.get('/',
  authenticate,
  authorize(['admin', 'manager']),
  async (req, res) => {
    try {
      const { page = 1, limit = 10, role, status, search } = req.query;
      const offset = (parseInt(page) - 1) * parseInt(limit);

      // 构建查询条件
      const where = {};
      if (role) where.role = role;
      if (status) where.status = status;
      if (search) {
        where[Op.or] = [
          { username: { [Op.like]: `%${search}%` } },
          { real_name: { [Op.like]: `%${search}%` } },
          { email: { [Op.like]: `%${search}%` } }
        ];
      }

      const { count, rows: users } = await User.findAndCountAll({
        where,
        attributes: ['id', 'username', 'email', 'real_name', 'phone', 'role', 'status', 'last_login_at', 'created_at'],
        limit: parseInt(limit),
        offset,
        order: [['created_at', 'DESC']]
      });

      res.json({
        success: true,
        data: {
          users,
          pagination: {
            total: count,
            page: parseInt(page),
            limit: parseInt(limit),
            pages: Math.ceil(count / parseInt(limit))
          }
        }
      });

    } catch (error) {
      console.error('获取用户列表失败:', error);
      res.status(500).json({
        success: false,
        message: '获取用户列表失败'
      });
    }
  }
);

/**
 * 获取单个用户信息
 * GET /api/users/:id
 */
router.get('/:id',
  authenticate,
  authorize(['admin', 'manager']),
  async (req, res) => {
    try {
      const { id } = req.params;

      const user = await User.findByPk(id, {
        attributes: ['id', 'username', 'email', 'real_name', 'phone', 'role', 'status', 'last_login_at', 'created_at', 'updated_at']
      });

      if (!user) {
        return res.status(404).json({
          success: false,
          message: '用户不存在'
        });
      }

      res.json({
        success: true,
        data: { user }
      });

    } catch (error) {
      console.error('获取用户信息失败:', error);
      res.status(500).json({
        success: false,
        message: '获取用户信息失败'
      });
    }
  }
);

/**
 * 创建用户
 * POST /api/users
 */
router.post('/',
  authenticate,
  authorize(['admin']),
  validateInput(createUserSchema),
  logOperation('用户管理', 'create'),
  async (req, res) => {
    try {
      const { username, email, password, real_name, phone, role } = req.body;

      // 检查用户名和邮箱是否已存在
      const existingUser = await User.findOne({
        where: {
          [Op.or]: [{ username }, { email }]
        }
      });

      if (existingUser) {
        return res.status(400).json({
          success: false,
          message: existingUser.username === username ? '用户名已存在' : '邮箱已存在'
        });
      }

      // 加密密码
      const hashedPassword = await bcrypt.hash(password, 12);

      // 创建用户
      const user = await User.create({
        username,
        email,
        password: hashedPassword,
        real_name,
        phone,
        role,
        status: 'active'
      });

      // 返回用户信息（不包含密码）
      const userResponse = {
        id: user.id,
        username: user.username,
        email: user.email,
        real_name: user.real_name,
        phone: user.phone,
        role: user.role,
        status: user.status,
        created_at: user.created_at
      };

      res.status(201).json({
        success: true,
        message: '用户创建成功',
        data: { user: userResponse }
      });

    } catch (error) {
      console.error('创建用户失败:', error);
      res.status(500).json({
        success: false,
        message: '创建用户失败'
      });
    }
  }
);

/**
 * 更新用户信息
 * PUT /api/users/:id
 */
router.put('/:id',
  authenticate,
  authorize(['admin']),
  saveOldData(User),
  validateInput(updateUserSchema),
  logOperation('用户管理', 'update'),
  async (req, res) => {
    try {
      const { id } = req.params;
      const { username, email, real_name, phone, role, status } = req.body;

      // 检查用户是否存在
      const user = await User.findByPk(id);
      if (!user) {
        return res.status(404).json({
          success: false,
          message: '用户不存在'
        });
      }

      // 检查用户名和邮箱是否被其他用户使用
      if (username || email) {
        const existingUser = await User.findOne({
          where: {
            [Op.and]: [
              { id: { [Op.ne]: id } },
              {
                [Op.or]: [
                  ...(username ? [{ username }] : []),
                  ...(email ? [{ email }] : [])
                ]
              }
            ]
          }
        });

        if (existingUser) {
          return res.status(400).json({
            success: false,
            message: existingUser.username === username ? '用户名已存在' : '邮箱已存在'
          });
        }
      }

      // 更新用户信息
      await user.update({
        username: username || user.username,
        email: email || user.email,
        real_name: real_name !== undefined ? real_name : user.real_name,
        phone: phone !== undefined ? phone : user.phone,
        role: role || user.role,
        status: status || user.status
      });

      // 获取更新后的用户信息
      const updatedUser = await User.findByPk(id, {
        attributes: ['id', 'username', 'email', 'real_name', 'phone', 'role', 'status', 'updated_at']
      });

      res.json({
        success: true,
        message: '用户信息更新成功',
        data: { user: updatedUser }
      });

    } catch (error) {
      console.error('更新用户失败:', error);
      res.status(500).json({
        success: false,
        message: '更新用户失败'
      });
    }
  }
);

/**
 * 删除用户
 * DELETE /api/users/:id
 */
router.delete('/:id',
  authenticate,
  authorize(['admin']),
  saveOldData(User),
  logOperation('用户管理', 'delete'),
  async (req, res) => {
    try {
      const { id } = req.params;

      // 检查用户是否存在
      const user = await User.findByPk(id);
      if (!user) {
        return res.status(404).json({
          success: false,
          message: '用户不存在'
        });
      }

      // 不允许删除自己
      if (parseInt(id) === req.user.id) {
        return res.status(400).json({
          success: false,
          message: '不能删除自己的账户'
        });
      }

      // 软删除（设置状态为inactive）而不是物理删除
      await user.update({ status: 'inactive' });

      res.json({
        success: true,
        message: '用户已禁用'
      });

    } catch (error) {
      console.error('删除用户失败:', error);
      res.status(500).json({
        success: false,
        message: '删除用户失败'
      });
    }
  }
);

/**
 * 重置用户密码
 * PUT /api/users/:id/reset-password
 */
router.put('/:id/reset-password',
  authenticate,
  authorize(['admin']),
  validateInput(resetPasswordSchema),
  logOperation('用户管理', 'update'),
  async (req, res) => {
    try {
      const { id } = req.params;
      const { new_password } = req.body;

      // 检查用户是否存在
      const user = await User.findByPk(id);
      if (!user) {
        return res.status(404).json({
          success: false,
          message: '用户不存在'
        });
      }

      // 加密新密码
      const hashedPassword = await bcrypt.hash(new_password, 12);

      // 更新密码
      await user.update({ password: hashedPassword });

      res.json({
        success: true,
        message: '密码重置成功'
      });

    } catch (error) {
      console.error('重置密码失败:', error);
      res.status(500).json({
        success: false,
        message: '重置密码失败'
      });
    }
  }
);

/**
 * 用户钱包：查询余额（基于最近一条流水的 after_balance 计算）
 * GET /api/users/:id/wallet
 */
router.get('/:id/wallet',
  authenticate,
  authorize(['admin', 'manager', 'staff']),
  async (req, res) => {
    try {
      const { id } = req.params;
      const u = await User.findByPk(id, { attributes: ['id'] });
      if (!u) return res.status(404).json({ success: false, message: '用户不存在' });
      const last = await WalletTransaction.findOne({ where: { user_id: id }, order: [['id', 'DESC']] });
      const balance = Number(last?.after_balance ?? 0);
      res.json({ success: true, data: { balance } });
    } catch (e) {
      res.status(500).json({ success: false, message: '查询失败' });
    }
  }
);

/**
 * 用户钱包：后台调账
 * POST /api/users/:id/wallet/adjust
 * body: { amount, type?, remark? }
 */
router.post('/:id/wallet/adjust',
  authenticate,
  authorize(['admin', 'manager']),
  async (req, res) => {
    try {
      const { id } = req.params;
      const { amount, type = 'adjust', remark } = req.body || {};
      if (!amount || Number(amount) === 0) return res.status(400).json({ success: false, message: '金额不能为空' });
      const u = await User.findByPk(id, { attributes: ['id'] });
      if (!u) return res.status(404).json({ success: false, message: '用户不存在' });
      const last = await WalletTransaction.findOne({ where: { user_id: id }, order: [['id', 'DESC']] });
      const before = Number(last?.after_balance ?? 0);
      const after = Number((before + Number(amount)).toFixed(2));
      const tx = await WalletTransaction.create({ user_id: id, change_amount: Number(amount), before_balance: before, after_balance: after, type, ref_type: 'manual', operator_id: req.user.id, remark: remark || '后台用户余额调账' });
      res.json({ success: true, message: '余额已调整', data: { balance: after, tx } });
    } catch (e) {
      res.status(500).json({ success: false, message: '调整失败' });
    }
  }
);

/**
 * 用户钱包：流水
 * GET /api/users/:id/wallet/transactions
 */
router.get('/:id/wallet/transactions',
  authenticate,
  authorize(['admin', 'manager', 'staff']),
  async (req, res) => {
    try {
      const { id } = req.params; const { page = 1, limit = 20 } = req.query;
      const per = parseInt(limit); const cur = parseInt(page); const offset = (cur - 1) * per;
      const { rows, count } = await WalletTransaction.findAndCountAll({ where: { user_id: id }, order: [['id', 'DESC']], limit: per, offset });
      res.json({ success: true, data: { items: rows, pagination: { total: count, page: cur, limit: per } } });
    } catch (e) {
      res.status(500).json({ success: false, message: '查询失败' });
    }
  }
);

module.exports = router;
