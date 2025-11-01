import axios from 'axios'
// import qs from 'qs'
import { toast } from 'vue-sonner'

// 对后端统一响应结构进行类型声明
export interface ApiResponse<T = any> {
  success: boolean
  message?: string
  data?: T
  // 兼容旧字段
  status?: number
  error?: string
  [key: string]: any
}

// 请求重试配置
const MAX_RETRY_COUNT = 3 // 最大重试次数
const RETRY_DELAY = 1000 // 重试延迟时间（毫秒）

// 记录是否正在执行登出，避免并发重复触发
let isLoggingOut = false

// 刷新令牌状态
let isRefreshing = false
let refreshPromise: Promise<string> | null = null

// 扩展 AxiosRequestConfig 类型
declare module 'axios' {
  export interface AxiosRequestConfig {
    retry?: boolean
    retryCount?: number
    _retry?: boolean
  }
}

const resolveBaseURL = () => {
  const useProxy = import.meta.env.DEV && import.meta.env.VITE_OPEN_PROXY
  const fromEnv = import.meta.env.VITE_APP_API_BASEURL as string | undefined
  // 优先使用开发代理 /api，其次使用环境变量，最后兜底 /api
  if (useProxy) return '/api'
  return fromEnv && fromEnv.trim() !== '' ? fromEnv : '/api'
}

const api = axios.create({
  baseURL: resolveBaseURL(),
  timeout: 1000 * 60,
  responseType: 'json',
})

// 原生实例用于刷新令牌，避免拦截器相互影响
const raw = axios.create({
  baseURL: resolveBaseURL(),
  timeout: 1000 * 60,
  responseType: 'json',
})

console.log('API模块已加载');

api.interceptors.request.use(
  (request) => {
    // 统一附加 Authorization 头；优先从 Pinia 读取，失败则回退 localStorage
    let bearer = ''
    try {
      const userStore = useUserStore();
      console.log('[API请求拦截] isLogin:', userStore?.isLogin, 'token:', userStore?.token);
      if (userStore?.isLogin && userStore?.token) bearer = userStore.token as unknown as string
    } catch (e) {
      // 可能发生在应用早期阶段尚未激活 Pinia
    }
    if (!bearer) {
      const t = (typeof localStorage !== 'undefined') ? localStorage.getItem('token') : ''
      if (t) bearer = t
    }
    if (request.headers && bearer) {
      request.headers.Authorization = `Bearer ${bearer}`
    }

    // 是否将 POST 请求参数进行字符串化处理
    if (request.method === 'post') {
      // request.data = qs.stringify(request.data, {
      //   arrayFormat: 'brackets',
      // })
    }
    return request
  },
)

// 辅助：执行令牌刷新，返回新 token
async function doRefreshToken(): Promise<string> {
  try {
    let refreshToken = ''
    try {
      const userStore = useUserStore()
      refreshToken = (userStore as any)?.refreshToken || ''
    } catch (_) {}
    if (!refreshToken && typeof localStorage !== 'undefined') {
      refreshToken = localStorage.getItem('refresh_token') || ''
    }
    if (!refreshToken) throw new Error('无刷新令牌')

    const res = await raw.post('/auth/refresh', { refresh_token: refreshToken })
    // 后端统一返回 { success, data: { token, refresh_token } }
    const payload = (res as any).data ?? res
    const newToken: string = payload.token || payload?.data?.token
    const newRefresh: string = payload.refresh_token || payload?.data?.refresh_token
    if (!newToken) throw new Error('刷新失败')

    try {
      const userStore = useUserStore()
      if (userStore && 'setTokens' in (userStore as any)) {
        ;(userStore as any).setTokens(newToken, newRefresh)
      } else {
        localStorage.setItem('token', newToken)
        if (newRefresh) localStorage.setItem('refresh_token', newRefresh)
      }
    } catch (_) {
      localStorage.setItem('token', newToken)
      if (newRefresh) localStorage.setItem('refresh_token', newRefresh)
    }
    return newToken
  } catch (err) {
    throw err
  }
}

