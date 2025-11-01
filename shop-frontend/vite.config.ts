import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    vue(),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url))
    },
  },
  // 开发环境代理后端 API
  server: {
    host: true,          // 监听 0.0.0.0，确保 localhost 可访问
    port: 5175,          // 固定端口
    strictPort: false,   // 若被占用则自动递增
    open: true,          // 启动自动打开浏览器
    proxy: {
      '/api': {
        target: 'http://localhost:3006',
        changeOrigin: true,
      },
      '/uploads': {
        target: 'http://localhost:3006',
        changeOrigin: true,
      }
    }
  },
})
