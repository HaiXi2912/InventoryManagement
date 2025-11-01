const bcrypt = require('bcryptjs');
const { 
  User, 
  // Supplier, 
  Customer, 
  Product, 
  Inventory,
  sequelize 
} = require('../models');

/**
 * 生成测试数据（自有工厂模式）
 */
async function seedDatabase() {
  console.log('🌱 开始生成测试数据...');

  try {
    // 创建测试用户
    console.log('1. 创建测试用户...');
    const hashedPassword = await bcrypt.hash('123456', 10);
    
    const users = await User.bulkCreate([
      {
        username: 'admin',
        email: 'admin@example.com',
        password: hashedPassword,
        real_name: '管理员',
        phone: '13800138000',
        role: 'admin',
        status: 'active'
      },
      {
        username: 'manager',
        email: 'manager@example.com',
        password: hashedPassword,
        real_name: '店长',
        phone: '13800138001',
        role: 'manager',
        status: 'active'
      },
      {
        username: 'staff1',
        email: 'staff1@example.com',
        password: hashedPassword,
        real_name: '员工一',
        phone: '13800138002',
        role: 'staff',
        status: 'active'
      },
      {
        username: 'staff2',
        email: 'staff2@example.com',
        password: hashedPassword,
        real_name: '员工二',
        phone: '13800138003',
        role: 'staff',
        status: 'active'
      },
      {
        username: 'agent1',
        email: 'agent1@example.com',
        password: hashedPassword,
        real_name: '客服一号',
        phone: '13800138004',
        role: 'agent',
        status: 'active'
      },
      // 工厂账号
      {
        username: 'factory',
        email: 'factory@example.com',
        password: hashedPassword,
        real_name: '工厂账户',
        phone: '13800138999',
        role: 'factory',
        status: 'active'
      }
    ], { ignoreDuplicates: true });
    console.log(`✅ 创建了 ${users.length} 个测试用户`);

    // 创建测试客户
    console.log('2. 创建测试客户...');
    const customers = await Customer.bulkCreate([
      { name: '张小姐', code: 'CUS001', phone: '13912345678', email: 'zhang@customer.com', address: '北京市朝阳区购物街100号', gender: 'female', customer_type: 'retail', status: 'active' },
      { name: '李先生', code: 'CUS002', phone: '13987654321', email: 'li@customer.com', address: '上海市徐汇区时尚路200号', gender: 'male', customer_type: 'vip', credit_limit: 10000, status: 'active' },
      { name: '王总（批发商）', code: 'CUS003', phone: '13866778899', email: 'wang@wholesale.com', address: '广州市天河区批发市场300号', gender: 'male', customer_type: 'wholesale', credit_limit: 50000, status: 'active' }
    ], { ignoreDuplicates: true });
    console.log(`✅ 创建了 ${customers.length} 个测试客户`);

    // 创建测试商品（去除 supplier_id 字段）
    console.log('3. 创建测试商品...');
    const products = await Product.bulkCreate([
      { name: '时尚女装连衣裙', code: 'PRD001', barcode: '1234567890123', category: '连衣裙', brand: '时尚品牌', color: '红色', size: 'M', material: '纯棉', season: 'summer', gender: 'female', purchase_price: 45.00, wholesale_price: 75.00, retail_price: 128.00, unit: '件', min_stock: 5, max_stock: 100, weight: 0.3, description: '时尚优雅的女装连衣裙，适合夏季穿着', status: 'active' },
      { name: '男士休闲T恤', code: 'PRD002', barcode: '2345678901234', category: 'T恤', brand: '休闲风', color: '蓝色', size: 'L', material: '棉麻混纺', season: 'all_season', gender: 'male', purchase_price: 25.00, wholesale_price: 40.00, retail_price: 68.00, unit: '件', min_stock: 10, max_stock: 200, weight: 0.2, description: '舒适的男士休闲T恤，四季皆宜', status: 'active' },
      { name: '儿童卡通卫衣', code: 'PRD003', barcode: '3456789012345', category: '卫衣', brand: '童趣', color: '黄色', size: '110', material: '纯棉', season: 'autumn', gender: 'children', purchase_price: 35.00, wholesale_price: 55.00, retail_price: 88.00, unit: '件', min_stock: 8, max_stock: 150, weight: 0.25, description: '可爱的儿童卡通卫衣，保暖舒适', status: 'active' },
      { name: '女士牛仔裤', code: 'PRD004', barcode: '4567890123456', category: '牛仔裤', brand: '经典牛仔', color: '深蓝', size: 'S', material: '牛仔布', season: 'all_season', gender: 'female', purchase_price: 55.00, wholesale_price: 85.00, retail_price: 158.00, unit: '件', min_stock: 6, max_stock: 120, weight: 0.5, description: '经典款女士牛仔裤，百搭实用', status: 'active' },
      { name: '运动外套', code: 'PRD005', barcode: '5678901234567', category: '外套', brand: '运动风', color: '黑色', size: 'XL', material: '聚酯纤维', season: 'winter', gender: 'unisex', purchase_price: 85.00, wholesale_price: 125.00, retail_price: 228.00, unit: '件', min_stock: 3, max_stock: 80, weight: 0.8, description: '防风保暖的运动外套，男女通用', status: 'active' }
    ], { ignoreDuplicates: true });
    console.log(`✅ 创建了 ${products.length} 个测试商品`);

    // 创建库存记录
    console.log('4. 初始化库存记录...');
    const inventoryData = products.map((product, index) => ({
      product_id: product.id || (index + 1),
      warehouse_location: '主仓库',
      current_stock: Math.floor(Math.random() * 50) + 10,
      available_stock: Math.floor(Math.random() * 50) + 10,
      reserved_stock: 0,
      average_cost: product.purchase_price || 0,
      total_value: (product.purchase_price || 0) * (Math.floor(Math.random() * 50) + 10)
    }));

    await Inventory.bulkCreate(inventoryData, { ignoreDuplicates: true });
    console.log(`✅ 初始化了 ${inventoryData.length} 条库存记录`);

    console.log('🎉 测试数据生成完成！');

  } catch (error) {
    console.error('❌ 生成测试数据失败:', error);
    console.error(error.stack);
  } finally {
    await sequelize.close();
  }
}

// 如果直接执行此脚本，则运行数据生成
if (require.main === module) {
  seedDatabase();
}

module.exports = { seedDatabase };
