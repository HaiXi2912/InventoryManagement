const express = require('express')
const router = express.Router()
const { authenticate, authorize } = require('../middleware/auth')
const { Op } = require('sequelize')
const { Order, OrderItem, Address, Purchase, PurchaseDetail, Product, ProductSku, Sale, SaleDetail, User } = require('../models')
const bwipjs = require('bwip-js')
const jwt = require('jsonwebtoken')

// 替换为打印专用认证：兼容 header 与 ?token=
router.use(async (req, res, next) => {
  try {
    let token = ''
    const authHeader = req.headers.authorization
    if (authHeader && authHeader.startsWith('Bearer ')) token = authHeader.substring(7)
    if (!token && req.query && req.query.token) token = String(req.query.token)
    if (!token) return res.status(401).json({ success: false, message: '未提供认证令牌' })

    const decoded = jwt.verify(token, process.env.JWT_SECRET)
    const user = await User.findByPk(decoded.id, { attributes: ['id','username','real_name','role','status'] })
    if (!user || user.status !== 'active') return res.status(401).json({ success: false, message: '用户不存在或被禁用' })
    req.user = user
    // 保存原始token，供页面中资源请求（如条码图片）携带
    req.authToken = token
    next()
  } catch (error) {
    if (error.name === 'TokenExpiredError') return res.status(401).json({ success:false, message:'认证令牌已过期' })
    return res.status(401).json({ success:false, message:'无效的认证令牌' })
  }
})

// 通用打印HTML模板
function printHtml({ title, body, styles = '' }) {
  const base = `
  body{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, "Helvetica Neue", Arial, "Noto Sans", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif; padding:16px; color:#222 }
  .header{ display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:12px }
  .brand{ font-size:18px; font-weight:700 }
  .subtitle{ color:#666; margin-top:2px; font-size:12px }
  .doc-title{ font-size:18px; font-weight:700; text-align:center; margin:6px 0 10px }
  .meta{ display:grid; grid-template-columns: repeat(2, 1fr); gap:6px 16px; font-size:12px; margin:8px 0 }
  .section{ margin-top:10px }
  table{ width:100%; border-collapse:collapse; margin-top:6px }
  th,td{ border:1px solid #333; padding:6px; font-size:12px }
  tfoot td{ font-weight:700 }
  .flex{ display:flex; gap:12px; align-items:center }
  .sign{ display:grid; grid-template-columns: repeat(3, 1fr); gap:12px; margin-top:20px; font-size:12px }
  .barcode{ margin-top:8px }
  @media print{ .no-print{ display:none !important } body{ padding:0 } }
  `
  return `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title><style>${base}${styles}</style></head><body>${body}<script>window.onload=()=>window.print()</script></body></html>`
}

function fmtMoney(n){ return Number(n||0).toFixed(2) }
function fmtDate(d){ try{ return new Date(d).toLocaleString() }catch{ return '' } }

