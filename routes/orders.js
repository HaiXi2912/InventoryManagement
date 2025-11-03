const express = require('express');
const router = express.Router();
const { sequelize, Product, ProductSku, ProductMedia, ProductContent, Order, OrderItem, InventoryLog, Address, Customer, WalletTransaction } = require('../models');
const { authenticate, optionalAuth } = require('../middleware/auth');
const { authorize } = require('../middleware/auth');
const { Op } = require('sequelize');

// 商品浏览（前台开放，带分页与搜索）
router.get('/catalog', optionalAuth, async (req,res)=>{
  try {
    const { page=1, limit=12, category, q } = req.query;
    const where = { status: 'active' };
    if(category) where.category = category;
    if(q) where.name = { [Op.like]: `%${q}%` };
    const per = parseInt(limit); const cur = parseInt(page); const offset = (cur-1)*per;
    const { rows, count } = await Product.findAndCountAll({ where, limit: per, offset, order:[['id','DESC']], include:[{ model: ProductSku, as:'skus' }, { model: ProductMedia, as:'media' }] });
    res.json({ success:true, data: { items: rows, pagination:{ total: count, page: cur, limit: per } } });
  } catch(e){ console.error('catalog error',e); res.status(500).json({ success:false, message:'服务器错误' }); }
});

// 商品详情
router.get('/catalog/:id', optionalAuth, async (req,res)=>{
  try {
    const id = Number(req.params.id)
    if(!Number.isFinite(id)) return res.status(400).json({ success:false, message:'参数错误' })
    const p = await Product.findByPk(id, { include: [{ model: ProductSku, as:'skus' }, { model: ProductMedia, as:'media' }, { model: ProductContent, as:'content' }] });
    if(!p || p.status!=='active') return res.status(404).json({ success:false, message:'商品不存在' });
    res.json({ success:true, data: p });
  } catch(e){
    try {
      console.error('[catalog/:id] 查询失败，降级为基础信息', e && e.message)
      const id = Number(req.params.id)
      const p = await Product.findByPk(id, { include: [{ model: ProductSku, as:'skus' }, { model: ProductMedia, as:'media' }] });
      if(!p || p.status!=='active') return res.status(404).json({ success:false, message:'商品不存在' });
      return res.json({ success:true, data: p, degraded: true })
    } catch (e2) {
      console.error('[catalog/:id] 降级查询仍失败', e2)
      return res.status(500).json({ success:false, message:'服务器错误' })
    }
  }
});

// 根据 SKU 获取详情（前台使用）
router.get('/catalog/sku/:id', optionalAuth, async (req,res)=>{
  try {
    const sku = await ProductSku.findByPk(req.params.id);
    if(!sku) return res.status(404).json({ success:false, message:'SKU不存在' });
    const product = await Product.findByPk(sku.product_id, { include:[{ model: ProductMedia, as:'media' }] });
    return res.json({ success:true, data: { sku, product } });
  } catch(e){ console.error('catalog sku error', e); return res.status(500).json({ success:false, message:'服务器错误' }); }
});

// 购物车（前端本地存储/Pinia 维护；下单时校验并锁库）

