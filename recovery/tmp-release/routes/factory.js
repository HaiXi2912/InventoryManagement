const express = require('express');
const router = express.Router();
const { Op } = require('sequelize');
const { sequelize } = require('../config/database');
const { authenticate, authorize } = require('../middleware/auth');
const { Product, ProductSku, InventoryLog, User, FactoryOrder, FactoryOrderDetail, OperationLog } = require('../models');
const { stockBus } = require('../services/stockBus');

// 工厂设置（简单内存版，可后续落库）。运费已取消，per_piece_shipping 保留仅为兼容，实际不再使用。
let factorySettings = {
  daily_capacity: 100,
  work_hours_per_day: 12,
  per_piece_shipping: 0,
};

// 单线程生产队列（内存版）：仅对非加急生效；加急始终按创建时间FIFO，且严禁插队
// 保存为 id 数组，表示非加急待生产的优先顺序（越靠前越早生产）
let normalQueuePref = [];

// 暂停进度映射：order_id -> 剩余毫秒（用于被加急抢占时保留进度）
const pausedRemainingMs = new Map();

// 允许匿名读取设置，避免初次加载鉴权引起的报错；保存亦免鉴权以符合前端需求
router.get('/settings', async (_req, res)=>{
  res.json({ success:true, data: factorySettings })
});
router.post('/settings', async (req,res)=>{
  const { daily_capacity, work_hours_per_day } = req.body||{}
  if (daily_capacity!=null) factorySettings.daily_capacity = Math.max(1, Number(daily_capacity)||100)
  if (work_hours_per_day!=null) factorySettings.work_hours_per_day = Math.max(1, Number(work_hours_per_day)||12)
  // per_piece_shipping 已废弃，不再更新
  res.json({ success:true, data: factorySettings })
});

function genFactoryNo(){
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth()+1).padStart(2,'0');
  const d = String(now.getDate()).padStart(2,'0');
  const t = String(now.getHours()).padStart(2,'0')+String(now.getMinutes()).padStart(2,'0')+String(now.getSeconds()).padStart(2,'0');
  return `FO${y}${m}${d}${t}`;
}

// 预计完成时间计算：按件数 -> 生产小时 = (件数 / 日产能)*work_hours
function calcExpectedFinish(hoursStart, totalQty){
  const hours = (Number(totalQty||0) / Math.max(1, factorySettings.daily_capacity)) * Math.max(1, factorySettings.work_hours_per_day)
  const ms = Math.ceil(hours * 60 * 60 * 1000)
  return new Date(hoursStart.getTime() + ms)
}

// 计算订单总件数
async function sumOrderQty(fo){
  const details = fo.details || await FactoryOrderDetail.findAll({ where:{ order_id: fo.id } })
  return details.reduce((s,d)=> s + Number(d.quantity||0), 0)
}

// 运费策略：已取消，恒为 0（保留函数避免侵入式改动）
function zeroShipping(){ return 0 }

// 获取下一张应开工的订单：加急优先且FIFO，其次非加急按 normalQueuePref -> createdAt FIFO
async function findNextApprovedOrder(t){
  // 有在产则不取
  const existing = await FactoryOrder.findOne({ where:{ status: 'in_production' }, transaction: t, lock: t?.LOCK?.UPDATE });
  if (existing) return null;
  const approved = await FactoryOrder.findAll({ where: { status:'approved' }, order: [['created_at','ASC']], transaction: t, lock: t?.LOCK?.UPDATE });
  if (!approved.length) return null;
  const expediteList = approved.filter(o=> !!o.expedite);
  const normalList = approved.filter(o=> !o.expedite);
  // 加急严格FIFO：按创建时间已排序，不允许打乱
  if (expediteList.length) return expediteList[0];
  if (!normalList.length) return null;
  // 应用内存排序：将 normalQueuePref 中的 id 顺序优先，其余按创建时间
  const idToOrder = new Map(normalList.map(o=>[String(o.id), o]));
  const ordered = [];
  // 仅采纳仍在 approved 的id
  for (const id of normalQueuePref){ const key=String(id); if (idToOrder.has(key)) { ordered.push(idToOrder.get(key)); idToOrder.delete(key); } }
  // 追加剩余项（保持 created_at 升序）
  for (const o of normalList){ if (idToOrder.has(String(o.id))) ordered.push(o); }
  return ordered[0] || null;
}

