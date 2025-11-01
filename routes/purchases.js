const express = require('express');
const router = express.Router();
const { Op } = require('sequelize');
const { sequelize } = require('../config/database');
const Purchase = require('../models/Purchase');
const PurchaseDetail = require('../models/PurchaseDetail');
const Product = require('../models/Product');
// 移除 Supplier
// const Supplier = require('../models/Supplier');
const User = require('../models/User');
const Inventory = require('../models/Inventory');
const OperationLog = require('../models/OperationLog');
const PriceHistory = require('../models/PriceHistory');
// 新增：SKU与库存流水
const ProductSku = require('../models/ProductSku');
const InventoryLog = require('../models/InventoryLog');
const { authenticate } = require('../middleware/auth');

// 生成进货单号
function generatePurchaseNo() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const time = String(now.getHours()).padStart(2, '0') + 
               String(now.getMinutes()).padStart(2, '0') + 
               String(now.getSeconds()).padStart(2, '0');
  return `PUR${year}${month}${day}${time}`;
}

// 应用认证中间件到所有路由
router.use(authenticate);

// -------- 新增：尺码分配持久化（purchase_size_plans） --------
let sizePlanTableEnsured = false;
async function ensureSizePlanTable() {
  if (sizePlanTableEnsured) return;
  const sql = `CREATE TABLE IF NOT EXISTS purchase_size_plans (
    id INT AUTO_INCREMENT PRIMARY KEY,
    purchase_id INT NOT NULL,
    product_id INT NOT NULL,
    sku_id INT NULL,
    size VARCHAR(30) NOT NULL,
    quantity INT NOT NULL,
    unit_price DECIMAL(12,4) NOT NULL DEFAULT 0,
    createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
    updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_purchase_id (purchase_id),
    INDEX idx_product_id (product_id),
    INDEX idx_sku_id (sku_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`;
  try { await sequelize.query(sql); sizePlanTableEnsured = true; } catch (e) { console.error('确保 purchase_size_plans 表失败:', e); }
}

async function loadSizePlans(purchaseId){
  try { await ensureSizePlanTable(); } catch {}
  try {
    const [rows] = await sequelize.query('SELECT product_id, sku_id, size, quantity, unit_price FROM purchase_size_plans WHERE purchase_id = ?', { replacements:[purchaseId] });
    const map = {};
    for(const r of rows){
      const pid = String(r.product_id);
      if(!map[pid]) map[pid] = [];
      map[pid].push({ size: r.size, sku_id: r.sku_id, qty: Number(r.quantity||0), unit_price: Number(r.unit_price||0) });
    }
    return map;
  } catch(e){ return {}; }
}

async function saveSizePlans(purchaseId, sizePlans){
  if(!sizePlans || typeof sizePlans !== 'object') return;
  await ensureSizePlanTable();
  await sequelize.query('DELETE FROM purchase_size_plans WHERE purchase_id = ?', { replacements:[purchaseId] });
  const entries = [];
  for(const k of Object.keys(sizePlans)){
    const pid = Number(k);
    const arr = Array.isArray(sizePlans[k]) ? sizePlans[k] : [];
    for(const r of arr){
      const size = String(r.size||'').trim();
      const qty = Number(r.qty||0);
      if(!size || qty<=0) continue;
      const skuId = r.sku_id ? Number(r.sku_id) : null;
      const up = Number(r.unit_price||0);
      entries.push([purchaseId, pid, skuId, size, qty, up]);
    }
  }
  if(entries.length){
    const placeholders = entries.map(()=>'(?,?,?,?,?,?)').join(',');
    const flat = entries.flat();
    await sequelize.query(`INSERT INTO purchase_size_plans (purchase_id, product_id, sku_id, size, quantity, unit_price) VALUES ${placeholders}`, { replacements: flat });
  }
}

