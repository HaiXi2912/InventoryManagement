const express = require('express')
const router = express.Router()
const { sequelize, ProductSku, InventoryLog, Order, OrderItem } = require('../models')
const { authenticate, authorize } = require('../middleware/auth')
const { Op } = require('sequelize')
const { Parser } = require('json2csv')

router.use(authenticate)

// 原因码（简单内置）
const REASONS = [
  { code: 'breakage', name: '破损' },
  { code: 'loss', name: '盘亏' },
  { code: 'surplus', name: '盘盈' },
  { code: 'sample', name: '样衣' },
  { code: 'other', name: '其他' },
]

router.get('/reasons', authorize(['staff','manager','admin']), async (_req,res)=>{
  res.json({ success:true, data: REASONS })
})

// 低库存列表（含锁定）
router.get('/low', authorize(['staff','manager','admin']), async (req,res)=>{
  const { threshold = 5, q, status = 'active' } = req.query
  const where = { stock: { [Op.lte]: Number(threshold) } }
  if (status) where.status = status
  if (q) {
    where[Op.or] = [
      { barcode: { [Op.like]: `%${q}%` } },
      { size: { [Op.like]: `%${q}%` } },
      { color: { [Op.like]: `%${q}%` } },
      { sku_code: { [Op.like]: `%${q}%` } },
    ]
  }
  const list = await ProductSku.findAll({ where, order:[['stock','ASC'],['id','ASC']] })
  res.json({ success:true, data: list })
})

// 批量查询SKU库存信息 ids=1,2,3
router.get('/batch', authorize(['staff','manager','admin']), async (req,res)=>{
  const ids = String(req.query.ids||'')
    .split(',')
    .map(s=>Number(s.trim()))
    .filter(n=>Number.isFinite(n) && n>0)
  if (!ids.length) return res.status(400).json({ success:false, message:'ids 必填' })
  const list = await ProductSku.findAll({ where:{ id: { [Op.in]: ids } }, order:[['id','ASC']] })
  res.json({ success:true, data: list })
})

// 批量调整库存：[{ sku_id, change_qty, reason, remark }]
router.post('/adjust', authorize(['staff','manager','admin']), async (req,res)=>{
  const t = await sequelize.transaction()
  try{
    const items = Array.isArray(req.body)? req.body : req.body.items
    if(!Array.isArray(items) || !items.length) return res.status(400).json({ success:false, message:'提交数据为空' })
    for(const it of items){
      const { sku_id, change_qty, reason, remark } = it || {}
      if(!sku_id || !Number.isFinite(Number(change_qty))) throw new Error('参数无效')
      const sku = await ProductSku.findByPk(sku_id, { transaction: t, lock: t.LOCK.UPDATE })
      if(!sku) throw new Error('SKU不存在')
      const before = sku.stock
      const after = before + Number(change_qty)
      if(after < 0) throw new Error('调整后库存不能为负数')
      await sku.update({ stock: after }, { transaction: t })
      await InventoryLog.create({ product_id: sku.product_id, sku_id: sku.id, change_qty: Number(change_qty), before_qty: before, after_qty: after, type: 'adjust', ref_type: 'manual_adjust', ref_id: null, operator_id: req.user.id, remark: `${(REASONS.find(r=>r.code===reason)?.name || reason || '调整')}${remark?(' - '+remark):''}` }, { transaction: t })
    }
    await t.commit()
    res.json({ success:true, message:'已调整' })
  } catch(e){ await t.rollback(); res.status(400).json({ success:false, message: e.message||'调整失败' }) }
})

// 盘点：设置实际库存 actual_qty
router.post('/stocktake', authorize(['staff','manager','admin']), async (req,res)=>{
  const t = await sequelize.transaction()
  try{
    const { sku_id, actual_qty, remark } = req.body || {}
    if(!sku_id || !Number.isFinite(Number(actual_qty))) return res.status(400).json({ success:false, message:'参数无效' })
    const sku = await ProductSku.findByPk(sku_id, { transaction: t, lock: t.LOCK.UPDATE })
    if(!sku) return res.status(404).json({ success:false, message:'SKU不存在' })
    const before = sku.stock
    const diff = Number(actual_qty) - before
    await sku.update({ stock: Number(actual_qty) }, { transaction: t })
    if(diff !== 0){
      await InventoryLog.create({ product_id: sku.product_id, sku_id: sku.id, change_qty: diff, before_qty: before, after_qty: Number(actual_qty), type:'adjust', ref_type:'stocktake', ref_id:null, operator_id: req.user.id, remark: remark||'库存盘点' }, { transaction: t })
    }
    await t.commit()
    res.json({ success:true, message:'盘点完成', data:{ sku_id, before, after: Number(actual_qty), diff } })
  } catch(e){ await t.rollback(); res.status(400).json({ success:false, message: e.message||'盘点失败' }) }
})

