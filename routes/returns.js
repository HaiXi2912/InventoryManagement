const express = require('express');
const { Op } = require('sequelize');
const { sequelize } = require('../config/database');
const { authenticate } = require('../middleware/auth');
const { ReturnOrder, ReturnDetail, Purchase, PurchaseDetail, Sale, SaleDetail, Product, Inventory, Customer, OperationLog } = require('../models');

const router = express.Router();

// 生成退货单号
function generateReturnNo(type) {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const time = String(now.getHours()).padStart(2, '0') + String(now.getMinutes()).padStart(2, '0') + String(now.getSeconds()).padStart(2, '0');
  const prefix = type === 'purchase' ? 'PRT' : 'SRT';
  return `${prefix}${year}${month}${day}${time}`;
}

// 应用JWT认证
router.use(authenticate);

// 列表查询
router.get('/', async (req, res) => {
  try {
    const { page = 1, size = 10, type, status, return_no, start_date, end_date } = req.query;
    const limit = parseInt(size);
    const offset = (parseInt(page) - 1) * limit;

    const where = {};
    if (type) where.type = type;
    if (status) where.status = status;
    if (return_no) where.return_no = { [Op.like]: `%${return_no}%` };
    if (start_date && end_date) {
      where.return_date = { [Op.between]: [start_date, end_date] };
    } else if (start_date) {
      where.return_date = { [Op.gte]: start_date };
    } else if (end_date) {
      where.return_date = { [Op.lte]: end_date };
    }

    const { count, rows } = await ReturnOrder.findAndCountAll({
      where,
      include: [{ model: ReturnDetail, as: 'details', include: [{ model: Product, as: 'product' }] }],
      order: [['createdAt', 'DESC']],
      limit,
      offset
    });

    res.json({ success: true, data: { returns: rows, pagination: { total: count, page: parseInt(page), size: limit, pages: Math.ceil(count / limit) } } });
  } catch (err) {
    console.error('获取退货单列表失败:', err);
    res.status(500).json({ success: false, message: '获取退货单列表失败' });
  }
});

// 获取详情
router.get('/:id', async (req, res) => {
  try {
    const item = await ReturnOrder.findByPk(req.params.id, {
      include: [
        { model: ReturnDetail, as: 'details', include: [{ model: Product, as: 'product' }] }
      ]
    });
    if (!item) return res.status(404).json({ success: false, message: '退货单不存在' });
    res.json({ success: true, data: item });
  } catch (err) {
    console.error('获取退货单详情失败:', err);
    res.status(500).json({ success: false, message: '获取退货单详情失败' });
  }
});

