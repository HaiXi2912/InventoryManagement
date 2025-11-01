const express = require('express');
const { Op } = require('sequelize');
const { sequelize } = require('../config/database');
const { authenticate, authorize } = require('../middleware/auth');
const { APTransaction, ARTransaction, Purchase, Sale, OperationLog, FactoryOrder, FactoryOrderDetail, DailyClearing, MonthlyStatement, FactoryPayment } = require('../models');

const router = express.Router();

router.use(authenticate);

// 查询应付记录
router.get('/ap', async (req, res) => {
  try {
    const { page = 1, size = 10, purchase_id, start_date, end_date } = req.query;
    const limit = parseInt(size);
    const offset = (parseInt(page) - 1) * limit;

    const where = {};
    if (purchase_id) where.purchase_id = parseInt(purchase_id);
    if (start_date && end_date) where.txn_date = { [Op.between]: [start_date, end_date] };

    const { count, rows } = await APTransaction.findAndCountAll({
      where,
      include: [{ model: Purchase, as: 'purchase', attributes: ['id', 'purchase_no'] }],
      order: [['txn_date', 'DESC']],
      limit,
      offset
    });

    res.json({ success: true, data: { list: rows, pagination: { total: count, page: parseInt(page), size: limit, pages: Math.ceil(count / limit) } } });
  } catch (err) {
    console.error('获取应付记录失败:', err);
    res.status(500).json({ success: false, message: '获取应付记录失败' });
  }
});

// 新增应付付款（并更新采购单已付金额和付款状态）
router.post('/ap', async (req, res) => {
  let transaction;
  try {
    transaction = await sequelize.transaction();
    const { purchase_id, amount, method, txn_date, remark } = req.body;
    if (!purchase_id || !amount || amount <= 0 || !method || !txn_date) {
      return res.status(400).json({ success: false, message: '参数无效' });
    }
    const purchase = await Purchase.findByPk(purchase_id);
    if (!purchase) return res.status(400).json({ success: false, message: '采购单不存在' });

    const ap = await APTransaction.create({ purchase_id, amount, method, txn_date, operator_id: req.user.id, remark }, { transaction });

    const newPaid = parseFloat(purchase.paid_amount || 0) + parseFloat(amount);
    const payment_status = newPaid >= parseFloat(purchase.total_amount || 0) ? 'paid' : (newPaid > 0 ? 'partial' : 'unpaid');
    await purchase.update({ paid_amount: newPaid, payment_status }, { transaction });

    await OperationLog.create({ user_id: req.user.id, operation_type: 'create', module: 'finance', operation_desc: `采购付款：${amount}`, target_id: ap.id, ip_address: req.ip }, { transaction });

    await transaction.commit();
    res.status(201).json({ success: true, message: '付款记录新增成功', data: { id: ap.id } });
  } catch (err) {
    if (transaction && !transaction.finished) await transaction.rollback();
    console.error('新增应付失败:', err);
    res.status(500).json({ success: false, message: '新增应付失败' });
  }
});

// 查询应收记录
router.get('/ar', async (req, res) => {
  try {
    const { page = 1, size = 10, sale_id, start_date, end_date } = req.query;
    const limit = parseInt(size);
    const offset = (parseInt(page) - 1) * limit;

    const where = {};
    if (sale_id) where.sale_id = parseInt(sale_id);
    if (start_date && end_date) where.txn_date = { [Op.between]: [start_date, end_date] };

    const { count, rows } = await ARTransaction.findAndCountAll({
      where,
      include: [{ model: Sale, as: 'sale', attributes: ['id', 'sale_no'] }],
      order: [['txn_date', 'DESC']],
      limit,
      offset
    });

    res.json({ success: true, data: { list: rows, pagination: { total: count, page: parseInt(page), size: limit, pages: Math.ceil(count / limit) } } });
  } catch (err) {
    console.error('获取应收记录失败:', err);
    res.status(500).json({ success: false, message: '获取应收记录失败' });
  }
});

