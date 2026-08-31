import cors from "cors";
import express from "express";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { env } from "./config.js";
import { errorHandler, notFound, sendError } from "./middleware.js";
import authRoutes from "./routes/auth.js";
import categoryRoutes from "./routes/categories.js";
import expenseRoutes from "./routes/expenses.js";
import budgetRoutes from "./routes/budgets.js";
import analyticsRoutes from "./routes/analytics.js";
import financialProfileRoutes from "./routes/financialProfile.js";
import incomeRoutes from "./routes/incomes.js";
import savingsGoalRoutes from "./routes/savingsGoals.js";
import recurringExpenseRoutes from "./routes/recurringExpenses.js";
import accountRoutes from "./routes/accounts.js";
import recurringIncomeRoutes from "./routes/recurringIncomes.js";
import debtRoutes from "./routes/debts.js";
import openBankingRoutes from "./routes/openBanking.js";
import internalOpenBankingRoutes from "./routes/internalOpenBanking.js";

export const app = express();

app.disable("x-powered-by");
if (env.TRUST_PROXY_HOPS > 0) app.set("trust proxy", env.TRUST_PROXY_HOPS);
app.use(helmet({ crossOriginResourcePolicy: false }));
app.use(cors({ origin: env.FRONTEND_ORIGIN, credentials: false }));
app.use(express.json({ limit: "1mb" }));

// Rede de segurança por IP para toda a API. Os limiters específicos (login,
// mutações de despesas) continuam a aplicar-se por cima deste teto genérico.
const globalApiLimiter = rateLimit({
  windowMs: env.RATE_LIMIT_WINDOW_MINUTES * 60_000,
  limit: env.RATE_LIMIT_MAX,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  skip: (request) => request.path === "/health",
  handler: (_request, response) =>
    sendError(
      response,
      429,
      "RATE_LIMITED",
      "Foram feitos demasiados pedidos. Aguarde alguns minutos e tente novamente.",
    ),
});
app.use("/api", globalApiLimiter);

app.get("/api/health", (_request, response) => {
  response.json({ data: { status: "ok" } });
});

app.use("/api/auth", authRoutes);
app.use("/api/categories", categoryRoutes);
app.use("/api/expenses", expenseRoutes);
app.use("/api/budgets", budgetRoutes);
app.use("/api/analytics", analyticsRoutes);
app.use("/api/financial-profile", financialProfileRoutes);
app.use("/api/incomes", incomeRoutes);
app.use("/api/savings-goals", savingsGoalRoutes);
app.use("/api/recurring-expenses", recurringExpenseRoutes);
app.use("/api/accounts", accountRoutes);
app.use("/api/recurring-incomes", recurringIncomeRoutes);
app.use("/api/debts", debtRoutes);
app.use("/api/open-banking", openBankingRoutes);
// Rotas internas de agendamento: protegidas por OPEN_BANKING_CRON_SECRET.
app.use("/api/internal", internalOpenBankingRoutes);

app.use(notFound);
app.use(errorHandler);