// 入库单（按采购单）
router.get('/inbound', authorize(['staff','manager','admin']), async (req,res)=>{
  const { purchase_id } = req.query
  const p = await Purchase.findByPk(purchase_id, { include:[
    { model: User, as: 'operator' },
    { model: PurchaseDetail, as:'details', include:[{ model: Product, as:'product' }] }
  ] })
  if(!p) return res.status(404).send('采购单不存在')

  // 加载尺码分配
  let sizePlans = {}
  try {
    const [rows] = await require('../config/database').sequelize.query('SELECT product_id, size, quantity FROM purchase_size_plans WHERE purchase_id = ? ORDER BY product_id, size', { replacements:[p.id] })
    for(const r of rows){ const k = String(r.product_id); if(!sizePlans[k]) sizePlans[k] = []; sizePlans[k].push({ size: r.size, qty: Number(r.quantity||0) }) }
  } catch {}

  const rows = (p.details||[]).map((it,i)=>{
    const name = it.product?.name||''
    const code = it.product?.code||''
    const barcode = it.product?.barcode||''
    // 尺码明细
    const plan = sizePlans[String(it.product_id)] || []
    const sizeHtml = plan.length ? `<table style="width:100%; border:none; border-collapse:collapse; margin:0"><tbody>${plan.map(sp=>`<tr><td style='border:none;padding:0 4px'>${sp.size}</td><td style='border:none;padding:0 4px;text-align:right'>×${sp.qty}</td></tr>`).join('')}</tbody></table>` : '-'
    return `<tr>
      <td>${i+1}</td>
      <td>${code}</td>
      <td>${name}</td>
      <td>${barcode}</td>
      <td style="text-align:right">${it.quantity}</td>
      <td style="text-align:right">${fmtMoney(it.unit_price)}</td>
      <td style="text-align:right">${fmtMoney(it.total_price)}</td>
      <td>${it.batch_no||''}</td>
      <td>${it.expiry_date? String(it.expiry_date).slice(0,10):''}</td>
      <td>${sizeHtml}</td>
    </tr>`
  }).join('')

  const totalQty = (p.details||[]).reduce((s,d)=>s+Number(d.quantity||0),0)
  const totalAmt = (p.details||[]).reduce((s,d)=>s+Number(d.total_price||0),0)
  const taxRate = Number(p.tax_rate||0)
  const freight = Number(p.freight_amount||0)
  const other = Number(p.other_amount||0)

  const body = `
    <div class="header">
      <div>
        <div class="brand">入库单 Inbound</div>
        <div class="subtitle">${fmtDate(new Date())}</div>
      </div>
      <div style="text-align:right">
        <div>单号：${p.purchase_no}</div>
        <div>操作员：${p.operator?.real_name||p.operator?.username||'-'}</div>
      </div>
    </div>
    <div class="meta">
      <div>进货日期：${String(p.purchase_date).slice(0,10)}</div>
      <div>币种：${p.currency||'CNY'}</div>
      <div>税率：${fmtMoney(taxRate)}%</div>
    </div>
    <div class="section">
      <table>
        <thead><tr><th>#</th><th>编码</th><th>商品</th><th>条码</th><th>数量</th><th>单价</th><th>金额</th><th>批号</th><th>效期</th><th style="min-width:140px">尺码明细</th></tr></thead>
        <tbody>${rows}</tbody>
        <tfoot>
          <tr><td colspan="4" style="text-align:right">合计</td><td style="text-align:right">${totalQty}</td><td></td><td style="text-align:right">${fmtMoney(totalAmt)}</td><td colspan="3"></td></tr>
          <tr><td colspan="6" style="text-align:right">运费</td><td style="text-align:right">${fmtMoney(freight)}</td><td colspan="3"></td></tr>
          <tr><td colspan="6" style="text-align:right">其他费用</td><td style="text-align:right">${fmtMoney(other)}</td><td colspan="3"></td></tr>
        </tfoot>
      </table>
    </div>
    <div class="sign">
      <div>制单：</div>
      <div>复核：</div>
      <div>仓管签收：</div>
    </div>
  `

  res.setHeader('Content-Type','text/html; charset=utf-8')
  res.send(printHtml({ title: '入库单', body }))
})