// 最近采购价与建议（不再按供应商维度区分）
router.get('/prices/last', async (req, res) => {
  try {
    const { product_id } = req.query;
    if (!product_id) return res.status(400).json({ success: false, message: 'product_id 必填' });
    const record = await PriceHistory.findOne({ where: { product_id }, order: [['recorded_at', 'DESC']] });
    res.json({ success: true, data: record ? { unit_price: record.unit_price, currency: record.currency, recorded_at: record.recorded_at } : null });
  } catch (e) { console.error('获取最近采购价失败:', e); res.status(500).json({ success:false, message:'服务器错误' }); }
});

router.get('/prices/suggestions', async (req, res) => {
  try {
    const { product_id, limit = 10 } = req.query;
    if (!product_id) return res.status(400).json({ success: false, message: 'product_id 必填' });
    const list = await PriceHistory.findAll({ where: { product_id }, order: [['recorded_at','DESC']], limit: Math.min(Number(limit)||10,50) });
    const prices = list.map(r=>Number(r.unit_price));
    const avg = prices.length ? (prices.reduce((a,b)=>a+b,0)/prices.length) : null;
    const sorted = prices.slice().sort((a,b)=>a-b);
    const mid = prices.length ? (prices.length%2? sorted[(prices.length-1)/2] : (sorted[prices.length/2-1]+sorted[prices.length/2])/2) : null;
    res.json({ success:true, data:{ count: prices.length, avg, median: mid, samples: list } });
  } catch (e) { console.error('获取价格建议失败:', e); res.status(500).json({ success:false, message:'服务器错误' }); }
});

// 1. 获取（历史）进货单列表：保留读取但不再暴露供应商信息
router.get('/', async (req, res) => {
  try {
    const { page=1, size=10, status, purchase_no, start_date, end_date, operator_id } = req.query;
    const limit = parseInt(size); const offset = (parseInt(page)-1)*limit;
    const where = {};
    if (status) where.status = status;
    if (purchase_no) where.purchase_no = { [Op.like]: `%${purchase_no}%` };
    if (operator_id) where.operator_id = operator_id;
    if (start_date && end_date) where.purchase_date = { [Op.between]: [start_date, end_date] };
    else if (start_date) where.purchase_date = { [Op.gte]: start_date };
    else if (end_date) where.purchase_date = { [Op.lte]: end_date };

    const { count, rows } = await Purchase.findAndCountAll({ where, include: [ { model: User, as: 'operator', attributes:['id','username','real_name'] } ], order:[['createdAt','DESC']], limit, offset });
    res.json({ success:true, data:{ purchases: rows, pagination:{ total: count, page: parseInt(page), size: limit, pages: Math.ceil(count/limit) } } });
  } catch (error) {
    console.error('获取进货单列表失败:', error);
    res.status(500).json({ success:false, message:'获取进货单列表失败', error: error.message });
  }
});

// 2. 获取进货单详情（仅数字 ID）
router.get('/:id(\\d+)', async (req, res) => {
  try {
    const { id } = req.params;
    const purchase = await Purchase.findByPk(id, { include: [ { model: User, as: 'operator', attributes:['id','username','real_name'] }, { model: PurchaseDetail, as: 'details', include: [ { model: Product, as: 'product', attributes: ['id','name','code','barcode','category','brand','unit','size','color','purchase_price','wholesale_price','retail_price'] } ] } ] });
    if (!purchase) return res.status(404).json({ success:false, message:'进货单不存在' });
    const size_plans = await loadSizePlans(purchase.id);
    const data = purchase.toJSON();
    data.size_plans = size_plans;
    res.json({ success:true, data });
  } catch (e) { console.error('获取进货单详情失败:', e); res.status(500).json({ success:false, message:'获取进货单详情失败', error: e.message }); }
});

// 3. 创建进货单：禁用，改用工厂订单
router.post('/', async (req, res) => {
  return res.status(400).json({ success:false, message:'采购功能已下线，请使用工厂订货（/api/factory/orders）' });
});

// 4. 更新进货单：禁用
router.put('/:id(\\d+)', async (req, res) => {
  return res.status(400).json({ success:false, message:'采购功能已下线' });
});

