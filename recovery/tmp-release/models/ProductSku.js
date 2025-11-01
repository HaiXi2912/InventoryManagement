const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

// 商品SKU（仅尺码；颜色不再作为维度）
const ProductSku = sequelize.define('ProductSku', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  product_id: { type: DataTypes.INTEGER, allowNull: false },
  size: { type: DataTypes.STRING(20), allowNull: false },
  // 颜色维度改为可选，保留字段以兼容历史数据
  color: { type: DataTypes.STRING(30), allowNull: true, defaultValue: '' },
  barcode: { type: DataTypes.STRING(50), allowNull: false, unique: true },
  sku_code: { type: DataTypes.STRING(50), comment: '内部SKU编码' },
  retail_price: { type: DataTypes.DECIMAL(10,2), defaultValue: 0 },
  wholesale_price: { type: DataTypes.DECIMAL(10,2), comment: '渠道/批发价' },
  tag_price: { type: DataTypes.DECIMAL(10,2) },
  cost_price: { type: DataTypes.DECIMAL(10,4) },
  stock: { type: DataTypes.INTEGER, defaultValue: 0 },
  locked_stock: { type: DataTypes.INTEGER, defaultValue: 0 },
  // 新增：自动补货阈值与目标库存（可为空时使用商品或全局默认）
  reorder_threshold: { type: DataTypes.INTEGER, allowNull: true, comment: '低于该值触发补货；为空则回退到商品安全库存或默认' },
  reorder_target: { type: DataTypes.INTEGER, allowNull: true, comment: '补货目标库存；为空则使用计划量或 2x 阈值' },
  status: { type: DataTypes.ENUM('active','disabled'), defaultValue: 'active' },
  sort: { type: DataTypes.INTEGER, defaultValue: 0 }
}, {
  tableName: 'product_skus',
  comment: '商品SKU表（尺码维度）'
});

module.exports = ProductSku;
