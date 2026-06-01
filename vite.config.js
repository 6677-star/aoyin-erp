import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  define: {
    __APP_VERSION__: JSON.stringify(process.env.npm_package_version || '1.0.5'),
    __BUILD_TIME__: JSON.stringify(new Date().toLocaleString('zh-CN', { hour12: false })),
  },
});
