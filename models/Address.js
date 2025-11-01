const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

// 用户收货地址
const Address = sequelize.define('Address', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  user_id: { type: DataTypes.INTEGER, allowNull: false, comment: '用户ID' },
  receiver_name: { type: DataTypes.STRING(50), allowNull: false },
  phone: { type: DataTypes.STRING(20), allowNull: false },
  province: { type: DataTypes.STRING(50) },
  city: { type: DataTypes.STRING(50) },
  district: { type: DataTypes.STRING(50) },
  detail: { type: DataTypes.STRING(200), allowNull: false },
  postcode: { type: DataTypes.STRING(10) },
  is_default: { type: DataTypes.BOOLEAN, defaultValue: false }
}, {
  tableName: 'addresses',
  comment: '用户收货地址'
});

module.exports = Address;
