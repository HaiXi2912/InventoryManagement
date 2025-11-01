import apiUser from '@/api/modules/user'
import router from '@/router'

export const useUserStore = defineStore(
  // 唯一ID
  'user',
  () => {
    const settingsStore = useSettingsStore()
    const routeStore = useRouteStore()
    const menuStore = useMenuStore()
    const tabbarStore = useTabbarStore()

    const account = ref(localStorage.account ?? '')
    const token = ref(localStorage.token ?? '')
    const refreshToken = ref(localStorage.refresh_token ?? '')
    const avatar = ref(localStorage.avatar ?? '')
    const role = ref<string>(localStorage.role ?? '')
    const permissions = ref<string[]>([])
    const isLogin = computed(() => {
      if (token.value) {
        return true
      }
      return false
    })

    // 登录
    async function login(data: {
      account: string
      password: string
    }) {
      const res = await apiUser.login(data)
      // 后端统一返回 { success, message, data }，此处取 data
      const payload = (res as any).data ?? res
      const user = payload.user ?? {}
      const tk = payload.token ?? ''
      const rtk = payload.refresh_token ?? ''

      localStorage.setItem('account', user.username || data.account)
      localStorage.setItem('token', tk)
      if (rtk) localStorage.setItem('refresh_token', rtk)
      localStorage.setItem('avatar', user.avatar || '/images/avatar.jpg')
      if (user.role) localStorage.setItem('role', user.role)
      account.value = user.username || data.account
      token.value = tk
      refreshToken.value = rtk
      avatar.value = user.avatar || '/images/avatar.jpg'
      role.value = user.role || ''
    }

    // 提供给拦截器更新 token/refresh_token
    function setTokens(tk: string, rtk?: string) {
      token.value = tk
      localStorage.setItem('token', tk)
      if (rtk) {
        refreshToken.value = rtk
        localStorage.setItem('refresh_token', rtk)
      }
    }

    // 注册
    async function register(data: {
      username: string
      email: string
      password: string
      real_name?: string
      phone?: string
    }) {
      await apiUser.register(data)
    }

    // 手动登出
    function logout(redirect = router.currentRoute.value.fullPath) {
      // 清除本地登录状态
      localStorage.removeItem('token')
      localStorage.removeItem('refresh_token')
      localStorage.removeItem('role')
      token.value = ''
      refreshToken.value = ''
      role.value = ''
      router.push({
        name: 'login',
        query: {
          ...(redirect !== settingsStore.settings.home.fullPath && router.currentRoute.value.name !== 'login' && { redirect }),
        },
      }).then(logoutCleanStatus)
    }
    // 请求登出（仅在存在 token 时才请求后端，以避免 401 循环）
    async function requestLogout() {
      const hasToken = Boolean(token.value || (typeof localStorage !== 'undefined' && localStorage.getItem('token')))
      const rtk = refreshToken.value || (typeof localStorage !== 'undefined' && localStorage.getItem('refresh_token')) || ''
      if (hasToken) {
        try {
          await apiUser.logout(rtk || undefined)
        }
        catch (e) {
          // ignore
        }
      }
      // 清除本地登录状态
      localStorage.removeItem('token')
      localStorage.removeItem('refresh_token')
      localStorage.removeItem('role')
      token.value = ''
      refreshToken.value = ''
      role.value = ''
      router.push({
        name: 'login',
        query: {
          ...(
            router.currentRoute.value.fullPath !== settingsStore.settings.home.fullPath
            && router.currentRoute.value.name !== 'login'
            && {
              redirect: router.currentRoute.value.fullPath,
            }
          ),
        },
      }).then(logoutCleanStatus)
    }
    // 登出后清除状态
    function logoutCleanStatus() {
      localStorage.removeItem('account')
      localStorage.removeItem('avatar')
      account.value = ''
      avatar.value = ''
      permissions.value = []
      settingsStore.updateSettings({}, true)
      tabbarStore.clean()
      routeStore.removeRoutes()
      menuStore.setActived(0)
    }

    // 获取权限
    async function getPermissions() {
      const res = await apiUser.permission()
      // 后端 /auth/me 返回 { data: { user } }
      const payload = (res as any).data ?? res
      const user = payload.user ?? payload?.data?.user ?? {}
      // 写入角色
      if (user.role) {
        role.value = user.role
        localStorage.setItem('role', user.role)
      }
      // 业务里 permissions 仅用于演示，这里基于角色简单映射
      const r = user.role || role.value || 'staff'
      const map: Record<string, string[]> = {
        admin: ['permission.browse', 'permission.create', 'permission.edit', 'permission.remove'],
        manager: ['permission.browse', 'permission.create', 'permission.edit'],
        staff: ['permission.browse'],
        agent: ['permission.browse'],
      }
      permissions.value = map[r] || ['permission.browse']
    }
    // 修改密码
    async function editPassword(data: {
      password: string
      newPassword: string
    }) {
      await apiUser.passwordEdit(data)
    }

    return {
      account,
      token,
      refreshToken,
      avatar,
      role,
      permissions,
      isLogin,
      login,
      register,
      logout,
      requestLogout,
      getPermissions,
      editPassword,
      setTokens,
    }
  },
)
