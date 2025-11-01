const express = require('express');
const router = express.Router();
const { Op } = require('sequelize');
const { sequelize } = require('../config/database');
const Purchase = require('../models/Purchase');
const Sale = require('../models/Sale');
const Product = require('../models/Product');
const Inventory = require('../models/Inventory');
const { authenticate } = require('../middleware/auth');
const { Parser } = require('json2csv');

// 应用认证中间件到所有路由
router.use(authenticate);

// 1. 系统概况统计
router.get('/overview', async (req, res) => {
  try {
    const { start_date, end_date, sale_type } = req.query;
    
    // 分别构建 进货 与 销售 的日期过滤（与 /daily、/monthly 口径一致）
    const purchaseWhere = {};
    const saleWhere = {};
    if (start_date && end_date) {
      purchaseWhere.purchase_date = { [Op.between]: [start_date, end_date] };
      saleWhere.sale_date = { [Op.between]: [start_date, end_date] };
    } else if (start_date) {
      purchaseWhere.purchase_date = { [Op.gte]: start_date };
      saleWhere.sale_date = { [Op.gte]: start_date };
    } else if (end_date) {
      purchaseWhere.purchase_date = { [Op.lte]: end_date };
      saleWhere.sale_date = { [Op.lte]: end_date };
    }
    if (sale_type) {
      saleWhere.sale_type = sale_type;
    }

    // 获取统计数据
    const [
      totalProducts,
      totalInventoryValue,
      purchaseStats,
      saleStats,
      saleStatsByType,
      lowStockCount,
      todayPurchases,
      todaySales
    ] = await Promise.all([
      // 商品总数
      Product.count({
        where: { status: 'active' }
      }),

      // 库存总价值
      sequelize.query(`
        SELECT SUM(current_stock * average_cost) as total_value 
        FROM inventory 
        WHERE current_stock > 0
      `, {
        type: sequelize.QueryTypes.SELECT
      }),

      // 进货统计（按 purchase_date 过滤）
      Purchase.findAll({
        where: purchaseWhere,
        attributes: [
          'status',
          [sequelize.fn('COUNT', sequelize.col('id')), 'count'],
          [sequelize.fn('SUM', sequelize.col('total_amount')), 'total_amount']
        ],
        group: ['status']
      }),

      // 销售统计（按 sale_date 过滤，按状态）
      Sale.findAll({
        where: saleWhere,
        attributes: [
          'status',
          [sequelize.fn('COUNT', sequelize.col('id')), 'count'],
          [sequelize.fn('SUM', sequelize.col('total_amount')), 'total_amount']
        ],
        group: ['status']
      }),

      // 销售统计（按 sale_type 分组）
      Sale.findAll({
        where: saleWhere,
        attributes: [
          'sale_type',
          [sequelize.fn('COUNT', sequelize.col('id')), 'count'],
          [sequelize.fn('SUM', sequelize.col('total_amount')), 'total_amount']
        ],
        group: ['sale_type']
      }),

      // 低库存商品数量
      sequelize.query(`
        SELECT COUNT(*) as low_stock_count
        FROM inventory i
        JOIN products p ON i.product_id = p.id
        WHERE i.current_stock <= p.min_stock
      `, {
        type: sequelize.QueryTypes.SELECT
      }),

      // 今日进货（按 purchase_date）
      Purchase.findAll({
        where: {
          purchase_date: {
            [Op.gte]: new Date(new Date().setHours(0, 0, 0, 0))
          }
        },
        attributes: [
          [sequelize.fn('COUNT', sequelize.col('id')), 'count'],
          [sequelize.fn('SUM', sequelize.col('total_amount')), 'total_amount']
        ]
      }),

      // 今日销售（按 sale_date，可选 sale_type 过滤）
      Sale.findAll({
        where: {
          ...(sale_type ? { sale_type } : {}),
          sale_date: {
            [Op.gte]: new Date(new Date().setHours(0, 0, 0, 0))
          }
        },
        attributes: [
          [sequelize.fn('COUNT', sequelize.col('id')), 'count'],
          [sequelize.fn('SUM', sequelize.col('total_amount')), 'total_amount']
        ]
      })
    ]);

    res.json({
      success: true,
      data: {
        basic_info: {
          total_products: totalProducts,
          total_inventory_value: totalInventoryValue[0]?.total_value || 0,
          low_stock_count: lowStockCount[0]?.low_stock_count || 0
        },
        purchase_stats: purchaseStats,
        sale_stats: saleStats,
        sale_stats_by_type: saleStatsByType,
        today_summary: {
          purchase: {
            count: todayPurchases[0]?.dataValues?.count || 0,
            amount: todayPurchases[0]?.dataValues?.total_amount || 0
          },
          sale: {
            count: todaySales[0]?.dataValues?.count || 0,
            amount: todaySales[0]?.dataValues?.total_amount || 0
          }
        }
      }
    });
  } catch (error) {
    console.error('获取系统概况失败:', error);
    res.status(500).json({
      success: false,
      message: '获取系统概况失败',
      error: error.message
    });
  }
});