// 创建退货单
router.post('/', async (req, res) => {
  let transaction;
  try {
    transaction = await sequelize.transaction();
    const { type, reference_id, return_date, details = [], remark } = req.body;

    if (!['purchase', 'sale'].includes(type) || !reference_id || !return_date || !details.length) {
      return res.status(400).json({ success: false, message: '参数无效' });
    }

    // 校验来源单据并计算金额
    let referenceNo = '';
    let vendorOrCustomerId = null;
    let total_amount = 0;

    if (type === 'purchase') {
      const purchase = await Purchase.findByPk(reference_id, { include: [{ model: PurchaseDetail, as: 'details' }] });
      if (!purchase) return res.status(400).json({ success: false, message: '采购单不存在' });
      referenceNo = purchase.purchase_no;
      vendorOrCustomerId = 0; // 供应商模式已废弃
    } else {
      const sale = await Sale.findByPk(reference_id, { include: [{ model: SaleDetail, as: 'details' }] });
      if (!sale) return res.status(400).json({ success: false, message: '销售单不存在' });
      referenceNo = sale.sale_no;
      vendorOrCustomerId = sale.customer_id || 0;
    }

    for (const d of details) {
      const { product_id, quantity, unit_price, reason } = d;
      if (!product_id || !quantity || !unit_price || quantity <= 0 || unit_price < 0) {
        return res.status(400).json({ success: false, message: '明细数据无效' });
      }
      const product = await Product.findByPk(product_id);
      if (!product) return res.status(400).json({ success: false, message: `商品ID ${product_id} 不存在` });
      total_amount += quantity * unit_price;
    }

    const return_no = generateReturnNo(type);

    const order = await ReturnOrder.create({
      return_no,
      type,
      reference_id,
      reference_no: referenceNo,
      vendor_or_customer_id: vendorOrCustomerId,
      return_date,
      total_amount,
      status: 'pending',
      operator_id: req.user.id,
      remark
    }, { transaction });

    for (const d of details) {
      const { product_id, quantity, unit_price, reason } = d;
      await ReturnDetail.create({
        return_id: order.id,
        product_id,
        quantity,
        unit_price,
        total_price: quantity * unit_price,
        reason: reason || null
      }, { transaction });
    }

    await OperationLog.create({
      user_id: req.user.id,
      operation_type: 'create',
      module: 'return',
      operation_desc: `创建退货单: ${return_no}`,
      target_id: order.id,
      ip_address: req.ip
    }, { transaction });

    await transaction.commit();

    res.status(201).json({ success: true, message: '退货单创建成功', data: { id: order.id, return_no: order.return_no, status: order.status } });
  } catch (err) {
    if (transaction && !transaction.finished) await transaction.rollback();
    console.error('创建退货单失败:', err);
    res.status(500).json({ success: false, message: '创建退货单失败' });
  }
});

// 确认退货单（生效并联动库存）
router.post('/:id/confirm', async (req, res) => {
  let transaction;
  try {
    transaction = await sequelize.transaction();
    const order = await ReturnOrder.findByPk(req.params.id, { include: [{ model: ReturnDetail, as: 'details' }] });
    if (!order) return res.status(404).json({ success: false, message: '退货单不存在' });
    if (order.status !== 'pending') return res.status(400).json({ success: false, message: '仅待确认的退货单可确认' });

    // 默认仓库
    const WAREHOUSE = '默认仓库';

    for (const d of order.details) {
      const inventory = await Inventory.findOne({ where: { product_id: d.product_id, warehouse_location: WAREHOUSE } });
      if (!inventory) {
        // 若库存不存在则初始化一条
        await Inventory.create({
          product_id: d.product_id,
          warehouse_location: WAREHOUSE,
          current_stock: 0,
          available_stock: 0,
          reserved_stock: 0,
          average_cost: 0,
          total_value: 0
        }, { transaction });
      }
    }

    // 采购退货：库存减少；销售退货：库存增加
    const isPurchaseReturn = order.type === 'purchase';

    for (const d of order.details) {
      const inv = await Inventory.findOne({ where: { product_id: d.product_id, warehouse_location: WAREHOUSE }, transaction, lock: transaction.LOCK.UPDATE });
      const delta = isPurchaseReturn ? -d.quantity : d.quantity;
      const newStock = (inv.current_stock || 0) + delta;
      if (newStock < 0) {
        return res.status(400).json({ success: false, message: `商品ID ${d.product_id} 库存不足，无法确认` });
      }
      await inv.update({
        current_stock: newStock,
        available_stock: (inv.available_stock || 0) + delta,
        total_value: newStock * (inv.average_cost || 0)
      }, { transaction });
    }

    await order.update({ status: 'confirmed' }, { transaction });

    await OperationLog.create({
      user_id: req.user.id,
      operation_type: 'update',
      module: 'return',
      operation_desc: `确认退货单: ${order.return_no}`,
      target_id: order.id,
      ip_address: req.ip
    }, { transaction });

    await transaction.commit();

    res.json({ success: true, message: '退货单已确认' });
  } catch (err) {
    if (transaction && !transaction.finished) await transaction.rollback();
    console.error('确认退货单失败:', err);
    res.status(500).json({ success: false, message: '确认退货单失败' });
  }
});

module.exports = router;
