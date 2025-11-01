const express = require('express');
const router = express.Router();
const { Op } = require('sequelize');
const { sequelize } = require('../config/database');
const Sale = require('../models/Sale');
const SaleDetail = require('../models/SaleDetail');
const Product = require('../models/Product');
const Customer = require('../models/Customer');
const User = require('../models/User');
const Inventory = require('../models/Inventory');
const OperationLog = require('../models/OperationLog');
// 新增：引入认证中间件
const { authenticate } = require('../middleware/auth');
// 新增：SKU与库存流水
const ProductSku = require('../models/ProductSku');
const InventoryLog = require('../models/InventoryLog');
// 新增：工厂单模型
const FactoryOrder = require('../models/FactoryOrder');
const FactoryOrderDetail = require('../models/FactoryOrderDetail');
// 新增：库存事件总线
const { stockBus } = require('../services/stockBus');

// 生成销售单号
function generateSaleNo() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const time = String(now.getHours()).padStart(2, '0') + 
               String(now.getMinutes()).padStart(2, '0') + 
               String(now.getSeconds()).padStart(2, '0');
  return `SAL${year}${month}${day}${time}`;
}

// 应用认证中间件到所有路由
router.use(authenticate);

// -------- 新增：尺码分配持久化（sales_size_plans） --------
let salesSizePlanTableEnsured = false;
async function ensureSalesSizePlanTable(){
  if (salesSizePlanTableEnsured) return;
  const sql = `CREATE TABLE IF NOT EXISTS sales_size_plans (
    id INT AUTO_INCREMENT PRIMARY KEY,
    sale_id INT NOT NULL,
    product_id INT NOT NULL,
    sku_id INT NULL,
    size VARCHAR(30) NOT NULL,
    quantity INT NOT NULL,
    unit_price DECIMAL(12,4) NOT NULL DEFAULT 0,
    createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
    updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_sale_id (sale_id),
    INDEX idx_product_id (product_id),
    INDEX idx_sku_id (sku_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`;
  try { await sequelize.query(sql); salesSizePlanTableEnsured = true; } catch(e){ console.error('确保 sales_size_plans 表失败:', e); }
}

async function loadSalesSizePlans(saleId){
  try { await ensureSalesSizePlanTable(); } catch{}
  try {
    const [rows] = await sequelize.query('SELECT product_id, sku_id, size, quantity, unit_price FROM sales_size_plans WHERE sale_id = ?', { replacements:[saleId] });
    const map = {};
    for(const r of rows){
      const pid = String(r.product_id);
      if(!map[pid]) map[pid] = [];
      map[pid].push({ size: r.size, sku_id: r.sku_id, qty: Number(r.quantity||0), unit_price: Number(r.unit_price||0) });
    }
    return map;
  } catch(e){ return {}; }
}

async function saveSalesSizePlans(saleId, sizePlans){
  if(!sizePlans || typeof sizePlans !== 'object') return;
  await ensureSalesSizePlanTable();
  await sequelize.query('DELETE FROM sales_size_plans WHERE sale_id = ?', { replacements:[saleId] });
  const entries = [];
  for(const k of Object.keys(sizePlans||{})){
    const pid = Number(k);
    const arr = Array.isArray(sizePlans[k]) ? sizePlans[k] : [];
    for(const r of arr){
      const size = String(r.size||'').trim();
      const qty = Number(r.qty||0);
      if(!size || qty<=0) continue;
      const skuId = r.sku_id ? Number(r.sku_id) : null;
      const up = Number(r.unit_price||0);
      entries.push([saleId, pid, skuId, size, qty, up]);
    }
  }
  if(entries.length){
    const placeholders = entries.map(()=>'(?,?,?,?,?,?)').join(',');
    const flat = entries.flat();
    await sequelize.query(`INSERT INTO sales_size_plans (sale_id, product_id, sku_id, size, quantity, unit_price) VALUES ${placeholders}` , { replacements: flat });
  }
}

