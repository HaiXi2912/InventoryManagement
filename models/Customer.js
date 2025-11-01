const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

// 客户表模型
const Customer = sequelize.define('Customer', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
    comment: '客户ID'
  },
  name: {
    type: DataTypes.STRING(100),
    allowNull: false,
    comment: '客户姓名'
  },
  code: {
    type: DataTypes.STRING(20),
    unique: true,
    comment: '客户编码'
  },
  phone: {
    type: DataTypes.STRING(20),
    comment: '手机号码'
  },
  email: {
    type: DataTypes.STRING(100),
    comment: '邮箱'
  },
  address: {
    type: DataTypes.TEXT,
    comment: '收货地址'
  },
  id_card: {
    type: DataTypes.STRING(20),
    comment: '身份证号'
  },
  gender: {
    type: DataTypes.ENUM('male', 'female', 'unknown'),
    defaultValue: 'unknown',
    comment: '性别'
  },
  birthday: {
    type: DataTypes.DATE,
    comment: '生日'
  },
  customer_type: {
    type: DataTypes.ENUM('retail', 'channel', 'vip'),
    defaultValue: 'retail',
    comment: '客户类型'
  },
  wallet_balance: {
    type: DataTypes.DECIMAL(12, 2),
    defaultValue: 0,
    comment: '虚拟钱包余额'
  },
  allow_return: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    comment: '是否允许退货（渠道商可开通）'
  },
  price_tier: {
    type: DataTypes.ENUM('retail', 'wholesale'),
    defaultValue: 'retail',
    comment: '价格层级：零售/批发'
  },
  credit_limit: {
    type: DataTypes.DECIMAL(10, 2),
    defaultValue: 0,
    comment: '信用额度'
  },
  status: {
    type: DataTypes.ENUM('active', 'inactive'),
    defaultValue: 'active',
    comment: '状态'
  },
  remark: {
    type: DataTypes.TEXT,
    comment: '备注'
  }
}, {
  tableName: 'customers',
  comment: '客户表'
});

module.exports = Customer;
