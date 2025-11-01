const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

// 工厂费用结算（按日/按月）
const FactoryPayment = sequelize.define('FactoryPayment', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  scope_type: { type: DataTypes.ENUM('daily','monthly'), allowNull: false },
  // daily: YYYY-MM-DD, monthly: YYYY-MM
  scope_value: { type: DataTypes.STRING(10), allowNull: false },
  amount: { type: DataTypes.DECIMAL(14,2), allowNull: false, defaultValue: 0 },
  method: { type: DataTypes.ENUM('cash','card','transfer','alipay','wechat','other'), allowNull: false, defaultValue: 'transfer' },
  paid_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  operator_id: { type: DataTypes.INTEGER, allowNull: true },
  remark: { type: DataTypes.TEXT, allowNull: true },
}, {
  tableName: 'factory_payments',
  comment: '工厂费用结算记录（按日/按月）',
});

module.exports = FactoryPayment;
