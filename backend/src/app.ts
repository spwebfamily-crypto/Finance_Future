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

export const app = express();

app.disable('x-powered-by');
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

app.use(notFound);
app.use(errorHandler);