// 将指定订单标记为开工（写入开始与预计完成时间）
async function startOrderNow(fo, operatorId, t){
  const now = new Date();
  // 若有暂停的剩余时间，则按剩余时间恢复
  if (pausedRemainingMs.has(fo.id)) {
    const remain = Math.max(0, Number(pausedRemainingMs.get(fo.id)) || 0);
    const eta = new Date(now.getTime() + remain);
    await fo.update({ status: 'in_production', factory_assignee_id: operatorId || fo.factory_assignee_id || null, production_started_at: now, expected_finish_at: eta }, { transaction: t });
    pausedRemainingMs.delete(fo.id);
    return;
  }
  // 否则按件数计算
  const qty = await sumOrderQty(fo);
  const eta = calcExpectedFinish(now, qty);
  await fo.update({ status: 'in_production', factory_assignee_id: operatorId || fo.factory_assignee_id || null, production_started_at: now, expected_finish_at: eta }, { transaction: t });
}

// 抢占当前在产（仅当当前在产为非加急时，供加急单使用）
async function preemptIfNeededForExpedite(t){
  const curr = await FactoryOrder.findOne({ where:{ status:'in_production' }, transaction: t, lock: t.LOCK.UPDATE });
  if (curr && !curr.expedite) {
    // 计算剩余时间并记录
    let remain = 0;
    try {
      const now = Date.now();
      const start = curr.production_started_at ? new Date(curr.production_started_at).getTime() : now;
      const eta = curr.expected_finish_at ? new Date(curr.expected_finish_at).getTime() : now;
      const total = Math.max(0, eta - start);
      const elapsed = Math.max(0, now - start);
      remain = Math.max(0, total - elapsed);
    } catch {}
    pausedRemainingMs.set(curr.id, remain);
    // 退回到已批准，但保留原时间戳不再更新（仅UI用），恢复时以 remain 为准
    await curr.update({ status:'approved' }, { transaction: t });
    return true;
  }
  return false;
}

// 若空闲则自动开工下一单
async function startNextIfIdle(operatorId, t){
  const next = await findNextApprovedOrder(t);
  if (next) {
    await startOrderNow(next, operatorId, t);
  }
}

// 工厂概览
router.get('/dashboard', async (req, res) => {
  try {
    const [byStatus] = await sequelize.query(`SELECT status, COUNT(*) AS cnt FROM factory_orders GROUP BY status`);
    const [inProd] = await sequelize.query(`SELECT f.id, f.order_no, p.name AS product_name, d.size, d.quantity
      FROM factory_order_details d
      JOIN factory_orders f ON f.id=d.order_id
      JOIN products p ON p.id=d.product_id
      WHERE f.status='in_production'
      ORDER BY f.created_at DESC LIMIT 50`);
    const [styles] = await sequelize.query(`SELECT p.id, p.name, COUNT(s.id) AS sku_count FROM products p LEFT JOIN product_skus s ON s.product_id=p.id GROUP BY p.id ORDER BY p.created_at DESC LIMIT 100`);
    res.json({ success:true, data: { status_stats: byStatus, in_production: inProd, styles } });
  } catch (e) {
    console.error('工厂概览失败:', e);
    res.status(500).json({ success:false, message:'服务器错误' });
  }
});

// 列表（新增 source 筛选）
router.get('/orders', async (req, res) => {
  try {
    const { page=1, size=10, status, keyword, source } = req.query;
    const where = {};
    if (status) where.status = status;
    if (source) where.source = source;
    if (keyword) where.order_no = { [Op.like]: `%${keyword}%` };
    const limit = parseInt(size); const offset = (parseInt(page)-1)*limit;
    const { count, rows } = await FactoryOrder.findAndCountAll({
      where,
      order: [['createdAt','DESC']],
      include: [
        { model: User, as: 'operator', attributes:['id','username','real_name'] },
        { model: User, as: 'factoryAssignee', attributes:['id','username','real_name'] },
        {
          model: FactoryOrderDetail, as: 'details',
          include: [
            { model: Product, as: 'product', attributes:['id','name','code','retail_price','purchase_price'] },
            { model: ProductSku, as: 'sku', attributes:['id','size','stock'] },
          ]
        }
      ],
      limit, offset,
    });

    // 进度时间回填：对处于生产中但缺少时间戳的订单，按当前时间与件数推算预计完成时间
    for (const o of rows) {
      if (String(o.status) === 'in_production' && (!o.production_started_at || !o.expected_finish_at)) {
        const totalQty = Array.isArray(o.details) ? o.details.reduce((s,d)=> s + Number(d.quantity||0), 0) : 0
        const start = o.production_started_at || new Date()
        const eta = calcExpectedFinish(new Date(start), totalQty)
        o.setDataValue('production_started_at', start)
        o.setDataValue('expected_finish_at', eta)
        // 尝试持久化，失败则忽略（不影响响应）
        try { await o.update({ production_started_at: start, expected_finish_at: eta }) } catch {}
      }
    }

    res.json({ success:true, data: { orders: rows, pagination:{ total: count, page: parseInt(page), size: limit, pages: Math.ceil(count/limit) } } });
  } catch (e) {
    console.error('获取工厂订单失败:', e);
    res.status(500).json({ success:false, message:'服务器错误' });
  }
});

