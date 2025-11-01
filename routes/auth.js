const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { User, RefreshToken, OperationLog, sequelize } = require('../models');
const { loginLimiter } = require('../middleware/validation');
const router = express.Router();
const { Op } = require('sequelize');

const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret_change_me';
const ACCESS_TOKEN_TTL = '24h';
const REFRESH_TOKEN_TTL_DAYS = 7;
const MAX_LOGIN_ATTEMPTS = 5;
const LOCK_MINUTES = 15;

// 开发环境禁用登录限流（便于测试），生产环境启用
const maybeLoginLimiter = process.env.NODE_ENV === 'development'
  ? (req, res, next) => next()
  : loginLimiter;

function generateAccessToken(user) {
  return jwt.sign(
    { id: user.id, username: user.username, role: user.role, account_type: user.account_type },
    JWT_SECRET,
    { expiresIn: ACCESS_TOKEN_TTL }
  );
}

function generateRefreshToken() {
  const token = crypto.randomBytes(48).toString('hex');
  const hashed = crypto.createHash('sha256').update(token).digest('hex');
  return { token, hashed };
}

async function issueRefreshToken(user, req, opts = {}) {
  const { token, hashed } = generateRefreshToken();
  const expiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000);
  const label = opts.label ?? req.body?.label ?? req.body?.device_label ?? req.get('X-Device-Label') ?? null;
  await RefreshToken.create({
    user_id: user.id,
    hashed_token: hashed,
    expires_at: expiresAt,
    created_by_ip: req.ip,
    user_agent: req.get('User-Agent'),
    label,
    last_used_at: new Date()
  });
  return token;
}

async function rotateRefreshToken(oldToken, user, req) {
  try {
    if (oldToken) {
      const hashedOld = crypto.createHash('sha256').update(oldToken).digest('hex');
      const record = await RefreshToken.findOne({ where: { user_id: user.id, hashed_token: hashedOld, revoked: false } });
      if (record) {
        await record.update({ revoked: true, revoked_at: new Date() });
        // 轮换：沿用旧会话的 label
        return issueRefreshToken(user, req, { label: record.label });
      }
    }
  } catch {}
  return issueRefreshToken(user, req);
}

async function isAccountLocked(user) {
  if (user.locked_until && user.locked_until > new Date()) return true;
  return false;
}

async function onLoginFail(user) {
  if (!user) return;
  const attempts = (user.failed_login_attempts || 0) + 1;
  const update = { failed_login_attempts: attempts };
  if (attempts >= MAX_LOGIN_ATTEMPTS) {
    update.locked_until = new Date(Date.now() + LOCK_MINUTES * 60 * 1000);
  }
  await user.update(update);
}

async function onLoginSuccess(user) {
  await user.update({ failed_login_attempts: 0, locked_until: null, last_login_at: new Date() });
}

// 登录接口（限流 + 账户锁定）
router.post('/login', maybeLoginLimiter, async (req, res) => {
  const { username, password } = req.body;
  
  if (!username || !password) {
    return res.status(400).json({ 
      success: false,
      message: '用户名和密码必填' 
    });
  }
  
  try {
    const user = await User.findOne({ where: { username } });
    
    if (!user) {
      return res.status(401).json({ 
        success: false,
        message: '用户不存在' 
      });
    }

    // 账户锁定检查
    if (await isAccountLocked(user) || user.status === 'locked') {
      return res.status(423).json({
        success: false,
        message: `账户已锁定，请稍后再试`,
        locked_until: user.locked_until
      });
    }
    
    const valid = await bcrypt.compare(password, user.password);
    
    if (!valid) {
      await onLoginFail(user);
      return res.status(401).json({ 
        success: false,
        message: '密码错误' 
      });
    }
    
    await onLoginSuccess(user);
    
    const token = generateAccessToken(user);
    const refreshToken = await issueRefreshToken(user, req);

    // 登录成功记录日志
    try {
      await OperationLog.create({
        user_id: user.id,
        operation_type: 'login',
        module: '认证',
        operation_desc: '用户登录',
        ip_address: req.ip,
        user_agent: req.get('User-Agent'),
        http_method: req.method,
        request_path: req.originalUrl,
        status: 'success'
      });
    } catch {}
    
    res.json({ 
      success: true,
      message: '登录成功',
      data: {
        token, 
        refresh_token: refreshToken,
        user: { 
          id: user.id, 
          username: user.username, 
          role: user.role, 
          account_type: user.account_type,
          real_name: user.real_name,
          email: user.email
        }
      }
    });
  } catch (err) {
    console.error('[登录接口异常]', err);
    if (err instanceof Error && err.stack) {
      console.error('[登录异常堆栈]', err.stack);
    }
    res.status(500).json({ 
      success: false,
      message: '服务器错误',
      error: err.message || err
    });
  }
});