// 2. 日清统计
router.get('/daily', async (req, res) => {
  try {
    const { date = new Date().toISOString().split('T')[0], sale_type } = req.query;
    
    const startDate = new Date(date);
    const endDate = new Date(date);
    endDate.setHours(23, 59, 59, 999);

    // 获取当日统计
    const [dailyPurchases, dailySales, dailySalesByType] = await Promise.all([
      // 当日进货
      Purchase.findAll({
        where: {
          purchase_date: {
            [Op.between]: [startDate, endDate]
          }
        },
        attributes: [
          'status',
          [sequelize.fn('COUNT', sequelize.col('id')), 'count'],
          [sequelize.fn('SUM', sequelize.col('total_amount')), 'total_amount'],
          [sequelize.fn('SUM', sequelize.col('paid_amount')), 'paid_amount']
        ],
        group: ['status']
      }),

      // 当日销售（状态维度）
      Sale.findAll({
        where: {
          ...(sale_type ? { sale_type } : {}),
          sale_date: {
            [Op.between]: [startDate, endDate]
          }
        },
        attributes: [
          'status',
          [sequelize.fn('COUNT', sequelize.col('id')), 'count'],
          [sequelize.fn('SUM', sequelize.col('total_amount')), 'total_amount'],
          [sequelize.fn('SUM', sequelize.col('received_amount')), 'received_amount']
        ],
        group: ['status']
      }),

      // 当日销售（按类型维度）
      Sale.findAll({
        where: {
          ...(sale_type ? { sale_type } : {}),
          sale_date: {
            [Op.between]: [startDate, endDate]
          }
        },
        attributes: [
          'sale_type',
          [sequelize.fn('COUNT', sequelize.col('id')), 'count'],
          [sequelize.fn('SUM', sequelize.col('total_amount')), 'total_amount'],
          [sequelize.fn('SUM', sequelize.col('received_amount')), 'received_amount']
        ],
        group: ['sale_type']
      })
    ]);

    // 计算汇总
    const purchaseSummary = {
      total_count: 0,
      total_amount: 0,
      paid_amount: 0
    };

    const saleSummary = {
      total_count: 0,
      total_amount: 0,
      received_amount: 0
    };

    dailyPurchases.forEach(p => {
      purchaseSummary.total_count += parseInt(p.dataValues.count);
      purchaseSummary.total_amount += parseFloat(p.dataValues.total_amount || 0);
      purchaseSummary.paid_amount += parseFloat(p.dataValues.paid_amount || 0);
    });

    dailySales.forEach(s => {
      saleSummary.total_count += parseInt(s.dataValues.count);
      saleSummary.total_amount += parseFloat(s.dataValues.total_amount || 0);
      saleSummary.received_amount += parseFloat(s.dataValues.received_amount || 0);
    });

    res.json({
      success: true,
      data: {
        date: date,
        purchase: {
          summary: purchaseSummary,
          by_status: dailyPurchases
        },
        sale: {
          summary: saleSummary,
          by_status: dailySales,
          by_type: dailySalesByType
        },
        profit: {
          gross_profit: saleSummary.total_amount - purchaseSummary.total_amount,
          cash_flow: saleSummary.received_amount - purchaseSummary.paid_amount
        }
      }
    });
  } catch (error) {
    console.error('获取日清统计失败:', error);
    res.status(500).json({
      success: false,
      message: '获取日清统计失败',
      error: error.message
    });
  }
});