// 创建（运费恒为 0）
router.post('/orders', authenticate, async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const { expedite=false, remark='', items=[] } = req.body;
    if (!Array.isArray(items) || items.length===0) { await t.rollback(); return res.status(400).json({ success:false, message:'明细不能为空' }); }
    const order_no = genFactoryNo();
    let total_cost = 0;
    for (const it of items){
      const product_id = Number(it.product_id); const sku_id = it.sku_id ? Number(it.sku_id) : null; const size = it.size || null; const qty = Number(it.quantity||0);
      if (!product_id || qty<=0) { await t.rollback(); return res.status(400).json({ success:false, message:'明细不合法' }); }
      const product = await Product.findByPk(product_id);
      if (!product) { await t.rollback(); return res.status(400).json({ success:false, message:`商品${product_id}不存在` }); }
      const unit_cost = Number(it.unit_cost != null ? it.unit_cost : (product.purchase_price || 0));
      const subtotal = qty * unit_cost; total_cost += subtotal;
    }
    const fo = await FactoryOrder.create({ order_no, status:'planned', expedite: !!expedite, source:'manual', shipping_fee: 0, total_cost: 0, remark, operator_id: req.user.id }, { transaction: t });
    for (const it of items){
      const product_id = Number(it.product_id); const sku_id = it.sku_id ? Number(it.sku_id) : null; const size = it.size || null; const qty = Number(it.quantity||0);
      const product = await Product.findByPk(product_id);
      const unit_cost = Number(it.unit_cost != null ? it.unit_cost : (product.purchase_price || 0));
      const subtotal = qty * unit_cost;
      await FactoryOrderDetail.create({ order_id: fo.id, product_id, sku_id, size, quantity: qty, unit_cost, subtotal_cost: subtotal, remark: it.remark||null }, { transaction: t });
    }
    await fo.update({ total_cost, shipping_fee: zeroShipping() }, { transaction: t });
    await t.commit();
    res.status(201).json({ success:true, message:'创建成功', data: { id: fo.id, order_no: fo.order_no } });
  } catch (e) {
    if (!t.finished) await t.rollback();
    console.error('创建工厂订单失败:', e);
    res.status(500).json({ success:false, message:'服务器错误' });
  }
});

// 更新加急/备注（运费已废弃，不允许更新）
router.put('/orders/:id', authenticate, async (req, res) => {
  try {
    const fo = await FactoryOrder.findByPk(req.params.id);
    if (!fo) return res.status(404).json({ success:false, message:'不存在' });
    if (!['planned','approved'].includes(fo.status)) return res.status(400).json({ success:false, message:'当前状态不可编辑' });
    const patch = {};
    ['expedite','remark'].forEach(k=>{ if (req.body[k] !== undefined) patch[k] = req.body[k]; });
    await fo.update(patch);
    res.json({ success:true });
  } catch(e){ res.status(500).json({ success:false, message:'服务器错误' }); }
});

