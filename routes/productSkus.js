const express = require('express');
const router = express.Router({ mergeParams: true });
const { Product, ProductSku, OrderItem, AfterSaleItem, InventoryLog, sequelize } = require('../models');
const { authenticate } = require('../middleware/auth');
const { Op } = require('sequelize');

router.use(authenticate);

// 常用尺码模板
const SIZE_TEMPLATES = {
  apparel: ['XS','S','M','L','XL','XXL'],
  full: ['XS','S','M','L','XL','XXL','XXXL'],
  kids: ['100','110','120','130','140','150','160'],
  one: ['均码']
};

// 获取SKU列表（按尺码排序，颜色可为空）
router.get('/:productId/skus', async (req,res)=>{
  try {
    const { productId } = req.params;
    const product = await Product.findByPk(productId);
    if(!product) return res.status(404).json({ success:false, message:'商品不存在'});
    const list = await ProductSku.findAll({ where:{ product_id: productId }, order:[[ 'sort','ASC' ], [ 'size','ASC' ], [ 'id','ASC' ]] });
    return res.json({ success:true, data: list });
  } catch(e){ console.error('获取SKU失败', e);return res.status(500).json({ success:false, message:'服务器错误'}); }
});

// 批量创建SKU（仅尺码必填）
router.post('/:productId/skus/batch', async (req,res)=>{
  try {
    const { productId } = req.params; const items = Array.isArray(req.body)? req.body: req.body.items;
    if(!Array.isArray(items) || !items.length) return res.status(400).json({ success:false, message:'提交数据为空'});
    const product = await Product.findByPk(productId); if(!product) return res.status(404).json({ success:false, message:'商品不存在'});
    // 收集条码并查重
    const barcodes = items.map(i=>i.barcode).filter(Boolean);
    const existingBarcode = await ProductSku.findAll({ where:{ barcode:{ [Op.in]: barcodes } } });
    if(existingBarcode.length) return res.status(409).json({ success:false, message:`以下条码已存在: ${existingBarcode.map(b=>b.barcode).join(',')}` });
    // 仅尺码必填；颜色可选；价格强制与商品价一致
    for(const it of items){ if(!it.size || !it.barcode){ return res.status(400).json({ success:false, message:'size/barcode 不能为空'}); } }
    // 批量创建（统一价：retail_price 固定为商品价）
    const created = await ProductSku.bulkCreate(items.map(it=>({
      product_id: productId,
      size: it.size,
      color: it.color || '',
      barcode: it.barcode,
      sku_code: it.sku_code || null,
      retail_price: product.retail_price || 0,
      tag_price: it.tag_price || null,
      cost_price: it.cost_price || null,
      stock: it.stock || 0,
      sort: it.sort || 0,
      status: it.status || 'active'
    })));
    return res.json({ success:true, message:'批量创建成功', data: created });
  } catch(e){ console.error('批量创建SKU失败', e);return res.status(500).json({ success:false, message:'服务器错误'}); }
});

// 更新单个SKU（允许清空颜色）
router.put('/skus/:id', async (req,res)=>{
  try {
    const sku = await ProductSku.findByPk(req.params.id);
    if(!sku) return res.status(404).json({ success:false, message:'SKU不存在'});
    const allow = ['tag_price','cost_price','stock','locked_stock','status','sort','barcode','sku_code','color','size','reorder_threshold','reorder_target'];
    const data = {};
    for(const k of allow){ if(Object.prototype.hasOwnProperty.call(req.body, k)) data[k]=req.body[k]; }
    // 忽略零售价修改（统一价策略）
    // 若需要同步价格，请到商品处修改零售价
    if(data.barcode && data.barcode !== sku.barcode){
      const exists = await ProductSku.findOne({ where:{ barcode: data.barcode } });
      if(exists) return res.status(409).json({ success:false, message:'条码已存在' });
    }
    if(data.size === '') return res.status(400).json({ success:false, message:'size 不能为空'});
    if(data.color === undefined) {} else if(data.color === null) { data.color = '' } // 允许清空
    await sku.update(data);
    return res.json({ success:true, message:'更新成功', data: sku });
  } catch(e){ console.error('更新SKU失败', e);return res.status(500).json({ success:false, message:'服务器错误'}); }
});

