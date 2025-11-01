const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

// 退货单（采购退货或销售退货，用 type 区分）
const ReturnOrder = sequelize.define('ReturnOrder', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  return_no: { type: DataTypes.STRING(30), unique: true, allowNull: false, comment: '退货单号' },
  type: { type: DataTypes.ENUM('purchase', 'sale'), allowNull: false, comment: '退货类型' },
  reference_id: { type: DataTypes.INTEGER, allowNull: false, comment: '关联单据ID（采购单/销售单）' },
  reference_no: { type: DataTypes.STRING(30), allowNull: false, comment: '关联单号' },
  vendor_or_customer_id: { type: DataTypes.INTEGER, allowNull: false, comment: '供应商或客户ID' },
  return_date: { type: DataTypes.DATE, allowNull: false },
  total_amount: { type: DataTypes.DECIMAL(12, 2), defaultValue: 0 },
  status: { type: DataTypes.ENUM('pending', 'confirmed', 'cancelled'), defaultValue: 'pending' },
  operator_id: { type: DataTypes.INTEGER, allowNull: false },
  remark: { type: DataTypes.TEXT }
}, { tableName: 'return_orders', comment: '退货单' });

const ReturnDetail = sequelize.define('ReturnDetail', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  return_id: { type: DataTypes.INTEGER, allowNull: false },
  product_id: { type: DataTypes.INTEGER, allowNull: false },
  quantity: { type: DataTypes.INTEGER, allowNull: false },
  unit_price: { type: DataTypes.DECIMAL(10, 2), allowNull: false },
  total_price: { type: DataTypes.DECIMAL(12, 2), allowNull: false },
  reason: { type: DataTypes.STRING(255) }
}, { tableName: 'return_details', comment: '退货明细' });

module.exports = { ReturnOrder, ReturnDetail };
