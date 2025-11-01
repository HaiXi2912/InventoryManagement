const express = require('express')
const router = express.Router()
const { sequelize, Order, OrderItem, AfterSale, AfterSaleItem, ProductSku, InventoryLog, WalletTransaction, Customer } = require('../models')
const { authenticate, authorize } = require('../middleware/auth')
const { Op } = require('sequelize')

// 需要登录
router.use(authenticate)

// 创建售后（退款/退货/换货）
router.post('/', async (req,res)=>{
  const t = await sequelize.transaction()
  try {
    const { order_id, type='return', items=[], reason, customer_id } = req.body||{}
    if(!order_id || !Array.isArray(items) || !items.length) return res.status(400).json({ success:false, message:'参数错误' })
    if(!['refund','return','exchange'].includes(type)) return res.status(400).json({ success:false, message:'非法售后类型' })
    const order = await Order.findByPk(order_id, { include:[{ model: OrderItem, as:'items' }], transaction: t, lock: t.LOCK.UPDATE })
    if(!order) return res.status(404).json({ success:false, message:'订单不存在' })

    const asNo = `AS${Date.now()}${Math.floor(Math.random()*1000)}`
    let totalRefund = 0

    for(const it of items){
      const oi = order.items.find(x=>x.id===it.order_item_id)
      if(!oi) throw new Error('订单行不存在')
      const qty = Math.min(Number(it.quantity||0), oi.quantity)
      if(qty<=0) throw new Error('数量无效')
      totalRefund += Number(oi.price) * qty
    }

    const as = await AfterSale.create({ as_no: asNo, order_id, user_id: req.user.id, customer_id: customer_id||null, type, reason, status:'pending', refund_amount: totalRefund }, { transaction: t })

    for(const it of items){
      const oi = order.items.find(x=>x.id===it.order_item_id)
      const qty = Math.min(Number(it.quantity||0), oi.quantity)
      await AfterSaleItem.create({ as_id: as.id, order_item_id: oi.id, sku_id: oi.sku_id, quantity: qty, amount: Number(oi.price)*qty }, { transaction: t })
    }

    await t.commit()
    res.status(201).json({ success:true, data:{ id: as.id, as_no: as.as_no, refund_amount: totalRefund } })
  } catch(e){ await t.rollback(); res.status(400).json({ success:false, message: e.message||'创建失败' }) }
})

// 审批售后（仅退款可直接审批；退货/换货请走验货 /inspect）
router.post('/:id/approve', authorize(['admin','manager']), async (req,res)=>{
  const t = await sequelize.transaction()
  try {
    const as = await AfterSale.findByPk(req.params.id, { include:[{ model: AfterSaleItem, as:'items' }], transaction: t, lock: t.LOCK.UPDATE })
    if(!as) return res.status(404).json({ success:false, message:'售后不存在' })
    if(as.status!=='pending') return res.status(400).json({ success:false, message:'状态不允许' })

    if(['return','exchange'].includes(as.type)) {
      await t.rollback()
      return res.status(400).json({ success:false, message:'退货/换货需先验货，请使用 /after-sales/:id/inspect' })
    }

    // 退款：审批通过，不涉及库存
    await as.update({ status:'approved', approved_by: req.user.id, approved_at: new Date() }, { transaction: t })

    await t.commit()
    res.json({ success:true, message:'已通过' })
  } catch(e){ await t.rollback(); res.status(400).json({ success:false, message:e.message||'操作失败' }) }
})

