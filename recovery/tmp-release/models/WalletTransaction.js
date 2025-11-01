const { DataTypes } = require('sequelize')
const { sequelize } = require('../config/database')

// 钱包流水（用户/客户虚拟钱包充值、消费、退款等）
const WalletTransaction = sequelize.define('WalletTransaction', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  user_id: { type: DataTypes.INTEGER, allowNull: true, comment: '关联用户ID（站内用户）' },
  customer_id: { type: DataTypes.INTEGER, allowNull: true, comment: '关联客户ID（企业/渠道客户）' },
  change_amount: { type: DataTypes.DECIMAL(12,2), allowNull: false },
  before_balance: { type: DataTypes.DECIMAL(12,2), allowNull: false },
  after_balance: { type: DataTypes.DECIMAL(12,2), allowNull: false },
  type: { type: DataTypes.ENUM('recharge','consume','refund','adjust','transfer'), allowNull: false },
  ref_type: { type: DataTypes.STRING(30) },
  ref_id: { type: DataTypes.INTEGER },
  operator_id: { type: DataTypes.INTEGER },
  remark: { type: DataTypes.STRING(255) }
}, { tableName: 'wallet_transactions', comment: '钱包流水' })

module.exports = WalletTransaction
