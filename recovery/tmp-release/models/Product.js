const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

// 商品表模型（自有工厂模式，去除供应商字段）
const Product = sequelize.define('Product', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
    comment: '商品ID'
  },
  name: {
    type: DataTypes.STRING(100),
    allowNull: false,
    comment: '商品名称'
  },
  code: {
    type: DataTypes.STRING(30),
    unique: true,
    allowNull: false,
    comment: '商品编码'
  },
  barcode: {
    type: DataTypes.STRING(30),
    comment: '条形码'
  },
  category: {
    type: DataTypes.STRING(50),
    comment: '商品分类'
  },
  brand: {
    type: DataTypes.STRING(50),
    comment: '品牌'
  },
  color: {
    type: DataTypes.STRING(20),
    comment: '颜色'
  },
  size: {
    type: DataTypes.STRING(10),
    comment: '尺码'
  },
  size_mode: {
    type: DataTypes.ENUM('apparel', 'shoe', 'onesize', 'custom'),
    defaultValue: 'apparel',
    comment: '尺寸模式（服装/鞋码/通码/自定义）'
  },
  material: {
    type: DataTypes.STRING(50),
    comment: '材质'
  },
  season: {
    type: DataTypes.ENUM('spring', 'summer', 'autumn', 'winter', 'all_season'),
    defaultValue: 'all_season',
    comment: '季节'
  },
  gender: {
    type: DataTypes.ENUM('male', 'female', 'unisex', 'children'),
    defaultValue: 'unisex',
    comment: '适用性别'
  },
  purchase_price: {
    type: DataTypes.DECIMAL(10, 2),
    defaultValue: 0,
    comment: '工厂成本价（参考）'
  },
  wholesale_price: {
    type: DataTypes.DECIMAL(10, 2),
    defaultValue: 0,
    comment: '批发价'
  },
  retail_price: {
    type: DataTypes.DECIMAL(10, 2),
    defaultValue: 0,
    comment: '零售价'
  },
  unit: {
    type: DataTypes.STRING(10),
    defaultValue: '件',
    comment: '单位'
  },
  min_stock: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
    comment: '最低库存'
  },
  max_stock: {
    type: DataTypes.INTEGER,
    defaultValue: 999999,
    comment: '最高库存'
  },
  weight: {
    type: DataTypes.DECIMAL(8, 3),
    comment: '重量(kg)'
  },
  image_url: {
    type: DataTypes.STRING(255),
    comment: '商品图片URL'
  },
  description: {
    type: DataTypes.TEXT,
    comment: '商品描述'
  },
  status: {
    type: DataTypes.ENUM('active', 'inactive', 'discontinued'),
    defaultValue: 'active',
    comment: '商品状态'
  }
}, {
  tableName: 'products',
  comment: '商品表（自有工厂模式）'
});

module.exports = Product;
