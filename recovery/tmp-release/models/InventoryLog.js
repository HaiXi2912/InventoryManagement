const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

// 库存流水（按 SKU 粒度）
const InventoryLog = sequelize.define('InventoryLog', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  product_id: { type: DataTypes.INTEGER, allowNull: false },
  sku_id: { type: DataTypes.INTEGER, allowNull: true },
  change_qty: { type: DataTypes.INTEGER, allowNull: false, comment: '+入库/-出库' },
  before_qty: { type: DataTypes.INTEGER, allowNull: true },
  after_qty: { type: DataTypes.INTEGER, allowNull: true },
  type: { type: DataTypes.ENUM('purchase_in','order_out','adjust','cancel_restore','factory_in'), allowNull: false },
  ref_type: { type: DataTypes.STRING(30), allowNull: true },
  ref_id: { type: DataTypes.INTEGER, allowNull: true },
  operator_id: { type: DataTypes.INTEGER, allowNull: true },
  remark: { type: DataTypes.STRING(255) }
}, {
  tableName: 'inventory_logs',
  comment: '库存流水表（SKU级）'
});

module.exports = InventoryLog;
