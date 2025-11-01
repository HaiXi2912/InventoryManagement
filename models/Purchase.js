const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

// 进货单表模型
const Purchase = sequelize.define('Purchase', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
    comment: '进货单ID'
  },
  purchase_no: {
    type: DataTypes.STRING(30),
    unique: true,
    allowNull: false,
    comment: '进货单号'
  },
  // 已弃用：供应商ID（切换至工厂模式后仅用于历史只读，允许为空）
  supplier_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
    comment: '供应商ID（已弃用）'
  },
  purchase_date: {
    type: DataTypes.DATE,
    allowNull: false,
    comment: '进货日期'
  },
  total_amount: {
    type: DataTypes.DECIMAL(12, 2),
    defaultValue: 0,
    comment: '总金额（本位币）'
  },
  paid_amount: {
    type: DataTypes.DECIMAL(12, 2),
    defaultValue: 0,
    comment: '已付金额（本位币）'
  },
  discount_amount: {
    type: DataTypes.DECIMAL(10, 2),
    defaultValue: 0,
    comment: '折扣金额（本位币）'
  },
  // 新增：币种与汇率
  currency: {
    type: DataTypes.STRING(10),
    allowNull: false,
    defaultValue: 'CNY',
    comment: '币种'
  },
  fx_rate: {
    type: DataTypes.DECIMAL(12, 6),
    allowNull: false,
    defaultValue: 1,
    comment: '对本位币汇率'
  },
  // 新增：税配置
  tax_rate: {
    type: DataTypes.DECIMAL(5, 2),
    allowNull: false,
    defaultValue: 0,
    comment: '默认税率%'
  },
  tax_included: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: true,
    comment: '单价是否含税'
  },
  // 新增：运费/其他费用与到岸成本
  freight_amount: {
    type: DataTypes.DECIMAL(12, 2),
    allowNull: false,
    defaultValue: 0,
    comment: '运费（本位币）'
  },
  other_amount: {
    type: DataTypes.DECIMAL(12, 2),
    allowNull: false,
    defaultValue: 0,
    comment: '其他费用（本位币）'
  },
  landed_cost_total: {
    type: DataTypes.DECIMAL(12, 2),
    allowNull: false,
    defaultValue: 0,
    comment: '到岸总成本（本位币）'
  },
  status: {
    type: DataTypes.ENUM('pending', 'confirmed', 'partial_received', 'received', 'cancelled'),
    defaultValue: 'pending',
    comment: '状态'
  },
  payment_status: {
    type: DataTypes.ENUM('unpaid', 'partial', 'paid'),
    defaultValue: 'unpaid',
    comment: '付款状态'
  },
  operator_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    comment: '操作员ID'
  },
  // 新增：审批
  approved_by: {
    type: DataTypes.INTEGER,
    allowNull: true,
    comment: '审批人ID'
  },
  approved_at: {
    type: DataTypes.DATE,
    allowNull: true,
    comment: '审批时间'
  },
  // 新增：发票信息
  supplier_invoice_no: {
    type: DataTypes.STRING(50),
    allowNull: true,
    comment: '供应商发票号'
  },
  invoice_date: {
    type: DataTypes.DATE,
    allowNull: true,
    comment: '发票日期'
  },
  // 新增：付款条款
  payment_term_days: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0,
    comment: '账期天数'
  },
  due_date: {
    type: DataTypes.DATE,
    allowNull: true,
    comment: '到期日'
  },
  remark: {
    type: DataTypes.TEXT,
    comment: '备注'
  }
}, {
  tableName: 'purchases',
  comment: '进货单表（历史只读，供应商模式已弃用）'
});

module.exports = Purchase;
