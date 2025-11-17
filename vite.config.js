import { fileURLToPath, URL } from 'node:url'

import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueDevTools from 'vite-plugin-vue-devtools'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    vue(),
    vueDevTools(),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url))
    },
  },
  build: {
    chunkSizeWarningLimit: 3000, // 提高警告阈值到 3000 KB，消除警告
    rollupOptions: {
      external: ['ROSLIB'],
      output: {
        globals: {
          'ROSLIB': 'ROSLIB'
        },
        // 手动分包：将大型库分离到独立文件
        manualChunks: {
          'three': ['three'],
          'echarts': ['echarts'],
          'element-plus': ['element-plus']
        }
      }
    }
  }
})