// 新增应收收款（并更新销售单已收金额和收款状态）
router.post('/ar', async (req, res) => {
  let transaction;
  try {
    transaction = await sequelize.transaction();
    const { sale_id, amount, method, txn_date, remark } = req.body;
    if (!sale_id || !amount || amount <= 0 || !method || !txn_date) {
      return res.status(400).json({ success: false, message: '参数无效' });
    }
    const sale = await Sale.findByPk(sale_id);
    if (!sale) return res.status(400).json({ success: false, message: '销售单不存在' });

    const ar = await ARTransaction.create({ sale_id, amount, method, txn_date, operator_id: req.user.id, remark }, { transaction });

    const newReceived = parseFloat(sale.received_amount || 0) + parseFloat(amount);
    const payment_status = newReceived >= parseFloat(sale.total_amount || 0) ? 'paid' : (newReceived > 0 ? 'partial' : 'unpaid');
    await sale.update({ received_amount: newReceived, payment_status }, { transaction });

    await OperationLog.create({ user_id: req.user.id, operation_type: 'create', module: 'finance', operation_desc: `销售收款：${amount}`, target_id: ar.id, ip_address: req.ip }, { transaction });

    await transaction.commit();
    res.status(201).json({ success: true, message: '收款记录新增成功', data: { id: ar.id } });
  } catch (err) {
    if (transaction && !transaction.finished) await transaction.rollback();
    console.error('新增应收失败:', err);
    res.status(500).json({ success: false, message: '新增应收失败' });
  }
});

// ===== 日清 / 月结（增强：含工厂订货“下单支出”与“完成成本”） =====

// 计算某日的工厂成本（mode: 'completed' 使用完成/入库日；'ordered' 使用创建日）
async function calcFactoryCostByDate(date, mode = 'completed') {
  if (mode === 'ordered') {
    const [rows] = await sequelize.query(
      `SELECT SUM(d.subtotal_cost) AS total
       FROM factory_orders f
       JOIN factory_order_details d ON d.order_id=f.id
       WHERE DATE(f.created_at) = :date AND f.status <> 'cancelled'`
      , { replacements: { date } }
    );
    return Number(rows?.[0]?.total || 0);
  }
  const [rows] = await sequelize.query(
    `SELECT SUM(d.subtotal_cost) AS total
     FROM factory_orders f
     JOIN factory_order_details d ON d.order_id=f.id
     WHERE DATE(COALESCE(f.finished_at, f.updated_at, f.created_at)) = :date
       AND f.status IN ('completed')`
    , { replacements: { date } }
  );
  return Number(rows?.[0]?.total || 0);
}

// 计算某日 AP/AR
async function calcAPByDate(date){
  const [rows] = await sequelize.query(`SELECT SUM(amount) AS total FROM ap_transactions WHERE DATE(txn_date)=:date AND status<>'cancelled'`, { replacements:{ date } })
  return Number(rows?.[0]?.total || 0)
}
async function calcARByDate(date){
  const [rows] = await sequelize.query(`SELECT SUM(amount) AS total FROM ar_transactions WHERE DATE(txn_date)=:date AND status<>'cancelled'`, { replacements:{ date } })
  return Number(rows?.[0]?.total || 0)
}

// 日清：计算并保存/覆盖（breakdown 同时包含 ordered/completed 两套口径）
router.post('/clearing/daily/close', async (req, res)=>{
  try{
    const date = req.body?.date || new Date().toISOString().slice(0,10)
    const [fcCompleted, fcOrdered, ap, ar] = await Promise.all([
      calcFactoryCostByDate(date, 'completed'),
      calcFactoryCostByDate(date, 'ordered'),
      calcAPByDate(date),
      calcARByDate(date),
    ])
    const breakdown = { factory_completed_cost: fcCompleted, factory_ordered_cost: fcOrdered, ap, ar }
    const [row, created] = await DailyClearing.findOrCreate({
      where:{ date },
      defaults:{ total_factory_cost: fcCompleted, total_ap: ap, total_ar: ar, breakdown, closed_by: req.user?.id || null, closed_at: new Date() }
    })
    if (!created){
      await row.update({ total_factory_cost: fcCompleted, total_ap: ap, total_ar: ar, breakdown, closed_by: req.user?.id || null, closed_at: new Date() })
    }
    res.json({ success:true, data:{ date, ...breakdown, total_completed_view: (fcCompleted + ap - ar), total_ordered_view: (fcOrdered + ap - ar) } })
  }catch(e){ console.error('日清关账失败:', e); res.status(500).json({ success:false, message:'日清关账失败' }) }
})

