# 服装网店进销存系统

> 更新（2025-11-01）：测试一次 README 变更以验证 GitHub 推送与 CI/CD 流水线。

基于 B/S 架构的现代化服装网店和进销存管理系统，支持完整的进销存业务流程和网店运营管理。

## ✨ 项目特色

- 🏪 **双系统架构**: 管理后台 + 商城前端，满足完整业务需求
- � **数据可视化**: ECharts图表，实时业务数据分析
- 📱 **响应式设计**: 全设备适配，移动端友好
- 🔒 **安全可靠**: JWT认证，权限控制，数据安全
- ⚡ **现代技术栈**: Vue 3 + Node.js + MySQL + TypeScript

## 🏗 系统架构

### 技术栈
- **前端**: Vue 3 + Element Plus + TypeScript + ECharts
- **后端**: Node.js + Express.js + Sequelize ORM
- **数据库**: MySQL 8.0
- **构建工具**: Vite
- **开发工具**: ESLint + Prettier

### 项目结构
```
├── admin-frontend/          # 管理后台前端
│   ├── src/
│   │   ├── views/           # 页面组件
│   │   ├── components/      # 公共组件
│   │   ├── router/          # 路由配置
│   │   └── store/           # 状态管理
├── shop-frontend/           # 商城前端
├── config/                  # 配置文件
├── database/               # 数据库脚本
├── models/                 # 数据模型
├── routes/                 # API路由
└── server.js              # 后端入口
```

## 🚀 快速开始

### 环境要求
- Node.js >= 18.0.0
- MySQL >= 8.0.0
- npm >= 8.0.0 或 pnpm >= 8.0.0

### 安装与启动

1. **安装依赖**
```bash
# 后端依赖
npm install

# 前端依赖
cd admin-frontend
pnpm install
```

2. **环境配置**
```bash
# 复制环境配置文件
copy .env.example .env

# 编辑 .env 文件，配置数据库连接信息
```

3. **初始化数据库**
```bash
# 创建数据库和表结构
npm run db:init
```

4. **启动服务**
```bash
# 启动后端服务 (端口: 3000)
npm start

# 启动前端服务 (端口: 9000)
cd admin-frontend
npx vite --port 9000
```

### 访问地址
- **管理后台**: http://localhost:9000
- **后端API**: http://localhost:3000
- **API健康检查**: http://localhost:3000/health

## 📋 功能模块

### ✅ 已完成功能

#### 管理后台 (admin-frontend)
- 🔐 **用户认证**: 登录/注册，权限控制
- 📦 **商品管理**: 商品增删改查，分类管理，库存显示
- 📈 **进货管理**: 进货单管理，供应商管理，状态流转
- 🛒 **销售管理**: 销售单管理，客户管理，订单跟踪
- 📊 **库存查询**: 实时库存，库存预警，调整记录
- 📈 **统计报表**: 销售分析，图表展示，数据导出
- 💰 **日清月结**: 财务结算，历史记录，报表生成
- 🎛 **系统仪表板**: 数据概览，快捷操作

#### 后端服务 (API)
- 🔑 **认证系统**: JWT Token，用户管理
- 📦 **商品API**: CRUD操作，分类品牌管理
- 📋 **库存API**: 库存查询，调整，统计
- 💼 **业务API**: 进货/销售单管理，状态控制
- 📊 **统计API**: 数据分析，报表生成
- 🗄 **数据管理**: MySQL数据库，Sequelize ORM

### 🚧 开发计划

#### 第四阶段: 系统集成与测试
- [ ] 前后端接口联调
- [ ] 真实数据替换模拟数据
- [ ] 功能测试和性能优化
- [ ] 安全测试和漏洞修复

#### 第五阶段: 网店功能
- [ ] 商城前端开发
- [ ] 购物车和订单系统
- [ ] 支付集成
- [ ] 用户中心

#### 第六阶段: 部署优化
- [ ] 生产环境部署
- [ ] 性能监控
- [ ] 备份策略
- [ ] CI/CD流程

## 🎨 界面预览

### 管理后台特色
- **现代化设计**: 简洁美观的管理界面
- **响应式布局**: 适配桌面、平板、手机
- **数据可视化**: 丰富的图表和统计功能
- **操作便捷**: 直观的业务流程设计

### 功能亮点
- **实时库存**: 库存变动实时同步更新
- **智能预警**: 低库存自动提醒
- **数据分析**: 多维度销售数据分析
- **报表导出**: 支持Excel/PDF导出

## 🔧 开发指南
npm run dev

