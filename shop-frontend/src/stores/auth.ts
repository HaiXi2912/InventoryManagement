import { defineStore } from 'pinia'

export const useAuthStore = defineStore('auth', {
  state: () => ({
    token: (typeof localStorage !== 'undefined' ? localStorage.getItem('token') : '') || '',
  }),
  getters: {
    isLogin: (s) => Boolean(s.token),
    userId: (s) => {
      try{
        if(!s.token) return null
        const payload = JSON.parse(atob(s.token.split('.')[1] || ''))
        return payload?.id || payload?.user_id || null
      }catch{ return null }
    },
  },
  actions: {
    setToken(t: string){ this.token = t; if(typeof localStorage!=='undefined'){ localStorage.setItem('token', t) } },
    logout(){ this.token = ''; if(typeof localStorage!=='undefined'){ localStorage.removeItem('token') } },
  }
})
