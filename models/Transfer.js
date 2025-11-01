const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

// 调拨单
const TransferOrder = sequelize.define('TransferOrder', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  transfer_no: { type: DataTypes.STRING(30), unique: true, allowNull: false, comment: '调拨单号' },
  from_warehouse: { type: DataTypes.STRING(50), allowNull: false, comment: '来源仓库' },
  to_warehouse: { type: DataTypes.STRING(50), allowNull: false, comment: '目标仓库' },
  transfer_date: { type: DataTypes.DATE, allowNull: false },
  status: { type: DataTypes.ENUM('pending', 'confirmed', 'cancelled'), defaultValue: 'pending' },
  operator_id: { type: DataTypes.INTEGER, allowNull: false },
  remark: { type: DataTypes.TEXT }
}, { tableName: 'transfer_orders', comment: '调拨单' });

// 调拨明细
const TransferDetail = sequelize.define('TransferDetail', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  transfer_id: { type: DataTypes.INTEGER, allowNull: false },
  product_id: { type: DataTypes.INTEGER, allowNull: false },
  quantity: { type: DataTypes.INTEGER, allowNull: false },
  remark: { type: DataTypes.STRING(255) }
}, { tableName: 'transfer_details', comment: '调拨明细' });

module.exports = { TransferOrder, TransferDetail };