// 5. 删除进货单：允许删除历史待确认/取消单据
router.delete('/:id(\\d+)', async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const purchase = await Purchase.findByPk(req.params.id);
    if (!purchase) { await t.rollback(); return res.status(404).json({ success:false, message:'进货单不存在' }); }
    if (purchase.status === 'received') { await t.rollback(); return res.status(400).json({ success:false, message:'已收货的进货单不能删除' }); }
    await PurchaseDetail.destroy({ where:{ purchase_id: purchase.id }, transaction: t });
    await purchase.destroy({ transaction: t });
    await OperationLog.create({ user_id: req.user.id, operation_type:'delete', module:'purchase', operation_desc:`删除进货单: ${purchase.purchase_no}`, target_id: purchase.id, ip_address: req.ip }, { transaction: t });
    await t.commit();
    res.json({ success:true, message:'进货单删除成功' });
  } catch (e) { await (t?.rollback?.()); console.error('删除进货单失败:', e); res.status(500).json({ success:false, message:'删除进货单失败', error:e.message }); }
});

// 6. 确认进货单：禁用
router.post('/:id(\\d+)/confirm', async (req, res) => { return res.status(400).json({ success:false, message:'采购功能已下线' }); });

// 7. 收货：禁用（历史单据若需收货，请通过迁移脚本转为工厂入库）
router.post('/:id(\\d+)/receive', async (req, res) => { return res.status(400).json({ success:false, message:'采购收货已下线，请使用工厂发货入库' }); });

// 8. 取消：允许
router.post('/:id(\\d+)/cancel', async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const purchase = await Purchase.findByPk(req.params.id);
    if (!purchase) { await t.rollback(); return res.status(404).json({ success:false, message:'进货单不存在' }); }
    if (purchase.status === 'received' || purchase.status === 'cancelled') { await t.rollback(); return res.status(400).json({ success:false, message:'已收货或已取消的进货单不能取消' }); }
    await purchase.update({ status:'cancelled', remark: purchase.remark ? `${purchase.remark}\n取消原因: ${req.body?.reason || '无'}` : `取消原因: ${req.body?.reason || '无'}` }, { transaction: t });
    await OperationLog.create({ user_id: req.user.id, operation_type:'update', module:'purchase', operation_desc:`取消进货单: ${purchase.purchase_no}`, target_id: purchase.id, ip_address: req.ip }, { transaction: t });
    await t.commit();
    res.json({ success:true, message:'进货单取消成功' });
  } catch (e) { await (t?.rollback?.()); console.error('取消进货单失败:', e); res.status(500).json({ success:false, message:'取消进货单失败', error:e.message }); }
});

// 9. 统计：移除供应商维度
router.get('/statistics/summary', async (req, res) => {
  try {
    const { start_date, end_date, status } = req.query;
    const where = {};
    if (status) where.status = status;
    if (start_date && end_date) where.purchase_date = { [Op.between]: [start_date, end_date] };
    else if (start_date) where.purchase_date = { [Op.gte]: start_date };
    else if (end_date) where.purchase_date = { [Op.lte]: end_date };

    const [monthlyStats] = await sequelize.query(`
      SELECT DATE_FORMAT(purchase_date, '%Y-%m') AS month, COUNT(*) AS count, SUM(total_amount) AS total_amount
      FROM purchases
      WHERE 1=1 ${start_date? ' AND purchase_date >= :start_date':''} ${end_date? ' AND purchase_date <= :end_date':''} ${status? ' AND status = :status':''}
      GROUP BY DATE_FORMAT(purchase_date, '%Y-%m') ORDER BY month DESC LIMIT 12
    `, { replacements: { start_date, end_date, status } });

    res.json({ success:true, data: { monthly_stats: monthlyStats } });
  } catch (e) { console.error('获取进货统计失败:', e); res.status(500).json({ success:false, message:'获取进货统计失败', error: e.message }); }
});

// 10/11/12 原有 price endpoints 已调整至上方新路径

module.exports = router;
