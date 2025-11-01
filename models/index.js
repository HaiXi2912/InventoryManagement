const { sequelize } = require('../config/database');
const Product = require('../models/Product');
(async () => {
  try {
    await sequelize.authenticate();
    const [db] = await sequelize.query('SELECT DATABASE() AS dbname');
    console.log('当前连接数据库:', db[0]?.dbname);
    const count = await Product.count();
    console.log('Product表商品数量:', count);
  } catch (err) {
    console.error('数据库连接或查询异常:', err);
  }
})();

// 导入所有模型
const User = require('./User');
// const Supplier = require('./Supplier');
const Customer = require('./Customer');
const Inventory = require('./Inventory');
const Purchase = require('./Purchase');
const PurchaseDetail = require('./PurchaseDetail');
const Sale = require('./Sale');
const SaleDetail = require('./SaleDetail');
const OperationLog = require('./OperationLog');
const RefreshToken = require('./RefreshToken');
// 新增：退货相关模型
const { ReturnOrder, ReturnDetail } = require('./Return');
// 新增：调拨相关模型
const { TransferOrder, TransferDetail } = require('./Transfer');
// 新增：财务相关模型
const { APTransaction, ARTransaction } = require('./Finance');
// 新增：价格历史
const PriceHistory = require('./PriceHistory');
// 新增：商品内容、媒体、SKU
const ProductContent = require('./ProductContent');
const ProductMedia = require('./ProductMedia');
const ProductSku = require('./ProductSku');
// 新增：地址与电商订单
const Address = require('./Address');
// 新增：库存流水
const InventoryLog = require('./InventoryLog');
// 新增：电商订单
const { Order, OrderItem } = require('./Order');
// 新增：钱包流水
const WalletTransaction = require('./WalletTransaction');
// 新增：售后与客服聊天
const { AfterSale, AfterSaleItem } = require('./AfterSale');
const ChatMessage = require('./ChatMessage');
// 新增：工厂生产单
const FactoryOrder = require('./FactoryOrder');
const FactoryOrderDetail = require('./FactoryOrderDetail');
// 新增：日清/月结模型
const { DailyClearing, MonthlyStatement } = require('./Clearing');
// 新增：工厂结算记录
const FactoryPayment = require('./FactoryPayment');

// 定义模型关联关系

// 用户与操作日志的关系
User.hasMany(OperationLog, { foreignKey: 'user_id', as: 'operationLogs' });
OperationLog.belongsTo(User, { foreignKey: 'user_id', as: 'user' });

// 用户与刷新令牌（多端登录）
User.hasMany(RefreshToken, { foreignKey: 'user_id', as: 'refreshTokens' });
RefreshToken.belongsTo(User, { foreignKey: 'user_id', as: 'user' });

// 商品与库存的关系
Product.hasOne(Inventory, { foreignKey: 'product_id', as: 'inventory' });
Inventory.belongsTo(Product, { foreignKey: 'product_id', as: 'product' });

// 用户与进货单的关系（操作员）
User.hasMany(Purchase, { foreignKey: 'operator_id', as: 'purchases' });
Purchase.belongsTo(User, { foreignKey: 'operator_id', as: 'operator' });

// 进货单与进货明细的关系
Purchase.hasMany(PurchaseDetail, { foreignKey: 'purchase_id', as: 'details' });
PurchaseDetail.belongsTo(Purchase, { foreignKey: 'purchase_id', as: 'purchase' });

// 商品与进货明细的关系
Product.hasMany(PurchaseDetail, { foreignKey: 'product_id', as: 'purchaseDetails' });
PurchaseDetail.belongsTo(Product, { foreignKey: 'product_id', as: 'product' });

// 客户与销售单的关系
Customer.hasMany(Sale, { foreignKey: 'customer_id', as: 'sales' });
Sale.belongsTo(Customer, { foreignKey: 'customer_id', as: 'customer' });

// 用户与销售单的关系（操作员）
User.hasMany(Sale, { foreignKey: 'operator_id', as: 'sales' });
Sale.belongsTo(User, { foreignKey: 'operator_id', as: 'operator' });

// 销售单与销售明细的关系
Sale.hasMany(SaleDetail, { foreignKey: 'sale_id', as: 'details' });
SaleDetail.belongsTo(Sale, { foreignKey: 'sale_id', as: 'sale' });