// 提交订单：校验库存，预扣库存（locked_stock），生成订单为 pending，返回待支付信息
router.post('/orders/checkout', authenticate, async (req,res)=>{
  const t = await sequelize.transaction();
  try {
    const { items, address_id, remark, customer_id } = req.body || {};
    if(!Array.isArray(items) || !items.length) return res.status(400).json({ success:false, message:'商品为空' });
    let total = 0;
    // 获取客户档案，判断价格层级
    let customer = null; let priceTier = 'retail';
    if (customer_id) {
      customer = await Customer.findByPk(customer_id);
      if (customer && customer.price_tier) priceTier = customer.price_tier;
    }
    // 校验并锁定库存
    for(const it of items){
      const sku = await ProductSku.findByPk(it.sku_id, { transaction: t, lock: t.LOCK.UPDATE });
      if(!sku || sku.status!=='active') throw new Error('SKU不存在或已停用');
      if(sku.stock - sku.locked_stock < it.quantity) throw new Error(`库存不足: ${sku.barcode}`);
      const unit = priceTier==='wholesale' && sku.wholesale_price!=null ? Number(sku.wholesale_price) : Number(sku.retail_price||0);
      total += unit * Number(it.quantity);
      await sku.update({ locked_stock: sku.locked_stock + it.quantity }, { transaction: t });
    }
    const orderNo = `E${Date.now()}${Math.floor(Math.random()*1000)}`;
    const order = await Order.create({ order_no: orderNo, user_id: req.user.id, address_id, total_amount: total, pay_amount: total, status:'pending', pay_status:'unpaid', remark }, { transaction: t });
    for(const it of items){
      const sku = await ProductSku.findByPk(it.sku_id, { transaction: t });
      const unit = priceTier==='wholesale' && sku.wholesale_price!=null ? Number(sku.wholesale_price) : Number(sku.retail_price||0);
      await OrderItem.create({ order_id: order.id, product_id: sku.product_id, sku_id: sku.id, name: it.name||'', size: sku.size, color: sku.color, barcode: sku.barcode, price: unit, quantity: it.quantity, amount: Number(unit)*Number(it.quantity) }, { transaction: t });
    }
    await t.commit();
    res.status(201).json({ success:true, message:'创建订单成功，请发起支付', data:{ order_id: order.id, order_no: order.order_no, total_amount: total } });
  } catch(e){ await t.rollback(); res.status(400).json({ success:false, message: e.message||'下单失败' }); }
});

// 模拟支付：支付成功 -> 扣减实际库存，释放锁（减锁定=已扣），订单状态改为 paid
router.post('/orders/:id/pay', authenticate, async (req,res)=>{
  const t = await sequelize.transaction();
  try {
    const order = await Order.findByPk(req.params.id, { include:[{ model: OrderItem, as:'items' }], transaction: t, lock: t.LOCK.UPDATE });
    if(!order || order.user_id !== req.user.id) return res.status(404).json({ success:false, message:'订单不存在' });
    if(order.status !== 'pending' || order.pay_status==='paid') return res.status(400).json({ success:false, message:'订单状态不允许支付' });
    // 支持客户钱包支付（可选 customer_id）
    const { customer_id } = req.body || {};
    let customer = null;
    if (customer_id) {
      customer = await Customer.findByPk(customer_id, { transaction: t, lock: t.LOCK.UPDATE });
      if(!customer) throw new Error('客户不存在');
      const before = Number(customer.wallet_balance||0);
      if(before < Number(order.pay_amount)) throw new Error('钱包余额不足');
      const after = Number((before - Number(order.pay_amount)).toFixed(2));
      await customer.update({ wallet_balance: after }, { transaction: t });
      await WalletTransaction.create({ customer_id: customer.id, change_amount: -Number(order.pay_amount), before_balance: before, after_balance: after, type:'consume', ref_type:'order', ref_id: order.id, operator_id: req.user.id, remark:'订单支付' }, { transaction: t });
    }
    for(const it of order.items){
      const sku = await ProductSku.findByPk(it.sku_id, { transaction: t, lock: t.LOCK.UPDATE });
      if(!sku) throw new Error('SKU不存在');
      // 实扣库存并释放锁
      const before = sku.stock;
      const newLocked = sku.locked_stock - it.quantity;
      const newStock = sku.stock - it.quantity;
      if(newStock < 0 || newLocked < 0) throw new Error('库存状态异常');
      await sku.update({ stock: newStock, locked_stock: newLocked }, { transaction: t });
      await InventoryLog.create({ product_id: sku.product_id, sku_id: sku.id, change_qty: -it.quantity, before_qty: before, after_qty: newStock, type: 'order_out', ref_type: 'order', ref_id: order.id, operator_id: req.user.id, remark: '下单出库' }, { transaction: t });
    }
    await order.update({ status:'paid', pay_status:'paid' }, { transaction: t });
    await t.commit();
    res.json({ success:true, message:'支付成功' });
  } catch(e){ await t.rollback(); res.status(400).json({ success:false, message: e.message||'支付失败' }); }
});