// 1. 获取销售单列表
router.get('/', async (req, res) => {
  try {
    const {
      page = 1,
      size = 10,
      status,
      payment_status,
      customer_id,
      sale_no,
      sale_type,
      start_date,
      end_date,
      operator_id
    } = req.query;

    const limit = parseInt(size);
    const offset = (parseInt(page) - 1) * limit;

    // 构建查询条件
    const where = {};
    
    if (status) {
      where.status = status;
    }
    
    if (payment_status) {
      where.payment_status = payment_status;
    }
    
    if (customer_id) {
      where.customer_id = customer_id;
    }
    
    if (sale_type) {
      where.sale_type = sale_type;
    }
    
    if (sale_no) {
      where.sale_no = {
        [Op.like]: `%${sale_no}%`
      };
    }
    
    if (operator_id) {
      where.operator_id = operator_id;
    }
    
    if (start_date && end_date) {
      where.sale_date = {
        [Op.between]: [start_date, end_date]
      };
    } else if (start_date) {
      where.sale_date = {
        [Op.gte]: start_date
      };
    } else if (end_date) {
      where.sale_date = {
        [Op.lte]: end_date
      };
    }

    const { count, rows } = await Sale.findAndCountAll({
      where,
      include: [
        {
          model: Customer,
          as: 'customer',
          attributes: ['id', 'name', 'phone'],
          required: false
        },
        {
          model: User,
          as: 'operator',
          attributes: ['id', 'username', 'real_name']
        }
      ],
      order: [['createdAt', 'DESC']],
      limit,
      offset
    });

    res.json({
      success: true,
      data: {
        sales: rows,
        pagination: {
          total: count,
          page: parseInt(page),
          size: limit,
          pages: Math.ceil(count / limit)
        }
      }
    });
  } catch (error) {
    console.error('获取销售单列表失败:', error);
    res.status(500).json({
      success: false,
      message: '获取销售单列表失败',
      error: error.message
    });
  }
});

// 2. 获取销售单详情
router.get('/:id(\\d+)', async (req, res) => {
  try {
    const { id } = req.params;

    const sale = await Sale.findByPk(id, {
      include: [
        {
          model: Customer,
          as: 'customer',
          attributes: ['id', 'name', 'phone', 'address'],
          required: false
        },
        {
          model: User,
          as: 'operator',
          attributes: ['id', 'username', 'real_name']
        },
        {
          model: SaleDetail,
          as: 'details',
          include: [
            {
              model: Product,
              as: 'product',
              attributes: ['id', 'name', 'code', 'category', 'brand', 'unit']
            }
          ]
        }
      ]
    });

    if (!sale) {
      return res.status(404).json({ success: false, message: '销售单不存在' });
    }

    // 新增：附带尺码分配
    let size_plans = {};
    try { size_plans = await loadSalesSizePlans(id); } catch{}
    const data = sale.toJSON();
    data.size_plans = size_plans;

    res.json({ success: true, data });
  } catch (error) {
    console.error('获取销售单详情失败:', error);
    res.status(500).json({ success: false, message: '获取销售单详情失败', error: error.message });
  }
});

