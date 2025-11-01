const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

// 日清记录（每日汇总快照）
const DailyClearing = sequelize.define('DailyClearing', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  date: { type: DataTypes.DATEONLY, allowNull: false, unique: true },
  total_factory_cost: { type: DataTypes.DECIMAL(14, 2), allowNull: false, defaultValue: 0 },
  total_ap: { type: DataTypes.DECIMAL(14, 2), allowNull: false, defaultValue: 0 },
  total_ar: { type: DataTypes.DECIMAL(14, 2), allowNull: false, defaultValue: 0 },
  breakdown: { type: DataTypes.JSON, allowNull: true },
  closed_by: { type: DataTypes.INTEGER, allowNull: true },
  closed_at: { type: DataTypes.DATE, allowNull: true },
}, {
  tableName: 'daily_clearings',
  comment: '日清汇总快照（可选关账）',
});

// 月结记录（每月汇总快照）
const MonthlyStatement = sequelize.define('MonthlyStatement', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  period: { type: DataTypes.STRING(7), allowNull: false, unique: true, comment: 'YYYY-MM' },
  total_factory_cost: { type: DataTypes.DECIMAL(14, 2), allowNull: false, defaultValue: 0 },
  total_ap: { type: DataTypes.DECIMAL(14, 2), allowNull: false, defaultValue: 0 },
  total_ar: { type: DataTypes.DECIMAL(14, 2), allowNull: false, defaultValue: 0 },
  breakdown: { type: DataTypes.JSON, allowNull: true },
  closed_by: { type: DataTypes.INTEGER, allowNull: true },
  closed_at: { type: DataTypes.DATE, allowNull: true },
}, {
  tableName: 'monthly_statements',
  comment: '月结汇总快照（可选关账）',
});

module.exports = { DailyClearing, MonthlyStatement };
