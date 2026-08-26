import { defineConfig } from "vitest/config";

// Ambiente determinístico para os testes: as rotas usam o Prisma mockado, pelo
// que a DATABASE_URL nunca é usada para ligar; os segredos só precisam de
// cumprir o mínimo de 32 caracteres validado em src/config.ts.
const testEnv = {
  NODE_ENV: "test",
  DATABASE_URL:
    process.env.DATABASE_URL ?? "postgresql://expense:expense@localhost:5432/expense_test",
  JWT_ACCESS_SECRET: process.env.JWT_ACCESS_SECRET ?? "test-access-secret-with-more-than-32-chars",
  JWT_REFRESH_SECRET:
    process.env.JWT_REFRESH_SECRET ?? "test-refresh-secret-with-more-than-32-chars",
};

export default defineConfig({
  test: {
    env: testEnv,
    // Sem restoreMocks: os testes definem implementações de mock ao nível do
    // módulo (ex.: prisma.$transaction) que têm de sobreviver entre testes.
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov"],
      include: ["src/**/*.ts"],
      exclude: ["src/**/*.test.ts", "src/types.ts"],
      // Thresholds após a Fase 3: todas as rotas CRUD têm testes; analytics,
      // app/server/prisma e partes de expenses continuam por cobrir.
      thresholds: {
        statements: 68,
        branches: 66,
        functions: 74,
        lines: 68,
      },
    },
  },
});
