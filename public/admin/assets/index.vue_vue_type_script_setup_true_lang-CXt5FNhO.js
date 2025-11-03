
/**
 * 由 Fantastic-admin 提供技术支持
 * Powered by Fantastic-admin
 * https://fantastic-admin.hurui.me
 */
    
import{d as c,y as s,I as l,o as m,B as h,w as u,f as d,j as p,_,s as x}from"./index-CdiJTMf6.js";const f=c({name:"ColorScheme",__name:"index",setup(C){const e=s();function a(o){if(!document.startViewTransition||window.matchMedia("(prefers-reduced-motion: reduce)").matches){e.currentColorScheme&&e.setColorScheme(e.currentColorScheme==="dark"?"light":"dark");return}const n=o.clientX,t=o.clientY,r=Math.hypot(Math.max(n,innerWidth-n),Math.max(t,innerHeight-t));document.startViewTransition(async()=>{e.currentColorScheme&&e.setColorScheme(e.currentColorScheme==="dark"?"light":"dark"),await x()}).ready.then(()=>{const i=["circle(0px at ".concat(n,"px ").concat(t,"px)"),"circle(".concat(r,"px at ").concat(n,"px ").concat(t,"px)")];document.documentElement.animate({clipPath:e.currentColorScheme==="light"?i:i.reverse()},{duration:500,easing:"ease-in-out",pseudoElement:e.currentColorScheme==="light"?"::view-transition-new(root)":"::view-transition-old(root)"})})}return(o,n)=>{const t=_,r=h;return m(),l(r,{variant:"ghost",size:"icon",class:"size-9",onClick:a},{default:u(()=>[d(t,{name:{light:"i-ri:sun-line",dark:"i-ri:moon-line"}[p(e).currentColorScheme],class:"size-4"},null,8,["name"])]),_:1})}}});export{f as _};
