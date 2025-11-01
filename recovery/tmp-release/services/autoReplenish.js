const { sequelize, Product, ProductSku, FactoryOrder, FactoryOrderDetail } = require('../models');

// 读取 SKU 的阈值与目标（fallback：SKU -> Product.min_stock/plan -> 参数 -> 默认）
function getThresholdAndTarget({ sku, product, defaultThreshold = 5, defaultPlan = 20 }){
  const threshold = Number(sku?.reorder_threshold ?? product?.min_stock ?? defaultThreshold);
  const targetBase = sku?.reorder_target != null ? Number(sku.reorder_target) : null;
  const plan = Number(product?.replenish_plan || 0);
  const target = targetBase != null ? targetBase : (plan > 0 ? plan : Math.max(defaultPlan, threshold * 2));
  return { threshold, target };
}

async function createFactoryOrderAuto(items, { operatorId, remark }){
  if (!items.length) return null;
  const t = await sequelize.transaction();
  try {
    const order_no = `FO${new Date().toISOString().replace(/[-:.TZ]/g,'').slice(0,14)}`;
    const fo = await FactoryOrder.create({ order_no, status:'approved', source:'auto_replenish', expedite:false, total_cost:0, shipping_fee:0, remark: remark || '自动补货', operator_id: operatorId || null }, { transaction: t });
    let total = 0;
    for(const it of items){ const sub = Number(it.quantity||0) * Number(it.unit_cost||0); total += sub; await FactoryOrderDetail.create({ order_id: fo.id, ...it, subtotal_cost: sub }, { transaction: t }); }
    await fo.update({ total_cost: total }, { transaction: t });
    await t.commit();
    return fo;
  } catch (e){ if (!t.finished) await t.rollback(); throw e; }
}

// 根据指定 SKU 列表检查并创建自动补货单
async function checkAndReplenishBySkus(affectedSkus, { defaultThreshold = 5, defaultPlan = 20, operatorId, reasonRemark } = {}){
  if (!Array.isArray(affectedSkus) || !affectedSkus.length) return null;
  const items = [];
  for (const a of affectedSkus){
    let sku = null;
    if (a.sku_id) sku = await ProductSku.findByPk(a.sku_id);
    if (!sku && a.product_id && a.size) sku = await ProductSku.findOne({ where: { product_id: a.product_id, size: a.size } });
    if (!sku) continue;
    const product = await Product.findByPk(sku.product_id);
    const { threshold, target } = getThresholdAndTarget({ sku, product, defaultThreshold, defaultPlan });
    const stock = Number(sku.stock||0);
    if (threshold > 0 && stock < threshold){
      const qty = Math.max(target - stock, 0);
      if (qty > 0){
        const unit_cost = Number(product?.purchase_price || sku.cost_price || 0);
        items.push({ product_id: sku.product_id, sku_id: sku.id, size: sku.size, quantity: qty, unit_cost });
      }
    }
  }
  if (!items.length) return null;
  return await createFactoryOrderAuto(items, { operatorId, remark: reasonRemark });
}

module.exports = { getThresholdAndTarget, checkAndReplenishBySkus };