// 3. 创建销售单（支持 SKU 粒度，按尺码聚合为唯一数量来源）
router.post('/', async (req, res) => {
  let transaction;
  
  try {
    transaction = await sequelize.transaction();
    
    const {
      customer_id,
      sale_date,
      sale_type = 'retail',
      discount_amount = 0,
      remark,
      details = [],
      // 新增：尺码分配计划（按商品分组）
      size_plans = null
    } = req.body;

    if (!sale_date || !details.length) {
      return res.status(400).json({ success: false, message: '销售日期和销售明细不能为空' });
    }

    if (customer_id) {
      const customer = await Customer.findByPk(customer_id);
      if (!customer) return res.status(400).json({ success: false, message: '客户不存在' });
    }

    // 按尺码聚合数量
    const sizeSumByProduct = {};
    if (size_plans && typeof size_plans === 'object') {
      for (const k of Object.keys(size_plans)) {
        const arr = Array.isArray(size_plans[k]) ? size_plans[k] : [];
        const sum = arr.reduce((n, r) => n + Number(r.qty || 0), 0);
        sizeSumByProduct[Number(k)] = sum;
      }
    }

    let total_amount = 0;
    for (const detail of details) {
      const { product_id, unit_price } = detail;
      if (!product_id || !unit_price || unit_price <= 0) {
        return res.status(400).json({ success: false, message: '销售明细信息不完整或单价无效' });
      }
      const product = await Product.findByPk(product_id);
      if (!product) return res.status(400).json({ success: false, message: `商品ID ${product_id} 不存在` });
      if (product.status && product.status !== 'active') {
        return res.status(400).json({ success: false, message: `商品 ${product.name} 已${product.status === 'inactive' ? '下架' : '停用'}，不可销售` });
      }

      const skuCount = await ProductSku.count({ where: { product_id } });
      const quantity = Number(sizeSumByProduct[Number(product_id)] || 0);
      if (skuCount > 0 && quantity <= 0) {
        return res.status(400).json({ success: false, message: `商品 ${product.name} 必须按尺码分配数量` });
      }

      // 累加总额（以尺码聚合数量为准）
      total_amount += quantity * Number(unit_price);
    }

    total_amount -= Number(discount_amount || 0);

    const sale_no = generateSaleNo();

    const sale = await Sale.create({ sale_no, customer_id: customer_id || null, sale_date, sale_type, total_amount, discount_amount, operator_id: req.user.id, remark }, { transaction });

    // 创建销售明细（数量以尺码聚合为准）
    for (const detail of details) {
      const { product_id, unit_price, remark: detail_remark } = detail;
      const quantity = Number(sizeSumByProduct[Number(product_id)] || 0);
      const total_price = quantity * Number(unit_price);
      await SaleDetail.create({ sale_id: sale.id, product_id, sku_id: null, size: null, color: null, quantity, unit_price, total_price, remark: detail_remark }, { transaction });
    }

    // 保存尺码分配
    try { await saveSalesSizePlans(sale.id, size_plans); } catch(e){ console.error('保存销售尺码分配失败:', e); }

    await OperationLog.create({ user_id: req.user.id, operation_type: 'create', module: 'sale', operation_desc: `创建销售单: ${sale_no}`, target_id: sale.id, ip_address: req.ip }, { transaction });

    await transaction.commit();

    res.status(201).json({ success: true, message: '销售单创建成功', data: { id: sale.id, sale_no: sale.sale_no, total_amount: sale.total_amount, status: sale.status } });
  } catch (error) {
    if (transaction && !transaction.finished) { await transaction.rollback(); }
    console.error('创建销售单失败:', error);
    res.status(500).json({ success: false, message: '创建销售单失败', error: error.message });
  }
});

// 新增：更新销售单（仅待确认可编辑，逻辑同创建）
router.put('/:id(\\d+)', async (req, res) => {
  const transaction = await sequelize.transaction();
  try {
    const { id } = req.params;
    const { customer_id, sale_date, sale_type = 'retail', discount_amount = 0, remark, details = [], size_plans = null } = req.body;

    const sale = await Sale.findByPk(id);
    if (!sale) { await transaction.rollback(); return res.status(404).json({ success:false, message:'销售单不存在' }); }
    if (sale.status !== 'pending') { await transaction.rollback(); return res.status(400).json({ success:false, message:'非待确认状态不可编辑' }); }

    if (!sale_date || !details.length) { await transaction.rollback(); return res.status(400).json({ success:false, message:'销售日期和销售明细不能为空' }); }

    if (customer_id) {
      const customer = await Customer.findByPk(customer_id);
      if (!customer) { await transaction.rollback(); return res.status(400).json({ success:false, message:'客户不存在' }); }
    }

    const sizeSumByProduct = {};
    if (size_plans && typeof size_plans === 'object') {
      for (const k of Object.keys(size_plans)) {
        const arr = Array.isArray(size_plans[k]) ? size_plans[k] : [];
        const sum = arr.reduce((n, r) => n + Number(r.qty || 0), 0);
        sizeSumByProduct[Number(k)] = sum;
      }
    }

    let total_amount = 0;
    for (const d of details) {
      const product_id = Number(d.product_id);
      const unit_price = Number(d.unit_price);
      const quantity = Number(sizeSumByProduct[product_id] || 0);
      const skuCount = await ProductSku.count({ where: { product_id } });
      if (skuCount > 0 && quantity <= 0) { await transaction.rollback(); return res.status(400).json({ success:false, message:'服装类商品必须按尺码分配数量' }); }
      if (!unit_price || unit_price <= 0) { await transaction.rollback(); return res.status(400).json({ success:false, message:'销售单价无效' }); }
      total_amount += quantity * unit_price;
    }

    await sale.update({ customer_id: customer_id || null, sale_date, sale_type, discount_amount, remark, total_amount }, { transaction });

    await SaleDetail.destroy({ where:{ sale_id: id }, transaction });

    for(const d of details){
      const product_id = Number(d.product_id);
      const quantity = Number(sizeSumByProduct[product_id] || 0);
      const unit_price = Number(d.unit_price);
      const total_price = quantity * unit_price;
      await SaleDetail.create({ sale_id: id, product_id, sku_id: null, size: null, color: null, quantity, unit_price, total_price, remark: d.remark }, { transaction });
    }

    try { await saveSalesSizePlans(Number(id), size_plans); } catch(e){ console.error('保存销售尺码分配失败:', e); }

    await OperationLog.create({ user_id: req.user.id, operation_type: 'update', module: 'sale', operation_desc: `更新销售单: ${sale.sale_no}` , target_id: sale.id, ip_address: req.ip }, { transaction });

    await transaction.commit();
    res.json({ success:true, message:'更新成功' });
  } catch (error) {
    if (!transaction.finished) await transaction.rollback();
    console.error('更新销售单失败:', error);
    res.status(500).json({ success:false, message:'更新销售单失败', error: error.message });
  }
});