// 注册接口（同步创建客户档案）
router.post('/register', async (req, res) => {
  let { username, password, email, real_name, phone } = req.body || {};

  // 规范化输入
  username = (username || '').trim();
  email = (email || '').trim().toLowerCase();
  real_name = (real_name || '').trim();
  phone = (phone || '').trim();

  // 基础校验：用户名仅限英数字下划线/中划线，4~32 位；邮箱必填；密码最少 6 位
  const usernameOk = /^[A-Za-z0-9][A-Za-z0-9_.-]{3,31}$/.test(username);
  const emailOk = /.+@.+\..+/.test(email);
  if (!username || !password || !email) {
    return res.status(400).json({ success: false, message: '用户名、密码、邮箱必填' });
  }
  if (!usernameOk) {
    return res.status(400).json({ success: false, message: '用户名需为英数字/.-/_ 组成，长度4-32，且不能为中文' });
  }
  if (!emailOk) {
    return res.status(400).json({ success: false, message: '邮箱格式不正确' });
  }
  if (String(password).length < 6) {
    return res.status(400).json({ success: false, message: '密码长度至少6位' });
  }

  const t = await sequelize.transaction();
  try {
    // 唯一性校验（用户名/邮箱）
    const exists = await User.findOne({ where: { [Op.or]: [{ username }, { email }] } });
    if (exists) {
      const msg = exists.username === username ? '用户名已存在' : '邮箱已存在';
      await t.rollback();
      return res.status(409).json({ success: false, message: msg });
    }

    const hash = await bcrypt.hash(password, 10);
    const user = await User.create({
      username,
      password: hash,
      email,
      real_name,
      phone,
      role: 'customer',
      account_type: 'user',
      status: 'active',
    }, { transaction: t });

    // 生成平台唯一客户编码（仅英文与数字），如 CU000123
    const platformCode = `CU${String(user.id).padStart(6, '0')}`;

    // 同步创建 Customer 档案
    const { Customer, WalletTransaction } = require('../models');
    await Customer.create({
      id: user.id,
      name: real_name || username,
      code: platformCode,
      email,
      phone,
      customer_type: 'retail',
      status: 'active',
      wallet_balance: 0,
    }, { transaction: t });

    // 默认发放 1000 余额给购物用户（记录钱包流水）
    await WalletTransaction.create({
      user_id: user.id,
      change_amount: 1000,
      before_balance: 0,
      after_balance: 1000,
      type: 'recharge',
      ref_type: 'signup_bonus',
      operator_id: null,
      remark: '注册赠送余额'
    }, { transaction: t });

    await t.commit();
    return res.status(201).json({
      success: true,
      message: '注册成功',
      data: {
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
          real_name: user.real_name,
          account_type: user.account_type
        },
        customer: { code: platformCode },
        bonus: 1000
      },
    });
  } catch (err) {
    await t.rollback();
    console.error('注册错误:', err);
    // 如果是唯一索引冲突等
    if (err && (err.name === 'SequelizeUniqueConstraintError')) {
      return res.status(409).json({ success: false, message: '用户名或邮箱已存在' });
    }
    return res.status(500).json({ success: false, message: '服务器错误' });
  }
});

// JWT校验中间件
function authMiddleware(req, res, next) {
  const token = req.headers['authorization']?.replace('Bearer ', '');
  
  if (!token) {
    return res.status(401).json({ 
      success: false,
      message: '未登录或令牌缺失' 
    });
  }
  
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ 
      success: false,
      message: '令牌无效或已过期' 
    });
  }
}

// 角色校验中间件（仅允许指定角色访问）
function requireRoles(roles = []) {
  return (req, res, next) => {
    if (!req.user || (roles.length && !roles.includes(req.user.role))) {
      return res.status(403).json({ success: false, message: '无权限' });
    }
    next();
  };
}

