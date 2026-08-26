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
      // Linha de base da Fase 1: sobe à medida que a Fase 3 cobre as rotas
      // restantes (auth, budgets, categories, incomes, recurring*, debts).
      thresholds: {
        statements: 35,
        branches: 60,
        functions: 50,
        lines: 35,
      },
    },
  },
});