// 修改状态
router.patch('/skus/:id/status', async (req,res)=>{
  try {
    const sku = await ProductSku.findByPk(req.params.id);
    if(!sku) return res.status(404).json({ success:false, message:'SKU不存在'});
    const { status } = req.body; if(!['active','disabled'].includes(status)) return res.status(400).json({ success:false, message:'非法状态'});
    await sku.update({ status });
    return res.json({ success:true, message:'状态已更新' });
  } catch(e){ console.error('修改SKU状态失败', e);return res.status(500).json({ success:false, message:'服务器错误'}); }
});

// 条码校验
router.get('/skus/check-barcode', async (req,res)=>{
  try { const { barcode } = req.query; if(!barcode) return res.status(400).json({ success:false, message:'barcode必填'});
    const exists = await ProductSku.findOne({ where:{ barcode } });
    return res.json({ success:true, data: { exists: !!exists } });
  } catch(e){ console.error('校验条码失败', e);return res.status(500).json({ success:false, message:'服务器错误'}); }
});

// 删除SKU
router.delete('/skus/:id', async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const id = req.params.id;
    const sku = await ProductSku.findByPk(id, { transaction: t, lock: t.LOCK.UPDATE });
    if (!sku) { await t.rollback(); return res.status(404).json({ success: false, message: 'SKU不存在' }); }

    // 库存/占用安全校验
    if ((sku.stock || 0) !== 0 || (sku.locked_stock || 0) !== 0) {
      await t.rollback();
      return res.status(400).json({ success: false, message: '库存或占用不为0，无法删除。请先盘点至0或释放占用。' });
    }

    // 检查是否存在引用
    const [oiCount, asCount, logCount] = await Promise.all([
      OrderItem.count({ where: { sku_id: id }, transaction: t }),
      AfterSaleItem.count({ where: { sku_id: id }, transaction: t }),
      InventoryLog.count({ where: { sku_id: id }, transaction: t }),
    ]);

    if (oiCount + asCount + logCount > 0) {
      // 将引用置空以保留历史记录完整性
      await Promise.all([
        OrderItem.update({ sku_id: null }, { where: { sku_id: id }, transaction: t }),
        AfterSaleItem.update({ sku_id: null }, { where: { sku_id: id }, transaction: t }),
        InventoryLog.update({ sku_id: null }, { where: { sku_id: id }, transaction: t }),
      ]);
    }

    await sku.destroy({ transaction: t });
    await t.commit();
    return res.json({ success: true, message: 'SKU已删除' });
  } catch (e) {
    await t.rollback();
    console.error('删除SKU失败', e);
    return res.status(500).json({ success: false, message: '服务器错误' });
  }
});

// 批量按尺码模板创建SKU（自动生成条码后缀）
router.post('/:productId/skus/batch-by-size', async (req,res)=>{
  try{
    const { productId } = req.params;
    const { template = 'apparel', baseBarcode, prefix, sizes, retail_price, stock=0 } = req.body || {};
    const product = await Product.findByPk(productId);
    if(!product) return res.status(404).json({ success:false, message:'商品不存在' });
    const sizeList = Array.isArray(sizes) && sizes.length ? sizes : (SIZE_TEMPLATES[template] || SIZE_TEMPLATES.apparel);
    if(!sizeList.length) return res.status(400).json({ success:false, message:'尺码列表为空' });

    // 读取已存在SKU，跳过已存在尺码，避免条码冲突
    const existing = await ProductSku.findAll({ where:{ product_id: productId }, attributes:['size','barcode'], order:[[ 'id','ASC' ]] });
    const existSizeSet = new Set(existing.map(e=>String(e.size)));
    const existBarcodeSet = new Set(existing.map(e=>String(e.barcode||'')));

    const genBarcode = (sz, idx)=>{
      if(baseBarcode) return `${baseBarcode}-${sz}`;
      if(prefix) return `${prefix}${sz}`;
      return `${product.code || 'P'}-${sz}-${Date.now()%10000}-${idx}`;
    };

    const items = [];
    let skipped = 0;
    sizeList.forEach((sz, idx)=>{
      const sizeStr = String(sz);
      if (existSizeSet.has(sizeStr)) { skipped++; return; }
      let bc = genBarcode(sizeStr, idx);
      // 规避条码冲突
      let tries = 0;
      while (existBarcodeSet.has(bc) && tries < 5){ bc = `${genBarcode(sizeStr, idx)}-${tries}`; tries++; }
      existBarcodeSet.add(bc);
      items.push({
        product_id: productId,
        size: sizeStr,
        color: '',
        barcode: bc,
        retail_price: (retail_price ?? product.retail_price) || 0,
        tag_price: null,
        cost_price: null,
        stock: Number(stock)||0,
        sort: idx,
        status: 'active'
      });
    });

    if (!items.length) return res.json({ success:true, message:`无可创建尺码（已存在或列表为空）。跳过 ${skipped} 个。`, data: { created: 0, skipped } });

    const resp = await ProductSku.bulkCreate(items);
    return res.json({ success:true, message:`已创建 ${resp.length} 条SKU，跳过 ${skipped} 条`, data: { created: resp.length, skipped } });
  }catch(e){ console.error('按尺码模板创建SKU失败', e); return res.status(500).json({ success:false, message:'服务器错误' }); }
});

