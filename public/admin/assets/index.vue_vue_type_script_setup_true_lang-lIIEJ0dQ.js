
/**
 * 由 Fantastic-admin 提供技术支持
 * Powered by Fantastic-admin
 * https://fantastic-admin.hurui.me
 */
    
import{i as p}from"./logo-A4CMGNjt.js";import{d as u,y as g,r as a,F as h,I as d,o,i as _,j as e,n as f,w as k,c as r,H as i,t as w}from"./index-CdiJTMf6.js";const x=["src"],b={key:1,class:"block truncate font-bold"},S=u({name:"Logo",__name:"index",props:{showLogo:{type:Boolean,default:!0},showTitle:{type:Boolean,default:!0}},setup(y){const t=g(),s=a("Fantastic-admin 基础版"),l=a(p),c=h(()=>t.settings.home.enable?t.settings.home.fullPath:"");return(n,L)=>{const m=_("RouterLink");return o(),d(m,{to:e(c),class:f(["h-[var(--g-sidebar-logo-height)] w-inherit flex-center gap-2 px-3 text-inherit no-underline",{"cursor-default":!e(t).settings.home.enable}]),title:e(s)},{default:k(()=>[n.showLogo?(o(),r("img",{key:0,src:e(l),class:"logo h-[30px] w-[30px] object-contain"},null,8,x)):i("",!0),n.showTitle?(o(),r("span",b,w(e(s)),1)):i("",!0)]),_:1},8,["to","class","title"])}}});export{S as _};
