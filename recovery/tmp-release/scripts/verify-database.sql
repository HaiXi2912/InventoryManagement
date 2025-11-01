-- 服装网店进销存系统数据库验证脚本
-- 运行此脚本来验证数据库初始化是否成功

-- 1. 检查数据库是否存在
SELECT 'clothing_inventory_db' AS database_name, 
       SCHEMA_NAME AS existing_database 
FROM INFORMATION_SCHEMA.SCHEMATA 
WHERE SCHEMA_NAME = 'clothing_inventory_db';

-- 2. 检查所有表是否创建成功
SELECT TABLE_NAME, TABLE_COMMENT, ENGINE, TABLE_ROWS 
FROM INFORMATION_SCHEMA.TABLES 
WHERE TABLE_SCHEMA = 'clothing_inventory_db'
ORDER BY TABLE_NAME;

-- 3. 检查用户数据
SELECT '用户表数据检查' AS check_type, COUNT(*) AS total_count FROM users;
SELECT username, real_name, role, status, created_at 
FROM users 
ORDER BY created_at;

-- 4. 检查供应商数据
SELECT '供应商表数据检查' AS check_type, COUNT(*) AS total_count FROM suppliers;
SELECT name, code, contact_person, phone, status 
FROM suppliers 
ORDER BY created_at;

-- 5. 检查客户数据
SELECT '客户表数据检查' AS check_type, COUNT(*) AS total_count FROM customers;
SELECT name, code, phone, customer_type, credit_limit, status 
FROM customers 
ORDER BY created_at;

-- 6. 检查商品数据
SELECT '商品表数据检查' AS check_type, COUNT(*) AS total_count FROM products;
SELECT name, code, category, brand, color, size, 
       purchase_price, wholesale_price, retail_price, status 
FROM products 
ORDER BY created_at;

-- 7. 检查库存数据
SELECT '库存表数据检查' AS check_type, COUNT(*) AS total_count FROM inventory;
SELECT p.name AS product_name, p.code AS product_code, 
       i.warehouse_location, i.current_stock, i.available_stock, 
       i.average_cost, i.total_value
FROM inventory i
JOIN products p ON i.product_id = p.id
ORDER BY p.name;

-- 8. 检查外键关联
SELECT '商品-供应商关联检查' AS check_type, 
       p.name AS product_name, s.name AS supplier_name
FROM products p
LEFT JOIN suppliers s ON p.supplier_id = s.id;

SELECT '库存-商品关联检查' AS check_type,
       p.name AS product_name, i.current_stock
FROM inventory i
JOIN products p ON i.product_id = p.id;

-- 9. 统计信息汇总
SELECT 
    '数据统计汇总' AS summary_type,
    (SELECT COUNT(*) FROM users) AS user_count,
    (SELECT COUNT(*) FROM suppliers) AS supplier_count,
    (SELECT COUNT(*) FROM customers) AS customer_count,
    (SELECT COUNT(*) FROM products) AS product_count,
    (SELECT COUNT(*) FROM inventory) AS inventory_count,
    (SELECT SUM(total_value) FROM inventory) AS total_inventory_value;

-- 10. 验证数据完整性
SELECT 
    'Active Users' AS item, COUNT(*) AS count 
FROM users WHERE status = 'active'
UNION ALL
SELECT 
    'Active Suppliers' AS item, COUNT(*) AS count 
FROM suppliers WHERE status = 'active'
UNION ALL
SELECT 
    'Active Customers' AS item, COUNT(*) AS count 
FROM customers WHERE status = 'active'
UNION ALL
SELECT 
    'Active Products' AS item, COUNT(*) AS count 
FROM products WHERE status = 'active'
UNION ALL
SELECT 
    'Products with Stock' AS item, COUNT(*) AS count 
FROM inventory WHERE current_stock > 0;
