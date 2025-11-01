const express = require('express');
const router = express.Router({ mergeParams: true });
const { Product, ProductContent } = require('../models');
const { authenticate } = require('../middleware/auth');

router.use(authenticate);

// 获取内容
router.get('/:productId/content', async (req,res)=>{
  try {
    const { productId } = req.params;
    const product = await Product.findByPk(productId, { include: [{ model: ProductContent, as: 'content' }] });
    if(!product) return res.status(404).json({ success:false, message: '商品不存在' });
    return res.json({ success:true, data: product.content || null });
  } catch(e){
    console.error('获取商品内容失败', e);return res.status(500).json({ success:false, message:'服务器错误'});
  }
});

// 保存/更新
router.post('/:productId/content', async (req,res)=>{
  try {
    const { productId } = req.params;
    const { rich_html, mobile_html, seo_title, seo_keywords, seo_desc } = req.body;
    const product = await Product.findByPk(productId);
    if(!product) return res.status(404).json({ success:false, message:'商品不存在'});
    let record = await ProductContent.findOne({ where:{ product_id: productId } });
    if(!record){
      record = await ProductContent.create({ product_id: productId, rich_html, mobile_html, seo_title, seo_keywords, seo_desc });
    } else {
      await record.update({ rich_html, mobile_html, seo_title, seo_keywords, seo_desc });
    }
    return res.json({ success:true, message:'保存成功', data: record });
  } catch(e){
    console.error('保存商品内容失败', e);return res.status(500).json({ success:false, message:'服务器错误'});
  }
});

module.exports = router;
