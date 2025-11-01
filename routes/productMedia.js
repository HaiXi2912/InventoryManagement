const express = require('express');
const router = express.Router({ mergeParams: true });
const { Product, ProductMedia } = require('../models');
const { authenticate, authorize } = require('../middleware/auth');
const path = require('path');
const fs = require('fs');
const multer = require('multer');

// 存储到 public/uploads，按日期分目录
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const today = new Date();
    const dir = path.join(process.cwd(), 'public', 'uploads', `${today.getFullYear()}-${today.getMonth()+1}-${today.getDate()}`);
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: function (req, file, cb) {
    const ext = path.extname(file.originalname || '') || '.jpg';
    const name = `${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`;
    cb(null, name);
  }
});
const upload = multer({ storage });

// 获取媒体列表（登录可读）
router.get('/:productId/media', authenticate, async (req,res)=>{
  try {
    const { productId } = req.params;
    const product = await Product.findByPk(productId);
    if(!product) return res.status(404).json({ success:false, message:'商品不存在'});
    const list = await ProductMedia.findAll({ where:{ product_id: productId }, order:[['sort','ASC'],['id','ASC']] });
    return res.json({ success:true, data: list });
  } catch(e){ console.error('获取媒体失败', e);return res.status(500).json({ success:false, message:'服务器错误'}); }
});

// 新增媒体（方式一：直接传 url）- 仅管理员/经理
router.post('/:productId/media', authenticate, authorize(['admin','manager']), async (req,res)=>{
  try {
    const { productId } = req.params; const { url, type='image', thumb_url } = req.body;
    if(!url) return res.status(400).json({ success:false, message:'url必填'});
    const product = await Product.findByPk(productId); if(!product) return res.status(404).json({ success:false, message:'商品不存在'});
    const media = await ProductMedia.create({ product_id: productId, url, type, thumb_url });
    return res.json({ success:true, message:'创建成功', data: media });
  } catch(e){ console.error('新增媒体失败', e);return res.status(500).json({ success:false, message:'服务器错误'}); }
});

// 新增媒体（方式二：上传图片文件）- 仅管理员/经理
router.post('/:productId/media/upload', authenticate, authorize(['admin','manager']), upload.single('file'), async (req,res)=>{
  try {
    const { productId } = req.params;
    const product = await Product.findByPk(productId); if(!product) return res.status(404).json({ success:false, message:'商品不存在'});
    if(!req.file) return res.status(400).json({ success:false, message:'未接收到文件'});
    const rel = req.file.path.replace(path.join(process.cwd(),'public'), '').replace(/\\/g,'/');
    const url = `/static${rel}`;
    const media = await ProductMedia.create({ product_id: productId, url, type:'image' });
    return res.status(201).json({ success:true, message:'上传成功', data: media });
  } catch(e){ console.error('上传媒体失败', e);return res.status(500).json({ success:false, message:'服务器错误'}); }
});

// 更新排序/主图 - 仅管理员/经理
router.put('/media/:mediaId', authenticate, authorize(['admin','manager']), async (req,res)=>{
  try {
    const { mediaId } = req.params; const { sort, is_main } = req.body;
    const media = await ProductMedia.findByPk(mediaId); if(!media) return res.status(404).json({ success:false, message:'资源不存在'});
    if(is_main){ await ProductMedia.update({ is_main:false }, { where:{ product_id: media.product_id } }); }
    await media.update({ sort: sort!=null? sort: media.sort, is_main: is_main!=null? !!is_main: media.is_main });
    return res.json({ success:true, message:'更新成功', data: media });
  } catch(e){ console.error('更新媒体失败', e);return res.status(500).json({ success:false, message:'服务器错误'}); }
});

// 删除 - 仅管理员/经理
router.delete('/media/:mediaId', authenticate, authorize(['admin','manager']), async (req,res)=>{
  try {
    const { mediaId } = req.params;
    const media = await ProductMedia.findByPk(mediaId); if(!media) return res.status(404).json({ success:false, message:'资源不存在'});
    await media.destroy();
    return res.json({ success:true, message:'删除成功' });
  } catch(e){ console.error('删除媒体失败', e);return res.status(500).json({ success:false, message:'服务器错误'}); }
});

module.exports = router;
