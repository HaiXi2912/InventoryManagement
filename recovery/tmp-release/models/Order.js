const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

// 电商订单头
const Order = sequelize.define('Order', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  order_no: { type: DataTypes.STRING(40), allowNull: false, unique: true },
  user_id: { type: DataTypes.INTEGER, allowNull: false },
  address_id: { type: DataTypes.INTEGER, allowNull: true },
  status: { type: DataTypes.ENUM('pending','paid','shipped','completed','cancelled'), defaultValue: 'pending' },
  pay_status: { type: DataTypes.ENUM('unpaid','paid'), defaultValue: 'unpaid' },
  total_amount: { type: DataTypes.DECIMAL(12,2), defaultValue: 0 },
  pay_amount: { type: DataTypes.DECIMAL(12,2), defaultValue: 0 },
  remark: { type: DataTypes.STRING(255) },
  // 新增：发货信息
  tracking_no: { type: DataTypes.STRING(60), comment: '物流单号' },
  logistics_provider: { type: DataTypes.STRING(60), comment: '承运商/快递公司' },
  shipped_at: { type: DataTypes.DATE, comment: '发货时间' },
  delivered_at: { type: DataTypes.DATE, comment: '签收时间' },
}, { tableName:'orders', comment:'电商订单头' });

// 电商订单行（SKU级）
const OrderItem = sequelize.define('OrderItem', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  order_id: { type: DataTypes.INTEGER, allowNull: false },
  product_id: { type: DataTypes.INTEGER, allowNull: false },
  sku_id: { type: DataTypes.INTEGER, allowNull: true },
  name: { type: DataTypes.STRING(120) },
  size: { type: DataTypes.STRING(20) },
  color: { type: DataTypes.STRING(30) },
  barcode: { type: DataTypes.STRING(50) },
  price: { type: DataTypes.DECIMAL(10,2), allowNull: false },
  quantity: { type: DataTypes.INTEGER, allowNull: false },
  amount: { type: DataTypes.DECIMAL(12,2), allowNull: false }
}, { tableName:'order_items', comment:'电商订单行' });

module.exports = { Order, OrderItem };
