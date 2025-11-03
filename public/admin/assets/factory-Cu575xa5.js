
/**
 * 由 Fantastic-admin 提供技术支持
 * Powered by Fantastic-admin
 * https://fantastic-admin.hurui.me
 */
    
import{P as o}from"./index-CdiJTMf6.js";const e={dashboard:()=>o.get("/factory/dashboard"),list:t=>o.get("/factory/orders",{params:t}),create:t=>o.post("/factory/orders",t),quickAdd:t=>o.post("/factory/orders/quick-add",t),simplified:t=>o.post("/factory/orders/simplified",t),update:(t,r)=>o.put("/factory/orders/".concat(t),r),approve:t=>o.post("/factory/orders/".concat(t,"/approve"),{}),start:t=>o.post("/factory/orders/".concat(t,"/start"),{}),complete:t=>o.post("/factory/orders/".concat(t,"/complete"),{}),ship:t=>o.post("/factory/orders/".concat(t,"/ship"),{}),cancel:t=>o.post("/factory/orders/".concat(t,"/cancel"),{}),move:(t,r)=>o.post("/factory/orders/".concat(t,"/move"),{direction:r}),autoReplenish:t=>o.post("/factory/auto-replenish",t||{}),autoReplenishByProduct:t=>o.post("/factory/auto-replenish/product",t),getSettings:()=>o.get("/factory/settings"),saveSettings:t=>o.post("/factory/settings",t)};export{e as F};