// 4. 确认销售单（优先按尺码分配扣减 SKU 库存并记流水）
router.post('/:id/confirm', async (req, res) => {
  let transaction;
  
  try {
    transaction = await sequelize.transaction();
    const { id } = req.params;

    const sale = await Sale.findByPk(id, { include: [{ model: SaleDetail, as: 'details' }] });
    if (!sale) return res.status(404).json({ success: false, message: '销售单不存在' });
    if (sale.status !== 'pending') return res.status(400).json({ success: false, message: '只有待确认状态的销售单才能确认' });

    // 新增：如果存在保存的尺码分配，则按分配逐条扣减 SKU 库存
    let usedSizePlans = false;
    let affected = [];
    try {
      const plans = await loadSalesSizePlans(id);
      const productIds = Object.keys(plans||{});
      if (productIds.length > 0) {
        usedSizePlans = true;
        for(const pid of productIds){
          const arr = Array.isArray(plans[pid]) ? plans[pid] : [];
          for(const r of arr){
            const qty = Number(r.qty||0);
            if (qty <= 0) continue;
            let skuId = r.sku_id ? Number(r.sku_id) : null;
            if (!skuId) {
              // 自动根据 size 匹配 SKU
              const sku = await ProductSku.findOne({ where: { product_id: Number(pid), size: r.size }, transaction, lock: transaction.LOCK.UPDATE });
              if (!sku) { await transaction.rollback(); return res.status(400).json({ success:false, message:`商品(${pid}) 尺码 ${r.size} 未找到对应 SKU` }); }
              skuId = Number(sku.id);
            }
            const sku = await ProductSku.findByPk(skuId, { transaction, lock: transaction.LOCK.UPDATE });
            if (!sku || Number(sku.product_id) !== Number(pid)) { await transaction.rollback(); return res.status(400).json({ success:false, message:'SKU 无效或不匹配' }); }
            if (Number(sku.stock) < qty) { await transaction.rollback(); return res.status(400).json({ success:false, message:`尺码 ${sku.size} 库存不足，现有 ${sku.stock}` }); }
            const before = Number(sku.stock); const after = before - qty;
            await sku.update({ stock: after }, { transaction });
            await InventoryLog.create({ product_id: sku.product_id, sku_id: sku.id, change_qty: -qty, before_qty: before, after_qty: after, type: 'order_out', ref_type: 'sale', ref_id: id, operator_id: req.user.id, remark: '销售出库' }, { transaction });
            affected.push({ product_id: sku.product_id, sku_id: sku.id, size: sku.size });
          }
        }
      }
    } catch(e) { console.error('按尺码扣减失败，降级为明细扣减:', e); }

    if (!usedSizePlans) {
      // 兼容：无尺码分配时，按明细行（可能带 sku_id）处理
      for (const detail of sale.details) {
        if (detail.sku_id) {
          const sku = await ProductSku.findByPk(detail.sku_id, { transaction, lock: transaction.LOCK.UPDATE });
          if (!sku) return res.status(400).json({ success: false, message: 'SKU 不存在' });
          if (sku.stock < detail.quantity) return res.status(400).json({ success: false, message: `尺码 ${sku.size} 库存不足` });
          const before = sku.stock; const after = before - Number(detail.quantity);
          await sku.update({ stock: after }, { transaction });
          await InventoryLog.create({ product_id: sku.product_id, sku_id: sku.id, change_qty: -Number(detail.quantity), before_qty: before, after_qty: after, type: 'order_out', ref_type: 'sale', ref_id: id, operator_id: req.user.id, remark: '销售出库' }, { transaction });
          affected.push({ product_id: sku.product_id, sku_id: sku.id, size: sku.size });
        } else {
          // 兼容：老数据按聚合库存扣减
          const inventory = await Inventory.findOne({ where: { product_id: detail.product_id, warehouse_location: '默认仓库' } });
          if (!inventory || inventory.available_stock < detail.quantity) {
            return res.status(400).json({ success: false, message: `商品库存不足，无法确认销售单` });
          }
          await inventory.update({ current_stock: inventory.current_stock - detail.quantity, available_stock: inventory.available_stock - detail.quantity, updatedAt: new Date() }, { transaction });
        }
      }
    }

    await sale.update({ status: 'confirmed' }, { transaction });
    await OperationLog.create({ user_id: req.user.id, operation_type: 'update', module: 'sale', operation_desc: `确认销售单: ${sale.sale_no}`, target_id: sale.id, ip_address: req.ip }, { transaction });

    await transaction.commit();

    // 新：确认后仅广播库存变动，由自动补货服务监听并决定是否下单
    try {
      if (affected.length) stockBus.emit('stockChanged', affected, { operatorId: req.user.id, reason: 'sale_confirm' });
    } catch(e){ console.error('广播库存变动失败:', e); }

    res.json({ success: true, message: '销售单已确认' });
  } catch (error) {
    if (transaction && !transaction.finished) { await transaction.rollback(); }
    console.error('确认销售单失败:', error);
    res.status(500).json({ success: false, message: '确认销售单失败', error: error.message });
  }
});