// 取消订单：仅未发货前(paid & !shipped)，回补库存（解锁或回补）
router.post('/orders/:id/cancel', authenticate, async (req,res)=>{
  const t = await sequelize.transaction();
  try {
    const order = await Order.findByPk(req.params.id, { include:[{ model: OrderItem, as:'items' }], transaction: t, lock: t.LOCK.UPDATE });
    if(!order || order.user_id !== req.user.id) return res.status(404).json({ success:false, message:'订单不存在' });
    if(order.status === 'shipped' || order.status === 'completed') return res.status(400).json({ success:false, message:'已发货订单不可取消' });
    if(order.status === 'pending'){
      // 未支付：仅释放锁
      for(const it of order.items){
        const sku = await ProductSku.findByPk(it.sku_id, { transaction: t, lock: t.LOCK.UPDATE });
        if(sku){ await sku.update({ locked_stock: Math.max(0, sku.locked_stock - it.quantity) }, { transaction: t }); }
      }
    } else if(order.status === 'paid'){
      // 已支付未发货：回补库存
      for(const it of order.items){
        const sku = await ProductSku.findByPk(it.sku_id, { transaction: t, lock: t.LOCK.UPDATE });
        if(sku){ const before = sku.stock; const newStock = sku.stock + it.quantity; await sku.update({ stock: newStock }, { transaction: t }); await InventoryLog.create({ product_id: sku.product_id, sku_id: sku.id, change_qty: it.quantity, before_qty: before, after_qty: newStock, type: 'cancel_restore', ref_type:'order', ref_id: order.id, operator_id: req.user.id, remark: '取消回补' }, { transaction: t }); }
      }
    }
    await order.update({ status:'cancelled' }, { transaction: t });
    await t.commit();
    res.json({ success:true, message:'订单已取消' });
  } catch(e){ await t.rollback(); res.status(400).json({ success:false, message: e.message||'取消失败' }); }
});

// 我的订单列表与详情
router.get('/orders', authenticate, async (req,res)=>{
  try {
    const list = await Order.findAll({ where:{ user_id: req.user.id }, order:[['id','DESC']], include:[{ model: OrderItem, as:'items' }] });
    res.json({ success:true, data: list });
  } catch (e) {
    console.error('my orders list error', e);
    res.status(500).json({ success:false, message:'服务器错误' });
  }
});
router.get('/orders/:id', authenticate, async (req,res)=>{
  try {
    const o = await Order.findOne({ where:{ id: req.params.id, user_id: req.user.id }, include:[{ model: OrderItem, as:'items' }, { model: Address, as:'address' }] });
    if(!o) return res.status(404).json({ success:false, message:'订单不存在' });
    res.json({ success:true, data: o });
  } catch (e) {
    console.error('my order detail error', e);
    res.status(500).json({ success:false, message:'服务器错误' });
  }
});

// 前台：确认收货（用户侧操作）
router.post('/orders/:id/confirm', authenticate, async (req,res)=>{
  try{
    const order = await Order.findByPk(req.params.id)
    if(!order || order.user_id !== req.user.id) return res.status(404).json({ success:false, message:'订单不存在' })
    if(order.status !== 'shipped') return res.status(400).json({ success:false, message:'仅已发货订单可确认收货' })
    await order.update({ status:'completed', delivered_at: new Date() })
    res.json({ success:true, message:'已确认收货' })
  }catch(e){ res.status(400).json({ success:false, message: e.message||'操作失败' }) }
})

// 钱包：查询我的余额与流水（前台）
router.get('/wallet/me', authenticate, async (req,res)=>{
  try {
    const me = await Customer.findByPk(req.user.id);
    if(!me) return res.status(404).json({ success:false, message:'客户不存在' });
    const txs = await WalletTransaction.findAll({ where:{ customer_id: me.id }, order:[['id','DESC']], limit: 50 });
    res.json({ success:true, data: { balance: Number(me.wallet_balance||0), transactions: txs } });
  } catch (e) {
    console.error('wallet me error', e);
    res.status(500).json({ success:false, message:'服务器错误' });
  }
});

// 钱包：充值（模拟）
router.post('/wallet/recharge', authenticate, async (req,res)=>{
  const { amount } = req.body||{}; if(!amount || Number(amount)<=0) return res.status(400).json({ success:false, message:'金额无效' });
  const t = await sequelize.transaction();
  try{
    const me = await Customer.findByPk(req.user.id, { transaction: t, lock: t.LOCK.UPDATE });
    if(!me) throw new Error('客户不存在');
    const before = Number(me.wallet_balance||0); const after = Number((before + Number(amount)).toFixed(2));
    await me.update({ wallet_balance: after }, { transaction: t });
    await WalletTransaction.create({ customer_id: me.id, change_amount: Number(amount), before_balance: before, after_balance: after, type:'recharge', ref_type:'manual', operator_id: req.user.id, remark:'用户充值' }, { transaction: t });
    await t.commit();
    res.json({ success:true, message:'充值成功', data:{ balance: after } })
  }catch(e){ await t.rollback(); res.status(400).json({ success:false, message: e.message||'充值失败' }); }
});

