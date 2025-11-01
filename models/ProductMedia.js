const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

// 商品媒体资源（图片/视频）
const ProductMedia = sequelize.define('ProductMedia', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  product_id: { type: DataTypes.INTEGER, allowNull: false, comment: '商品ID' },
  type: { type: DataTypes.ENUM('image','video'), allowNull: false, defaultValue: 'image' },
  url: { type: DataTypes.STRING(500), allowNull: false },
  thumb_url: { type: DataTypes.STRING(500) },
  sort: { type: DataTypes.INTEGER, defaultValue: 0 },
  is_main: { type: DataTypes.BOOLEAN, defaultValue: false }
}, {
  tableName: 'product_media',
  comment: '商品媒体资源'
});

module.exports = ProductMedia;