// 5. 发货
router.post('/:id/ship', async (req, res) => {
  let transaction;
  
  try {
    transaction = await sequelize.transaction();
    const { id } = req.params;
    const { shipping_info } = req.body;

    // 查找销售单
    const sale = await Sale.findByPk(id);
    if (!sale) {
      return res.status(404).json({
        success: false,
        message: '销售单不存在'
      });
    }

    // 检查销售单状态
    if (sale.status !== 'confirmed') {
      return res.status(400).json({
        success: false,
        message: '只有已确认状态的销售单才能发货'
      });
    }

    // 更新销售单状态
    const updateData = {
      status: 'shipped'
    };
    
    if (shipping_info) {
      updateData.remark = sale.remark ? 
        `${sale.remark}\n发货信息: ${shipping_info}` : 
        `发货信息: ${shipping_info}`;
    }

    await sale.update(updateData, { transaction });

    // 记录操作日志
    await OperationLog.create({
      user_id: req.user.id,
      operation_type: 'update',
      module: 'sale',
      operation_desc: `销售发货: ${sale.sale_no}`,
      target_id: id,
      ip_address: req.ip
    }, { transaction });

    await transaction.commit();

    res.json({
      success: true,
      message: '销售单发货成功'
    });
  } catch (error) {
    if (transaction && !transaction.finished) {
      await transaction.rollback();
    }
    console.error('销售发货失败:', error);
    res.status(500).json({
      success: false,
      message: '销售发货失败',
      error: error.message
    });
  }
});

