const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

// 应付交易（采购付款）
const APTransaction = sequelize.define('APTransaction', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  purchase_id: { type: DataTypes.INTEGER, allowNull: false },
  amount: { type: DataTypes.DECIMAL(12, 2), allowNull: false },
  method: { type: DataTypes.ENUM('cash', 'card', 'transfer', 'alipay', 'wechat', 'other'), allowNull: false },
  txn_date: { type: DataTypes.DATE, allowNull: false },
  status: { type: DataTypes.ENUM('pending', 'confirmed', 'cancelled'), defaultValue: 'confirmed' },
  operator_id: { type: DataTypes.INTEGER, allowNull: false },
  remark: { type: DataTypes.TEXT }
}, { tableName: 'ap_transactions', comment: '应付交易（采购付款）' });

// 应收交易（销售收款）
const ARTransaction = sequelize.define('ARTransaction', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  sale_id: { type: DataTypes.INTEGER, allowNull: false },
  amount: { type: DataTypes.DECIMAL(12, 2), allowNull: false },
  method: { type: DataTypes.ENUM('cash', 'card', 'transfer', 'alipay', 'wechat', 'other'), allowNull: false },
  txn_date: { type: DataTypes.DATE, allowNull: false },
  status: { type: DataTypes.ENUM('pending', 'confirmed', 'cancelled'), defaultValue: 'confirmed' },
  operator_id: { type: DataTypes.INTEGER, allowNull: false },
  remark: { type: DataTypes.TEXT }
}, { tableName: 'ar_transactions', comment: '应收交易（销售收款）' });

// 日清关账（每日一条，可覆盖）
const DailyClearing = sequelize.define('DailyClearing', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  date: { type: DataTypes.DATEONLY, unique: true, allowNull: false },
  total_factory_cost: { type: DataTypes.DECIMAL(12,2), defaultValue: 0 },
  total_ap: { type: DataTypes.DECIMAL(12,2), defaultValue: 0 },
  total_ar: { type: DataTypes.DECIMAL(12,2), defaultValue: 0 },
  breakdown: { type: DataTypes.JSON, allowNull: true },
  closed_by: { type: DataTypes.INTEGER, allowNull: true },
  closed_at: { type: DataTypes.DATE, allowNull: true },
}, { tableName: 'daily_clearing', comment: '日清关账' });

// 月结关账（每月一条，可覆盖）
const MonthlyStatement = sequelize.define('MonthlyStatement', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  period: { type: DataTypes.STRING(7), unique: true, allowNull: false, comment: 'YYYY-MM' },
  total_factory_cost: { type: DataTypes.DECIMAL(12,2), defaultValue: 0 },
  total_ap: { type: DataTypes.DECIMAL(12,2), defaultValue: 0 },
  total_ar: { type: DataTypes.DECIMAL(12,2), defaultValue: 0 },
  breakdown: { type: DataTypes.JSON, allowNull: true },
  closed_by: { type: DataTypes.INTEGER, allowNull: true },
  closed_at: { type: DataTypes.DATE, allowNull: true },
}, { tableName: 'monthly_statements', comment: '月结关账' });

module.exports = { APTransaction, ARTransaction, DailyClearing, MonthlyStatement };