// 3. 月结统计
router.get('/monthly', async (req, res) => {
  try {
    const { 
      year = new Date().getFullYear(), 
      month = new Date().getMonth() + 1,
      sale_type
    } = req.query;
    
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0, 23, 59, 59, 999);

    // 供 SQL 拼接的类型过滤
    const saleTypeCondition = sale_type ? ' AND sale_type = :sale_type' : '';

    // 获取月度统计
    const [monthlyPurchases, monthlySales, monthlySalesByType, dailyTrend] = await Promise.all([
      // 月度进货
      Purchase.findAll({
        where: {
          purchase_date: {
            [Op.between]: [startDate, endDate]
          }
        },
        attributes: [
          'status',
          [sequelize.fn('COUNT', sequelize.col('id')), 'count'],
          [sequelize.fn('SUM', sequelize.col('total_amount')), 'total_amount'],
          [sequelize.fn('SUM', sequelize.col('paid_amount')), 'paid_amount']
        ],
        group: ['status']
      }),

      // 月度销售（状态维度）
      Sale.findAll({
        where: {
          ...(sale_type ? { sale_type } : {}),
          sale_date: {
            [Op.between]: [startDate, endDate]
          }
        },
        attributes: [
          'status',
          [sequelize.fn('COUNT', sequelize.col('id')), 'count'],
          [sequelize.fn('SUM', sequelize.col('total_amount')), 'total_amount'],
          [sequelize.fn('SUM', sequelize.col('received_amount')), 'received_amount']
        ],
        group: ['status']
      }),

      // 月度销售（按类型维度）
      Sale.findAll({
        where: {
          ...(sale_type ? { sale_type } : {}),
          sale_date: {
            [Op.between]: [startDate, endDate]
          }
        },
        attributes: [
          'sale_type',
          [sequelize.fn('COUNT', sequelize.col('id')), 'count'],
          [sequelize.fn('SUM', sequelize.col('total_amount')), 'total_amount'],
          [sequelize.fn('SUM', sequelize.col('received_amount')), 'received_amount']
        ],
        group: ['sale_type']
      }),

      // 每日趋势（与采购合并，销售可选按类型过滤）
      sequelize.query(`
        SELECT 
          DATE(purchase_date) as date,
          'purchase' as type,
          COUNT(*) as count,
          SUM(total_amount) as amount
        FROM purchases 
        WHERE purchase_date BETWEEN :startDate AND :endDate
        GROUP BY DATE(purchase_date)
        
        UNION ALL
        
        SELECT 
          DATE(sale_date) as date,
          'sale' as type,
          COUNT(*) as count,
          SUM(total_amount) as amount
        FROM sales 
        WHERE sale_date BETWEEN :startDate AND :endDate${saleTypeCondition}
        GROUP BY DATE(sale_date)
        
        ORDER BY date, type
      `, {
        replacements: { startDate, endDate, sale_type },
        type: sequelize.QueryTypes.SELECT
      })
    ]);

    // 计算月度汇总
    const purchaseMonthly = {
      total_count: 0,
      total_amount: 0,
      paid_amount: 0
    };

    const saleMonthly = {
      total_count: 0,
      total_amount: 0,
      received_amount: 0
    };

    monthlyPurchases.forEach(p => {
      purchaseMonthly.total_count += parseInt(p.dataValues.count);
      purchaseMonthly.total_amount += parseFloat(p.dataValues.total_amount || 0);
      purchaseMonthly.paid_amount += parseFloat(p.dataValues.paid_amount || 0);
    });

    monthlySales.forEach(s => {
      saleMonthly.total_count += parseInt(s.dataValues.count);
      saleMonthly.total_amount += parseFloat(s.dataValues.total_amount || 0);
      saleMonthly.received_amount += parseFloat(s.dataValues.received_amount || 0);
    });

    res.json({
      success: true,
      data: {
        period: `${year}-${String(month).padStart(2, '0')}`,
        purchase: {
          summary: purchaseMonthly,
          by_status: monthlyPurchases
        },
        sale: {
          summary: saleMonthly,
          by_status: monthlySales,
          by_type: monthlySalesByType
        },
        profit: {
          gross_profit: saleMonthly.total_amount - purchaseMonthly.total_amount,
          cash_flow: saleMonthly.received_amount - purchaseMonthly.paid_amount
        },
        daily_trend: dailyTrend
      }
    });
  } catch (error) {
    console.error('获取月结统计失败:', error);
    res.status(500).json({
      success: false,
      message: '获取月结统计失败',
      error: error.message
    });
  }
});