// 获取当前用户信息
router.get('/me', authMiddleware, async (req, res) => {
  try {
    const user = await User.findByPk(req.user.id, { 
      attributes: { exclude: ['password'] } 
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
  } catch (err) {
    console.error('获取用户信息错误:', err);
    res.status(500).json({ 
      success: false,
      message: '服务器错误' 
    });
  }
});

// 修改密码（支持 POST 与 PUT）
async function changePasswordHandler(req, res) {
  try {
    const { password, newPassword } = req.body || {};
    if (!password || !newPassword) {
      return res.status(400).json({
        success: false,
        message: '当前密码与新密码必填'
      });
    }

    const user = await User.findByPk(req.user.id);
    if (!user) {
      return res.status(404).json({ success: false, message: '用户不存在' });
    }

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) {
      return res.status(400).json({ success: false, message: '当前密码不正确' });
    }

    const hashed = await bcrypt.hash(newPassword, 10);
    await user.update({ password: hashed });

    return res.json({ success: true, message: '密码修改成功' });
  } catch (err) {
    console.error('修改密码错误:', err);
    return res.status(500).json({ success: false, message: '服务器错误' });
  }
}
router.post('/password', authMiddleware, changePasswordHandler);
router.put('/password', authMiddleware, changePasswordHandler);

// 刷新令牌（轮换刷新令牌）
router.post('/refresh', async (req, res) => {
  try {
    const refreshToken = req.body?.refresh_token;
    if (!refreshToken) {
      return res.status(400).json({ success: false, message: '缺少刷新令牌' });
    }
    const hashed = crypto.createHash('sha256').update(refreshToken).digest('hex');
    const record = await RefreshToken.findOne({ where: { hashed_token: hashed, revoked: false } });
    if (!record) {
      return res.status(401).json({ success: false, message: '刷新令牌无效' });
    }
    if (new Date(record.expires_at) <= new Date()) {
      await record.update({ revoked: true, revoked_at: new Date() });
      return res.status(401).json({ success: false, message: '刷新令牌已过期' });
    }
    const user = await User.findByPk(record.user_id);
    if (!user || user.status !== 'active') {
      return res.status(401).json({ success: false, message: '用户状态异常' });
    }

    // 标记最近使用时间
    try { await record.update({ last_used_at: new Date() }); } catch (_) {}
    
    // 颁发新access token并轮换refresh token
    const newAccessToken = generateAccessToken(user);
    const newRefreshToken = await rotateRefreshToken(refreshToken, user, req);

    res.json({
      success: true,
      message: '令牌刷新成功',
      data: { token: newAccessToken, refresh_token: newRefreshToken }
    });
  } catch (err) {
    console.error('刷新令牌失败:', err);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

// 退出登录（幂等，可选撤销刷新令牌）
router.post('/logout', async (req, res) => {
  try {
    const refreshToken = req.body?.refresh_token;
    if (refreshToken) {
      const hashed = crypto.createHash('sha256').update(refreshToken).digest('hex');
      const record = await RefreshToken.findOne({ where: { hashed_token: hashed, revoked: false } });
      if (record) {
        await record.update({ revoked: true, revoked_at: new Date() });
      }
    }

    // 可选记录登出（若有可解出的用户信息）
    try {
      const authHeader = req.headers['authorization'];
      const raw = authHeader?.replace('Bearer ', '');
      if (raw) {
        const decoded = jwt.verify(raw, JWT_SECRET);
        await OperationLog.create({
          user_id: decoded.id,
          operation_type: 'logout',
          module: '认证',
          operation_desc: '用户退出',
          ip_address: req.ip,
          user_agent: req.get('User-Agent'),
          http_method: req.method,
          request_path: req.originalUrl,
          status: 'success'
        });
      }
    } catch {}

    res.json({
      success: true,
      message: '退出登录成功'
    });
  } catch (e) {
    res.json({ success: true, message: '退出登录成功' });
  }
});

// 会话管理：列出当前用户的刷新令牌会话
router.get('/sessions', authMiddleware, async (req, res) => {
  try {
    const list = await RefreshToken.findAll({
      where: { user_id: req.user.id },
      order: [[ 'id', 'DESC' ]]
    });
    res.json({ success: true, data: { sessions: list } });
  } catch (err) {
    console.error('获取会话失败:', err);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

// 会话管理：撤销指定会话（只能操作自己的）
router.delete('/sessions/:id', authMiddleware, async (req, res) => {
  try {
    const id = req.params.id;
    const record = await RefreshToken.findByPk(id);
    if (!record || record.user_id !== req.user.id) {
      return res.status(404).json({ success: false, message: '会话不存在' });
    }
    if (!record.revoked) {
      await record.update({ revoked: true, revoked_at: new Date() });
    }
    res.json({ success: true, message: '会话已撤销' });
  } catch (err) {
    console.error('撤销会话失败:', err);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

// 会话管理：撤销除指定会话外的其他会话
router.post('/sessions/revoke-others', authMiddleware, async (req, res) => {
  try {
    const keepId = req.body?.keep_id;
    const where = { user_id: req.user.id, revoked: false };
    if (keepId) where.id = { [Op.ne]: keepId };
    await RefreshToken.update(
      { revoked: true, revoked_at: new Date() },
      { where }
    );
    res.json({ success: true, message: '其他会话已撤销' });
  } catch (err) {
    console.error('撤销其他会话失败:', err);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

// 会话管理：一键撤销当前用户的全部会话
router.post('/sessions/logout-all', authMiddleware, async (req, res) => {
  try {
    await RefreshToken.update(
      { revoked: true, revoked_at: new Date() },
      { where: { user_id: req.user.id, revoked: false } }
    );
    res.json({ success: true, message: '已注销全部会话' });
  } catch (err) {
    console.error('注销全部会话失败:', err);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

// 操作日志：获取当前用户最近活动（分页）
router.get('/activity', authMiddleware, async (req, res) => {
  try {
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const pageSize = Math.min(Math.max(parseInt(req.query.pageSize, 10) || 20, 1), 100);
    const offset = (page - 1) * pageSize;
    const { rows, count } = await OperationLog.findAndCountAll({
      where: { user_id: req.user.id },
      order: [['id', 'DESC']],
      limit: pageSize,
      offset
    });
    res.json({ success: true, data: { list: rows, page, pageSize, total: count } });
  } catch (err) {
    console.error('获取活动日志失败:', err);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

// 管理端：系统诊断（数据库连接与关键计数）
router.get('/diagnostics', authMiddleware, requireRoles(['admin']), async (req, res) => {
  try {
    let dbConnected = false;
    try {
      await sequelize.authenticate();
      dbConnected = true;
    } catch (_) {}

    let users = 0, tokens = 0, logs = 0;
    try { users = await User.count(); } catch (_) {}
    try { tokens = await RefreshToken.count(); } catch (_) {}
    try { logs = await OperationLog.count(); } catch (_) {}

    res.json({
      success: true,
      data: {
        timestamp: new Date().toISOString(),
        database: dbConnected ? 'connected' : 'disconnected',
        counts: { users, refresh_tokens: tokens, operation_logs: logs }
      }
    });
  } catch (err) {
    console.error('系统诊断失败:', err);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

// 管理端：解锁用户账号（清空失败次数与锁定时间）
router.post('/users/:id/unlock', authMiddleware, requireRoles(['admin']), async (req, res) => {
  try {
    const user = await User.findByPk(req.params.id);
    if (!user) return res.status(404).json({ success: false, message: '用户不存在' });
    await user.update({ failed_login_attempts: 0, locked_until: null, status: 'active' });
    res.json({ success: true, message: '用户已解锁' });
  } catch (err) {
    console.error('解锁用户失败:', err);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

// 管理后台：删除用户（软删除），仅管理员
router.delete('/user/:id', async (req, res) => {
  try{
    // 简化：通过 header token 做一次校验（正式项目应复用全局中间件）
    const auth = req.headers['authorization']?.replace('Bearer ', '')
    if(!auth) return res.status(401).json({ success:false, message:'未登录' })
    const decoded = jwt.verify(auth, JWT_SECRET)
    if(decoded?.role !== 'admin') return res.status(403).json({ success:false, message:'无权限' })
    if(String(decoded?.id) === String(req.params.id)) return res.status(400).json({ success:false, message:'不能删除自己' })
    const u = await User.findByPk(req.params.id)
    if(!u) return res.status(404).json({ success:false, message:'用户不存在' })
    await u.update({ status:'inactive' })
    res.json({ success:true, message:'已禁用' })
  }catch(e){
    res.status(500).json({ success:false, message:'删除失败' })
  }
})

module.exports = router;
