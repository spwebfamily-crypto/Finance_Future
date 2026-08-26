import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: "./src/test/setup.ts",
    css: true,
    restoreMocks: true,
    // Testes que carregam pdf.js/tesseract real em jsdom podem exceder 5s
    // quando a cobertura está ativa.
    testTimeout: 20_000,
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov"],
      include: ["src/**/*.{ts,tsx}"],
      exclude: [
        "src/**/*.test.{ts,tsx}",
        "src/test/**",
        "src/main.tsx",
        "src/routePreloads.ts",
        "src/vite-env.d.ts",
      ],
      // Linha de base da Fase 1: sobe à medida que páginas críticas ganham
      // testes na Fase 3/4.
      thresholds: {
        statements: 18,
        branches: 60,
        functions: 34,
        lines: 18,
      },
    },
  },
});