// 商品与销售明细的关系
Product.hasMany(SaleDetail, { foreignKey: 'product_id', as: 'saleDetails' });
SaleDetail.belongsTo(Product, { foreignKey: 'product_id', as: 'product' });

// 新增：退货单与明细的关系、与用户、商品的关系
ReturnOrder.hasMany(ReturnDetail, { foreignKey: 'return_id', as: 'details' });
ReturnDetail.belongsTo(ReturnOrder, { foreignKey: 'return_id', as: 'order' });
Product.hasMany(ReturnDetail, { foreignKey: 'product_id', as: 'returnDetails' });
ReturnDetail.belongsTo(Product, { foreignKey: 'product_id', as: 'product' });
User.hasMany(ReturnOrder, { foreignKey: 'operator_id', as: 'returnOrders' });
ReturnOrder.belongsTo(User, { foreignKey: 'operator_id', as: 'operator' });

// 新增：调拨单与明细、与用户、商品关系
TransferOrder.hasMany(TransferDetail, { foreignKey: 'transfer_id', as: 'details' });
TransferDetail.belongsTo(TransferOrder, { foreignKey: 'transfer_id', as: 'order' });
Product.hasMany(TransferDetail, { foreignKey: 'product_id', as: 'transferDetails' });
TransferDetail.belongsTo(Product, { foreignKey: 'product_id', as: 'product' });
User.hasMany(TransferOrder, { foreignKey: 'operator_id', as: 'transferOrders' });
TransferOrder.belongsTo(User, { foreignKey: 'operator_id', as: 'operator' });

// 新增：财务交易与采购/销售/用户关联
Purchase.hasMany(APTransaction, { foreignKey: 'purchase_id', as: 'apTransactions' });
APTransaction.belongsTo(Purchase, { foreignKey: 'purchase_id', as: 'purchase' });
User.hasMany(APTransaction, { foreignKey: 'operator_id', as: 'apTransactions' });
APTransaction.belongsTo(User, { foreignKey: 'operator_id', as: 'operator' });

Sale.hasMany(ARTransaction, { foreignKey: 'sale_id', as: 'arTransactions' });
ARTransaction.belongsTo(Sale, { foreignKey: 'sale_id', as: 'sale' });
User.hasMany(ARTransaction, { foreignKey: 'operator_id', as: 'arTransactions' });
ARTransaction.belongsTo(User, { foreignKey: 'operator_id', as: 'operator' });

// 价格历史关联
Product.hasMany(PriceHistory, { foreignKey: 'product_id', as: 'priceHistory' });
Purchase.hasMany(PriceHistory, { foreignKey: 'purchase_id', as: 'priceHistory' });
PurchaseDetail.hasMany(PriceHistory, { foreignKey: 'purchase_detail_id', as: 'priceHistory' });
PriceHistory.belongsTo(Product, { foreignKey: 'product_id', as: 'product' });
PriceHistory.belongsTo(Purchase, { foreignKey: 'purchase_id', as: 'purchase' });
PriceHistory.belongsTo(PurchaseDetail, { foreignKey: 'purchase_detail_id', as: 'purchaseDetail' });

// 用户与地址
User.hasMany(Address, { foreignKey: 'user_id', as: 'addresses' });
Address.belongsTo(User, { foreignKey: 'user_id', as: 'user' });

// 库存流水与商品、用户
Product.hasMany(InventoryLog, { foreignKey: 'product_id', as: 'inventoryLogs' });
InventoryLog.belongsTo(Product, { foreignKey: 'product_id', as: 'product' });
User.hasMany(InventoryLog, { foreignKey: 'operator_id', as: 'inventoryLogs' });
InventoryLog.belongsTo(User, { foreignKey: 'operator_id', as: 'operator' });

// 内容/媒体/SKU 关联
Product.hasOne(ProductContent, { foreignKey: 'product_id', as: 'content' });
ProductContent.belongsTo(Product, { foreignKey: 'product_id', as: 'product' });
Product.hasMany(ProductMedia, { foreignKey: 'product_id', as: 'media' });
ProductMedia.belongsTo(Product, { foreignKey: 'product_id', as: 'product' });
Product.hasMany(ProductSku, { foreignKey: 'product_id', as: 'skus' });
ProductSku.belongsTo(Product, { foreignKey: 'product_id', as: 'product' });

