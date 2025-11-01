const jwt = require('jsonwebtoken');
const User = require('../models/User');

/**
 * JWT认证中间件
 * 验证请求头中的JWT token
 */
const authenticate = async (req, res, next) => {
  try {
    // 从请求头获取token
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        message: '未提供认证令牌'
      });
    }

    const token = authHeader.substring(7); // 移除 'Bearer ' 前缀

    // 验证token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // 查找用户
    const user = await User.findByPk(decoded.id, {
      attributes: ['id', 'username', 'email', 'real_name', 'role', 'status', 'account_type']
    });

    if (!user) {
      return res.status(401).json({
        success: false,
        message: '用户不存在'
      });
    }

    if (user.status !== 'active') {
      return res.status(401).json({
        success: false,
        message: '用户账户已被禁用'
      });
    }

    // 将用户信息添加到请求对象
    req.user = user;
    next();

  } catch (error) {
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({
        success: false,
        message: '无效的认证令牌'
      });
    }
    
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        message: '认证令牌已过期'
      });
    }

    console.error('认证中间件错误:', error);
    return res.status(500).json({
      success: false,
      message: '认证服务器错误'
    });
  }
};

/**
 * 角色权限检查中间件
 * @param {string[]} allowedRoles - 允许的角色列表
 */
const authorize = (allowedRoles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: '未认证的请求'
      });
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: '权限不足'
      });
    }

    next();
  };
};

/**
 * 可选认证中间件
 * 如果提供了token则验证，否则继续执行
 */
const optionalAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      
      const user = await User.findByPk(decoded.id, {
        attributes: ['id', 'username', 'email', 'real_name', 'role', 'status', 'account_type']
      });

      if (user && user.status === 'active') {
        req.user = user;
      }
    }

    next();
  } catch (error) {
    // 可选认证失败时不阻止请求继续
    next();
  }
};

module.exports = {
  authenticate,
  authorize,
  optionalAuth
};
