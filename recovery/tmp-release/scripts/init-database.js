const mysql = require('mysql2/promise');
const { testConnection } = require('../config/database');
const { sequelize } = require('../models');
require('dotenv').config();

/**
 * 初始化数据库
 * 1. 创建数据库（如果不存在）
 * 2. 清洗历史数据（如 ENUM 变更前置处理）
 * 3. 创建/更新所有数据表
 * 4. 创建默认管理员账户
 */
async function initDatabase() {
  console.log('🚀 开始初始化数据库...');

  try {
    // 第一步：创建数据库
    console.log('1. 创建数据库...');
    const connection = await mysql.createConnection({
      host: process.env.DB_HOST,
      port: process.env.DB_PORT,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD
    });

    await connection.execute(`CREATE DATABASE IF NOT EXISTS \`${process.env.DB_NAME}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    console.log(`✅ 数据库 ${process.env.DB_NAME} 创建成功`);
    await connection.end();

    // 第二步：测试数据库连接
    console.log('2. 测试数据库连接...');
    const isConnected = await testConnection();
    if (!isConnected) {
      throw new Error('数据库连接失败');
    }

    // 2.5 步：清洗历史数据（扩展角色等）
    console.log('2.5 清洗历史数据（users.role 扩展 factory 角色）...');
    try {
      await sequelize.query("ALTER TABLE users MODIFY role ENUM('admin','manager','staff','customer','agent','factory') NOT NULL DEFAULT 'staff'");
      console.log('✅ 历史枚举已规范化');
    } catch (e) {
      console.log('ℹ️ 跳过清洗或无需清洗（原因：', e.message || e, ')');
    }

    // 第三步：同步数据模型（创建表/更新结构）
    console.log('3. 创建/更新数据表...');
    await sequelize.sync({ force: false, alter: true });
    console.log('✅ 数据表创建/更新成功');

    // 第四步：创建默认管理员账户
    console.log('4. 创建默认管理员账户...');
    const bcrypt = require('bcryptjs');
    const { User } = require('../models');

    const adminExists = await User.findOne({ where: { username: 'admin' } });
    if (!adminExists) {
      const hashedPassword = await bcrypt.hash('admin123', 10);
      await User.create({
        username: 'admin',
        email: 'admin@example.com',
        password: hashedPassword,
        real_name: '系统管理员',
        role: 'admin',
        status: 'active'
      });
      console.log('✅ 默认管理员账户创建成功');
      console.log('   用户名: admin');
      console.log('   密码: admin123');
    } else {
      console.log('⚠️  管理员账户已存在，跳过创建');
    }

    console.log('🎉 数据库初始化完成！');

  } catch (error) {
    console.error('❌ 数据库初始化失败:', error.message);
    process.exit(1);
  } finally {
    await sequelize.close();
  }
}

// 如果直接执行此脚本，则运行初始化
if (require.main === module) {
  initDatabase();
}

module.exports = { initDatabase };