// 新增 5. 销售趋势（按天）
router.get('/sales-trend', async (req, res) => {
  try {
    const { start_date, end_date, sale_type, group_by } = req.query;

    if (!start_date || !end_date) {
      return res.status(400).json({ success: false, message: '缺少 start_date 或 end_date 参数' });
    }

    const groupByType = group_by === 'sale_type' || group_by === 'type';
    const groupByClause = groupByType ? ', sale_type' : '';
    const saleTypeCondition = sale_type ? ' AND sale_type = :sale_type' : '';

    const rows = await sequelize.query(`
      SELECT 
        DATE(sale_date) as date${groupByClause},
        COUNT(*) as count,
        SUM(total_amount) as amount
      FROM sales
      WHERE sale_date BETWEEN :start AND :end
        AND status <> 'cancelled'${saleTypeCondition}
      GROUP BY DATE(sale_date)${groupByClause}
      ORDER BY DATE(sale_date)${groupByClause}
    `, {
      replacements: { start: start_date, end: end_date, sale_type },
      type: sequelize.QueryTypes.SELECT,
    });

    return res.json({ success: true, data: rows });
  } catch (error) {
    console.error('获取销售趋势失败:', error);
    res.status(500).json({ success: false, message: '获取销售趋势失败', error: error.message });
  }
});

// 新增 6. 按分类统计销售额与利润占比
router.get('/sales-by-category', async (req, res) => {
  try {
    const { start_date, end_date, sale_type } = req.query;

    if (!start_date || !end_date) {
      return res.status(400).json({ success: false, message: '缺少 start_date 或 end_date 参数' });
    }

    const saleTypeCondition = sale_type ? ' AND s.sale_type = :sale_type' : '';

    const rows = await sequelize.query(`
      SELECT 
        COALESCE(NULLIF(p.category, ''), '未分类') AS category,
        SUM(sd.total_price) AS sales,
        SUM(COALESCE(sd.profit, sd.total_price - COALESCE(sd.cost_price, 0))) AS profit
      FROM sales s
      JOIN sale_details sd ON s.id = sd.sale_id
      JOIN products p ON sd.product_id = p.id
      WHERE s.sale_date BETWEEN :start AND :end
        AND s.status <> 'cancelled'${saleTypeCondition}
      GROUP BY COALESCE(NULLIF(p.category, ''), '未分类')
      ORDER BY sales DESC
    `, {
      replacements: { start: start_date, end: end_date, sale_type },
      type: sequelize.QueryTypes.SELECT,
    });

    const totalSales = rows.reduce((acc, r) => acc + Number(r.sales || 0), 0);
    const withPercent = rows.map(r => ({
      category: r.category,
      sales: Number(r.sales || 0),
      profit: Number(r.profit || 0),
      percentage: totalSales > 0 ? Number(((Number(r.sales || 0) / totalSales) * 100).toFixed(2)) : 0,
    }));

    return res.json({ success: true, data: withPercent });
  } catch (error) {
    console.error('获取分类销售统计失败:', error);
    res.status(500).json({ success: false, message: '获取分类销售统计失败', error: error.message });
  }
});

