const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

// 自有工厂生产单（制造/补货单）
const FactoryOrder = sequelize.define('FactoryOrder', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  order_no: { type: DataTypes.STRING(40), unique: true, allowNull: false, comment: '工厂单号' },
  status: { type: DataTypes.ENUM('planned','approved','in_production','completed','shipped','cancelled'), defaultValue: 'planned' },
  source: { type: DataTypes.ENUM('manual','auto_replenish'), defaultValue: 'manual', comment: '来源：手动/自动补货' },
  expedite: { type: DataTypes.BOOLEAN, defaultValue: false, comment: '是否加急' },
  total_cost: { type: DataTypes.DECIMAL(12,2), defaultValue: 0, comment: '合计成本' },
  shipping_fee: { type: DataTypes.DECIMAL(12,2), defaultValue: 0, comment: '运费' },
  remark: { type: DataTypes.STRING(255) },
  operator_id: { type: DataTypes.INTEGER, allowNull: true, comment: '创建人' },
  factory_assignee_id: { type: DataTypes.INTEGER, allowNull: true, comment: '工厂处理账号' },
  // 新增：生产进度字段
  production_started_at: { type: DataTypes.DATE, allowNull: true },
  expected_finish_at: { type: DataTypes.DATE, allowNull: true },
  finished_at: { type: DataTypes.DATE, allowNull: true },
}, {
  tableName: 'factory_orders',
  comment: '工厂生产单',
});

module.exports = FactoryOrder;
