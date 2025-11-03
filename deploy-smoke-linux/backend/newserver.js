// 轻量后端入口（冒烟）
process.env.NODE_ENV = process.env.NODE_ENV || 'development'
process.env.PORT = process.env.PORT || '3000'
require('../../newserver.js')
