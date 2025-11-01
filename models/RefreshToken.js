const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

// 刷新令牌表模型（用于长会话与令牌轮换）
const RefreshToken = sequelize.define('RefreshToken', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
    comment: '主键ID'
  },
  user_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    comment: '用户ID'
  },
  // 存储哈希后的refresh token，避免明文落库
  hashed_token: {
    type: DataTypes.STRING(255),
    allowNull: false,
    comment: '哈希后的刷新令牌'
  },
  expires_at: {
    type: DataTypes.DATE,
    allowNull: false,
    comment: '过期时间'
  },
  revoked: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
    comment: '是否已撤销'
  },
  revoked_at: {
    type: DataTypes.DATE,
    allowNull: true,
    comment: '撤销时间'
  },
  created_by_ip: {
    type: DataTypes.STRING(45),
    allowNull: true,
    comment: '创建IP'
  },
  user_agent: {
    type: DataTypes.TEXT,
    allowNull: true,
    comment: 'UA'
  },
  // 新增：人类可读的设备/会话标签
  label: {
    type: DataTypes.STRING(100),
    allowNull: true,
    comment: '设备/会话标签'
  },
  // 新增：最近使用时间（用于活动排序与清理）
  last_used_at: {
    type: DataTypes.DATE,
    allowNull: true,
    comment: '最近使用时间'
  }
}, {
  tableName: 'refresh_tokens',
  comment: '刷新令牌表'
});

module.exports = RefreshToken;