// 移动非加急待生产顺序（上/下），仅对 status=approved 且 expedite=false 生效
router.post('/orders/:id/move', authenticate, async (req, res) => {
  try {
    const { direction } = req.body || {};
    if (!['up','down'].includes(direction)) return res.status(400).json({ success:false, message:'direction 必须是 up/down' });
    const fo = await FactoryOrder.findByPk(req.params.id);
    if (!fo) return res.status(404).json({ success:false, message:'不存在' });
    if (fo.status !== 'approved') return res.status(400).json({ success:false, message:'仅待生产(已批准)可调整顺序' });
    if (fo.expedite) return res.status(400).json({ success:false, message:'加急单按创建时间排队，不可调整' });

    // 取当前所有非加急 approved 的 id，生成基线顺序
    const normals = await FactoryOrder.findAll({ where:{ status:'approved', expedite:false }, order:[['created_at','ASC']], attributes:['id'] });
    const baseline = normals.map(n=>String(n.id));
    // 清理无效 id
    normalQueuePref = normalQueuePref.filter(id=> baseline.includes(String(id)));
    // 补充缺失 id 到末尾（保持基线）
    for (const id of baseline){ if (!normalQueuePref.includes(id)) normalQueuePref.push(id); }

    const idx = normalQueuePref.findIndex(x=> String(x)===String(fo.id));
    if (idx < 0) return res.json({ success:true, data:{ order: normalQueuePref } });
    if (direction==='up' && idx>0){ const tmp = normalQueuePref[idx-1]; normalQueuePref[idx-1]= normalQueuePref[idx]; normalQueuePref[idx]= tmp; }
    if (direction==='down' && idx<normalQueuePref.length-1){ const tmp = normalQueuePref[idx+1]; normalQueuePref[idx+1]= normalQueuePref[idx]; normalQueuePref[idx]= tmp; }
    return res.json({ success:true, data:{ order: normalQueuePref } });
  } catch(e){
    console.error('移动队列失败:', e);
    res.status(500).json({ success:false, message:'服务器错误' });
  }
});

// 状态流转（按单线程队列处理）
router.post('/orders/:id/approve', authenticate, async (req, res)=>{ await changeStatus(req, res, 'approved'); });
router.post('/orders/:id/start', authenticate, async (req, res)=>{ await changeStatus(req, res, 'in_production'); });
router.post('/orders/:id/complete', authenticate, async (req, res)=>{ await changeStatus(req, res, 'completed'); });
// 将“发货入库”改为“确认入库”，沿用 ship 路径以兼容前端，目标状态直接为 completed
router.post('/orders/:id/ship', authenticate, async (req, res)=>{ await changeStatus(req, res, 'completed', true); });
router.post('/orders/:id/cancel', authenticate, async (req, res)=>{ await changeStatus(req, res, 'cancelled'); });