// 6. 完成销售
router.post('/:id/complete', async (req, res) => {
  let transaction;
  
  try {
    transaction = await sequelize.transaction();
    const { id } = req.params;

    // 查找销售单
    const sale = await Sale.findByPk(id);
    if (!sale) {
      return res.status(404).json({
        success: false,
        message: '销售单不存在'
      });
    }

    // 检查销售单状态
    if (sale.status !== 'shipped') {
      return res.status(400).json({
        success: false,
        message: '只有已发货状态的销售单才能完成'
      });
    }

    // 更新销售单状态
    await sale.update({
      status: 'completed'
    }, { transaction });

    // 记录操作日志
    await OperationLog.create({
      user_id: req.user.id,
      operation_type: 'update',
      module: 'sale',
      operation_desc: `完成销售: ${sale.sale_no}`,
      target_id: id,
      ip_address: req.ip
    }, { transaction });

    await transaction.commit();

    res.json({
      success: true,
      message: '销售单完成成功'
    });
  } catch (error) {
    if (transaction && !transaction.finished) {
      await transaction.rollback();
    }
    console.error('完成销售失败:', error);
    res.status(500).json({
      success: false,
      message: '完成销售失败',
      error: error.message
    });
  }
});

// 7. 取消销售单（按尺码分配回补 SKU 库存，兼容无分配时的聚合库存回补）
router.post('/:id/cancel', async (req, res) => {
  let transaction;
  
  try {
    transaction = await sequelize.transaction();
    const { id } = req.params;
    const { reason } = req.body;

    const sale = await Sale.findByPk(id, { include: [{ model: SaleDetail, as: 'details' }] });

    if (!sale) { return res.status(404).json({ success: false, message: '销售单不存在' }); }

    if (sale.status === 'completed' || sale.status === 'cancelled') {
      return res.status(400).json({ success: false, message: '已完成或已取消的销售单不能取消' });
    }

    // 若已确认/已发货，则需要回补库存
    let affected = [];
    if (sale.status === 'confirmed' || sale.status === 'shipped') {
      let restored = false;
      try {
        const plans = await loadSalesSizePlans(id);
        const productIds = Object.keys(plans||{});
        if (productIds.length > 0) {
          restored = true;
          for(const pid of productIds){
            const arr = Array.isArray(plans[pid]) ? plans[pid] : [];
            for(const r of arr){
              const qty = Number(r.qty||0);
              if (qty <= 0) continue;
              let skuId = r.sku_id ? Number(r.sku_id) : null;
              if (!skuId) {
                const sku = await ProductSku.findOne({ where: { product_id: Number(pid), size: r.size }, transaction, lock: transaction.LOCK.UPDATE });
                if (!sku) { await transaction.rollback(); return res.status(400).json({ success:false, message:`商品(${pid}) 尺码 ${r.size} 未找到对应 SKU` }); }
                skuId = Number(sku.id);
              }
              const sku = await ProductSku.findByPk(skuId, { transaction, lock: transaction.LOCK.UPDATE });
              if (!sku || Number(sku.product_id) !== Number(pid)) { await transaction.rollback(); return res.status(400).json({ success:false, message:'SKU 无效或不匹配' }); }
              const before = Number(sku.stock); const after = before + qty;
              await sku.update({ stock: after }, { transaction });
              await InventoryLog.create({ product_id: sku.product_id, sku_id: sku.id, change_qty: qty, before_qty: before, after_qty: after, type: 'cancel_restore', ref_type: 'sale', ref_id: id, operator_id: req.user.id, remark: '取消销售回补库存' }, { transaction });
              affected.push({ product_id: sku.product_id, sku_id: sku.id, size: sku.size });
            }
          }
        }
      } catch(e){ console.error('按尺码回补失败，将尝试按照明细/聚合回补:', e); }

      if (!restored) {
        // 兼容：无尺码分配时的聚合库存回补
        for (const detail of sale.details) {
          const inventory = await Inventory.findOne({ where: { product_id: detail.product_id, warehouse_location: '默认仓库' } });
          if (inventory) {
            await inventory.update({ current_stock: inventory.current_stock + detail.quantity, available_stock: inventory.available_stock + detail.quantity, updatedAt: new Date() }, { transaction });
          }
        }
      }
    }

    await sale.update({ status: 'cancelled', remark: sale.remark ? `${sale.remark}\n取消原因: ${reason || '无'}` : `取消原因: ${reason || '无'}` }, { transaction });

    await OperationLog.create({ user_id: req.user.id, operation_type: 'update', module: 'sale', operation_desc: `取消销售单: ${sale.sale_no}，原因: ${reason || '无'}`, target_id: id, ip_address: req.ip }, { transaction });

    await transaction.commit();

    // 新：取消后也广播库存变动（一般为回补，不会触发下单）
    try { if (affected.length) stockBus.emit('stockChanged', affected, { operatorId: req.user.id, reason: 'sale_cancel' }); } catch(e){}

    res.json({ success: true, message: '销售单取消成功' });
  } catch (error) {
    if (transaction && !transaction.finished) { await transaction.rollback(); }
    console.error('取消销售单失败:', error);
    res.status(500).json({ success: false, message: '取消销售单失败', error: error.message });
  }
});