// 钱包：提现（模拟）
router.post('/wallet/withdraw', authenticate, async (req,res)=>{
  const { amount } = req.body||{}; if(!amount || Number(amount)<=0) return res.status(400).json({ success:false, message:'金额无效' });
  const t = await sequelize.transaction();
  try{
    const me = await Customer.findByPk(req.user.id, { transaction: t, lock: t.LOCK.UPDATE });
    if(!me) throw new Error('客户不存在');
    const before = Number(me.wallet_balance||0); if(before < Number(amount)) throw new Error('余额不足');
    const after = Number((before - Number(amount)).toFixed(2));
    await me.update({ wallet_balance: after }, { transaction: t });
    await WalletTransaction.create({ customer_id: me.id, change_amount: -Number(amount), before_balance: before, after_balance: after, type:'withdraw', ref_type:'manual', operator_id: req.user.id, remark:'用户提现' }, { transaction: t });
    await t.commit();
    res.json({ success:true, message:'提现成功', data:{ balance: after } })
  }catch(e){ await t.rollback(); res.status(400).json({ success:false, message: e.message||'提现失败' }); }
});

// 管理端：订单列表（分页、筛选）
router.get('/admin/orders', authenticate, authorize(['admin','manager','staff']), async (req,res)=>{
  try {
    const { page=1, limit=20, status, q } = req.query
    const where = {}
    if (status) where.status = status
    if (q) where.order_no = { [Op.like]: `%${q}%` }
    const per = parseInt(limit); const cur = parseInt(page); const offset = (cur-1)*per
    const { rows, count } = await Order.findAndCountAll({ where, limit: per, offset, order:[['id','DESC']], include:[{ model: OrderItem, as:'items' }, { model: Address, as:'address' }] })
    res.json({ success:true, data: { items: rows, pagination:{ total: count, page: cur, limit: per } } })
  } catch(e){ console.error('admin orders list error', e); res.status(500).json({ success:false, message:'服务器错误' }) }
})

// 管理端：订单详情
router.get('/admin/orders/:id', authenticate, authorize(['admin','manager','staff']), async (req,res)=>{
  try {
    const o = await Order.findByPk(req.params.id, { include:[{ model: OrderItem, as:'items' }, { model: Address, as:'address' }] })
    if(!o) return res.status(404).json({ success:false, message:'订单不存在' })
    res.json({ success:true, data: o })
  } catch (e) {
    console.error('admin order detail error', e)
    res.status(500).json({ success:false, message:'服务器错误' })
  }
})

// 管理端：发货（填写物流信息）
router.post('/admin/orders/:id/ship', authenticate, authorize(['admin','manager','staff']), async (req,res)=>{
  const t = await sequelize.transaction()
  try{
    const { tracking_no, logistics_provider } = req.body || {}
    const order = await Order.findByPk(req.params.id, { transaction: t, lock: t.LOCK.UPDATE })
    if(!order) return res.status(404).json({ success:false, message:'订单不存在' })
    if(order.status !== 'paid') return res.status(400).json({ success:false, message:'仅已支付订单可发货' })
    await order.update({ status: 'shipped', tracking_no, logistics_provider, shipped_at: new Date() }, { transaction: t })
    await t.commit()
    res.json({ success:true, message:'已发货' })
  }catch(e){ await t.rollback(); res.status(400).json({ success:false, message: e.message||'发货失败' }) }
})

// 管理端：签收完成（售后外的正常收货完成）
router.post('/admin/orders/:id/complete', authenticate, authorize(['admin','manager','staff']), async (req,res)=>{
  try{
    const order = await Order.findByPk(req.params.id)
    if(!order) return res.status(404).json({ success:false, message:'订单不存在' })
    if(order.status !== 'shipped') return res.status(400).json({ success:false, message:'仅已发货订单可完成' })
    await order.update({ status:'completed', delivered_at: new Date() })
    res.json({ success:true, message:'已完成签收' })
  }catch(e){ res.status(400).json({ success:false, message: e.message||'操作失败' }) }
})

module.exports = router;
