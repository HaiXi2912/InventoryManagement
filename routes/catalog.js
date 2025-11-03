const express = require('express');
const { Op } = require('sequelize');
const { Product, ProductMedia, ProductSku, ProductContent, Inventory } = require('../models');
const { apiLimiter } = require('../middleware/validation');

const router = express.Router();

// 商城目录：产品分页列表（公开接口）
router.get('/', apiLimiter, async (req, res) => {
  try {
    const page = Math.max(parseInt(req.query.page || '1', 10), 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit || '12', 10), 1), 100);
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
        'id','name','code','barcode','category','brand','retail_price','status','createdAt','updatedAt','image_url'
      ],
      include: [
        {
          model: ProductMedia,
          as: 'media',
          attributes: ['id','url','thumb_url','is_main','sort'],
          required: false,
        },
        { model: Inventory, as: 'inventory', attributes: ['current_stock', 'available_stock'], required: false }
      ],
      limit,
      offset,
      order: [['createdAt', 'DESC']],
    });

    return res.json({
      success: true,
      data: {
        items: rows,
        pagination: { total: count, page, limit },
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
        { model: ProductMedia, as: 'media', attributes: ['id','url','thumb_url','is_main','sort'], required: false },
        { model: ProductSku, as: 'skus', attributes: ['id','sku_code','color','size','stock','locked_stock','retail_price','wholesale_price','tag_price'] },
        { model: ProductContent, as: 'content', attributes: ['id','mobile_html','rich_html','seo_title','seo_keywords','seo_desc'], required: false },
        { model: Inventory, as: 'inventory', required: false }
      ],
    });
    if (!product || product.status !== 'active') {
      return res.status(404).json({ success: false, message: '商品不存在' });
    }
    // 对媒体排序
    try {
      if (Array.isArray(product.media)) {
        product.media.sort((a, b) => {
          const aMain = a.is_main ? 1 : 0;
          const bMain = b.is_main ? 1 : 0;
          if (bMain !== aMain) return bMain - aMain;
          const aSort = Number(a.sort || 0), bSort = Number(b.sort || 0);
          if (aSort !== bSort) return aSort - bSort;
          return Number(a.id) - Number(b.id);
        });
      }
    } catch {}
    return res.json({ success: true, data: product });
  } catch (err) {
    const msg = (process.env.NODE_ENV !== 'production') ? (err && err.message) : '服务器错误'
    console.error('[catalog] 详情失败，降级到 media+skus:', err && err.stack || err)
    try {
      const id = req.params.id;
      const product = await Product.findByPk(id, {
        include: [
          { model: ProductMedia, as: 'media', attributes: ['id','url','thumb_url','is_main','sort'], required: false },
          { model: ProductSku, as: 'skus', attributes: ['id','sku_code','color','size','stock','locked_stock','retail_price','wholesale_price','tag_price'] },
        ],
      });
      if (!product || product.status !== 'active') {
        return res.status(404).json({ success: false, message: '商品不存在' });
      }
      try {
        if (Array.isArray(product.media)) {
          product.media.sort((a, b) => {
            const aMain = a.is_main ? 1 : 0;
            const bMain = b.is_main ? 1 : 0;
            if (bMain !== aMain) return bMain - aMain;
            const aSort = Number(a.sort || 0), bSort = Number(b.sort || 0);
            if (aSort !== bSort) return aSort - bSort;
            return Number(a.id) - Number(b.id);
          });
        }
      } catch {}
      return res.json({ success: true, data: product, degraded: true });
    } catch (e2) {
      console.error('[catalog] 详情二级降级失败，降到基础信息:', e2 && e2.stack || e2)
      try {
        const id = req.params.id;
        const p = await Product.findByPk(id);
        if (!p || p.status !== 'active') return res.status(404).json({ success: false, message: '商品不存在' });
        const minimal = p.toJSON ? p.toJSON() : p;
        minimal.media = [];
        minimal.skus = [];
        minimal.content = null;
        return res.json({ success: true, data: minimal, degraded: 'minimal' });
      } catch (e3) {
        console.error('[catalog] 详情三级降级仍失败:', e3 && e3.stack || e3)
        return res.status(500).json({ success: false, message: msg, error: e3 && e3.message })
      }
    }
  }
});

module.exports = router;
