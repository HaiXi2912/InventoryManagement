const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

// 操作日志表模型
const OperationLog = sequelize.define('OperationLog', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
    comment: '日志ID'
  },
  user_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    comment: '操作用户ID'
  },
  operation_type: {
    type: DataTypes.ENUM('login', 'logout', 'create', 'update', 'delete', 'import', 'export'),
    allowNull: false,
    comment: '操作类型'
  },
  module: {
    type: DataTypes.STRING(50),
    allowNull: false,
    comment: '操作模块'
  },
  operation_desc: {
    type: DataTypes.STRING(255),
    allowNull: false,
    comment: '操作描述'
  },
  target_id: {
    type: DataTypes.INTEGER,
    comment: '目标记录ID'
  },
  old_data: {
    type: DataTypes.JSON,
    comment: '原始数据'
  },
  new_data: {
    type: DataTypes.JSON,
    comment: '新数据'
  },
  ip_address: {
    type: DataTypes.STRING(45),
    comment: 'IP地址'
  },
  user_agent: {
    type: DataTypes.TEXT,
    comment: '用户代理'
  },
  http_method: {
    type: DataTypes.STRING(10),
    comment: 'HTTP 方法'
  },
  request_path: {
    type: DataTypes.STRING(255),
    comment: '请求路径'
  },
  duration_ms: {
    type: DataTypes.INTEGER,
    comment: '请求耗时（ms）'
  },
  status: {
    type: DataTypes.ENUM('success', 'failed'),
    defaultValue: 'success',
    comment: '操作状态'
  },
  error_message: {
    type: DataTypes.TEXT,
    comment: '错误信息'
  },
  meta: {
    type: DataTypes.JSON,
    comment: '额外元数据（如请求参数摘要）'
  }
}, {
  tableName: 'operation_logs',
  comment: '操作日志表'
});

module.exports = OperationLog;
