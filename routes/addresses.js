const express = require('express');
const router = express.Router();
const { Address } = require('../models');
const { authenticate } = require('../middleware/auth');

router.use(authenticate);

// 列表
router.get('/', async (req,res)=>{
  const list = await Address.findAll({ where:{ user_id: req.user.id }, order:[['is_default','DESC'],['id','DESC']] });
  res.json({ success:true, data: list });
});

// 新增
router.post('/', async (req,res)=>{
  const data = req.body || {}; data.user_id = req.user.id;
  if(data.is_default){ await Address.update({ is_default:false }, { where:{ user_id: req.user.id } }); }
  const created = await Address.create(data);
  res.status(201).json({ success:true, message:'创建成功', data: created });
});

// 更新
router.put('/:id', async (req,res)=>{
  const addr = await Address.findOne({ where:{ id: req.params.id, user_id: req.user.id } });
  if(!addr) return res.status(404).json({ success:false, message:'地址不存在' });
  const patch = req.body||{};
  if(patch.is_default){ await Address.update({ is_default:false }, { where:{ user_id: req.user.id } }); }
  await addr.update(patch);
  res.json({ success:true, message:'更新成功', data: addr });
});

// 删除
router.delete('/:id', async (req,res)=>{
  const addr = await Address.findOne({ where:{ id: req.params.id, user_id: req.user.id } });
  if(!addr) return res.status(404).json({ success:false, message:'地址不存在' });
  await addr.destroy();
  res.json({ success:true, message:'已删除' });
});

// 设为默认
router.post('/:id/default', async (req,res)=>{
  const addr = await Address.findOne({ where:{ id: req.params.id, user_id: req.user.id } });
  if(!addr) return res.status(404).json({ success:false, message:'地址不存在' });
  await Address.update({ is_default:false }, { where:{ user_id: req.user.id } });
  await addr.update({ is_default:true });
  res.json({ success:true, message:'已设为默认' });
});

module.exports = router;
