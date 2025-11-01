const express = require('express')
const router = express.Router()
const { Customer, WalletTransaction, Order, OrderItem, AfterSale, ChatMessage } = require('../models')
const { authenticate, authorize } = require('../middleware/auth')
const { Op } = require('sequelize')

// 管理端：客户列表/详情/创建/修改
router.use(authenticate)

router.get('/', authorize(['admin','manager','staff']), async (req,res)=>{
  const { page=1, limit=20, keyword, type, status } = req.query
  const where = {}
  if (keyword) where[Op.or] = [ { name: { [Op.like]: `%${keyword}%` } }, { code: { [Op.like]: `%${keyword}%` } }, { phone: { [Op.like]: `%${keyword}%` } } ]
  if (type) where.customer_type = type
  if (status) where.status = status
  const per = parseInt(limit); const cur = parseInt(page); const offset = (cur-1)*per
  const { rows, count } = await Customer.findAndCountAll({ where, limit: per, offset, order:[['id','DESC']] })
  res.json({ success:true, data: { items: rows, pagination:{ total: count, page: cur, limit: per } } })
})

router.get('/:id', authorize(['admin','manager','staff']), async (req,res)=>{
  const c = await Customer.findByPk(req.params.id)
  if(!c) return res.status(404).json({ success:false, message:'客户不存在' })
  res.json({ success:true, data: c })
})

router.post('/', authorize(['admin','manager']), async (req,res)=>{
  const created = await Customer.create(req.body)
  res.status(201).json({ success:true, data: created })
})

router.put('/:id', authorize(['admin','manager']), async (req,res)=>{
  const c = await Customer.findByPk(req.params.id)
  if(!c) return res.status(404).json({ success:false, message:'客户不存在' })
  await c.update(req.body)
  res.json({ success:true, message:'已更新', data: c })
})

// 钱包：后台调账（充值/扣减/退款/调整）
router.post('/:id/wallet/adjust', authorize(['admin','manager']), async (req,res)=>{
  const c = await Customer.findByPk(req.params.id)
  if(!c) return res.status(404).json({ success:false, message:'客户不存在' })
  const { amount, type='adjust', remark } = req.body||{}
  if(!amount || Number(amount)===0) return res.status(400).json({ success:false, message:'金额不能为空' })
  const before = Number(c.wallet_balance||0)
  const after = Number((before + Number(amount)).toFixed(2))
  await c.update({ wallet_balance: after })
  const tx = await WalletTransaction.create({ customer_id: c.id, change_amount: amount, before_balance: before, after_balance: after, type, operator_id: req.user.id, remark })
  res.json({ success:true, message:'余额已调整', data: { balance: after, tx } })
})

// 钱包流水
router.get('/:id/wallet/transactions', authorize(['admin','manager','staff']), async (req,res)=>{
  const { page=1, limit=20 } = req.query
  const per = parseInt(limit); const cur = parseInt(page); const offset = (cur-1)*per
  const { rows, count } = await WalletTransaction.findAndCountAll({ where:{ customer_id: req.params.id }, limit: per, offset, order:[['id','DESC']] })
  res.json({ success:true, data: { items: rows, pagination:{ total: count, page: cur, limit: per } } })
})

// 客户档案：订单列表
router.get('/:id/orders', authorize(['admin','manager','staff']), async (req,res)=>{
  const list = await Order.findAll({ where:{ user_id: req.params.id }, include:[{ model: OrderItem, as:'items' }], order:[['id','DESC']] })
  res.json({ success:true, data: list })
})

// 客户档案：售后列表
router.get('/:id/after-sales', authorize(['admin','manager','staff']), async (req,res)=>{
  const list = await AfterSale.findAll({ where:{ customer_id: req.params.id }, order:[['id','DESC']] })
  res.json({ success:true, data: list })
})

// 客户档案：客服聊天（按session或按客户ID双向检索）
router.get('/:id/chats', authorize(['admin','manager','staff']), async (req,res)=>{
  const { session_id } = req.query
  let where = {}
  if (session_id) {
    where.session_id = session_id
  } else {
    where = { [Op.or]: [ { from_customer_id: req.params.id }, { to_customer_id: req.params.id } ] }
  }
  const list = await ChatMessage.findAll({ where, order:[['id','ASC']] })
  res.json({ success:true, data: list })
})

// TODO：售后记录、客服聊天记录可在后续模块补充

module.exports = router
