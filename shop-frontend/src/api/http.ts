import axios from 'axios'
import router from '@/router'

const http = axios.create({
  baseURL: '',
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
