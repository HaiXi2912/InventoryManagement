const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

// 销售单表模型
const Sale = sequelize.define('Sale', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
    comment: '销售单ID'
  },
  sale_no: {
    type: DataTypes.STRING(30),
    unique: true,
    allowNull: false,
    comment: '销售单号'
  },
  customer_id: {
    type: DataTypes.INTEGER,
    comment: '客户ID'
  },
  sale_date: {
    type: DataTypes.DATE,
    allowNull: false,
    comment: '销售日期'
  },
  total_amount: {
    type: DataTypes.DECIMAL(12, 2),
    defaultValue: 0,
    comment: '总金额'
  },
  received_amount: {
    type: DataTypes.DECIMAL(12, 2),
    defaultValue: 0,
    comment: '已收金额'
  },
  discount_amount: {
    type: DataTypes.DECIMAL(10, 2),
    defaultValue: 0,
    comment: '折扣金额'
  },
  sale_type: {
    type: DataTypes.ENUM('retail', 'wholesale', 'online'),
    defaultValue: 'retail',
    comment: '销售类型'
  },
  status: {
    type: DataTypes.ENUM('pending', 'confirmed', 'shipped', 'completed', 'cancelled'),
    defaultValue: 'pending',
    comment: '状态'
  },
  payment_status: {
    type: DataTypes.ENUM('unpaid', 'partial', 'paid'),
    defaultValue: 'unpaid',
    comment: '付款状态'
  },
  payment_method: {
    type: DataTypes.ENUM('cash', 'card', 'transfer', 'alipay', 'wechat', 'other'),
    comment: '支付方式'
  },
  operator_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    comment: '操作员ID'
  },
  shipping_address: {
    type: DataTypes.TEXT,
    comment: '配送地址'
  },
  remark: {
    type: DataTypes.TEXT,
    comment: '备注'
  }
}, {
  tableName: 'sales',
  comment: '销售单表'
});

module.exports = Sale;
