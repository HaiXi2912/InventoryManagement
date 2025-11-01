const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

// 用户表模型
const User = sequelize.define('User', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
    comment: '用户ID'
  },
  username: {
    type: DataTypes.STRING(50),
    allowNull: false,
    unique: true,
    comment: '用户名'
  },
  email: {
    type: DataTypes.STRING(100),
    allowNull: false,
    unique: true,
    comment: '邮箱'
  },
  password: {
    type: DataTypes.STRING(255),
    allowNull: false,
    comment: '密码哈希'
  },
  real_name: {
    type: DataTypes.STRING(50),
    comment: '真实姓名'
  },
  phone: {
    type: DataTypes.STRING(20),
    comment: '手机号码'
  },
  // 新增：连续登录失败计数
  failed_login_attempts: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0,
    comment: '连续登录失败次数'
  },
  // 新增：账户锁定截止时间
  locked_until: {
    type: DataTypes.DATE,
    allowNull: true,
    comment: '账户锁定截止时间（到期自动解锁）'
  },
  role: {
    type: DataTypes.ENUM('admin', 'manager', 'staff', 'customer', 'agent', 'factory'),
    defaultValue: 'staff',
    comment: '用户角色'
  },
  status: {
    type: DataTypes.ENUM('active', 'inactive', 'locked'),
    defaultValue: 'active',
    comment: '用户状态'
  },
  last_login_at: {
    type: DataTypes.DATE,
    comment: '最后登录时间'
  }
}, {
  tableName: 'users',
  comment: '用户表'
});

module.exports = User;
