const express = require('express');
const { Op } = require('sequelize');
const { Product, ProductMedia, ProductSku, ProductContent, Inventory } = require('../models');
const { apiLimiter } = require('../middleware/validation');

const router = express.Router();

// 商城目录：产品分页列表（公开接口）
router.get('/', apiLimiter, async (req, res) => {
  try {
    const page = Math.max(parseInt(req.query.page || '1', 10), 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit || '10', 10), 1), 100);
    const offset = (page - 1) * limit;

    const { q, category, brand, minPrice, maxPrice } = req.query || {};

    const where = { status: 'active' };
    if (q) {
      const kw = String(q).trim();
      if (kw) where[Op.or] = [
        { name: { [Op.like]: `%${kw}%` } },
        { code: { [Op.like]: `%${kw}%` } },
        { barcode: { [Op.like]: `%${kw}%` } },
      ];
    }
    if (category) where.category = category;
    if (brand) where.brand = brand;
    if (minPrice != null || maxPrice != null) {
      where.retail_price = {};
      if (minPrice != null) where.retail_price[Op.gte] = Number(minPrice);
      if (maxPrice != null) where.retail_price[Op.lte] = Number(maxPrice);
    }

    const { count, rows } = await Product.findAndCountAll({
      where,
      attributes: [
        'id','name','code','barcode','category','brand','retail_price','status','createdAt','updatedAt'
      ],
      include: [
        {
          model: ProductMedia,
          as: 'media',
          attributes: ['id','url','thumb_url','is_main','sort'],
          where: { is_main: true },
          required: false,
        },
        { model: Inventory, as: 'inventory', attributes: ['current_stock', 'available_stock'] }
      ],
      limit,
      offset,
      order: [['createdAt', 'DESC']],
    });

    // 统一首图字段，便于前端使用
    const items = rows.map(p => {
      const json = p.toJSON();
      json.cover = json.media && json.media.length > 0 ? json.media[0].url : json.image_url || null;
      delete json.media;
      return json;
    });

    return res.json({
      success: true,
      data: {
        items,
        pagination: {
          current_page: page,
          per_page: limit,
          total_count: count,
          total_pages: Math.ceil(count / limit),
        },
      },
    });
  } catch (err) {
    console.error('[catalog] 列表失败:', err);
    return res.status(500).json({ success: false, message: '服务器错误' });
  }
});

// 商城目录：产品详情（公开接口）
router.get('/:id', apiLimiter, async (req, res) => {
  try {
    const id = req.params.id;
    const product = await Product.findByPk(id, {
      include: [
        { model: ProductMedia, as: 'media', attributes: ['id','url','thumb_url','is_main','sort'], required: false, order: [['is_main','DESC'],['sort','ASC'],['id','ASC']] },
        { model: ProductSku, as: 'skus', attributes: ['id','sku_code','color','size','stock','retail_price'] },
        { model: ProductContent, as: 'content', attributes: ['id','description','detail_html'] },
        { model: Inventory, as: 'inventory' }
      ],
    });
    if (!product || product.status === 'discontinued') {
      return res.status(404).json({ success: false, message: '商品不存在' });
    }
    return res.json({ success: true, data: { product } });
  } catch (err) {
    console.error('[catalog] 详情失败:', err);
    return res.status(500).json({ success: false, message: '服务器错误' });
  }
});

module.exports = router;
