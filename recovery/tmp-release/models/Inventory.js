const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

// 库存表模型
const Inventory = sequelize.define('Inventory', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
    comment: '库存ID'
  },
  product_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    comment: '商品ID'
  },
  warehouse_location: {
    type: DataTypes.STRING(50),
    defaultValue: '默认仓库',
    comment: '仓库位置'
  },
  current_stock: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
    comment: '当前库存'
  },
  available_stock: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
    comment: '可用库存'
  },
  reserved_stock: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
    comment: '预留库存'
  },
  last_purchase_date: {
    type: DataTypes.DATE,
    comment: '最后进货日期'
  },
  last_sale_date: {
    type: DataTypes.DATE,
    comment: '最后销售日期'
  },
  last_check_date: {
    type: DataTypes.DATE,
    comment: '最后盘点日期'
  },
  average_cost: {
    type: DataTypes.DECIMAL(10, 2),
    defaultValue: 0,
    comment: '平均成本'
  },
  total_value: {
    type: DataTypes.DECIMAL(12, 2),
    defaultValue: 0,
    comment: '库存总价值'
  }
}, {
  tableName: 'inventory',
  comment: '库存表',
  indexes: [
    {
      unique: true,
      fields: ['product_id', 'warehouse_location'],
      name: 'unique_product_warehouse'
    }
  ]
});

module.exports = Inventory;
