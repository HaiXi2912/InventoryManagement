
/**
 * 由 Fantastic-admin 提供技术支持
 * Powered by Fantastic-admin
 * https://fantastic-admin.hurui.me
 */
    
import{d,aA as p,J as f,c as b,o as i,n as r,j as a,ac as c,ah as V,aB as _,ad as v,ae as g,I as x,v as k}from"./index-CdiJTMf6.js";const B=d({__name:"Input",props:{defaultValue:{},modelValue:{},class:{}},emits:["update:modelValue"],setup(s,{emit:o}){const e=s,l=p(e,"modelValue",o,{passive:!0,defaultValue:e.defaultValue});return(n,u)=>f((i(),b("input",{"onUpdate:modelValue":u[0]||(u[0]=m=>V(l)?l.value=m:null),class:r(a(c)("flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",e.class))},null,2)),[[_,a(l)]])}}),M=d({name:"FaInput",__name:"index",props:v({disabled:{type:Boolean},class:{}},{modelValue:{},modelModifiers:{}}),emits:["update:modelValue"],setup(s){const o=s,e=g(s,"modelValue");return(t,l)=>(i(),x(a(B),{modelValue:e.value,"onUpdate:modelValue":l[0]||(l[0]=n=>e.value=n),disabled:t.disabled,autocomplete:"off",class:r(a(c)("w-[200px]",o.class))},null,8,["modelValue","disabled","class"]))}}),I=k(M,[["__scopeId","data-v-e7ac8986"]]);export{I as _};
