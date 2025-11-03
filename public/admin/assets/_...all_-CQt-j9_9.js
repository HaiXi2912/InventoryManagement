
/**
 * 由 Fantastic-admin 提供技术支持
 * Powered by Fantastic-admin
 * https://fantastic-admin.hurui.me
 */
    
import{d as u,y as f,r as d,z as x,A as _,q as p,c as m,f as a,e as n,w as v,B as w,o as g,_ as B,h as y,t as N,j as h,x as s}from"./index-CdiJTMf6.js";const k={class:"absolute left-[50%] top-[50%] flex flex-col items-center justify-between lg-flex-row -translate-x-50% -translate-y-50% lg-gap-12"},b={class:"flex flex-col gap-4"},I=u({__name:"[...all]",setup(S){const l=p(),r=f(),e=d({inter:Number.NaN,countdown:5});x(()=>{e.value.inter&&window.clearInterval(e.value.inter)}),_(()=>{e.value.inter=window.setInterval(()=>{e.value.countdown--,e.value.countdown===0&&(e.value.inter&&window.clearInterval(e.value.inter),o())},1e3)});function o(){l.push(r.settings.home.fullPath)}return(C,t)=>{const c=B,i=w;return g(),m("div",k,[a(c,{name:"404",class:"text-[300px] lg-text-[400px]"}),n("div",b,[t[0]||(t[0]=n("h1",{class:"m-0 text-6xl font-sans"}," 404 ",-1)),t[1]||(t[1]=n("div",{class:"mx-0 text-xl text-secondary-foreground/50"}," 抱歉，你访问的页面不存在 ",-1)),n("div",null,[a(i,{onClick:o},{default:v(()=>[y(N(h(e).countdown)+" 秒后，返回首页 ",1)]),_:1})])])])}}});typeof s=="function"&&s(I);export{I as default};
