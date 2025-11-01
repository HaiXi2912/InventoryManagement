const express = require('express');
const { Product, Inventory, ProductSku, sequelize } = require('../models');
const jwt = require('jsonwebtoken');
const router = express.Router();
const { Op } = require('sequelize');
// 服装类元数据（用于校验与前端选择）
const CLOTHING_CATEGORIES = ['T恤','衬衫','卫衣','外套','牛仔裤','连衣裙','半裙','羽绒服','运动套装','内衣','童装','配饰'];
const CLOTHING_SIZES = ['XS','S','M','L','XL','XXL','XXXL','100','110','120','130','140','150','160'];
const CLOTHING_COLORS = ['黑色','白色','红色','蓝色','绿色','黄色','粉色','紫色','灰色','卡其','藏青'];

// JWT校验中间件
function authMiddleware(req, res, next) {
  const token = req.headers['authorization']?.replace('Bearer ', '');
  console.log('[后端鉴权] 收到的 Authorization:', req.headers['authorization']);
  if (!token) {
    return res.status(401).json({ 
      success: false,
      message: '未登录或令牌缺失' 
    });
  }
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ 
      success: false,
      message: '令牌无效或已过期' 
    });
  }
}

// 简易角色校验
function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ success: false, message: '无权限' });
  }
  next();
}

// 获取商品列表
router.get('/', authMiddleware, async (req, res) => {
  try {
    const { page = 1, limit = 10, category, brand, status } = req.query;
    const perPage = parseInt(limit);
    const currentPage = parseInt(page);
    const offset = (currentPage - 1) * perPage;
    // 默认不按状态筛选，排除已删除(discontinued)；若显式传入status则按传入筛选
    const where = {};
    if (status) {
      where.status = status;
    } else {
      where.status = { [Op.ne]: 'discontinued' };
    }
    if (category) where.category = category;
    if (brand) where.brand = brand;
    const products = await Product.findAndCountAll({
      where,
      include: [
        { model: Inventory, as: 'inventory', attributes: ['current_stock', 'available_stock'] }
      ],
      limit: perPage,
      offset,
      // 修复：使用 Sequelize 默认时间戳字段 createdAt 排序，避免 Unknown column created_at 报错
      order: [['createdAt', 'DESC']]
    });
    
    // 批量查询每个商品的 SKU 库存总和，避免前端依赖聚合库存表
    const [skuSums] = await sequelize.query('SELECT product_id, SUM(stock) AS sum_stock FROM product_skus GROUP BY product_id');
    const skuSumMap = Object.create(null);
    (skuSums || []).forEach(r => { skuSumMap[String(r.product_id)] = Number(r.sum_stock || 0); });
    // 将汇总值附加到返回的每个商品实例中，字段名：sku_stock_sum
    products.rows.forEach(p => { p.setDataValue('sku_stock_sum', skuSumMap[String(p.id)] || 0); });
    
    res.json({
      success: true,
      data: {
        products: products.rows,
        pagination: {
          current_page: currentPage,
          total_pages: Math.ceil(products.count / perPage),
          total_count: products.count,
          per_page: perPage
        }
      }
    });
  } catch (err) {
    console.error('获取商品列表错误:', err);
    if (err instanceof Error && err.stack) {
      console.error('详细错误堆栈:', err.stack);
    }
    res.status(500).json({ 
      success: false,
      message: '服务器错误',
      error: err.message || err
    });
  }
});

// 服装类元数据供前端使用
router.get('/catalog/clothing/meta', authMiddleware, async (req, res) => {
  return res.json({
    success: true,
    data: {
      categories: CLOTHING_CATEGORIES,
      sizes: CLOTHING_SIZES,
      colors: CLOTHING_COLORS,
      unit: '件'
    }
  });
});

// 管理端：一键清理非服装类商品（软删除）
router.post('/cleanup/non-clothing', authMiddleware, requireAdmin, async (req, res) => {
  try {
    const [affected] = await Product.update(
      { status: 'discontinued' },
      { where: { category: { [Op.notIn]: CLOTHING_CATEGORIES } } }
    );
    return res.json({ success: true, message: '清理完成', data: { affected } });
  } catch (err) {
    console.error('清理非服装类商品失败:', err);
    return res.status(500).json({ success: false, message: '服务器错误' });
  }
});

