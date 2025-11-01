const { OperationLog } = require('../models');

/**
 * 操作日志记录中间件
 * @param {string} module - 操作模块
 * @param {string} operationType - 操作类型
 */
const logOperation = (module, operationType) => {
  return async (req, res, next) => {
    // 保存原始的响应方法
    const originalSend = res.send;
    const originalJson = res.json;
    
    // 记录请求开始时间
    const startTime = Date.now();
    
    // 获取客户端IP
    const ipAddress = req.ip || 
                     req.connection.remoteAddress || 
                     req.socket.remoteAddress ||
                     (req.connection.socket ? req.connection.socket.remoteAddress : null);

    // 重写响应方法以捕获响应数据
    let responseData = null;
    let statusCode = 200;

    res.send = function(data) {
      responseData = data;
      statusCode = res.statusCode;
      return originalSend.call(this, data);
    };

    res.json = function(data) {
      responseData = data;
      statusCode = res.statusCode;
      return originalJson.call(this, data);
    };

    // 在响应结束时记录日志
    res.on('finish', async () => {
      try {
        // 只记录已认证用户的操作
        if (req.user) {
          const duration = Date.now() - startTime;
          const logData = {
            user_id: req.user.id,
            operation_type: operationType,
            module: module,
            operation_desc: generateOperationDesc(req, operationType, module),
            target_id: extractTargetId(req),
            old_data: req.oldData || null,
            new_data: extractNewData(req, responseData),
            ip_address: ipAddress,
            user_agent: req.get('User-Agent'),
            http_method: req.method,
            request_path: req.originalUrl || req.url,
            duration_ms: duration,
            status: statusCode >= 200 && statusCode < 400 ? 'success' : 'failed',
            error_message: statusCode >= 400 ? stringifySafely(responseData) : null,
            meta: buildMeta(req)
          };

          await OperationLog.create(logData);
        }
      } catch (error) {
        console.error('记录操作日志失败:', error);
      }
    });

    next();
  };
};

function stringifySafely(data) {
  try {
    if (typeof data === 'string') return data;
    return JSON.stringify(data);
  } catch {
    return null;
  }
}

function buildMeta(req) {
  try {
    const q = req.query || {};
    const meta = {
      queryKeys: Object.keys(q),
      hasBody: !!req.body && Object.keys(req.body).length > 0,
    };
    return meta;
  } catch {
    return null;
  }
}

/**
 * 生成操作描述
 */
function generateOperationDesc(req, operationType, module) {
  const method = req.method;
  const path = req.route ? req.route.path : req.path;
  
  const actionMap = {
    'login': '用户登录',
    'logout': '用户退出',
    'create': `创建${module}`,
    'update': `更新${module}`,
    'delete': `删除${module}`,
    'import': `导入${module}数据`,
    'export': `导出${module}数据`
  };

  const action = actionMap[operationType] || `${method} ${path}`;
  return action;
}

/**
 * 提取目标记录ID
 */
function extractTargetId(req) {
  // 从URL参数中提取ID
  if (req.params.id) {
    return parseInt(req.params.id);
  }
  
  // 从请求体中提取ID
  if (req.body && req.body.id) {
    return parseInt(req.body.id);
  }
  
  return null;
}

/**
 * 提取新数据
 */
function extractNewData(req, responseData) {
  if (req.method === 'POST' || req.method === 'PUT' || req.method === 'PATCH') {
    try {
      // 过滤敏感信息
      const filteredBody = { ...req.body };
      delete filteredBody.password;
      delete filteredBody.confirmPassword;
      
      return filteredBody;
    } catch (error) {
      return null;
    }
  }
  
  return null;
}

/**
 * 保存旧数据的中间件（用于更新操作）
 */
const saveOldData = (model) => {
  return async (req, res, next) => {
    try {
      if (req.params.id && (req.method === 'PUT' || req.method === 'PATCH' || req.method === 'DELETE')) {
        const oldRecord = await model.findByPk(req.params.id);
        if (oldRecord) {
          req.oldData = oldRecord.toJSON();
          // 移除敏感信息
          delete req.oldData.password;
        }
      }
      next();
    } catch (error) {
      console.error('保存旧数据失败:', error);
      next();
    }
  };
};

module.exports = {
  logOperation,
  saveOldData
};