// 新增 7. 热销商品 TOP
router.get('/top-products', async (req, res) => {
  try {
    const { start_date, end_date, limit = 10, sale_type } = req.query;

    if (!start_date || !end_date) {
      return res.status(400).json({ success: false, message: '缺少 start_date 或 end_date 参数' });
    }

    const saleTypeCondition = sale_type ? ' AND s.sale_type = :sale_type' : '';

    const rows = await sequelize.query(`
      SELECT 
        p.id AS product_id,
        p.name AS productName,
        SUM(sd.total_price) AS sales,
        SUM(sd.quantity) AS quantity
      FROM sales s
      JOIN sale_details sd ON s.id = sd.sale_id
      JOIN products p ON sd.product_id = p.id
      WHERE s.sale_date BETWEEN :start AND :end
        AND s.status <> 'cancelled'${saleTypeCondition}
      GROUP BY p.id, p.name
      ORDER BY sales DESC
      LIMIT :limit
    `, {
      replacements: { start: start_date, end: end_date, limit: Number(limit), sale_type },
      type: sequelize.QueryTypes.SELECT,
    });

    return res.json({ success: true, data: rows.map(r => ({
      product_id: r.product_id,
      productName: r.productName,
      sales: Number(r.sales || 0),
      quantity: Number(r.quantity || 0),
    })) });
  } catch (error) {
    console.error('获取热销商品失败:', error);
    res.status(500).json({ success: false, message: '获取热销商品失败', error: error.message });
  }
});

// 新增 8. 年度月度对比（今年 vs 去年）
router.get('/monthly-comparison', async (req, res) => {
  try {
    const year = Number(req.query.year) || new Date().getFullYear();
    const lastYear = year - 1;
    const sale_type = req.query.sale_type;

    const saleTypeCondition = sale_type ? ' AND sale_type = :sale_type' : '';

    const query = async (y) => sequelize.query(`
      SELECT 
        MONTH(sale_date) AS month,
        SUM(total_amount) AS amount
      FROM sales
      WHERE YEAR(sale_date) = :y
        AND status <> 'cancelled'${saleTypeCondition}
      GROUP BY MONTH(sale_date)
      ORDER BY MONTH(sale_date)
    `, {
      replacements: { y, sale_type },
      type: sequelize.QueryTypes.SELECT,
    });

    const [curr, prev] = await Promise.all([query(year), query(lastYear)]);

    const toMap = (rows) => {
      const m = new Map();
      rows.forEach(r => m.set(Number(r.month), Number(r.amount || 0)));
      return m;
    };

    const currMap = toMap(curr);
    const prevMap = toMap(prev);

    const result = Array.from({ length: 12 }).map((_, idx) => {
      const m = idx + 1;
      return {
        month: String(m).padStart(2, '0'),
        currentYear: Number(currMap.get(m) || 0),
        lastYear: Number(prevMap.get(m) || 0),
      };
    });

    return res.json({ success: true, data: { year, lastYear, sale_type: sale_type || null, items: result } });
  } catch (error) {
    console.error('获取年度对比失败:', error);
    res.status(500).json({ success: false, message: '获取年度对比失败', error: error.message });
  }
});

