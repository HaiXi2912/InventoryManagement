/*
  重置数据库到“按尺码(SKU)为主”的库存模式：
  - 清空与 SKU 相关的流水引用（将外键置空）
  - 删除全部 ProductSku 记录（不使用 TRUNCATE 以规避 FK）
  - 为每个商品生成若干尺码 SKU（默认 S/M/L/XL 或 100/110/120 for 儿童）
  - 将聚合库存(Inventory)设为各 SKU 之和（可选保留，用作汇总展示）
*/

const { sequelize, Product, ProductSku, Inventory, InventoryLog, OrderItem, AfterSaleItem, FactoryOrderDetail } = require('../models')

const ADULT_SIZES = ['S','M','L','XL']
const KIDS_SIZES  = ['100','110','120']

function makeSkuCode(product, size, idx){
  const base = (product.code || ('P'+product.id))
  return `${base}-${size}-${String(idx+1).padStart(2,'0')}`
}

function makeBarcode(product, size, idx){
  // 简易生成，避免冲突：产品ID + size + 递增
  return `${product.id}${size}${String(idx+1).padStart(3,'0')}`.replace(/[^0-9A-Za-z]/g,'').slice(0,50)
}

async function resetSkuInventory(){
  console.log('🔄 开始重置为 SKU 尺码库存模式...')
  const t = await sequelize.transaction()
  try {
    // 1) 清空库存流水（可直接清表）
    console.log(' - 清空库存流水 InventoryLog ...')
    await InventoryLog.destroy({ where: {}, transaction: t })

    // 2) 解除外键引用（置空 sku_id）
    console.log(' - 解除外键引用: OrderItem/AfterSaleItem/FactoryOrderDetail ...')
    try { await OrderItem.update({ sku_id: null }, { where: { sku_id: { [sequelize.Op.ne]: null } }, transaction: t }) } catch(_) {}
    try { await AfterSaleItem.update({ sku_id: null }, { where: { sku_id: { [sequelize.Op.ne]: null } }, transaction: t }) } catch(_) {}
    try { await FactoryOrderDetail.update({ sku_id: null }, { where: { sku_id: { [sequelize.Op.ne]: null } }, transaction: t }) } catch(_) {}

    // 3) 删除所有 SKU（不使用 TRUNCATE，规避 FK）
    console.log(' - 删除现有 ProductSku ...')
    await ProductSku.destroy({ where: {}, transaction: t })

    // 4) 为每个商品生成 SKU 并分配库存
    console.log(' - 为每个商品生成默认尺码 SKU 并分配库存 ...')
    const products = await Product.findAll({ transaction: t })
    for(const p of products){
      let baseStock = 0
      try {
        const inv = await Inventory.findOne({ where:{ product_id: p.id }, transaction: t })
        baseStock = Number(inv?.current_stock || 0)
      } catch(_) {}
      if (!Number.isFinite(baseStock) || baseStock <= 0) baseStock = 20

      const isKids = ['童装','儿童','kids','child','children'].some(k => String(p.category||'').toLowerCase().includes(k))
      const sizes = isKids ? KIDS_SIZES : ADULT_SIZES

      const per = Math.max(1, Math.floor(baseStock / sizes.length))
      let remain = baseStock

      const created = []
      for(let i=0;i<sizes.length;i++){
        const size = sizes[i]
        const alloc = i === sizes.length - 1 ? remain : per
        remain -= alloc
        const sku = await ProductSku.create({
          product_id: p.id,
          size,
          color: '',
          barcode: makeBarcode(p, size, i),
          sku_code: makeSkuCode(p, size, i),
          retail_price: p.retail_price || 0,
          wholesale_price: p.wholesale_price || null,
          cost_price: p.purchase_price || null,
          stock: alloc,
          locked_stock: 0,
          status: 'active',
          sort: i
        }, { transaction: t })
        created.push(sku)
      }

      // 5) 更新聚合库存为 SKU 之和
      const sum = created.reduce((a,b)=> a + Number(b.stock||0), 0)
      const avgCost = Number(p.purchase_price || 0)
      const value = avgCost * sum
      const [row, createdInv] = await Inventory.findOrCreate({
        where: { product_id: p.id, warehouse_location: '默认仓库' },
        defaults: { current_stock: sum, available_stock: sum, reserved_stock: 0, average_cost: avgCost, total_value: value },
        transaction: t
      })
      if(!createdInv){
        await row.update({ current_stock: sum, available_stock: sum, reserved_stock: 0, average_cost: avgCost, total_value: value }, { transaction: t })
      }
    }

    await t.commit()
    console.log('✅ 已完成 SKU 库存模式重置。')
  } catch (e){
    await t.rollback()
    console.error('❌ 重置失败:', e)
    process.exitCode = 1
  } finally {
    await sequelize.close()
  }
}

if (require.main === module) {
  resetSkuInventory()
}

module.exports = { resetSkuInventory }
