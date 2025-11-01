
/**
 * 由 Fantastic-admin 提供技术支持
 * Powered by Fantastic-admin
 * https://fantastic-admin.hurui.me
 */
    
import{d,ax as p,G as f,c as b,o as i,n as r,j as a,a9 as m,ae as V,ay as _,aa as g,ab as v,F as x,p as k}from"./index-BOHDOdY5.js";const M=d({__name:"Input",props:{defaultValue:{},modelValue:{},class:{}},emits:["update:modelValue"],setup(s,{emit:o}){const e=s,l=p(e,"modelValue",o,{passive:!0,defaultValue:e.defaultValue});return(n,u)=>f((i(),b("input",{"onUpdate:modelValue":u[0]||(u[0]=c=>V(l)?l.value=c:null),class:r(a(m)("flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",e.class))},null,2)),[[_,a(l)]])}}),w=d({name:"FaInput",__name:"index",props:g({disabled:{type:Boolean},class:{}},{modelValue:{},modelModifiers:{}}),emits:["update:modelValue"],setup(s){const o=s,e=v(s,"modelValue");return(t,l)=>(i(),x(a(M),{modelValue:e.value,"onUpdate:modelValue":l[0]||(l[0]=n=>e.value=n),disabled:t.disabled,autocomplete:"off",class:r(a(m)("w-[200px]",o.class))},null,8,["modelValue","disabled","class"]))}}),B=k(w,[["__scopeId","data-v-d8306eb6"]]);export{B as _};
