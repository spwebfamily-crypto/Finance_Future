import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    env: {
      NODE_ENV: 'test',
      DATABASE_URL: 'postgresql://expensesnap:expensesnap@localhost:5432/expensesnap_test',
      JWT_ACCESS_SECRET: 'test-access-secret-that-is-more-than-32-characters',
      JWT_REFRESH_SECRET: 'test-refresh-secret-that-is-more-than-32-characters',
      FRONTEND_ORIGIN: 'http://localhost:5173',
      UPLOAD_DIR: 'uploads-test',
    },
  },
});
