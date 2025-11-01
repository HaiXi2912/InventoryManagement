import api from '@/api'

export default {
  // 日清/月结口径查询与关账
  getDaily(date: string){
    return api.get('/finance/clearing/daily', { params: { date } })
  },
  closeDaily(date: string){
    return api.post('/finance/clearing/daily/close', { date })
  },
  getMonthly(period: string){
    return api.get('/finance/clearing/monthly', { params: { period } })
  },
  closeMonthly(period: string){
    return api.post('/finance/clearing/monthly/close', { period })
  },
  exportMonthly(period: string){
    return api.get('/finance/statements/export', { params: { period }, responseType: 'blob' })
  },
  // 工厂结算：日清/曰月以及记录查询
  settleDaily(payload: { date: string; amount?: number; method?: string; remark?: string }){
    return api.post('/finance/factory/settle/daily', payload)
  },
  settleMonthly(payload: { period: string; amount?: number; method?: string; remark?: string }){
    return api.post('/finance/factory/settle/monthly', payload)
  },
  getFactoryPayments(params: { page?: number; size?: number; scope_type?: 'daily'|'monthly'; scope_value?: string; start_date?: string; end_date?: string }){
    return api.get('/finance/factory/payments', { params })
  }
}
