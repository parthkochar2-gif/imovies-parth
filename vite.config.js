import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

function localApi() {
  return {
    name: 'local-api',
    apply: 'serve',
    async configureServer(server) {
      const { default: app } = await import('./api/[...route].js');
      server.middlewares.use(app);
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  for (const key of ['MONGODB_URI', 'JWT_SECRET']) {
    if (!process.env[key] && env[key]) process.env[key] = env[key];
  }

  return { plugins: [react(), localApi()] };
});
