const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

// 进货单明细表模型
const PurchaseDetail = sequelize.define('PurchaseDetail', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
    comment: '明细ID'
  },
  purchase_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    comment: '进货单ID'
  },
  product_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    comment: '商品ID'
  },
  quantity: {
    type: DataTypes.INTEGER,
    allowNull: false,
    comment: '数量'
  },
  unit_price: {
    type: DataTypes.DECIMAL(10, 4),
    allowNull: false,
    comment: '单价（按 tax_included 判定是否含税）'
  },
  total_price: {
    type: DataTypes.DECIMAL(12, 4),
    allowNull: false,
    comment: '小计（同口径）'
  },
  received_quantity: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
    comment: '已收货数量'
  },
  // 新增：批次、效期与到岸成本
  batch_no: {
    type: DataTypes.STRING(50),
    allowNull: true,
    comment: '批次号'
  },
  expiry_date: {
    type: DataTypes.DATE,
    allowNull: true,
    comment: '效期'
  },
  landed_unit_cost: {
    type: DataTypes.DECIMAL(12, 4),
    allowNull: true,
    comment: '分摊后的到岸单价（含运费/其他）'
  },
  tax_amount: {
    type: DataTypes.DECIMAL(12, 4),
    allowNull: true,
    defaultValue: 0,
    comment: '税额（按单行税率计算）'
  },
  remark: {
    type: DataTypes.STRING(255),
    comment: '备注'
  }
}, {
  tableName: 'purchase_details',
  comment: '进货单明细表'
});

module.exports = PurchaseDetail;