// 订单关联
User.hasMany(Order, { foreignKey: 'user_id', as: 'orders' });
Order.belongsTo(User, { foreignKey: 'user_id', as: 'user' });
Order.belongsTo(Address, { foreignKey: 'address_id', as: 'address' });
Order.hasMany(OrderItem, { foreignKey: 'order_id', as: 'items' });
OrderItem.belongsTo(Order, { foreignKey: 'order_id', as: 'order' });
Product.hasMany(OrderItem, { foreignKey: 'product_id', as: 'orderItems' });
OrderItem.belongsTo(Product, { foreignKey: 'product_id', as: 'product' });
ProductSku.hasMany(OrderItem, { foreignKey: 'sku_id', as: 'orderItems' });
OrderItem.belongsTo(ProductSku, { foreignKey: 'sku_id', as: 'sku' });

// 钱包流水关联：可作用于 user 或 customer
User.hasMany(WalletTransaction, { foreignKey: 'user_id', as: 'walletTransactions' });
Customer.hasMany(WalletTransaction, { foreignKey: 'customer_id', as: 'walletTransactions' });
WalletTransaction.belongsTo(User, { foreignKey: 'user_id', as: 'user' });
WalletTransaction.belongsTo(Customer, { foreignKey: 'customer_id', as: 'customer' });

// 售后关联
User.hasMany(AfterSale, { foreignKey: 'user_id', as: 'afterSales' });
Customer.hasMany(AfterSale, { foreignKey: 'customer_id', as: 'afterSales' });
AfterSale.belongsTo(User, { foreignKey: 'user_id', as: 'user' });
AfterSale.belongsTo(Customer, { foreignKey: 'customer_id', as: 'customer' });
Order.hasMany(AfterSale, { foreignKey: 'order_id', as: 'afterSales' });
AfterSale.belongsTo(Order, { foreignKey: 'order_id', as: 'order' });
AfterSale.hasMany(AfterSaleItem, { foreignKey: 'as_id', as: 'items' });
AfterSaleItem.belongsTo(AfterSale, { foreignKey: 'as_id', as: 'afterSale' });
OrderItem.hasMany(AfterSaleItem, { foreignKey: 'order_item_id', as: 'afterSaleItems' });
AfterSaleItem.belongsTo(OrderItem, { foreignKey: 'order_item_id', as: 'orderItem' });
ProductSku.hasMany(AfterSaleItem, { foreignKey: 'sku_id', as: 'afterSaleItems' });
AfterSaleItem.belongsTo(ProductSku, { foreignKey: 'sku_id', as: 'sku' });

// 工厂单关联
FactoryOrder.hasMany(FactoryOrderDetail, { foreignKey: 'order_id', as: 'details' });
FactoryOrderDetail.belongsTo(FactoryOrder, { foreignKey: 'order_id', as: 'order' });
Product.hasMany(FactoryOrderDetail, { foreignKey: 'product_id', as: 'factoryOrderDetails' });
FactoryOrderDetail.belongsTo(Product, { foreignKey: 'product_id', as: 'product' });
ProductSku.hasMany(FactoryOrderDetail, { foreignKey: 'sku_id', as: 'factoryOrderDetails' });
FactoryOrderDetail.belongsTo(ProductSku, { foreignKey: 'sku_id', as: 'sku' });
User.hasMany(FactoryOrder, { foreignKey: 'operator_id', as: 'createdFactoryOrders' });
FactoryOrder.belongsTo(User, { foreignKey: 'operator_id', as: 'operator' });
User.hasMany(FactoryOrder, { foreignKey: 'factory_assignee_id', as: 'assignedFactoryOrders' });
FactoryOrder.belongsTo(User, { foreignKey: 'factory_assignee_id', as: 'factoryAssignee' });

// 导出所有模型和数据库连接
module.exports = {
  sequelize,
  User,
  Customer,
  Product,
  Inventory,
  Purchase,
  PurchaseDetail,
  Sale,
  SaleDetail,
  OperationLog,
  RefreshToken,
  ReturnOrder,
  ReturnDetail,
  TransferOrder,
  TransferDetail,
  APTransaction,
  ARTransaction,
  PriceHistory,
  ProductContent,
  ProductMedia,
  ProductSku,
  Address,
  InventoryLog,
  Order,
  OrderItem,
  WalletTransaction,
  AfterSale,
  AfterSaleItem,
  ChatMessage,
  FactoryOrder,
  FactoryOrderDetail,
  DailyClearing,
  MonthlyStatement,
  FactoryPayment,
};
