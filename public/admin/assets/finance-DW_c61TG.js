
/**
 * 由 Fantastic-admin 提供技术支持
 * Powered by Fantastic-admin
 * https://fantastic-admin.hurui.me
 */
    
import{P as t}from"./index-CdiJTMf6.js";const a={getDaily(e){return t.get("/finance/clearing/daily",{params:{date:e}})},closeDaily(e){return t.post("/finance/clearing/daily/close",{date:e})},getMonthly(e){return t.get("/finance/clearing/monthly",{params:{period:e}})},closeMonthly(e){return t.post("/finance/clearing/monthly/close",{period:e})},exportMonthly(e){return t.get("/finance/statements/export",{params:{period:e},responseType:"blob"})},settleDaily(e){return t.post("/finance/factory/settle/daily",e)},settleMonthly(e){return t.post("/finance/factory/settle/monthly",e)},getFactoryPayments(e){return t.get("/finance/factory/payments",{params:e})}};export{a as F};