// 导出报表（CSV）
router.get('/export', async (req, res) => {
  try {
    const { start_date, end_date, type = 'category', format = 'csv', sale_type } = req.query;
    if (!start_date || !end_date) return res.status(400).json({ success: false, message: '缺少 start_date 或 end_date 参数' });

    let rows = []
    if (type === 'trend') {
      const saleTypeCondition = sale_type ? ' AND sale_type = :sale_type' : '';
      const trend = await sequelize.query(`
        SELECT DATE(sale_date) as date, COUNT(*) as orders, SUM(total_amount) as amount
        FROM sales WHERE sale_date BETWEEN :start AND :end AND status <> 'cancelled'${saleTypeCondition}
        GROUP BY DATE(sale_date) ORDER BY DATE(sale_date)
      `, { replacements: { start: start_date, end: end_date, sale_type }, type: sequelize.QueryTypes.SELECT })
      rows = trend.map(r => ({ 日期: r.date, 订单数: Number(r.orders||0), 销售额: Number(r.amount||0) }))
    } else if (type === 'category') {
      const saleTypeCondition = sale_type ? ' AND s.sale_type = :sale_type' : '';
      const cats = await sequelize.query(`
        SELECT COALESCE(NULLIF(p.category, ''), '未分类') AS category,
               SUM(sd.total_price) AS sales,
               SUM(COALESCE(sd.profit, sd.total_price - COALESCE(sd.cost_price, 0))) AS profit
        FROM sales s JOIN sale_details sd ON s.id=sd.sale_id JOIN products p ON sd.product_id=p.id
        WHERE s.sale_date BETWEEN :start AND :end AND s.status <> 'cancelled'${saleTypeCondition}
        GROUP BY COALESCE(NULLIF(p.category, ''), '未分类')
        ORDER BY sales DESC
      `, { replacements: { start: start_date, end: end_date, sale_type }, type: sequelize.QueryTypes.SELECT })
      const total = cats.reduce((a, c)=> a + Number(c.sales||0), 0)
      rows = cats.map(c=>({ 分类: c.category, 销售额: Number(c.sales||0), 利润: Number(c.profit||0), 占比: total>0? Number(((Number(c.sales||0)/total)*100).toFixed(2)) : 0 }))
    } else if (type === 'top') {
      const saleTypeCondition = sale_type ? ' AND s.sale_type = :sale_type' : '';
      const top = await sequelize.query(`
        SELECT p.name AS name, SUM(sd.total_price) AS sales, SUM(sd.quantity) AS qty
        FROM sales s JOIN sale_details sd ON s.id=sd.sale_id JOIN products p ON sd.product_id=p.id
        WHERE s.sale_date BETWEEN :start AND :end AND s.status <> 'cancelled'${saleTypeCondition}
        GROUP BY p.name ORDER BY sales DESC LIMIT 100
      `, { replacements: { start: start_date, end: end_date, sale_type }, type: sequelize.QueryTypes.SELECT })
      rows = top.map(t=>({ 商品: t.name, 销售额: Number(t.sales||0), 销量: Number(t.qty||0) }))
    } else if (type === 'size') {
      const sizes = await sequelize.query(`
        SELECT COALESCE(NULLIF(oi.size, ''), '未标尺码') AS size, SUM(oi.quantity) AS qty, SUM(oi.amount) AS sales
        FROM order_items oi JOIN orders o ON oi.order_id = o.id
        WHERE o.createdAt BETWEEN :start AND :end AND o.status <> 'cancelled'
        GROUP BY COALESCE(NULLIF(oi.size, ''), '未标尺码') ORDER BY qty DESC
      `, { replacements: { start: start_date, end: end_date }, type: sequelize.QueryTypes.SELECT })
      rows = sizes.map(s=>({ 尺码: s.size, 销量: Number(s.qty||0), 销售额: Number(s.sales||0) }))
    } else if (type === 'overview') {
      const [purchase, sale] = await Promise.all([
        sequelize.query(`SELECT COUNT(*) as count, SUM(total_amount) as amount FROM purchases WHERE purchase_date BETWEEN :start AND :end`, { replacements:{ start: start_date, end: end_date }, type: sequelize.QueryTypes.SELECT }),
        sequelize.query(`SELECT COUNT(*) as count, SUM(total_amount) as amount FROM sales WHERE sale_date BETWEEN :start AND :end${sale_type ? ' AND sale_type = :sale_type' : ''}`, { replacements:{ start: start_date, end: end_date, sale_type }, type: sequelize.QueryTypes.SELECT }),
      ])
      rows = [
        { 指标: '进货单据数', 数值: Number(purchase[0]?.count||0) },
        { 指标: '进货金额',   数值: Number(purchase[0]?.amount||0) },
        { 指标: '销售订单数', 数值: Number(sale[0]?.count||0) },
        { 指标: '销售金额',   数值: Number(sale[0]?.amount||0) }
      ]
    }

    if (format !== 'csv') return res.status(400).json({ success:false, message:'暂仅支持 csv 导出' })
    const parser = new Parser({ withBOM: true })
    const csv = parser.parse(rows)
    const filename = `reports_${type}_${start_date}_to_${end_date}.csv`
    res.setHeader('Content-Type', 'text/csv; charset=utf-8')
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`)
    res.send(csv)
  } catch (error) {
    console.error('导出报表失败:', error)
    res.status(500).json({ success:false, message:'导出报表失败', error: error.message })
  }
})

module.exports = router;