// 处理错误信息的函数
function handleError(error: any) {
  const status = error?.response?.status ?? error?.status
  if (status === 401) {
    // 401时的统一处理：仅在存在 token 且非认证接口时触发一次性登出
    try {
      const userStore = useUserStore()
      const hasToken = Boolean(userStore?.token || (typeof localStorage !== 'undefined' && localStorage.getItem('token')))
      const url: string = (error?.config?.url || '') as string
      const isAuthEndpoint = /\/auth\/(login|logout|register|refresh)$/i.test(url)
      if (!hasToken) {
        // 无token，直接跳转登录页并清理状态，不再请求 /auth/logout，避免循环
        if (!isLoggingOut) {
          isLoggingOut = true
          userStore.logout()
          setTimeout(() => { isLoggingOut = false }, 300)
        }
      }
      else if (!isAuthEndpoint) {
        // 有token且不是认证接口，触发一次请求登出
        if (!isLoggingOut) {
          isLoggingOut = true
          userStore.requestLogout().finally(() => { isLoggingOut = false })
        }
      }
      // 对于认证接口本身的401，直接透传错误
    } catch (_) {
      // 忽略
    }
  }
  else {
    let message: string = error?.response?.data?.message || error.message || '请求失败'
    if (message === 'Network Error') {
      message = '后端网络故障'
    }
    else if ((error?.code === 'ECONNABORTED') || String(message).includes('timeout')) {
      message = '接口请求超时'
    }
    else if (String(message).includes('Request failed with status code')) {
      message = `接口${String(message).slice(-3)}异常`
    }
    toast.error('Error', {
      description: message,
    })
  }
  return Promise.reject(error)
}

api.interceptors.response.use(
  (response) => {
    /**
     * 全局拦截请求发送后返回的数据，如果数据有报错则在这做全局的错误提示
     * 后端返回格式为：{ success: true/false, message: '', data: {} }
     * 成功时 success 为 true，失败时为 false
     */
    if (typeof response.data === 'object') {
      if (response.data.success === true) {
        return Promise.resolve(response.data)
      }
      else if (response.data.success === false) {
        if (response.data.message) {
          toast.error('Error', {
            description: response.data.message,
          })
        }
        return Promise.reject(response.data)
      }
      else {
        // 兼容旧格式，如果没有success字段，按原来的逻辑处理
        if (response.data.status === 1) {
          if (response.data.error !== '') {
            toast.warning('Warning', {
              description: response.data.error,
            })
            return Promise.reject(response.data)
          }
        }
        else {
          // 旧格式的未授权，交由错误拦统一处理
        }
        return Promise.resolve(response.data)
      }
    }
    else {
      return Promise.reject(response.data)
    }
  },
  async (error) => {
    const status = error?.response?.status ?? error?.status
    const config = error.config || {}

    // 如果是 401，尝试刷新令牌并重放请求（避免对认证接口与已重试请求）
    if (status === 401 && !config._retry) {
      try {
        const url: string = (config.url || '') as string
        const isAuthEndpoint = /\/auth\/(login|logout|register|refresh)$/i.test(url)
        // 获取 refresh_token
        let refreshToken = ''
        try {
          const userStore = useUserStore()
          refreshToken = (userStore as any)?.refreshToken || ''
        } catch (_) {}
        if (!refreshToken && typeof localStorage !== 'undefined') {
          refreshToken = localStorage.getItem('refresh_token') || ''
        }

        if (!isAuthEndpoint && refreshToken) {
          // 串行化刷新过程
          if (!isRefreshing) {
            isRefreshing = true
            refreshPromise = doRefreshToken()
              .catch(async () => {
                try { const userStore = useUserStore(); await userStore.requestLogout() } catch (_) {}
                throw error
              })
              .finally(() => { isRefreshing = false; refreshPromise = null })
          }
          // 等待刷新完成后重放当前请求
          const newToken = await (refreshPromise as Promise<string>)
          // 标记避免重复刷新
          config._retry = true
          // 覆盖令牌并重放
          config.headers = config.headers || {}
          config.headers.Authorization = `Bearer ${newToken}`
          return api(config)
        }
      } catch (e) {
        // 刷新流程失败，走统一错误处理
        return handleError(error)
      }
    }

    // 获取请求配置
    const cfg = error.config
    // 如果配置不存在或未启用重试，则直接处理错误
    if (!cfg || !cfg.retry) {
      return handleError(error)
    }
    // 设置重试次数
    cfg.retryCount = cfg.retryCount || 0
    // 判断是否超过重试次数
    if (cfg.retryCount >= MAX_RETRY_COUNT) {
      return handleError(error)
    }
    // 重试次数自增
    cfg.retryCount += 1
    // 延迟重试
    await new Promise(resolve => setTimeout(resolve, RETRY_DELAY))
    // 重新发起请求
    return api(cfg)
  },
)

export default api