async function changeStatus(req, res, target, doInbound){
  const t = await sequelize.transaction();
  try {
    const fo = await FactoryOrder.findByPk(req.params.id, { include: [{ model: FactoryOrderDetail, as: 'details' }], transaction: t, lock: t.LOCK.UPDATE });
    if (!fo) { await t.rollback(); return res.status(404).json({ success:false, message:'不存在' }); }

    if (target === 'approved') {
      // 设置为待生产
      await fo.update({ status: 'approved', factory_assignee_id: req.user.id }, { transaction: t });
      if (fo.expedite) {
        // 加急：若当前在产是非加急，则抢占并立刻开工本单；若在产为加急，则排在其后
        const preempted = await preemptIfNeededForExpedite(t);
        if (preempted) await startOrderNow(fo, req.user.id, t); else await startNextIfIdle(req.user.id, t);
      } else {
        await startNextIfIdle(req.user.id, t);
      }
    }
    else if (target === 'in_production'){
      const exist = await FactoryOrder.findOne({ where:{ status:'in_production' }, transaction: t, lock: t.LOCK.UPDATE });
      if (exist && String(exist.id) !== String(fo.id)) {
        if (fo.expedite && !exist.expedite) {
          // 加急抢占非加急在产（保留被抢占单剩余进度）
          await preemptIfNeededForExpedite(t);
          await startOrderNow(fo, req.user.id, t);
        } else {
          // 不能并行，退回排队
          await fo.update({ status: 'approved', factory_assignee_id: req.user.id }, { transaction: t });
        }
      } else {
        await startOrderNow(fo, req.user.id, t);
      }
    }
    else if (target === 'completed'){
      const now = new Date();
      await fo.update({ status: 'completed', factory_assignee_id: req.user.id, finished_at: now }, { transaction: t });
      pausedRemainingMs.delete(fo.id);
      // 完成后自动尝试开工下一单
      await startNextIfIdle(req.user.id, t);
    }
    else {
      await fo.update({ status: target, factory_assignee_id: req.user.id }, { transaction: t })
      if (target==='cancelled') { pausedRemainingMs.delete(fo.id); await startNextIfIdle(req.user.id, t); }
    }

    let inbounded = 0; let createdSkus = 0;
    if (doInbound) {
      for (const d of fo.details){
        let sku = null;
        if (d.sku_id) sku = await ProductSku.findByPk(d.sku_id, { transaction: t, lock: t.LOCK.UPDATE });
        if (!sku && d.size) {
          sku = await ProductSku.findOne({ where: { product_id: d.product_id, size: d.size }, transaction: t, lock: t.LOCK.UPDATE });
          if (!sku) {
            const product = await Product.findByPk(d.product_id, { transaction: t });
            const barcode = `${product.code || 'P'}-${d.size}-${Date.now()%100000}`;
            sku = await ProductSku.create({ product_id: d.product_id, size: d.size, color: '', barcode, retail_price: product.retail_price || 0, tag_price: null, cost_price: product.purchase_price || 0, stock: 0, sort: 0, status: 'active' }, { transaction: t });
            createdSkus++;
          }
        }
        if (!sku) continue;
        const before = Number(sku.stock||0); const after = before + Number(d.quantity||0);
        await sku.update({ stock: after }, { transaction: t });
        await InventoryLog.create({ product_id: d.product_id, sku_id: sku.id, change_qty: Number(d.quantity||0), before_qty: before, after_qty: after, type: 'factory_in', ref_type: 'factory_order', ref_id: fo.id, operator_id: req.user.id, remark: '确认入库' }, { transaction: t });
        inbounded++;
      }
      // 入库完成：shipping_fee 归零（保持0），并确保订单状态为 completed，写入完成时间
      const now = new Date();
      await fo.update({ shipping_fee: 0, status: 'completed', finished_at: fo.finished_at || now }, { transaction: t })
      pausedRemainingMs.delete(fo.id);
      // 记录操作日志（可选）
      try { await OperationLog.create({ user_id: req.user.id, operation_type: 'factory_in', module: 'factory', operation_desc: `工厂单入库 ${fo.order_no}`, target_id: fo.id, ip_address: req.ip }) } catch {}
      // 入库后也尝试开工下一单
      await startNextIfIdle(req.user.id, t);
    }

    await t.commit();

    try {
      if (doInbound) {
        const affected = fo.details.map(d=>({ product_id: d.product_id, sku_id: d.sku_id || null, size: d.size || null }));
        stockBus.emit('stockChanged', affected, { operatorId: req.user.id, reason: 'factory_in' });
      }
    } catch{}

    res.json({ success:true, data: { inbounded, created_skus: createdSkus, status: fo.status } });
  } catch (e) {
    if (!t.finished) await t.rollback();
    console.error('变更工厂订单状态失败:', e);
    res.status(500).json({ success:false, message:'服务器错误' });
  }
}

// 打印：入库单（简易HTML，供浏览器打印）
router.get('/orders/:id/print-inbound', authenticate, async (req, res) => {
  try {
    const fo = await FactoryOrder.findByPk(req.params.id, { include: [{ model: FactoryOrderDetail, as: 'details', include: [{ model: Product, as: 'product' }] }] });
    if (!fo) return res.status(404).send('NOT FOUND')
    const rows = (fo.details||[]).map(d=>`<tr><td>${d.product?.name||''}</td><td>${d.size||''}</td><td style=\"text-align:right\">${Number(d.quantity||0)}</td></tr>`).join('')
    const html = `<!doctype html><html><head><meta charset=\"utf-8\"/><title>入库单 ${fo.order_no}</title><style>body{font-family:system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial; padding:20px;}h1{font-size:20px;margin:0 0 10px;}table{width:100%;border-collapse:collapse;margin-top:10px;}td,th{border:1px solid #999;padding:6px;}footer{margin-top:20px;display:flex;justify-content:space-between}</style></head><body>
      <h1>入库单</h1>
      <div>工厂单号：${fo.order_no}　状态：${fo.status}　创建：${fo.createdAt?.toISOString?.()||''}</div>
      <table><thead><tr><th>商品</th><th>尺码</th><th style=\"text-align:right\">数量</th></tr></thead><tbody>${rows}</tbody></table>
      <footer><div>经手人：________</div><div>复核：________</div><div>日期：________</div></footer>
    </body></html>`
    res.setHeader('Content-Type', 'text/html; charset=utf-8')
    res.send(html)
  } catch (e) {
    console.error('打印入库单失败:', e)
    res.status(500).send('SERVER ERROR')
  }
})

