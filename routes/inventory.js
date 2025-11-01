const express = require('express');
const { Inventory, Product } = require('../models');
const jwt = require('jsonwebtoken');
const router = express.Router();

// JWT校验中间件
function authMiddleware(req, res, next) {
  const token = req.headers['authorization']?.replace('Bearer ', '');
  
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

// 获取库存列表
router.get('/', authMiddleware, async (req, res) => {
  try {
    const { page = 1, limit = 10, warehouse_location, low_stock } = req.query;
    const offset = (page - 1) * limit;
    
    let where = {};
    if (warehouse_location) where.warehouse_location = warehouse_location;
    
    const inventory = await Inventory.findAndCountAll({
      where,
      include: [
        { 
          model: Product, 
          as: 'product',
          attributes: ['id', 'name', 'code', 'category', 'brand', 'unit', 'min_stock', 'max_stock']
        }
      ],
      limit: parseInt(limit),
      offset: parseInt(offset),
      order: [['updated_at', 'DESC']]
    });
    
    // 如果需要筛选低库存商品
    let filteredRows = inventory.rows;
    if (low_stock === 'true') {
      filteredRows = inventory.rows.filter(item => 
        item.current_stock <= (item.product?.min_stock || 0)
      );
    }
    
    res.json({
      success: true,
      data: {
        inventory: filteredRows,
        pagination: {
          current_page: parseInt(page),
          total_pages: Math.ceil(inventory.count / limit),
          total_count: inventory.count,
          per_page: parseInt(limit)
        },
        low_stock_count: inventory.rows.filter(item => 
          item.current_stock <= (item.product?.min_stock || 0)
        ).length
      }
    });
  } catch (err) {
    console.error('获取库存列表错误:', err);
    res.status(500).json({ 
      success: false,
      message: '服务器错误' 
    });
  }
});

// 获取单个商品库存详情
router.get('/product/:productId', authMiddleware, async (req, res) => {
  try {
    const inventory = await Inventory.findOne({
      where: { product_id: req.params.productId },
      include: [
        { 
          model: Product, 
          as: 'product'
        }
      ]
    });
    
    if (!inventory) {
      return res.status(404).json({ 
        success: false,
        message: '库存记录不存在' 
      });
    }
    
    res.json({
      success: true,
      data: { inventory }
    });
  } catch (err) {
    console.error('获取库存详情错误:', err);
    res.status(500).json({ 
      success: false,
      message: '服务器错误' 
    });
  }
});

// 库存调整
router.post('/adjust', authMiddleware, async (req, res) => {
  try {
    const { product_id, adjustment_type, quantity, reason, warehouse_location = '默认仓库' } = req.body;
    
    if (!product_id || !adjustment_type || !quantity) {
      return res.status(400).json({ 
        success: false,
        message: '商品ID、调整类型和数量必填' 
      });
    }
    
    if (!['in', 'out'].includes(adjustment_type)) {
      return res.status(400).json({ 
        success: false,
        message: '调整类型必须是 in（入库）或 out（出库）' 
      });
    }
    
    const inventory = await Inventory.findOne({
      where: { product_id, warehouse_location },
      include: [{ model: Product, as: 'product' }]
    });
    
    if (!inventory) {
      return res.status(404).json({ 
        success: false,
        message: '库存记录不存在' 
      });
    }
    
    const adjustmentQuantity = adjustment_type === 'in' ? quantity : -quantity;
    const newStock = inventory.current_stock + adjustmentQuantity;
    
    if (newStock < 0) {
      return res.status(400).json({ 
        success: false,
        message: '库存不足，无法执行出库操作' 
      });
    }
    
    // 更新库存
    await inventory.update({
      current_stock: newStock,
      available_stock: newStock - inventory.reserved_stock,
      total_value: newStock * inventory.average_cost
    });
    
    res.json({
      success: true,
      message: `库存${adjustment_type === 'in' ? '入库' : '出库'}成功`,
      data: { 
        inventory,
        adjustment: {
          type: adjustment_type,
          quantity: quantity,
          reason: reason || '',
          operator: req.user.username,
          timestamp: new Date()
        }
      }
    });
  } catch (err) {
    console.error('库存调整错误:', err);
    res.status(500).json({ 
      success: false,
      message: '服务器错误' 
    });
  }
});

// 库存盘点
router.post('/stocktake', authMiddleware, async (req, res) => {
  try {
    const { product_id, actual_stock, warehouse_location = '默认仓库', remark } = req.body;
    
    if (!product_id || actual_stock === undefined) {
      return res.status(400).json({ 
        success: false,
        message: '商品ID和实际库存数量必填' 
      });
    }
    
    const inventory = await Inventory.findOne({
      where: { product_id, warehouse_location },
      include: [{ model: Product, as: 'product' }]
    });
    
    if (!inventory) {
      return res.status(404).json({ 
        success: false,
        message: '库存记录不存在' 
      });
    }
    
    const difference = actual_stock - inventory.current_stock;
    
    // 更新库存
    await inventory.update({
      current_stock: actual_stock,
      available_stock: actual_stock - inventory.reserved_stock,
      total_value: actual_stock * inventory.average_cost,
      last_check_date: new Date()
    });
    
    res.json({
      success: true,
      message: '库存盘点完成',
      data: { 
        inventory,
        stocktake: {
          original_stock: inventory.current_stock - difference,
          actual_stock: actual_stock,
          difference: difference,
          remark: remark || '',
          operator: req.user.username,
          timestamp: new Date()
        }
      }
    });
  } catch (err) {
    console.error('库存盘点错误:', err);
    res.status(500).json({ 
      success: false,
      message: '服务器错误' 
    });
  }
});

// 获取库存统计信息
router.get('/statistics', authMiddleware, async (req, res) => {
  try {
    const { Op } = require('sequelize');
    
    // 总库存价值
    const totalValue = await Inventory.sum('total_value');
    
    // 商品总数
    const totalProducts = await Inventory.count();
    
    // 低库存商品数量
    const lowStockProducts = await Inventory.count({
      include: [{
        model: Product,
        as: 'product',
        where: {
          [Op.and]: [
            { '$Inventory.current_stock$': { [Op.lte]: { [Op.col]: 'product.min_stock' } } }
          ]
        }
      }]
    });
    
    // 零库存商品数量
    const zeroStockProducts = await Inventory.count({
      where: { current_stock: 0 }
    });
    
    res.json({
      success: true,
      data: {
        statistics: {
          total_value: totalValue || 0,
          total_products: totalProducts,
          low_stock_products: lowStockProducts,
          zero_stock_products: zeroStockProducts,
          normal_stock_products: totalProducts - lowStockProducts - zeroStockProducts
        }
      }
    });
  } catch (err) {
    console.error('获取库存统计错误:', err);
    res.status(500).json({ 
      success: false,
      message: '服务器错误' 
    });
  }
});

// 获取仓库列表
router.get('/warehouses', authMiddleware, async (req, res) => {
  try {
    const warehouses = await Inventory.findAll({
      attributes: ['warehouse_location'],
      group: ['warehouse_location'],
      raw: true
    });
    
    res.json({
      success: true,
      data: { 
        warehouses: warehouses.map(item => item.warehouse_location).filter(Boolean) 
      }
    });
  } catch (err) {
    console.error('获取仓库列表错误:', err);
    res.status(500).json({ 
      success: false,
      message: '服务器错误' 
    });
  }
});

module.exports = router;
