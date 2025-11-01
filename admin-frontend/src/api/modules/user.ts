import api from '../index'

export default {
  // 登录
  login: (data: {
    account: string
    password: string
  }) => api.post('/auth/login', {
    username: data.account,
    password: data.password
  }),

  // 注册
  register: (data: {
    username: string
    password: string
    email: string
    real_name?: string
    phone?: string
  }) => api.post('/auth/register', data),

  // 登出（可选携带 refresh_token 以撤销）
  logout: (refresh_token?: string) => api.post('/auth/logout', refresh_token ? { refresh_token } : undefined),

  // 获取当前用户
  permission: () => api.get('/auth/me'),

  // 修改密码（后端支持 POST/PUT，这里使用 POST）
  passwordEdit: (data: {
    password: string
    newPassword: string
  }) => api.post('/auth/password', data),
}