// 8. 销售统计
router.get('/statistics/summary', async (req, res) => {
  try {
    const {
      start_date,
      end_date,
      customer_id,
      status,
      sale_type
    } = req.query;

    // 构建查询条件
    const where = {};
    
    if (status) {
      where.status = status;
    }
    
    if (customer_id) {
      where.customer_id = customer_id;
    }
    
    if (sale_type) {
      where.sale_type = sale_type;
    }
    
    if (start_date && end_date) {
      where.sale_date = {
        [Op.between]: [start_date, end_date]
      };
    } else if (start_date) {
      where.sale_date = {
        [Op.gte]: start_date
      };
    } else if (end_date) {
      where.sale_date = {
        [Op.lte]: end_date
      };
    }

    // 获取统计数据
    const [totalStats, customerStats, monthlyStats] = await Promise.all([
      // 总体统计
      Sale.findAll({
        where,
        attributes: [
          'status',
          [sequelize.fn('COUNT', sequelize.col('id')), 'count'],
          [sequelize.fn('SUM', sequelize.col('total_amount')), 'total_amount'],
          [sequelize.fn('SUM', sequelize.col('received_amount')), 'received_amount']
        ],
        group: ['status']
      }),

      // 按客户统计
      Sale.findAll({
        where: {
          ...where,
          customer_id: {
            [Op.ne]: null
          }
        },
        attributes: [
          'customer_id',
          [sequelize.fn('COUNT', sequelize.col('Sale.id')), 'count'],
          [sequelize.fn('SUM', sequelize.col('total_amount')), 'total_amount'],
          [sequelize.fn('SUM', sequelize.col('received_amount')), 'received_amount']
        ],
        include: [
          {
            model: Customer,
            as: 'customer',
            attributes: ['name']
          }
        ],
        group: ['customer_id', 'customer.id', 'customer.name'],
        order: [[sequelize.literal('total_amount'), 'DESC']],
        limit: 10
      }),

      // 按月统计
      sequelize.query(`
        SELECT 
          DATE_FORMAT(sale_date, '%Y-%m') as month,
          COUNT(*) as count,
          SUM(total_amount) as total_amount,
          SUM(received_amount) as received_amount
        FROM sales 
        WHERE ${start_date ? 'sale_date >= :start_date AND ' : ''}
              ${end_date ? 'sale_date <= :end_date AND ' : ''}
              ${status ? 'status = :status AND ' : ''}
              ${customer_id ? 'customer_id = :customer_id AND ' : ''}
              ${sale_type ? 'sale_type = :sale_type AND ' : ''}
              1=1
        GROUP BY DATE_FORMAT(sale_date, '%Y-%m')
        ORDER BY month DESC
        LIMIT 12
      `, {
        replacements: {
          start_date,
          end_date,
          status,
          customer_id,
          sale_type
        },
        type: sequelize.QueryTypes.SELECT
      })
    ]);

    res.json({
      success: true,
      data: {
        total_stats: totalStats,
        customer_stats: customerStats,
        monthly_stats: monthlyStats
      }
    });
  } catch (error) {
    console.error('获取销售统计失败:', error);
    res.status(500).json({
      success: false,
      message: '获取销售统计失败',
      error: error.message
    });
  }
});

module.exports = router;
