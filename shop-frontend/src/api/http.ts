import axios from 'axios'
import router from '@/router'

// 在开发环境，若当前端口不是 5173（例如被占用自动切到 5174 的旧实例），
// 则直接将 baseURL 指向后端 3000，绕过 Vite 代理，避免 /api 404。
const isDev = import.meta.env.DEV
let base = ''
try {
  const port = (typeof window !== 'undefined') ? window.location.port : ''
  if (isDev && port && port !== '5173') {
    base = 'http://127.0.0.1:3000'
  }
} catch {}

const http = axios.create({
  baseURL: base,
  timeout: 15000,
})

http.interceptors.request.use((config) => {
  const token = localStorage.getItem('token')
  if (token) {
    config.headers = config.headers || {}
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

http.interceptors.response.use(
  (res) => res,
  (error) => {
    if (error?.response?.status === 401) {
      const redirect = encodeURIComponent(location.pathname + location.search)
      router.push(`/login?redirect=${redirect}`)
    }
    return Promise.reject(error)
  }
)

export default http
