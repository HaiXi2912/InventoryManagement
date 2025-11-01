const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

// 供应商表模型
const Supplier = sequelize.define('Supplier', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
    comment: '供应商ID'
  },
  name: {
    type: DataTypes.STRING(100),
    allowNull: false,
    comment: '供应商名称'
  },
  code: {
    type: DataTypes.STRING(20),
    unique: true,
    comment: '供应商编码'
  },
  contact_person: {
    type: DataTypes.STRING(50),
    comment: '联系人'
  },
  phone: {
    type: DataTypes.STRING(20),
    comment: '联系电话'
  },
  email: {
    type: DataTypes.STRING(100),
    comment: '邮箱'
  },
  address: {
    type: DataTypes.TEXT,
    comment: '地址'
  },
  bank_account: {
    type: DataTypes.STRING(50),
    comment: '银行账户'
  },
  tax_number: {
    type: DataTypes.STRING(30),
    comment: '税号'
  },
  status: {
    type: DataTypes.ENUM('active', 'inactive'),
    defaultValue: 'active',
    comment: '状态'
  },
  remark: {
    type: DataTypes.TEXT,
    comment: '备注'
  }
}, {
  tableName: 'suppliers',
  comment: '供应商表'
});

module.exports = Supplier;