// 自动补货：扫描低库存 SKU，生成工厂订单（运费恒为0）
router.post('/auto-replenish', authenticate, async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const { threshold = 5, plan = 20 } = req.body || {};
    const [rows] = await sequelize.query(`SELECT s.id AS sku_id, s.product_id, s.size, s.stock, s.reorder_threshold, s.reorder_target, p.min_stock, p.purchase_price
      FROM product_skus s JOIN products p ON p.id=s.product_id WHERE s.status='active'`);
    const toMake = [];
    for (const r of rows){
      const sku = { reorder_threshold: r.reorder_threshold, reorder_target: r.reorder_target, stock: r.stock };
      const product = { min_stock: r.min_stock, purchase_price: r.purchase_price };
      const th = Number(sku.reorder_threshold ?? product.min_stock ?? threshold);
      const tgt = sku.reorder_target != null ? Number(sku.reorder_target) : Math.max(plan, th*2);
      const stock = Number(r.stock||0);
      if (stock < th) {
        const qty = Math.max(tgt - stock, 0);
        if (qty > 0) toMake.push({ product_id: r.product_id, sku_id: r.sku_id, size: r.size, quantity: qty, unit_cost: Number(product.purchase_price||0) });
      }
    }
    if (!toMake.length) { await t.rollback(); return res.json({ success:true, message:'无需补货' }); }
    const order_no = genFactoryNo();
    const fo = await FactoryOrder.create({ order_no, status:'approved', source:'auto_replenish', expedite:false, total_cost:0, shipping_fee:0, remark:'自动补货', operator_id: req.user.id }, { transaction: t });
    let total = 0; let totalQty = 0;
    for (const it of toMake){ const sub = it.quantity * it.unit_cost; total += sub; totalQty += Number(it.quantity||0); await FactoryOrderDetail.create({ order_id: fo.id, ...it, subtotal_cost: sub }, { transaction: t }); }
    await fo.update({ total_cost: total, shipping_fee: 0 }, { transaction: t });
    // 加入队列：若空闲则立刻开工
    await startNextIfIdle(req.user.id, t);
    await t.commit();
    res.json({ success:true, data:{ id: fo.id, order_no: fo.order_no, items: toMake.length, status: 'approved' } });
  } catch ( e) {
    if (!t.finished) await t.rollback();
    console.error('自动补货失败:', e);
    res.status(500).json({ success:false, message:'服务器错误' });
  }
});

// 单商品自动补货（运费恒为0）
router.post('/auto-replenish/product', authenticate, async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const { product_id, threshold = 5, plan = 20, unit_cost } = req.body || {};
    const pid = Number(product_id);
    if (!pid) { await t.rollback(); return res.status(400).json({ success:false, message:'product_id 必填' }); }
    const product = await Product.findByPk(pid);
    if (!product) { await t.rollback(); return res.status(404).json({ success:false, message:'商品不存在' }); }

    const skus = await ProductSku.findAll({ where:{ product_id: pid } });
    const toMake = [];
    for (const s of skus){
      const th = Number(s.reorder_threshold ?? product.min_stock ?? threshold);
      const tgt = s.reorder_target != null ? Number(s.reorder_target) : Math.max(plan, th*2);
      const stock = Number(s.stock||0);
      if (stock < th) {
        const qty = tgt - stock;
        if (qty > 0) toMake.push({ product_id: pid, sku_id: s.id, size: s.size, quantity: qty, unit_cost: Number(unit_cost != null ? unit_cost : (product.purchase_price || 0)) });
      }
    }
    if (!toMake.length) { await t.rollback(); return res.json({ success:true, message:'无需补货' }); }

    const order_no = genFactoryNo();
    const fo = await FactoryOrder.create({ order_no, status:'approved', source:'auto_replenish', expedite:false, total_cost:0, shipping_fee:0, remark:`自动补货(单商品 ${product.name})`, operator_id: req.user.id }, { transaction: t });
    let total = 0; let totalQty = 0;
    for (const it of toMake){ const sub = it.quantity * it.unit_cost; total += sub; totalQty += Number(it.quantity||0); await FactoryOrderDetail.create({ order_id: fo.id, ...it, subtotal_cost: sub }, { transaction: t }); }
    await fo.update({ total_cost: total, shipping_fee: 0 }, { transaction: t });
    await startNextIfIdle(req.user.id, t);
    await t.commit();
    res.json({ success:true, data:{ id: fo.id, order_no: fo.order_no, items: toMake.length, status: 'approved' } });
  } catch (e) {
    if (!t.finished) await t.rollback();
    console.error('单商品自动补货失败:', e);
    res.status(500).json({ success:false, message:'服务器错误' });
  }
});

module.exports = router;
