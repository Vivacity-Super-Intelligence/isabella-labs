import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: { host: '127.0.0.1', port: 5173, strictPort: true },
  build: { rolldownOptions: { output: { manualChunks: (id: string) => {
    if (id.includes('node_modules') && /three|react-three/.test(id)) return 'three-vendor';
    if (id.includes('node_modules') && /[\\/]react(?:-dom)?[\\/]/.test(id)) return 'react-vendor';
  } } } }
});
