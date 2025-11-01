const express = require('express')
const router = express.Router()
const { ChatMessage } = require('../models')
const { authenticate, authorize } = require('../middleware/auth')
const { Op } = require('sequelize')

router.use(authenticate)

// 列出我的会话（客服/员工侧）：聚合最近会话、未读数
router.get('/sessions', authorize(['agent','staff','manager','admin']), async (req,res)=>{
  const me = req.user.id
  // 取最近的消息，内存聚合
  const msgs = await ChatMessage.findAll({
    where: { [Op.or]: [ { from_user_id: me }, { to_user_id: me }, { role: 'customer' } ] },
    order: [['id','DESC']],
    limit: 1000,
  })
  const map = new Map()
  for (const m of msgs) {
    const sid = m.session_id
    if (!map.has(sid)) {
      const unreadCount = msgs.filter(x => x.session_id===sid && x.read_status==='unread' && (x.to_user_id===me || (x.role==='customer' && !x.to_user_id))).length
      map.set(sid, {
        session_id: sid,
        last_message: m,
        unread_count: unreadCount,
        order_id: m.order_id,
        as_id: m.as_id,
      })
    }
  }
  res.json({ success:true, data: Array.from(map.values()) })
})

// 列出我的会话（用户侧）
router.get('/my/sessions', authorize(['customer','agent','staff','manager','admin']), async (req,res)=>{
  // 普通用户场景：用 user.id 作为 from/to_customer_id 的简化实现
  const cid = req.user.id
  const msgs = await ChatMessage.findAll({
    where: { [Op.or]: [ { from_customer_id: cid }, { to_customer_id: cid } ] },
    order: [['id','DESC']],
    limit: 1000,
  })
  const map = new Map()
  for (const m of msgs) {
    const sid = m.session_id
    if (!map.has(sid)) {
      const unreadCount = msgs.filter(x => x.session_id===sid && x.to_customer_id===cid && x.read_status==='unread').length
      map.set(sid, {
        session_id: sid,
        last_message: m,
        unread_count: unreadCount,
        order_id: m.order_id,
        as_id: m.as_id,
      })
    }
  }
  res.json({ success:true, data: Array.from(map.values()) })
})

// 新增：获取未读消息总数
router.get('/unread/count', authorize(['agent','staff','manager','admin','customer']), async (req,res)=>{
  const where = { read_status: 'unread' }
  if (['agent','staff','manager','admin'].includes(req.user.role)) {
    where[Op.or] = [ { to_user_id: req.user.id }, { [Op.and]: [{ role: 'customer' }, { to_user_id: null }] } ]
  } else {
    where.to_customer_id = req.user.id
  }
  const count = await ChatMessage.count({ where })
  res.json({ success:true, data: { unread: count } })
})

// 新增：将所有未读设为已读
router.post('/read-all', authorize(['agent','staff','manager','admin','customer']), async (req,res)=>{
  const where = { read_status: 'unread' }
  if (['agent','staff','manager','admin'].includes(req.user.role)) {
    where[Op.or] = [ { to_user_id: req.user.id }, { [Op.and]: [{ role: 'customer' }, { to_user_id: null }] } ]
  } else {
    where.to_customer_id = req.user.id
  }
  const [updated] = await ChatMessage.update({ read_status: 'read' }, { where })
  res.json({ success:true, data: { updated } })
})

// 客服或员工：获取会话消息
router.get('/sessions/:session_id/messages', authorize(['agent','staff','manager','admin','customer']), async (req,res)=>{
  const { session_id } = req.params
  const list = await ChatMessage.findAll({ where:{ session_id }, order:[['id','ASC']] })
  res.json({ success:true, data: list })
})

// 按我的未读（客服/员工）
router.get('/me/unread', authorize(['agent','staff','manager','admin']), async (req,res)=>{
  const me = req.user.id
  const list = await ChatMessage.findAll({ 
    where:{ 
      read_status: 'unread',
      [Op.or]: [ { to_user_id: me }, { [Op.and]: [{ role: 'customer' }, { to_user_id: null }] } ]
    }, 
    order:[['id','ASC']] 
  })
  res.json({ success:true, data: list })
})

// 标记已读（单条）
router.post('/messages/:id/read', authorize(['agent','staff','manager','admin','customer']), async (req,res)=>{
  const msg = await ChatMessage.findByPk(req.params.id)
  if(!msg) return res.status(404).json({ success:false, message:'消息不存在' })
  // 权限：只能标记发给自己的消息（员工）或发给当前客户（前台用户）
  const isForThisUser = msg.to_user_id && msg.to_user_id === req.user.id
  const isForThisCustomer = msg.to_customer_id && ['customer'].includes(req.user.role) && msg.to_customer_id === req.user.id
  if (!isForThisUser && !isForThisCustomer && !(msg.role==='customer' && ['agent','staff','manager','admin'].includes(req.user.role))) return res.status(403).json({ success:false, message:'无权操作' })
  await msg.update({ read_status: 'read' })
  res.json({ success:true })
})

// 按会话批量标记已读
router.post('/sessions/:session_id/read', authorize(['agent','staff','manager','admin','customer']), async (req,res)=>{
  const { session_id } = req.params
  const where = { session_id, read_status: 'unread' }
  if (['agent','staff','manager','admin'].includes(req.user.role)) {
    // 客服侧：发给我或来自客户未指定接收人的消息
    where[Op.or] = [ { to_user_id: req.user.id }, { [Op.and]: [{ role:'customer' }, { to_user_id: null }] } ]
  } else {
    where.to_customer_id = req.user.id
  }
  const updated = await ChatMessage.update({ read_status: 'read' }, { where })
  res.json({ success:true, data: { updated: updated?.[0] || 0 } })
})

// 发送消息（客服或用户）
router.post('/sessions/:session_id/messages', authorize(['agent','staff','manager','admin','customer']), async (req,res)=>{
  const { session_id } = req.params
  const { content, role, order_id, as_id, to_user_id, to_customer_id, content_type='text' } = req.body||{}
  if(!content) return res.status(400).json({ success:false, message:'内容不能为空' })
  const payload = { session_id, order_id: order_id||null, as_id: as_id||null, content, content_type, read_status: 'unread' }
  if (['agent','staff','manager','admin'].includes(req.user.role)) {
    payload.from_user_id = req.user.id
    payload.role = 'agent'
    if (to_customer_id) payload.to_customer_id = to_customer_id
  } else {
    payload.role = 'customer'
    payload.from_customer_id = req.user.id // 简化：当前登录站内用户即客户ID
    if (to_user_id) payload.to_user_id = to_user_id
  }
  const msg = await ChatMessage.create(payload)
  res.status(201).json({ success:true, data: msg })
})

// 发起/获取会话ID（支持基于订单/售后/临时会话）
router.post('/sessions/start', authorize(['agent','staff','manager','admin','customer']), async (req,res)=>{
  const { session_id, order_id, as_id, peer_user_id, peer_customer_id } = req.body||{}
  let sid = session_id
  if (!sid) {
    if (order_id) sid = `order_${order_id}`
    else if (as_id) sid = `as_${as_id}`
    else if (peer_user_id) sid = `u_${[req.user.id, peer_user_id].sort().join('_')}`
    else if (peer_customer_id) sid = `c_${[req.user.id, peer_customer_id].sort().join('_')}`
    else sid = `t_${req.user.id}_${Date.now()}`
  }
  res.json({ success:true, data: { session_id: sid } })
})

module.exports = router
