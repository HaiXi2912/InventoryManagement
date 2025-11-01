const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

// 自有工厂生产单明细（按 SKU/尺码）
const FactoryOrderDetail = sequelize.define('FactoryOrderDetail', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  order_id: { type: DataTypes.INTEGER, allowNull: false },
  product_id: { type: DataTypes.INTEGER, allowNull: false },
  sku_id: { type: DataTypes.INTEGER, allowNull: true },
  size: { type: DataTypes.STRING(30), allowNull: true },
  quantity: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  unit_cost: { type: DataTypes.DECIMAL(12,4), allowNull: false, defaultValue: 0 },
  subtotal_cost: { type: DataTypes.DECIMAL(12,2), allowNull: false, defaultValue: 0 },
  remark: { type: DataTypes.STRING(255) },
}, {
  tableName: 'factory_order_details',
  comment: '工厂生产单明细',
});

module.exports = FactoryOrderDetail;
