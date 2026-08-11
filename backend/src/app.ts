import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { env } from './config.js';
import { errorHandler, notFound } from './middleware.js';
import authRoutes from './routes/auth.js';
import categoryRoutes from './routes/categories.js';
import expenseRoutes from './routes/expenses.js';
import budgetRoutes from './routes/budgets.js';
import analyticsRoutes from './routes/analytics.js';
import financialProfileRoutes from './routes/financialProfile.js';
import incomeRoutes from './routes/incomes.js';
import savingsGoalRoutes from './routes/savingsGoals.js';
import recurringExpenseRoutes from './routes/recurringExpenses.js';
import accountRoutes from './routes/accounts.js';
import recurringIncomeRoutes from './routes/recurringIncomes.js';
import debtRoutes from './routes/debts.js';

export const app = express();

app.disable('x-powered-by');
if (env.TRUST_PROXY_HOPS > 0) app.set('trust proxy', env.TRUST_PROXY_HOPS);
app.use(helmet({ crossOriginResourcePolicy: false }));
app.use(cors({ origin: env.FRONTEND_ORIGIN, credentials: false }));
app.use(express.json({ limit: '1mb' }));

app.get('/api/health', (_request, response) => {
  response.json({ data: { status: 'ok' } });
});

app.use('/api/auth', authRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/expenses', expenseRoutes);
app.use('/api/budgets', budgetRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/financial-profile', financialProfileRoutes);
app.use('/api/incomes', incomeRoutes);
app.use('/api/savings-goals', savingsGoalRoutes);
app.use('/api/recurring-expenses', recurringExpenseRoutes);
app.use('/api/accounts', accountRoutes);
app.use('/api/recurring-incomes', recurringIncomeRoutes);
app.use('/api/debts', debtRoutes);

app.use(notFound);
app.use(errorHandler);
