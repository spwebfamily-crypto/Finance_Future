import { defineConfig, devices } from "@playwright/test";

const isCI = Boolean(process.env.CI);

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  forbidOnly: isCI,
  retries: isCI ? 2 : 0,
  workers: isCI ? 1 : undefined,
  reporter: [["list"], ["html", { open: "never", outputFolder: "playwright-report" }]],
  timeout: 30_000,
  expect: {
    timeout: 8_000,
  },
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:5173",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: [
    {
      command: "npm run dev -w backend",
      url: "http://127.0.0.1:3000/api/health",
      reuseExistingServer: !isCI,
      timeout: 120_000,
      // Open Banking em modo fake para o E2E: o provedor em memória simula o
      // banco e nunca é usado fora dos testes. A chave é apenas de teste.
      env: {
        OPEN_BANKING_ENABLED: "true",
        OPEN_BANKING_PROVIDER: "fake",
        OPEN_BANKING_DEFAULT_COUNTRY: "PT",
        OPEN_BANKING_CALLBACK_URL: "http://localhost:3000/api/open-banking/callback",
        // Igual à baseURL do Playwright: o redirecionamento do callback tem de
        // voltar à mesma origem, senão a sessão do navegador perde-se.
        FRONTEND_ORIGIN: "http://127.0.0.1:5173",
        OPEN_BANKING_CRON_SECRET: "playwright-cron-secret-with-at-least-32-characters",
        OPEN_BANKING_DATA_KEY_B64: "ZXhwZW5zZXNuYXAtZTJlLWZha2UtcHJvdmlkZXItdGU=",
        OPEN_BANKING_SYNC_INTERVAL_MINUTES: "360",
      },
    },
    {
      command: "npm run dev -w frontend -- --host 127.0.0.1",
      url: "http://127.0.0.1:5173",
      reuseExistingServer: !isCI,
      timeout: 120_000,
    },
  ],
});