router.get('/clearing/daily', async (req, res)=>{
  try{
    const date = req.query?.date || new Date().toISOString().slice(0,10)
    const row = await DailyClearing.findOne({ where:{ date } })
    if (row) return res.json({ success:true, data: row })
    // 未关账则临时计算返回
    const [fcCompleted, fcOrdered, ap, ar] = await Promise.all([
      calcFactoryCostByDate(date, 'completed'),
      calcFactoryCostByDate(date, 'ordered'),
      calcAPByDate(date),
      calcARByDate(date),
    ])
    return res.json({ success:true, data:{ date, total_factory_cost: fcCompleted, total_ap: ap, total_ar: ar, breakdown:{ factory_completed_cost: fcCompleted, factory_ordered_cost: fcOrdered, ap, ar }, total_completed_view: (fcCompleted + ap - ar), total_ordered_view: (fcOrdered + ap - ar) } })
  }catch(e){ res.status(500).json({ success:false, message:'获取日清失败' }) }
})

// 月结：汇总当月（同时返回 ordered/completed）
async function calcMonth(period){
  const [rows] = await sequelize.query(
    `SELECT
       (SELECT SUM(d.subtotal_cost)
          FROM factory_orders f JOIN factory_order_details d ON d.order_id=f.id
          WHERE DATE_FORMAT(COALESCE(f.finished_at, f.updated_at, f.created_at),'%Y-%m')=:p AND f.status IN ('completed')
       ) AS factory_completed,
       (SELECT SUM(d.subtotal_cost)
          FROM factory_orders f JOIN factory_order_details d ON d.order_id=f.id
          WHERE DATE_FORMAT(f.created_at,'%Y-%m')=:p AND f.status <> 'cancelled'
       ) AS factory_ordered,
       (SELECT SUM(amount) FROM ap_transactions WHERE DATE_FORMAT(txn_date,'%Y-%m')=:p AND status<>'cancelled') AS ap,
       (SELECT SUM(amount) FROM ar_transactions WHERE DATE_FORMAT(txn_date,'%Y-%m')=:p AND status<>'cancelled') AS ar`,
    { replacements:{ p: period } }
  )
  const fcCompleted = Number(rows?.[0]?.factory_completed || 0)
  const fcOrdered = Number(rows?.[0]?.factory_ordered || 0)
  const ap = Number(rows?.[0]?.ap || 0)
  const ar = Number(rows?.[0]?.ar || 0)
  return { fcCompleted, fcOrdered, ap, ar }
}

router.post('/clearing/monthly/close', async (req, res)=>{
  try{
    const period = (req.body?.period || new Date().toISOString().slice(0,7))
    const { fcCompleted, fcOrdered, ap, ar } = await calcMonth(period)
    const breakdown = { factory_completed_cost: fcCompleted, factory_ordered_cost: fcOrdered, ap, ar }
    const [row, created] = await MonthlyStatement.findOrCreate({ where:{ period }, defaults:{ total_factory_cost: fcCompleted, total_ap: ap, total_ar: ar, breakdown, closed_by: req.user?.id || null, closed_at: new Date() } })
    if (!created){ await row.update({ total_factory_cost: fcCompleted, total_ap: ap, total_ar: ar, breakdown, closed_by: req.user?.id || null, closed_at: new Date() }) }
    res.json({ success:true, data:{ period, ...breakdown, total_completed_view: (fcCompleted + ap - ar), total_ordered_view: (fcOrdered + ap - ar) } })
  }catch(e){ console.error('月结关账失败:', e); res.status(500).json({ success:false, message:'月结关账失败' }) }
})

router.get('/clearing/monthly', async (req, res)=>{
  try{
    const period = (req.query?.period || new Date().toISOString().slice(0,7))
    const row = await MonthlyStatement.findOne({ where:{ period } })
    if (row) return res.json({ success:true, data: row })
    const { fcCompleted, fcOrdered, ap, ar } = await calcMonth(period)
    return res.json({ success:true, data:{ period, total_factory_cost: fcCompleted, total_ap: ap, total_ar: ar, breakdown:{ factory_completed_cost: fcCompleted, factory_ordered_cost: fcOrdered, ap, ar }, total_completed_view: (fcCompleted + ap - ar), total_ordered_view: (fcOrdered + ap - ar) } })
  }catch(e){ res.status(500).json({ success:false, message:'获取月结失败' }) }
})

// ====== 工厂账单结算（按日/按月） ======
// 规则：
// - daily: 直接使用 DailyClearing.total_factory_cost 作为应付金额，允许手动调整 amount
// - monthly: 使用当月 completed 口径 total_factory_cost，需扣除当日（date=today）已结算金额（若也走 daily 结算），避免重复（今日的成本今日已结则月度不再含今日）