# 生产模式
npm start
```

6. **访问系统**
- 服务地址: http://localhost:3000
- 健康检查: http://localhost:3000/health
- API接口: http://localhost:3000/api

### 默认账户

初始化后会创建默认管理员账户：
- 用户名: `admin`
- 密码: `admin123`

## 📋 功能特性

### 核心功能模块

- **👥 用户管理**: 多角色权限管理（管理员、经理、员工、客户）
- **📦 商品管理**: 商品信息、分类、库存管理
- **🏭 供应商管理**: 供应商信息、合作关系管理
- **👤 客户管理**: 客户信息、分类、信用管理
- **📥 进货管理**: 采购订单、入库、付款管理
- **📤 销售管理**: 销售订单、出库、收款管理
- **📊 库存管理**: 实时库存、预警、盘点
- **📈 统计分析**: 进销存报表、利润分析
- **📋 日清月结**: 每日汇总、月度结算
- **🛒 网店功能**: 商品展示、购物车、订单管理

### 技术特性

- **🏗️ B/S架构**: 浏览器访问，跨平台兼容
- **🔒 安全保障**: JWT认证、密码加密、SQL防注入
- **📱 响应式设计**: 支持PC、平板、手机访问
- **⚡ 高性能**: 数据库连接池、查询优化
- **📝 完整日志**: 操作审计、错误记录
- **🔄 DevOps**: Git版本控制、CI/CD支持

## 🏗️ 项目结构

```
进销存/1.1/
├── config/              # 配置文件
│   └── database.js      # 数据库配置
├── models/              # 数据模型
│   ├── User.js          # 用户模型
│   ├── Product.js       # 商品模型
│   ├── Supplier.js      # 供应商模型
│   ├── Customer.js      # 客户模型
│   ├── Inventory.js     # 库存模型
│   ├── Purchase.js      # 进货单模型
│   ├── Sale.js          # 销售单模型
│   └── index.js         # 模型关联
├── scripts/             # 脚本文件
│   ├── init-database.js # 数据库初始化
│   └── seed-database.js # 测试数据生成
├── .env                 # 环境配置
├── .env.example         # 环境配置示例
├── package.json         # 项目依赖
├── server.js            # 服务器入口
└── README.md           # 项目说明
```

## 📊 数据库设计

### 核心数据表

| 表名 | 说明 | 主要字段 |
|-----|------|---------|
| users | 用户表 | 用户名、邮箱、角色、状态 |
| products | 商品表 | 商品名、编码、价格、规格 |
| suppliers | 供应商表 | 供应商名、联系方式、状态 |
| customers | 客户表 | 客户名、联系方式、类型 |
| inventory | 库存表 | 商品ID、当前库存、可用库存 |
| purchases | 进货单表 | 供应商、金额、状态、日期 |
| purchase_details | 进货明细表 | 商品、数量、单价、小计 |
| sales | 销售单表 | 客户、金额、状态、日期 |
| sale_details | 销售明细表 | 商品、数量、单价、利润 |
| operation_logs | 操作日志表 | 用户、操作、时间、详情 |

## 🔧 开发指南

### NPM脚本

| 命令 | 说明 |
|-----|------|
| `npm start` | 启动生产服务器 |
| `npm run dev` | 启动开发服务器（自动重启） |
| `npm run db:init` | 初始化数据库 |
| `npm run db:seed` | 生成测试数据 |
| `npm test` | 运行测试 |
| `npm run lint` | 代码质量检查 |

### API接口

**认证接口**
- `POST /api/auth/login` - 用户登录
- `POST /api/auth/register` - 用户注册  
- `GET /api/auth/me` - 获取当前用户信息
- `POST /api/auth/logout` - 退出登录

**商品管理**
- `GET /api/products` - 商品列表
- `GET /api/products/:id` - 商品详情
- `POST /api/products` - 创建商品
- `PUT /api/products/:id` - 更新商品
- `DELETE /api/products/:id` - 删除商品

**库存管理** 
- `GET /api/inventory` - 库存列表
- `GET /api/inventory/product/:productId` - 商品库存详情
- `POST /api/inventory/adjust` - 库存调整
- `GET /api/inventory/statistics` - 库存统计

**进货管理**
- `GET /api/purchases` - 进货单列表
- `GET /api/purchases/:id` - 进货单详情
- `POST /api/purchases` - 创建进货单
- `POST /api/purchases/:id/confirm` - 确认进货单
- `POST /api/purchases/:id/receive` - 进货收货
- `POST /api/purchases/:id/cancel` - 取消进货单

**销售管理**
- `GET /api/sales` - 销售单列表
- `GET /api/sales/:id` - 销售单详情
- `POST /api/sales` - 创建销售单
- `POST /api/sales/:id/confirm` - 确认销售单
- `POST /api/sales/:id/ship` - 销售发货
- `POST /api/sales/:id/complete` - 完成销售
- `POST /api/sales/:id/cancel` - 取消销售单

访问 http://localhost:3000/health 检查系统状态。

## 📈 开发进度

### ✅ 已完成

- [x] 项目架构搭建
- [x] 数据库设计与模型定义
- [x] 数据库连接配置
- [x] 初始化脚本开发
- [x] 基础服务器搭建
- [x] 健康检查接口

### 🚧 进行中

- [ ] API接口开发
- [ ] 前端界面开发
- [ ] 功能测试

### 📋 待开发

- [ ] 用户认证系统
- [ ] 商品管理功能
- [ ] 进销存核心功能
- [ ] 报表统计功能
- [ ] 网店前台功能

## 🤝 贡献指南

1. Fork 本项目
2. 创建特性分支 (`git checkout -b feature/AmazingFeature`)
3. 提交更改 (`git commit -m 'Add some AmazingFeature'`)
4. 推送到分支 (`git push origin feature/AmazingFeature`)
5. 打开 Pull Request

## 📝 开发日志

- **2024-09-18**: 完成项目初始化、数据库设计和基础架构搭建

## 📄 许可证

本项目采用 MIT 许可证。详情请参阅 [LICENSE](LICENSE) 文件。

## ❓ 常见问题

**Q: 数据库连接失败怎么办？**
A: 请检查 `.env` 文件中的数据库配置，确保MySQL服务正在运行。

**Q: 如何重置数据库？**
A: 删除数据库后重新运行 `npm run db:init`。

**Q: 支持哪些数据库？**
A: 当前支持MySQL，后续可扩展支持PostgreSQL等。

## 📞 联系方式

如有问题或建议，请通过以下方式联系：

- 项目Issues: [GitHub Issues](项目地址/issues)
- 邮箱: developer@example.com

---

*🎉 感谢使用服装网店进销存系统！*