// 获取单个商品详情
router.get('/:id', authMiddleware, async (req, res) => {
  try {
    const product = await Product.findByPk(req.params.id, {
      include: [
        { model: Inventory, as: 'inventory' }
      ]
    });
    
    if (!product) {
      return res.status(404).json({ 
        success: false,
        message: '商品不存在' 
      });
    }
    
    res.json({
      success: true,
      data: { product }
    });
  } catch (err) {
    console.error('获取商品详情错误:', err);
    res.status(500).json({ 
      success: false,
      message: '服务器错误' 
    });
  }
});

// 创建商品
router.post('/', authMiddleware, async (req, res) => {
  try {
    const {
      name,
      code,
      barcode,
      category,
      brand,
      // color/size 不再强制，商品只是容器
      color,
      size,
      material,
      season,
      gender,
      purchase_price,
      wholesale_price,
      retail_price,
      unit,
      min_stock,
      max_stock,
      weight,
      image_url,
      description,
      status
      // 已移除: supplier_id
    } = req.body;

    // 最小必填：名称
    if (!name) {
      return res.status(400).json({ success: false, message: '商品名称必填' });
    }

    // 价格区间（若提交）
    if (purchase_price != null && wholesale_price != null && Number(purchase_price) > Number(wholesale_price)) {
      return res.status(400).json({ success: false, message: '进货价不可高于批发价' });
    }
    if (wholesale_price != null && retail_price != null && Number(wholesale_price) > Number(retail_price)) {
      return res.status(400).json({ success: false, message: '批发价不可高于零售价' });
    }

    // code 可选；若未提供则生成唯一编码
    let finalCode = code && String(code).trim();
    if (!finalCode) {
      for (let i = 0; i < 3; i++) {
        const candidate = `P${Date.now()}${Math.floor(Math.random()*1000).toString().padStart(3,'0')}`;
        const exists = await Product.findOne({ where: { code: candidate } });
        if (!exists) { finalCode = candidate; break; }
      }
      if (!finalCode) finalCode = `P${Date.now()}`;
    } else {
      const existingProduct = await Product.findOne({ where: { code: finalCode } });
      if (existingProduct) {
        return res.status(409).json({ success: false, message: '商品编码已存在' });
      }
    }

    // barcode 可选；若提交则校验唯一
    let finalBarcode = barcode && String(barcode).trim();
    if (finalBarcode) {
      const existingBarcode = await Product.findOne({ where: { barcode: finalBarcode } });
      if (existingBarcode) {
        return res.status(409).json({ success: false, message: '条形码已存在' });
      }
    } else {
      finalBarcode = null;
    }

    // 分类不再强制限定到 CLOTHING_CATEGORIES，允许自由填写/选择
    const product = await Product.create({
      name,
      code: finalCode,
      barcode: finalBarcode,
      category: category || null,
      brand: brand || null,
      color: color || null,
      size: size || null,
      material: material || null,
      season: season || null,
      gender: gender || null,
      purchase_price: purchase_price ?? null,
      wholesale_price: wholesale_price ?? null,
      retail_price: retail_price ?? 0,
      unit: unit || '件',
      min_stock: min_stock ?? 0,
      max_stock: max_stock ?? null,
      weight: weight ?? null,
      image_url: image_url || null,
      description: description || null,
      status: status || 'active'
      // 已移除: supplier_id
    });

    // 初始化聚合库存记录（用于兼容历史统计），SKU 库存独立管理
    await Inventory.create({
      product_id: product.id,
      warehouse_location: '默认仓库',
      current_stock: 0,
      available_stock: 0,
      reserved_stock: 0,
      average_cost: purchase_price || 0,
      total_value: 0
    });

    res.status(201).json({ success: true, message: '商品创建成功', data: { product } });
  } catch (err) {
    console.error('创建商品错误:', err);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

// 更新商品（同步SKU价格 = 商品零售价）
router.put('/:id', authMiddleware, async (req, res) => {
  try {
    const product = await Product.findByPk(req.params.id);
    console.log('[商品修改] 修改前数据:', product?.toJSON?.());
    if (!product) {
      return res.status(404).json({ success: false, message: '商品不存在' });
    }
    // 如果要更新商品编码，检查是否已存在
    if (req.body.code && req.body.code !== product.code) {
      const existingProduct = await Product.findOne({ where: { code: req.body.code } });
      if (existingProduct) {
        return res.status(409).json({ 
          success: false,
          message: '商品编码已存在' 
        });
      }
    }
    // 如果要更新条形码，检查是否已存在
    if (req.body.barcode && req.body.barcode !== product.barcode) {
      const existingBarcode = await Product.findOne({ where: { barcode: req.body.barcode } });
      if (existingBarcode) {
        return res.status(409).json({ success: false, message: '条形码已存在' });
      }
    }
    // 仅允许更新白名单内字段（含 barcode）
    const allow = ['name','category','brand','retail_price','wholesale_price','purchase_price','min_stock','max_stock','status','image_url','description','barcode','size','color'];
    const data = {};
    for (const k of allow) {
      if (Object.prototype.hasOwnProperty.call(req.body, k)) {
        data[k] = req.body[k];
      }
    }
    // 条形码非空（若提交更新）
    if (Object.prototype.hasOwnProperty.call(data, 'barcode') && !data.barcode) {
      return res.status(400).json({ success: false, message: '条形码不能为空' });
    }
    // 服装类校验（若提交了相关字段）
    if (data.category && !CLOTHING_CATEGORIES.includes(data.category)) {
      return res.status(400).json({ success: false, message: `分类必须为服装类: ${CLOTHING_CATEGORIES.join(', ')}` });
    }
    if (req.body.size && !CLOTHING_SIZES.includes(req.body.size)) {
      return res.status(400).json({ success: false, message: `尺码必须为: ${CLOTHING_SIZES.join(', ')}` });
    }
    if (req.body.color && !CLOTHING_COLORS.includes(req.body.color)) {
      return res.status(400).json({ success: false, message: `颜色必须为: ${CLOTHING_COLORS.join(', ')}` });
    }
    if (data.purchase_price != null && product.wholesale_price != null && Number(data.purchase_price) > Number(product.wholesale_price)) {
      return res.status(400).json({ success: false, message: '进货价不可高于批发价' });
    }
    if (data.wholesale_price != null && (data.retail_price != null ? Number(data.wholesale_price) > Number(data.retail_price) : Number(data.wholesale_price) > Number(product.retail_price))) {
      return res.status(400).json({ success: false, message: '批发价不可高于零售价' });
    }
    const updateResult = await product.update(data);
    console.log('[商品修改] update结果:', updateResult?.toJSON?.());

    // 新增：若更新了商品零售价，则同步到所有 SKU（不同尺码同价）
    if (Object.prototype.hasOwnProperty.call(data, 'retail_price')) {
      try {
        await ProductSku.update(
          { retail_price: data.retail_price },
          { where: { product_id: product.id } }
        );
        console.log(`[商品修改] 已同步所有SKU零售价为 ${data.retail_price}`);
      } catch (e) {
        console.error('[商品修改] 同步SKU零售价失败:', e);
      }
    }

    // 再查一次数据库，确认最新数据
    const latestProduct = await Product.findByPk(req.params.id);
    console.log('[商品修改] 修改后数据库数据:', latestProduct?.toJSON?.());
    res.json({ success: true, message: '商品更新成功', data: { product: latestProduct } });
  } catch (err) {
    console.error('更新商品错误:', err);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

// 删除商品（软删除）
router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    const product = await Product.findByPk(req.params.id);
    
    if (!product) {
      return res.status(404).json({ 
        success: false,
        message: '商品不存在' 
      });
    }
    
    await product.update({ status: 'discontinued' });
    
    res.json({
      success: true,
      message: '商品删除成功'
    });
  } catch (err) {
    console.error('删除商品错误:', err);
    res.status(500).json({ 
      success: false,
      message: '服务器错误' 
    });
  }
});

// 获取商品分类列表
router.get('/categories/list', authMiddleware, async (req, res) => {
  try {
    const categories = await Product.findAll({
      attributes: ['category'],
      where: { status: 'active' },
      group: ['category'],
      raw: true
    });
    
    res.json({
      success: true,
      data: { categories: categories.map(item => item.category).filter(Boolean) }
    });
  } catch (err) {
    console.error('获取商品分类错误:', err);
    res.status(500).json({ 
      success: false,
      message: '服务器错误' 
    });
  }
});

// 获取品牌列表
router.get('/brands/list', authMiddleware, async (req, res) => {
  try {
    const brands = await Product.findAll({
      attributes: ['brand'],
      where: { status: 'active' },
      group: ['brand'],
      raw: true
    });
    
    res.json({
      success: true,
      data: { brands: brands.map(item => item.brand).filter(Boolean) }
    });
  } catch (err) {
    console.error('获取品牌列表错误:', err);
    res.status(500).json({ 
      success: false,
      message: '服务器错误' 
    });
  }
});

module.exports = router;