// 复制其他商品的SKU（仅复制尺码/颜色/条码后缀自定义）
router.post('/:productId/skus/copy-from/:sourceProductId', async (req,res)=>{
  try{
    const { productId, sourceProductId } = req.params;
    const { barcodePrefix, keepBarcode=false } = req.body || {};
    const [target, source] = await Promise.all([Product.findByPk(productId), Product.findByPk(sourceProductId)]);
    if(!target || !source) return res.status(404).json({ success:false, message:'目标或来源商品不存在' });
    const srcSkus = await ProductSku.findAll({ where:{ product_id: sourceProductId }, order:[[ 'sort','ASC' ], [ 'id','ASC' ]] });
    if(!srcSkus.length) return res.status(400).json({ success:false, message:'来源商品无SKU可复制' });

    const items = srcSkus.map((s,idx)=>({
      product_id: productId,
      size: s.size,
      color: s.color || '',
      barcode: keepBarcode ? s.barcode : `${barcodePrefix || (target.code || 'P')}-${s.size}-${Date.now()%10000}-${idx}`,
      retail_price: target.retail_price || 0,
      tag_price: s.tag_price || null,
      cost_price: s.cost_price || null,
      stock: 0,
      sort: idx,
      status: 'active'
    }));

    const created = await ProductSku.bulkCreate(items);
    return res.json({ success:true, message:`已复制 ${created.length} 条SKU`, data: created });
  }catch(e){ console.error('复制SKU失败', e); return res.status(500).json({ success:false, message:'服务器错误' }); }
});

// 获取单商品的尺码库存（简版看板）- 带出阈值与目标
router.get('/:productId/sku-stocks', async (req,res)=>{
  try{
    const { productId } = req.params;
    const product = await Product.findByPk(productId);
    if(!product) return res.status(404).json({ success:false, message:'商品不存在' });
    const list = await ProductSku.findAll({ where:{ product_id: productId, status:'active' }, order:[[ 'size','ASC' ], [ 'id','ASC' ]] });
    const data = list.map(s=>({ id: s.id, size: s.size, stock: s.stock||0, locked: s.locked_stock||0, reorder_threshold: s.reorder_threshold ?? null, reorder_target: s.reorder_target ?? null }));
    return res.json({ success:true, data });
  }catch(e){ console.error('获取尺码库存失败', e); return res.status(500).json({ success:false, message:'服务器错误' }); }
});

// 新增：批量保存某商品所有 SKU 的阈值与目标
router.post('/:productId/skus/reorder-config', async (req,res)=>{
  try{
    const { productId } = req.params;
    const rows = Array.isArray(req.body) ? req.body : (req.body?.items || []);
    if(!rows.length) return res.status(400).json({ success:false, message:'提交数据为空' });
    const ids = rows.map(r=>Number(r.id)).filter(Boolean);
    const skus = await ProductSku.findAll({ where: { id: { [Op.in]: ids }, product_id: productId } });
    const skuMap = new Map(skus.map(s=>[Number(s.id), s]));
    let updated = 0;
    for(const r of rows){
      const id = Number(r.id); const th = r.reorder_threshold; const tgt = r.reorder_target;
      const sku = skuMap.get(id); if(!sku) continue;
      const patch = {};
      if (th === null || th === undefined) patch.reorder_threshold = null; else patch.reorder_threshold = Number(th);
      if (tgt === null || tgt === undefined) patch.reorder_target = null; else patch.reorder_target = Number(tgt);
      await sku.update(patch);
      updated++;
    }
    return res.json({ success:true, message:`已更新 ${updated} 条`, data: { updated } });
  }catch(e){ console.error('批量保存补货配置失败', e); return res.status(500).json({ success:false, message:'服务器错误' }); }
});

module.exports = router;
