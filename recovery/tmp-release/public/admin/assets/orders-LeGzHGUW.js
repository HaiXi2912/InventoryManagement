
/**
 * 由 Fantastic-admin 提供技术支持
 * Powered by Fantastic-admin
 * https://fantastic-admin.hurui.me
 */
    
import{Q as e}from"./index-BOHDOdY5.js";const o={list(r){return e.get("/admin/orders",{params:r})},detail(r){return e.get("/admin/orders/".concat(r))},ship(r,t){return e.post("/admin/orders/".concat(r,"/ship"),t)},complete(r){return e.post("/admin/orders/".concat(r,"/complete"))}};export{o as O};