router.post('/factory/settle/daily', authorize(['manager','admin']), async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const date = (req.body?.date || new Date().toISOString().slice(0,10));
    let amount = Number(req.body?.amount || 0);
    const method = req.body?.method || 'transfer';
    const remark = req.body?.remark || '';

    const daily = await DailyClearing.findOne({ where:{ date } });
    if (!daily) {
      return res.status(400).json({ success:false, message:'当日未生成日清数据，请先进行日清关账' });
    }

    // 新增：防重复结算（同一日期仅允许结算一次）
    const existed = await FactoryPayment.findOne({ where:{ scope_type:'daily', scope_value: date } });
    if (existed) {
      await t.rollback();
      return res.status(400).json({ success:false, message:'该日期已完成日清结算，不可重复结算' });
    }

    if (!amount || amount <= 0) amount = Number(daily.total_factory_cost || 0);

    const pay = await FactoryPayment.create({ scope_type:'daily', scope_value: date, amount, method, operator_id: req.user.id, remark }, { transaction: t });
    await OperationLog.create({ user_id: req.user.id, operation_type:'create', module:'finance', operation_desc:`工厂日清结算 ${date}：${amount}`, target_id: pay.id, ip_address: req.ip }, { transaction: t });

    await t.commit();
    return res.json({ success:true, message:'日清结算完成', data: { id: pay.id, date, amount } });
  } catch (e) {
    if (t && !t.finished) await t.rollback();
    console.error('日清结算失败:', e);
    return res.status(500).json({ success:false, message:'日清结算失败' });
  }
});

router.post('/factory/settle/monthly', authorize(['manager','admin']), async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const today = new Date().toISOString().slice(0,10);
    const period = (req.body?.period || new Date().toISOString().slice(0,7));
    let amount = Number(req.body?.amount || 0);
    const method = req.body?.method || 'transfer';
    const remark = req.body?.remark || '';

    const monthRow = await MonthlyStatement.findOne({ where:{ period } });
    if (!monthRow) {
      return res.status(400).json({ success:false, message:'当月未生成月结数据，请先进行月结关账' });
    }
    const totalMonthly = Number(monthRow.total_factory_cost || 0);

    // 计算今天是否属于该 period，若属于则扣除今天已结算的日清金额
    let deduction = 0;
    if (today.startsWith(period)) {
      const paidToday = await FactoryPayment.findOne({ where:{ scope_type:'daily', scope_value: today } });
      if (paidToday) deduction = Number(paidToday.amount || 0);
    }

    const payable = Math.max(0, totalMonthly - deduction);
    if (!amount || amount <= 0) amount = payable;

    const pay = await FactoryPayment.create({ scope_type:'monthly', scope_value: period, amount, method, operator_id: req.user.id, remark }, { transaction: t });
    await OperationLog.create({ user_id: req.user.id, operation_type:'create', module:'finance', operation_desc:`工厂月结结算 ${period}：${amount}（扣除当日 ${deduction}）`, target_id: pay.id, ip_address: req.ip }, { transaction: t });

    await t.commit();
    return res.json({ success:true, message:'月结结算完成', data: { id: pay.id, period, amount, deducted_today: deduction, payable } });
  } catch (e) {
    if (t && !t.finished) await t.rollback();
    console.error('月结结算失败:', e);
    return res.status(500).json({ success:false, message:'月结结算失败' });
  }
});

// 查询结算记录
router.get('/factory/payments', authorize(['staff','manager','admin']), async (req, res) => {
  try {
    const { page=1, size=10, scope_type, scope_value, start_date, end_date } = req.query;
    const limit = parseInt(size); const offset = (parseInt(page)-1)*limit;
    const where = {};
    if (scope_type) where.scope_type = scope_type;
    if (scope_value) where.scope_value = scope_value;
    if (start_date && end_date) where.paid_at = { [Op.between]: [start_date, end_date] };

    const { rows, count } = await FactoryPayment.findAndCountAll({ where, order:[['paid_at','DESC']], limit, offset });
    return res.json({ success:true, data:{ list: rows, pagination:{ total: count, page: parseInt(page), size: limit, pages: Math.ceil(count/limit) } } });
  } catch(e) { console.error('获取结算记录失败:', e); return res.status(500).json({ success:false, message:'获取结算记录失败' }); }
});

module.exports = router;
