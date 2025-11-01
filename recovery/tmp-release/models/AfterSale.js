const { DataTypes } = require('sequelize')
const { sequelize } = require('../config/database')

// 售后服务单（退款/退货/换货）
const AfterSale = sequelize.define('AfterSale', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  as_no: { type: DataTypes.STRING(40), allowNull: false, unique: true, comment: '售后单号' },
  order_id: { type: DataTypes.INTEGER, allowNull: false, comment: '关联订单ID' },
  user_id: { type: DataTypes.INTEGER, allowNull: true, comment: '站内用户ID（下单人）' },
  customer_id: { type: DataTypes.INTEGER, allowNull: true, comment: '客户ID（渠道商等）' },
  type: { type: DataTypes.ENUM('refund','return','exchange'), allowNull: false, defaultValue: 'return' },
  reason: { type: DataTypes.STRING(255) },
  status: { type: DataTypes.ENUM('pending','approved','rejected','completed','cancelled'), defaultValue: 'pending' },
  refund_amount: { type: DataTypes.DECIMAL(12,2), defaultValue: 0, comment: '预计退款金额',
    validate: { min: 0 }
  },
  approved_by: { type: DataTypes.INTEGER, allowNull: true },
  approved_at: { type: DataTypes.DATE, allowNull: true },
  remark: { type: DataTypes.STRING(255) }
}, {
  tableName: 'after_sales',
  comment: '售后服务单',
  indexes: [
    { fields: ['as_no'], unique: true },
    { fields: ['order_id'] },
    { fields: ['customer_id'] },
    { fields: ['status'] },
    { fields: ['type'] },
    { fields: ['approved_by'] },
    { fields: ['created_at'] },
  ]
})

// 售后明细（基于订单行）
const AfterSaleItem = sequelize.define('AfterSaleItem', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  as_id: { type: DataTypes.INTEGER, allowNull: false },
  order_item_id: { type: DataTypes.INTEGER, allowNull: false },
  sku_id: { type: DataTypes.INTEGER, allowNull: true },
  quantity: { type: DataTypes.INTEGER, allowNull: false },
  amount: { type: DataTypes.DECIMAL(12,2), allowNull: false }
}, {
  tableName: 'after_sale_items',
  comment: '售后明细',
  indexes: [
    { fields: ['as_id'] },
    { fields: ['order_item_id'] },
    { fields: ['sku_id'] },
    { fields: ['created_at'] }
  ]
})

module.exports = { AfterSale, AfterSaleItem }
