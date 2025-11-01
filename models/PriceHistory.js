const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const PriceHistory = sequelize.define('PriceHistory', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  supplier_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
    comment: '供应商ID（历史）'
  },
  product_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    comment: '商品ID'
  },
  purchase_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
    comment: '进货单ID（历史）'
  },
  purchase_detail_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
    comment: '进货明细ID（历史）'
  },
  unit_price: {
    type: DataTypes.DECIMAL(10, 4),
    allowNull: false,
    comment: '成交单价'
  },
  currency: {
    type: DataTypes.STRING(10),
    allowNull: false,
    defaultValue: 'CNY',
    comment: '币种'
  },
  recorded_at: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW,
    comment: '记录时间'
  }
}, {
  tableName: 'price_history',
  comment: '价格历史（工厂模式）'
});

module.exports = PriceHistory;