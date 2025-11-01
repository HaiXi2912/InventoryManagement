const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

// 销售单明细表模型（支持 SKU 粒度）
const SaleDetail = sequelize.define('SaleDetail', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
    comment: '明细ID'
  },
  sale_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    comment: '销售单ID'
  },
  product_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    comment: '商品ID'
  },
  // 新增：SKU 维度（可为空，便于兼容旧数据与非服装类）
  sku_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
    comment: 'SKU ID（按尺码/颜色）'
  },
  // 新增：尺码/颜色，便于统计
  size: { type: DataTypes.STRING(20), allowNull: true, comment: '尺码' },
  color: { type: DataTypes.STRING(30), allowNull: true, comment: '颜色' },
  quantity: {
    type: DataTypes.INTEGER,
    allowNull: false,
    comment: '数量'
  },
  unit_price: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false,
    comment: '单价'
  },
  total_price: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false,
    comment: '小计'
  },
  cost_price: {
    type: DataTypes.DECIMAL(10, 2),
    comment: '成本价'
  },
  profit: {
    type: DataTypes.DECIMAL(10, 2),
    comment: '利润'
  },
  shipped_quantity: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
    comment: '已发货数量'
  },
  remark: {
    type: DataTypes.STRING(255),
    comment: '备注'
  }
}, {
  tableName: 'sale_details',
  comment: '销售单明细表（支持SKU）'
});

module.exports = SaleDetail;