// 批量盘点：items: [{ sku_id, actual_qty, remark }]
router.post('/stocktake/batch', authorize(['staff','manager','admin']), async (req,res)=>{
  const t = await sequelize.transaction()
  try{
    const items = Array.isArray(req.body)? req.body : req.body.items
    if(!Array.isArray(items) || !items.length) return res.status(400).json({ success:false, message:'提交数据为空' })
    const results = []
    for(const it of items){
      const { sku_id, actual_qty, remark } = it || {}
      if(!sku_id || !Number.isFinite(Number(actual_qty))) throw new Error('参数无效')
      const sku = await ProductSku.findByPk(sku_id, { transaction: t, lock: t.LOCK.UPDATE })
      if(!sku) throw new Error('SKU不存在')
      const before = sku.stock
      const diff = Number(actual_qty) - before
      await sku.update({ stock: Number(actual_qty) }, { transaction: t })
      if(diff !== 0){
        await InventoryLog.create({ product_id: sku.product_id, sku_id: sku.id, change_qty: diff, before_qty: before, after_qty: Number(actual_qty), type:'adjust', ref_type:'stocktake', ref_id:null, operator_id: req.user.id, remark: remark||'库存盘点' }, { transaction: t })
      }
      results.push({ sku_id, before, after: Number(actual_qty), diff })
    }
    await t.commit()
    res.json({ success:true, message:'批量盘点完成', data:{ items: results } })
  } catch(e){ await t.rollback(); res.status(400).json({ success:false, message:e.message||'批量盘点失败' }) }
})

// 查看某SKU的占用（pending订单）
router.get('/sku/:id/reservations', authorize(['staff','manager','admin']), async (req,res)=>{
  const id = Number(req.params.id)
  if(!Number.isFinite(id)) return res.status(400).json({ success:false, message:'参数无效' })
  const orders = await Order.findAll({ where:{ status:'pending' }, include:[{ model: OrderItem, as:'items', where:{ sku_id: id } }] })
  const list = orders.map(o=>({ order_id: o.id, order_no: o.order_no, quantity: o.items.reduce((a,b)=>a+(b.sku_id===id?b.quantity:0),0), created_at: o.createdAt }))
  res.json({ success:true, data: list })
})

// 导出库存流水CSV
router.get('/logs/export.csv', authorize(['staff','manager','admin']), async (req,res)=>{
  const { sku_id, date_from, date_to } = req.query
  const where = {}
  if (sku_id) where.sku_id = Number(sku_id)
  if (date_from || date_to) where.created_at = {}
  if (date_from) where.created_at[Op.gte] = new Date(date_from)
  if (date_to) where.created_at[Op.lte] = new Date(date_to)
  const logs = await InventoryLog.findAll({ where, order:[['id','ASC']] })
  const rows = logs.map(l=>({ id:l.id, sku_id:l.sku_id, product_id:l.product_id, type:l.type, change_qty:l.change_qty, before_qty:l.before_qty, after_qty:l.after_qty, ref_type:l.ref_type, ref_id:l.ref_id, operator_id:l.operator_id, remark:l.remark, created_at:l.created_at }))
  const parser = new Parser({ fields: Object.keys(rows[0]||{ id:0 }) })
  const csv = parser.parse(rows)
  res.setHeader('Content-Type','text/csv; charset=utf-8')
  res.setHeader('Content-Disposition','attachment; filename="inventory_logs.csv"')
  res.send('\uFEFF' + csv)
})

// 批量获取 SKU 销售指标：ids=1,2,3 -> { id, total_sold, sold_30d }
router.get('/sku/metrics', authorize(['staff','manager','admin']), async (req,res)=>{
  try{
    const ids = String(req.query.ids||'')
      .split(',')
      .map(s=>Number(s.trim()))
      .filter(n=>Number.isFinite(n) && n>0)
    if(!ids.length) return res.status(400).json({ success:false, message:'ids 必填' })

    const since30d = new Date(Date.now() - 30*24*60*60*1000)
    const okStatus = ['paid','shipped','completed']

    // 取出相关订单项（限制状态）
    const items = await OrderItem.findAll({
      where: { sku_id: { [Op.in]: ids } },
      include: [{ model: Order, as: 'order', where: { status: { [Op.in]: okStatus } } }],
      order: [['id','ASC']]
    })

    const map = Object.fromEntries(ids.map(id => [id, { id, total_sold: 0, sold_30d: 0 }]))
    for(const it of items){
      const id = it.sku_id
      const qty = Number(it.quantity||0)
      map[id].total_sold += qty
      if(new Date(it.createdAt) >= since30d) map[id].sold_30d += qty
    }

    res.json({ success:true, data: ids.map(id => map[id]) })
  } catch(e){
    console.error('获取SKU指标失败', e)
    res.status(500).json({ success:false, message:'服务器错误' })
  }
})

module.exports = router

// 注意：系统以 SKU 为唯一库存维度，商品级库存仅作为汇总展示，不参与扣减/入库逻辑。
