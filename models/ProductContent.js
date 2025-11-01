const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

// 商品富文本/SEO 内容
const ProductContent = sequelize.define('ProductContent', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  product_id: { type: DataTypes.INTEGER, allowNull: false, unique: true, comment: '关联商品ID' },
  rich_html: { type: DataTypes.TEXT('long'), comment: 'PC富文本详情' },
  mobile_html: { type: DataTypes.TEXT('long'), comment: '移动端富文本详情' },
  seo_title: { type: DataTypes.STRING(150) },
  seo_keywords: { type: DataTypes.STRING(255) },
  seo_desc: { type: DataTypes.STRING(500) }
}, {
  tableName: 'product_contents',
  comment: '商品富文本与SEO内容'
});

module.exports = ProductContent;
