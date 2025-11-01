const { DataTypes } = require('sequelize')
const { sequelize } = require('../config/database')

// 客服聊天记录
const ChatMessage = sequelize.define('ChatMessage', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  session_id: { type: DataTypes.STRING(40), allowNull: false, comment: '会话ID（同一售后/订单的一次会话）' },
  order_id: { type: DataTypes.INTEGER, allowNull: true },
  as_id: { type: DataTypes.INTEGER, allowNull: true, comment: '售后单ID，可空' },
  from_user_id: { type: DataTypes.INTEGER, allowNull: true },
  from_customer_id: { type: DataTypes.INTEGER, allowNull: true },
  to_user_id: { type: DataTypes.INTEGER, allowNull: true },
  to_customer_id: { type: DataTypes.INTEGER, allowNull: true },
  role: { type: DataTypes.ENUM('customer','agent','system'), allowNull: false, defaultValue: 'customer' },
  content: { type: DataTypes.TEXT, allowNull: false },
  content_type: { type: DataTypes.ENUM('text','image','file','system'), defaultValue: 'text' },
  read_status: { type: DataTypes.ENUM('unread','read'), defaultValue: 'unread' }
}, {
  tableName: 'chat_messages',
  comment: '客服聊天记录',
  indexes: [
    { fields: ['session_id'] },
    { fields: ['order_id'] },
    { fields: ['as_id'] },
    { fields: ['from_user_id'] },
    { fields: ['from_customer_id'] },
    { fields: ['to_user_id'] },
    { fields: ['to_customer_id'] },
    { fields: ['read_status'] },
    { fields: ['created_at'] }
  ]
})

module.exports = ChatMessage