// 提交验货结果（退货/换货必须验货通过，退款可直接审批）
router.post('/:id/inspect', authorize(['agent','staff','manager','admin']), async (req,res)=>{
  const t = await sequelize.transaction()
  try {
    const { passed, remark } = req.body||{}
    const as = await AfterSale.findByPk(req.params.id, { include:[{ model: AfterSaleItem, as:'items' }], transaction: t, lock: t.LOCK.UPDATE })
    if(!as) return res.status(404).json({ success:false, message:'售后不存在' })
    if(as.status!=='pending') return res.status(400).json({ success:false, message:'当前状态不可验货' })
    if(['return','exchange'].includes(as.type)){
      if(!passed) {
        await as.update({ status:'rejected', remark: (remark?`验货不通过: ${remark}`:'验货不通过') }, { transaction: t })
        await t.commit(); return res.json({ success:true, message:'验货未通过，售后已拒绝' })
      }
    }
    // 验货通过，流转到待审批
    await as.update({ status:'approved', approved_by: req.user.id, approved_at: new Date(), remark }, { transaction: t })
    // 对于退货/换货：先回库（把原订单行数量回到对应 SKU）
    if(['return','exchange'].includes(as.type)){
      for(const it of as.items){
        if(!it.sku_id) continue
        const sku = await ProductSku.findByPk(it.sku_id, { transaction: t, lock: t.LOCK.UPDATE })
        if(!sku) continue
        const before = sku.stock
        const newStock = before + it.quantity
        await sku.update({ stock: newStock }, { transaction: t })
        await InventoryLog.create({ product_id: sku.product_id, sku_id: sku.id, change_qty: it.quantity, before_qty: before, after_qty: newStock, type:'adjust', ref_type:'after_sale', ref_id: as.id, operator_id: req.user.id, remark:`售后验货通过回库` }, { transaction: t })
      }
    }
    await t.commit()
    res.json({ success:true, message:'验货完成，已通过并回库，待完成' })
  } catch(e){ await t.rollback(); res.status(400).json({ success:false, message:e.message||'验货提交失败' }) }
})

// 完成售后
router.post('/:id/complete', authorize(['agent','manager','admin']), async (req,res)=>{
  const t = await sequelize.transaction()
  try {
    const { exchange_to } = req.body||{}
    // 额外校验：exchange_to 结构
    if (exchange_to && !Array.isArray(exchange_to)) return res.status(400).json({ success:false, message:'exchange_to 参数应为数组' })
    const as = await AfterSale.findByPk(req.params.id, { include:[{ model: AfterSaleItem, as:'items' }], transaction: t, lock: t.LOCK.UPDATE })
    if(!as) return res.status(404).json({ success:false, message:'售后不存在' })
    if(!['approved'].includes(as.status)) return res.status(400).json({ success:false, message:'状态不允许完成' })

    if(as.type==='refund'){
      // 退款：直接退回钱包
      if(as.customer_id){
        const customer = await Customer.findByPk(as.customer_id, { transaction: t, lock: t.LOCK.UPDATE })
        if(!customer) throw new Error('客户不存在')
        const before = Number(customer.wallet_balance||0)
        const after = Number((before + Number(as.refund_amount||0)).toFixed(2))
        await customer.update({ wallet_balance: after }, { transaction: t })
        await WalletTransaction.create({ customer_id: customer.id, change_amount: Number(as.refund_amount||0), before_balance: before, after_balance: after, type:'refund', ref_type:'after_sale', ref_id: as.id, operator_id: req.user.id, remark:'售后退款' }, { transaction: t })
      }
    }
    else if(as.type==='return'){
      // 退货：退款到钱包（金额取 as.refund_amount）
      if(as.customer_id){
        const customer = await Customer.findByPk(as.customer_id, { transaction: t, lock: t.LOCK.UPDATE })
        if(!customer) throw new Error('客户不存在')
        const before = Number(customer.wallet_balance||0)
        const after = Number((before + Number(as.refund_amount||0)).toFixed(2))
        await customer.update({ wallet_balance: after }, { transaction: t })
        await WalletTransaction.create({ customer_id: customer.id, change_amount: Number(as.refund_amount||0), before_balance: before, after_balance: after, type:'refund', ref_type:'after_sale', ref_id: as.id, operator_id: req.user.id, remark:'退货退款' }, { transaction: t })
      }
    }
    else if(as.type==='exchange'){
      // 换货：仅允许更换同商品不同尺码
      if(!Array.isArray(exchange_to) || !exchange_to.length) throw new Error('缺少换货目标')
      for(const m of exchange_to){
        const from = as.items.find(x=>x.id===m.from_item_id)
        if(!from) throw new Error('换货来源不存在')
        const toSku = await ProductSku.findByPk(m.to_sku_id, { transaction: t, lock: t.LOCK.UPDATE })
        if(!toSku) throw new Error('目标SKU不存在')
        if (Number(toSku.product_id) !== Number((await ProductSku.findByPk(from.sku_id, { transaction: t }))?.product_id)) {
          throw new Error('仅能更换同一商品的不同尺码')
        }
        const qty = Math.min(Number(m.quantity||0), from.quantity)
        if(qty<=0) throw new Error('换货数量无效')
        // 目标SKU出库
        const before = toSku.stock
        if (before < qty) throw new Error('目标尺码库存不足')
        const after = before - qty
        await toSku.update({ stock: after }, { transaction: t })
        await InventoryLog.create({ product_id: toSku.product_id, sku_id: toSku.id, change_qty: -qty, before_qty: before, after_qty: after, type:'adjust', ref_type:'after_sale', ref_id: as.id, operator_id: req.user.id, remark:'售后换货出库' }, { transaction: t })
      }
    }

    await as.update({ status:'completed' }, { transaction: t })
    await t.commit()
    res.json({ success:true, message:'售后已完成' })
  } catch(e){ await t.rollback(); res.status(400).json({ success:false, message: e.message||'操作失败' }) }
})

