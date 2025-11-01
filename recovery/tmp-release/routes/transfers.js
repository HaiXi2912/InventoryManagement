const express = require('express');
const { Op } = require('sequelize');
const { sequelize } = require('../config/database');
const { authenticate } = require('../middleware/auth');
const { TransferOrder, TransferDetail, Inventory, Product, OperationLog } = require('../models');

const router = express.Router();

function generateTransferNo() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const time = String(now.getHours()).padStart(2, '0') + String(now.getMinutes()).padStart(2, '0') + String(now.getSeconds()).padStart(2, '0');
  return `TRF${year}${month}${day}${time}`;
}

router.use(authenticate);

// 列表
router.get('/', async (req, res) => {
  try {
    const { page = 1, size = 10, status, transfer_no, from_warehouse, to_warehouse } = req.query;
    const limit = parseInt(size);
    const offset = (parseInt(page) - 1) * limit;

    const where = {};
    if (status) where.status = status;
    if (transfer_no) where.transfer_no = { [Op.like]: `%${transfer_no}%` };
    if (from_warehouse) where.from_warehouse = from_warehouse;
    if (to_warehouse) where.to_warehouse = to_warehouse;

    const { count, rows } = await TransferOrder.findAndCountAll({
      where,
      include: [{ model: TransferDetail, as: 'details', include: [{ model: Product, as: 'product' }] }],
      order: [['createdAt', 'DESC']],
      limit,
      offset
    });

    res.json({ success: true, data: { transfers: rows, pagination: { total: count, page: parseInt(page), size: limit, pages: Math.ceil(count / limit) } } });
  } catch (err) {
    console.error('获取调拨单列表失败:', err);
    res.status(500).json({ success: false, message: '获取调拨单列表失败' });
  }
});

// 详情
router.get('/:id', async (req, res) => {
  try {
    const item = await TransferOrder.findByPk(req.params.id, {
      include: [{ model: TransferDetail, as: 'details', include: [{ model: Product, as: 'product' }] }]
    });
    if (!item) return res.status(404).json({ success: false, message: '调拨单不存在' });
    res.json({ success: true, data: item });
  } catch (err) {
    console.error('获取调拨单详情失败:', err);
    res.status(500).json({ success: false, message: '获取调拨单详情失败' });
  }
});

// 创建
router.post('/', async (req, res) => {
  let transaction;
  try {
    transaction = await sequelize.transaction();
    const { from_warehouse, to_warehouse, transfer_date, remark, details = [] } = req.body;

    if (!from_warehouse || !to_warehouse || !transfer_date || !details.length) {
      return res.status(400).json({ success: false, message: '参数无效' });
    }
    if (from_warehouse === to_warehouse) {
      return res.status(400).json({ success: false, message: '来源与目标仓库不能相同' });
    }

    // 校验商品
    for (const d of details) {
      const { product_id, quantity } = d;
      if (!product_id || !quantity || quantity <= 0) {
        return res.status(400).json({ success: false, message: '明细数据无效' });
      }
      const inv = await Inventory.findOne({ where: { product_id, warehouse_location: from_warehouse } });
      if (!inv || inv.available_stock < quantity) {
        return res.status(400).json({ success: false, message: `商品ID ${product_id} 来源仓库库存不足` });
      }
    }

    const transfer_no = generateTransferNo();

    const order = await TransferOrder.create({
      transfer_no,
      from_warehouse,
      to_warehouse,
      transfer_date,
      status: 'pending',
      operator_id: req.user.id,
      remark
    }, { transaction });

    for (const d of details) {
      await TransferDetail.create({
        transfer_id: order.id,
        product_id: d.product_id,
        quantity: d.quantity,
        remark: d.remark || null
      }, { transaction });
    }

    await OperationLog.create({
      user_id: req.user.id,
      operation_type: 'create',
      module: 'transfer',
      operation_desc: `创建调拨单: ${transfer_no}`,
      target_id: order.id,
      ip_address: req.ip
    }, { transaction });

    await transaction.commit();

    res.status(201).json({ success: true, message: '调拨单创建成功', data: { id: order.id, transfer_no: order.transfer_no } });
  } catch (err) {
    if (transaction && !transaction.finished) await transaction.rollback();
    console.error('创建调拨单失败:', err);
    res.status(500).json({ success: false, message: '创建调拨单失败' });
  }
});

// 确认（联动库存）
router.post('/:id/confirm', async (req, res) => {
  let transaction;
  try {
    transaction = await sequelize.transaction();
    const order = await TransferOrder.findByPk(req.params.id, { include: [{ model: TransferDetail, as: 'details' }] });
    if (!order) return res.status(404).json({ success: false, message: '调拨单不存在' });
    if (order.status !== 'pending') return res.status(400).json({ success: false, message: '仅待确认的调拨单可确认' });

    for (const d of order.details) {
      const fromInv = await Inventory.findOne({ where: { product_id: d.product_id, warehouse_location: order.from_warehouse }, transaction, lock: transaction.LOCK.UPDATE });
      if (!fromInv || fromInv.available_stock < d.quantity) {
        return res.status(400).json({ success: false, message: `商品ID ${d.product_id} 来源仓库库存不足` });
      }
    }

    for (const d of order.details) {
      // 扣减来源仓
      const fromInv = await Inventory.findOne({ where: { product_id: d.product_id, warehouse_location: order.from_warehouse }, transaction, lock: transaction.LOCK.UPDATE });
      await fromInv.update({
        current_stock: fromInv.current_stock - d.quantity,
        available_stock: fromInv.available_stock - d.quantity,
        total_value: (fromInv.current_stock - d.quantity) * (fromInv.average_cost || 0)
      }, { transaction });

      // 增加目标仓（若无则初始化）
      let toInv = await Inventory.findOne({ where: { product_id: d.product_id, warehouse_location: order.to_warehouse }, transaction, lock: transaction.LOCK.UPDATE });
      if (!toInv) {
        toInv = await Inventory.create({
          product_id: d.product_id,
          warehouse_location: order.to_warehouse,
          current_stock: 0,
          available_stock: 0,
          reserved_stock: 0,
          average_cost: fromInv.average_cost || 0,
          total_value: 0
        }, { transaction });
      }
      const newStock = toInv.current_stock + d.quantity;
      await toInv.update({
        current_stock: newStock,
        available_stock: (toInv.available_stock || 0) + d.quantity,
        total_value: newStock * (toInv.average_cost || fromInv.average_cost || 0)
      }, { transaction });
    }

    await order.update({ status: 'confirmed' }, { transaction });

    await OperationLog.create({
      user_id: req.user.id,
      operation_type: 'update',
      module: 'transfer',
      operation_desc: `确认调拨单: ${order.transfer_no}`,
      target_id: order.id,
      ip_address: req.ip
    }, { transaction });

    await transaction.commit();
    res.json({ success: true, message: '调拨单已确认' });
  } catch (err) {
    if (transaction && !transaction.finished) await transaction.rollback();
    console.error('确认调拨单失败:', err);
    res.status(500).json({ success: false, message: '确认调拨单失败' });
  }
});

module.exports = router;
