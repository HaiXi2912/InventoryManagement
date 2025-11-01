const bcrypt = require('bcryptjs');
const { 
  User, 
  Customer, 
  Product, 
  Inventory,
  Purchase,
  PurchaseDetail,
  Sale,
  SaleDetail,
  sequelize 
} = require('../models');

/**
 * 生成测试数据（包含真实进销单据）
 */
async function seedDatabase() {
  console.log('🌱 开始生成测试数据...');

  try {
    // 事务包装，保证一致性
    await sequelize.transaction(async (t) => {
      // 创建测试用户
      console.log('1. 创建测试用户...');
      const hashedPassword = await bcrypt.hash('123456', 10);
      await User.bulkCreate([
        { username: 'admin', email: 'admin@example.com', password: hashedPassword, real_name: '管理员', phone: '13800138000', role: 'admin', status: 'active' },
        { username: 'manager', email: 'manager@example.com', password: hashedPassword, real_name: '店长', phone: '13800138001', role: 'manager', status: 'active' },
        { username: 'staff1', email: 'staff1@example.com', password: hashedPassword, real_name: '员工一', phone: '13800138002', role: 'staff', status: 'active' },
      ], { ignoreDuplicates: true, transaction: t });

      // 创建测试客户
      console.log('2. 创建测试客户...');
      await Customer.bulkCreate([
        { name: '张小姐', code: 'CUS001', phone: '13912345678', email: 'zhang@customer.com', address: '北京市朝阳区100号', gender: 'female', customer_type: 'retail', status: 'active' },
        { name: '李先生', code: 'CUS002', phone: '13987654321', email: 'li@customer.com', address: '上海市徐汇区200号', gender: 'male', customer_type: 'vip', credit_limit: 10000, status: 'active' },
      ], { ignoreDuplicates: true, transaction: t });

      // 创建测试商品
      console.log('3. 创建测试商品...');
      const productRows = await Product.bulkCreate([
        { name: '时尚女装连衣裙', code: 'PRD001', barcode: '1234567890123', category: '连衣裙', brand: '时尚品牌', color: '红色', size: 'M', material: '纯棉', season: 'summer', gender: 'female', purchase_price: 45.00, wholesale_price: 75.00, retail_price: 128.00, unit: '件', min_stock: 5, max_stock: 100, weight: 0.3, description: '夏季连衣裙', status: 'active' },
        { name: '男士休闲T恤', code: 'PRD002', barcode: '2345678901234', category: 'T恤', brand: '休闲风', color: '蓝色', size: 'L', material: '棉麻', season: 'all_season', gender: 'male', purchase_price: 25.00, wholesale_price: 40.00, retail_price: 68.00, unit: '件', min_stock: 10, max_stock: 200, weight: 0.2, description: '男士T恤', status: 'active' },
        { name: '儿童卡通卫衣', code: 'PRD003', barcode: '3456789012345', category: '卫衣', brand: '童趣', color: '黄色', size: '110', material: '纯棉', season: 'autumn', gender: 'children', purchase_price: 35.00, wholesale_price: 55.00, retail_price: 88.00, unit: '件', min_stock: 8, max_stock: 150, weight: 0.25, description: '儿童卫衣', status: 'active' },
      ], { ignoreDuplicates: true, transaction: t });

      // 初始化库存（与商品数量一致）
      console.log('4. 初始化库存...');
      const products = await Product.findAll({ transaction: t });
      for (const p of products) {
        await Inventory.findOrCreate({
          where: { product_id: p.id, warehouse_location: '主仓库' },
          defaults: {
            current_stock: 20,
            available_stock: 20,
            reserved_stock: 0,
            average_cost: p.purchase_price || 0,
            total_value: (p.purchase_price || 0) * 20,
          },
          transaction: t
        });
      }

      // 5. 写入近一个月内的进货单与明细
      console.log('5. 写入进货单与明细...');
      const todayBase = new Date();
      const d = (offset) => new Date(todayBase.getFullYear(), todayBase.getMonth(), todayBase.getDate() - offset, 10, 0, 0);

      const p1 = await Purchase.create({
        purchase_no: 'PO' + Date.now(),
        purchase_date: d(20),
        total_amount: 4500,
        paid_amount: 3000,
        discount_amount: 0,
        currency: 'CNY', fx_rate: 1,
        tax_rate: 0, tax_included: true,
        freight_amount: 100, other_amount: 0, landed_cost_total: 4600,
        status: 'received', payment_status: 'partial', operator_id: 1,
      }, { transaction: t });

      await PurchaseDetail.bulkCreate([
        { purchase_id: p1.id, product_id: products[0].id, quantity: 30, unit_price: 40, total_price: 1200 },
        { purchase_id: p1.id, product_id: products[1].id, quantity: 50, unit_price: 22, total_price: 1100 },
        { purchase_id: p1.id, product_id: products[2].id, quantity: 40, unit_price: 30, total_price: 1200 },
      ], { transaction: t });

      const p2 = await Purchase.create({
        purchase_no: 'PO' + (Date.now() + 1),
        purchase_date: d(5),
        total_amount: 2600,
        paid_amount: 2600,
        status: 'received', payment_status: 'paid', operator_id: 1,
        currency: 'CNY', fx_rate: 1, tax_rate: 0, tax_included: true,
        freight_amount: 50, other_amount: 0, landed_cost_total: 2650,
      }, { transaction: t });

      await PurchaseDetail.bulkCreate([
        { purchase_id: p2.id, product_id: products[0].id, quantity: 20, unit_price: 42, total_price: 840 },
        { purchase_id: p2.id, product_id: products[1].id, quantity: 30, unit_price: 24, total_price: 720 },
      ], { transaction: t });

      // 6. 写入近一月销售单与明细
      console.log('6. 写入销售单与明细...');
      const s1 = await Sale.create({
        sale_no: 'SO' + Date.now(),
        customer_id: 1,
        sale_date: d(18),
        total_amount: 3200,
        received_amount: 2000,
        discount_amount: 0,
        sale_type: 'retail',
        status: 'completed', payment_status: 'partial', operator_id: 1,
        payment_method: 'wechat'
      }, { transaction: t });

      await SaleDetail.bulkCreate([
        { sale_id: s1.id, product_id: products[0].id, quantity: 10, unit_price: 120, total_price: 1200 },
        { sale_id: s1.id, product_id: products[1].id, quantity: 20, unit_price: 60, total_price: 1200 },
      ], { transaction: t });

      const s2 = await Sale.create({
        sale_no: 'SO' + (Date.now() + 1),
        customer_id: 2,
        sale_date: d(2),
        total_amount: 2100,
        received_amount: 2100,
        sale_type: 'online',
        status: 'completed', payment_status: 'paid', operator_id: 1,
        payment_method: 'alipay'
      }, { transaction: t });

      await SaleDetail.bulkCreate([
        { sale_id: s2.id, product_id: products[0].id, quantity: 8, unit_price: 125, total_price: 1000 },
        { sale_id: s2.id, product_id: products[2].id, quantity: 12, unit_price: 92, total_price: 1104 },
      ], { transaction: t });

      // ===== 7. 批量生成近60天的进销数据（含今日） =====
      console.log('7. 批量生成近60天进销数据...');
      const randInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
      const pick = (arr) => arr[randInt(0, arr.length - 1)];
      const today2 = new Date();
      const dateOffset = (days) => new Date(today2.getFullYear(), today2.getMonth(), today2.getDate() - days, randInt(9, 20), randInt(0, 59), 0);

      // 批量进货单
      for (let i = 0; i < 15; i++) {
        const dayOff = randInt(0, 59);
        const when = dateOffset(dayOff);
        const po = await Purchase.create({
          purchase_no: `PO${when.getTime()}_${i}`,
          purchase_date: when,
          total_amount: 0,
          paid_amount: 0,
          discount_amount: 0,
          currency: 'CNY', fx_rate: 1, tax_rate: 0, tax_included: true,
          freight_amount: randInt(0, 100), other_amount: randInt(0, 50), landed_cost_total: 0,
          status: 'received', payment_status: pick(['unpaid','partial','paid']), operator_id: 1,
        }, { transaction: t });

        const lineCount = randInt(1, 3);
        let total = 0;
        const details = [];
        for (let j = 0; j < lineCount; j++) {
          const p = pick(products);
          const qty = randInt(5, 40);
          const unit = Math.max(1, Math.round((p.purchase_price || 20) * (0.9 + Math.random() * 0.3)));
          const lineTotal = unit * qty;
          total += lineTotal;
          details.push({ purchase_id: po.id, product_id: p.id, quantity: qty, unit_price: unit, total_price: lineTotal });
        }
        await PurchaseDetail.bulkCreate(details, { transaction: t });
        po.total_amount = total;
        po.landed_cost_total = total + po.freight_amount + po.other_amount;
        po.paid_amount = pick([0, Math.round(total * 0.5), total]);
        await po.save({ transaction: t });
      }

      // 批量销售单
      const allCustomers = await Customer.findAll({ transaction: t });
      for (let i = 0; i < 30; i++) {
        const dayOff = randInt(0, 59);
        const when = dateOffset(dayOff);
        const so = await Sale.create({
          sale_no: `SO${when.getTime()}_${i}`,
          customer_id: pick(allCustomers).id,
          sale_date: when,
          total_amount: 0,
          received_amount: 0,
          discount_amount: 0,
          sale_type: pick(['retail','wholesale','online']),
          status: pick(['completed','shipped','confirmed']),
          payment_status: pick(['unpaid','partial','paid']),
          operator_id: 1,
          payment_method: pick(['cash','card','transfer','alipay','wechat'])
        }, { transaction: t });

        const lineCount = randInt(1, 4);
        let total = 0;
        const details = [];
        for (let j = 0; j < lineCount; j++) {
          const p = pick(products);
          const qty = randInt(1, 20);
          const unit = Math.max(1, Math.round((p.retail_price || 60) * (0.8 + Math.random() * 0.3)));
          const lineTotal = unit * qty;
          total += lineTotal;
          details.push({ sale_id: so.id, product_id: p.id, quantity: qty, unit_price: unit, total_price: lineTotal });
        }
        await SaleDetail.bulkCreate(details, { transaction: t });
        so.total_amount = total;
        so.received_amount = pick([0, Math.round(total * 0.5), total]);
        await so.save({ transaction: t });
      }

      // 今日数据加一笔（确保日清有数据）
      const todayNoon = new Date(today2.getFullYear(), today2.getMonth(), today2.getDate(), 12, 0, 0);
      const soToday = await Sale.create({
        sale_no: `SO_TODAY_${todayNoon.getTime()}`,
        customer_id: allCustomers[0]?.id || 1,
        sale_date: todayNoon,
        total_amount: 0,
        received_amount: 0,
        discount_amount: 0,
        sale_type: 'retail',
        status: 'completed', payment_status: 'paid', operator_id: 1,
        payment_method: 'wechat'
      }, { transaction: t });
      await SaleDetail.bulkCreate([
        { sale_id: soToday.id, product_id: products[0].id, quantity: 3, unit_price: 120, total_price: 360 },
        { sale_id: soToday.id, product_id: products[1].id, quantity: 2, unit_price: 65, total_price: 130 },
      ], { transaction: t });
      soToday.total_amount = 490; soToday.received_amount = 490; await soToday.save({ transaction: t });

      const poToday = await Purchase.create({
        purchase_no: `PO_TODAY_${todayNoon.getTime()}`,
        purchase_date: todayNoon,
        total_amount: 0, paid_amount: 0, discount_amount: 0,
        currency: 'CNY', fx_rate: 1, tax_rate: 0, tax_included: true,
        freight_amount: 20, other_amount: 0, landed_cost_total: 0,
        status: 'received', payment_status: 'paid', operator_id: 1,
      }, { transaction: t });
      await PurchaseDetail.bulkCreate([
        { purchase_id: poToday.id, product_id: products[2].id, quantity: 10, unit_price: 32, total_price: 320 },
      ], { transaction: t });
      poToday.total_amount = 320; poToday.landed_cost_total = 340; poToday.paid_amount = 320; await poToday.save({ transaction: t });
      // ===== 批量丰富数据结束 =====

      console.log('🎉 测试数据生成完成！');
    });
  } catch (error) {
    console.error('❌ 生成测试数据失败:', error);
    console.error(error.stack);
  } finally {
    await sequelize.close();
  }
}

if (require.main === module) {
  seedDatabase();
}

module.exports = { seedDatabase };
