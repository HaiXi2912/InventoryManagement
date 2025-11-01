// 简易事件总线：用于广播库存变动，解耦触发自动补货
const EventEmitter = require('events');

class StockBus extends EventEmitter {}

// 单例
const stockBus = new StockBus();

module.exports = { stockBus };