// 拣货单（订单/销售）
router.get('/picking', authorize(['staff','manager','admin']), async (req,res)=>{
  const { order_id } = req.query
  let o = await Order.findByPk(order_id, { include:[{ model: OrderItem, as:'items' }, { model: Address, as:'address' }] })
  let rowsHtml = ''
  let orderNo = ''
  if(!o){
    // 销售单：附带 Product
    const s = await Sale.findByPk(order_id, { include:[{ model: SaleDetail, as:'details', include:[{ model: Product, as:'product' }] }] })
    if(!s) return res.status(404).send('单据不存在')
    orderNo = s.sale_no

    // 加载销售尺码分配
    let sizePlans = {}
    try {
      const [rows] = await require('../config/database').sequelize.query('SELECT product_id, size, quantity FROM sales_size_plans WHERE sale_id = ? ORDER BY product_id, size', { replacements:[s.id] })
      for(const r of rows){ const k = String(r.product_id); if(!sizePlans[k]) sizePlans[k] = []; sizePlans[k].push({ size: r.size, qty: Number(r.quantity||0) }) }
    } catch {}

    if (Object.keys(sizePlans).length) {
      // 按尺码逐行展示
      rowsHtml = Object.keys(sizePlans).map((pid, i) => {
        const plan = sizePlans[pid]
        const detail = (s.details||[]).find(d=>String(d.product_id)===String(pid))
        const name = detail?.product?.name || '-'
        return plan.map((sp, idx)=>`<tr><td>${i+1}.${idx+1}</td><td>${name}</td><td>-</td><td>${sp.size}</td><td>-</td><td>${sp.qty}</td></tr>`).join('')
      }).join('')
    } else {
      // 兼容：按明细展示
      rowsHtml = (s.details||[]).map((it,i)=>`<tr><td>${i+1}</td><td>${it.product?.name||'-'}</td><td>-</td><td>-</td><td>-</td><td>${it.quantity}</td></tr>`).join('')
    }
  } else {
    orderNo = o.order_no
    rowsHtml = (o.items||[]).map((it,i)=>`<tr><td>${i+1}</td><td>${it.name||''}</td><td>${it.color||''}</td><td>${it.size||''}</td><td>${it.barcode||''}</td><td>${it.quantity}</td></tr>`).join('')
  }
  const body = `
    <div class="doc-title">拣货单 Pick List</div>
    <div class="meta">
      <div>单号：${orderNo}</div>
      <div>日期：${fmtDate(new Date())}</div>
    </div>
    <table><thead><tr><th>#</th><th>商品</th><th>颜色</th><th>尺码</th><th>条码</th><th>数量</th></tr></thead><tbody>${rowsHtml}</tbody></table>
    <div class="sign"><div>拣货：</div><div>复核：</div><div>出库：</div></div>
  `
  res.setHeader('Content-Type','text/html; charset=utf-8')
  res.send(printHtml({ title:'拣货单', body }))
})

// 出库单（订单/销售）
router.get('/outbound', authorize(['staff','manager','admin']), async (req,res)=>{
  const { order_id } = req.query
  let o = await Order.findByPk(order_id, { include:[{ model: OrderItem, as:'items' }] })
  let rowsHtml = ''
  let orderNo = ''
  if(!o){
    const s = await Sale.findByPk(order_id, { include:[{ model: SaleDetail, as:'details', include:[{ model: Product, as:'product' }] }] })
    if(!s) return res.status(404).send('单据不存在')
    orderNo = s.sale_no

    // 加载销售尺码分配
    let sizePlans = {}
    try {
      const [rows] = await require('../config/database').sequelize.query('SELECT product_id, size, quantity FROM sales_size_plans WHERE sale_id = ? ORDER BY product_id, size', { replacements:[s.id] })
      for(const r of rows){ const k = String(r.product_id); if(!sizePlans[k]) sizePlans[k] = []; sizePlans[k].push({ size: r.size, qty: Number(r.quantity||0) }) }
    } catch {}

    if (Object.keys(sizePlans).length) {
      rowsHtml = Object.keys(sizePlans).map((pid, i) => {
        const plan = sizePlans[pid]
        const detail = (s.details||[]).find(d=>String(d.product_id)===String(pid))
        const name = detail?.product?.name || '-'
        const sizeHtml = plan.length ? `<table style="width:100%; border:none; border-collapse:collapse; margin:0"><tbody>${plan.map(sp=>`<tr><td style='border:none;padding:0 4px'>${sp.size}</td><td style='border:none;padding:0 4px;text-align:right'>×${sp.qty}</td></tr>`).join('')}</tbody></table>` : '-'
        const sumQty = plan.reduce((n,p)=>n+Number(p.qty||0),0)
        return `<tr><td>${i+1}</td><td>${name}</td><td>${sumQty}</td><td>已出库</td><td>${sizeHtml}</td></tr>`
      }).join('')
    } else {
      rowsHtml = (s.details||[]).map((it,i)=>`<tr><td>${i+1}</td><td>${it.product?.name||''}</td><td>${it.quantity}</td><td>已出库</td><td>-</td></tr>`).join('')
    }
  } else {
    orderNo = o.order_no
    rowsHtml = (o.items||[]).map((it,i)=>`<tr><td>${i+1}</td><td>${it.name||''}</td><td>${it.barcode||''}</td><td>${it.quantity}</td><td>已出库</td></tr>`).join('')
  }
  const body = `
    <div class="doc-title">出库单 Delivery Note</div>
    <div class="meta">
      <div>单号：${orderNo}</div>
      <div>日期：${fmtDate(new Date())}</div>
    </div>
    <table><thead><tr><th>#</th><th>商品</th><th>数量</th><th>状态</th><th style="min-width:140px">尺码明细</th></tr></thead><tbody>${rowsHtml}</tbody></table>
    <div class="sign"><div>制单：</div><div>复核：</div><div>收货：</div></div>
  `
  res.setHeader('Content-Type','text/html; charset=utf-8')
  res.send(printHtml({ title:'出库单', body }))
})

