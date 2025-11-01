import { defineStore } from 'pinia'
import http from '@/api/http'

export interface CartItem { sku_id: number; quantity: number }

export const useCartStore = defineStore('cart', {
  state: () => ({
    items: JSON.parse(localStorage.getItem('cart') || '[]') as CartItem[],
  }),
  getters: {
    count: (s) => s.items.reduce((a, b) => a + b.quantity, 0),
    // 新增总金额占位（需要 SKU 价格时前端可在页面侧计算）
  },
  actions: {
    add(item: CartItem){
      const found = this.items.find(i => i.sku_id === item.sku_id)
      if(found) found.quantity += item.quantity
      else this.items.push({ ...item })
      localStorage.setItem('cart', JSON.stringify(this.items))
    },
    remove(sku_id: number){
      this.items = this.items.filter(i => i.sku_id !== sku_id)
      localStorage.setItem('cart', JSON.stringify(this.items))
    },
    clear(){
      this.items = []
      localStorage.setItem('cart', JSON.stringify(this.items))
    },
    async checkout(address_id: number){
      const payload = { items: this.items, address_id }
      const { data } = await http.post('/api/orders/checkout', payload)
      return data
    },
  }
})