// 撤销售后
router.post('/:id/cancel', authorize(['admin','manager']), async (req,res)=>{
  const t = await sequelize.transaction()
  try {
    const as = await AfterSale.findByPk(req.params.id, { transaction: t, lock: t.LOCK.UPDATE })
    if(!as) return res.status(404).json({ success:false, message:'售后不存在' })
    if(['completed','cancelled','rejected'].includes(as.status)) return res.status(400).json({ success:false, message:'状态不允许撤销' })
    await as.update({ status:'cancelled' }, { transaction: t })
    await t.commit()
    res.json({ success:true, message:'已撤销' })
  } catch(e){ await t.rollback(); res.status(400).json({ success:false, message:e.message||'撤销失败' }) }
})

// 客服转账到客户钱包（正数加钱，负数扣钱）
router.post('/wallet/transfer', authorize(['agent','manager','admin']), async (req,res)=>{
  const t = await sequelize.transaction()
  try{
    const { customer_id, amount, remark } = req.body||{}
    if(!customer_id || !amount) return res.status(400).json({ success:false, message:'参数错误' })
    const customer = await Customer.findByPk(customer_id, { transaction: t, lock: t.LOCK.UPDATE })
    if(!customer) return res.status(404).json({ success:false, message:'客户不存在' })
    const before = Number(customer.wallet_balance||0)
    const after = Number((before + Number(amount)).toFixed(2))
    await customer.update({ wallet_balance: after }, { transaction: t })
    await WalletTransaction.create({ customer_id, change_amount: Number(amount), before_balance: before, after_balance: after, type:'transfer', ref_type:'manual_transfer', ref_id: null, operator_id: req.user.id, remark: remark||'客服转账' }, { transaction: t })
    await t.commit()
    res.json({ success:true, data: { balance: after } })
  } catch(e){ await t.rollback(); res.status(400).json({ success:false, message:e.message||'转账失败' }) }
})

// 获取售后列表（支持筛选）
router.get('/', async (req,res)=>{
  const { page=1, limit=20, q, status, order_id, customer_id, type } = req.query
  const where = {}
  if(q) where.as_no = { [Op.like]: `%${q}%` }
  if(status) where.status = status
  if(order_id) where.order_id = order_id
  if(customer_id) where.customer_id = customer_id
  if(type) where.type = type
  const per = parseInt(limit); const cur = parseInt(page); const offset = (cur-1)*per
  const { rows, count } = await AfterSale.findAndCountAll({ where, limit: per, offset, order:[['id','DESC']] })
  res.json({ success:true, data: { items: rows, pagination:{ total: count, page: cur, limit: per } } })
})

// 获取售后详情
router.get('/:id', async (req,res)=>{
  const as = await AfterSale.findByPk(req.params.id, { include:[{ model: AfterSaleItem, as:'items' }] })
  if(!as) return res.status(404).json({ success:false, message:'不存在' })
  res.json({ success:true, data: as })
})

module.exports = router