// 条码PNG
router.get('/barcode/:code.png', authorize(['customer','staff','manager','admin']), async (req,res)=>{
  const { code } = req.params
  try{
    const png = await bwipjs.toBuffer({ bcid:'code128', text: String(code), scale: 3, height: 10, includetext: true, textxalign:'center' })
    res.setHeader('Content-Type','image/png')
    res.send(png)
  }catch(e){ res.status(400).send('条码生成失败') }
})

// SKU 吊牌/条码批量打印（支持 ids 或 product_id 打印全部SKU）
router.get('/sku-labels', authorize(['staff','manager','admin']), async (req,res)=>{
  const productId = Number(req.query.product_id || 0)
  let list = []
  if(productId){
    list = await ProductSku.findAll({ where:{ product_id: productId }, include:[{ model: Product, as:'product' }] })
  } else {
    const ids = String(req.query.ids||'').split(',').map(s=>Number(s.trim())).filter(n=>Number.isFinite(n) && n>0)
    if(!ids.length) return res.status(400).send('ids 或 product_id 必填')
    list = await ProductSku.findAll({ where:{ id:{ [Op.in]: ids } }, include:[{ model: Product, as:'product' }] })
  }
  const tokenQ = req.authToken ? `?token=${encodeURIComponent(req.authToken)}` : ''
  const labels = list.map(s=>`<div class="label">
    <div>${s.product?.name||''}</div>
    <div>${s.color||''} / ${s.size||''}</div>
    <div>￥${Number(s.retail_price||0).toFixed(2)}</div>
    <div class="barcode"><img src="/api/print/barcode/${encodeURIComponent(s.barcode||s.sku_code||s.id)}.png${tokenQ}" /></div>
  </div>`).join('')
  const body = `<div class="doc-title">SKU 吊牌</div><div class="grid">${labels}</div>`
  const styles = `.grid{ display:grid; grid-template-columns: repeat(2, 1fr); gap:8px } .label{ border:1px dashed #999; padding:8px; border-radius:6px }`
  res.setHeader('Content-Type','text/html; charset=utf-8')
  res.send(printHtml({ title: 'SKU 吊牌', body, styles }))
})

// 快递面单（简版，支持已有运单号）
router.get('/shipping-label', authorize(['staff','manager','admin']), async (req,res)=>{
  const { order_id } = req.query
  const o = await Order.findByPk(order_id, { include:[{ model: Address, as:'address' }] })
  if(!o) return res.status(404).send('订单不存在')
  const shipNo = o.shipping_no || `SHIP${o.id}${Date.now().toString().slice(-6)}`
  const addr = o.address
  const toLine = addr? `${addr.receiver_name} ${addr.phone}`:'-'
  const addrLine = addr? `${addr.province||''}${addr.city||''}${addr.district||''}${addr.detail||''}`:'-'
  const tokenQ = req.authToken ? `?token=${encodeURIComponent(req.authToken)}` : ''
  const body = `
    <div class="doc-title">快递面单 Shipping Label</div>
    <div class="meta"><div>订单号：${o.order_no}</div><div>运单号：${shipNo}</div></div>
    <div class="meta"><div>收件人：${toLine}</div><div>地址：${addrLine}</div></div>
    <div class="barcode"><img src="/api/print/barcode/${encodeURIComponent(shipNo)}.png${tokenQ}" /></div>
  `
  res.setHeader('Content-Type','text/html; charset=utf-8')
  res.send(printHtml({ title: '快递面单', body }))
})

module.exports = router
