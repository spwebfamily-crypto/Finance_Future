import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { access, unlink } from 'node:fs/promises';
import path from 'node:path';
import { Prisma } from '@prisma/client';
import { Router } from 'express';
import multer from 'multer';
import { env } from '../config.js';
import { ApiError, requireAuth, sendError } from '../middleware.js';
import { prisma } from '../prisma.js';
import type { AuthenticatedRequest } from '../types.js';
import { expenseCreateSchema, expenseFiltersSchema, expenseUpdateSchema } from '../validation.js';

const uploadDirectory = path.resolve(process.cwd(), env.UPLOAD_DIR);
mkdirSync(uploadDirectory, { recursive: true });

const mimeExtensions: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
};

const upload = multer({
  storage: multer.diskStorage({
    destination: uploadDirectory,
    filename: (_request, file, callback) => {
      callback(null, `${randomUUID()}${mimeExtensions[file.mimetype] ?? ''}`);
    },
  }),
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
  fileFilter: (_request, file, callback) => {
    if (!mimeExtensions[file.mimetype]) {
      callback(new ApiError(415, 'INVALID_RECEIPT_TYPE', 'Use uma imagem JPG, PNG ou WEBP.'));
      return;
    }
    callback(null, true);
  },
});

const router = Router();
router.use(requireAuth);

const expenseInclude = { category: true } satisfies Prisma.ExpenseInclude;

type ExpenseWithCategory = Prisma.ExpenseGetPayload<{ include: typeof expenseInclude }>;

function presentExpense(expense: ExpenseWithCategory) {
  return {
    ...expense,
    amount: expense.amount.toFixed(2),
    receiptImageUrl: expense.receiptImageUrl ? `/api/expenses/${expense.id}/receipt` : null,
  };
}

async function categoryBelongsToUser(categoryId: string, userId: string) {
  return prisma.category.findFirst({ where: { id: categoryId, userId }, select: { id: true } });
}

function receiptFilePath(receiptImageUrl: string | null | undefined) {
  if (!receiptImageUrl) return null;
  const filename = path.basename(receiptImageUrl);
  return path.join(uploadDirectory, filename);
}

async function removeReceiptFile(filePath: string | null | undefined) {
  if (!filePath) return;
  try {
    await unlink(filePath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
}

function nextUtcDay(date: string) {
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + 1);
  return value;
}

router.get('/', async (request: AuthenticatedRequest, response, next) => {
  try {
    const filters = expenseFiltersSchema.parse(request.query);
    const dateFilter: Prisma.DateTimeFilter = {};
    if (filters.from) dateFilter.gte = new Date(`${filters.from}T00:00:00.000Z`);
    if (filters.to) dateFilter.lt = nextUtcDay(filters.to);

    const expenses = await prisma.expense.findMany({
      where: {
        userId: request.user!.id,
        ...(filters.category ? { categoryId: filters.category } : {}),
        ...(Object.keys(dateFilter).length ? { date: dateFilter } : {}),
      },
      include: expenseInclude,
      orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
    });

    return response.json({ data: expenses.map(presentExpense) });
  } catch (error) {
    return next(error);
  }
});

router.get('/:id/receipt', async (request: AuthenticatedRequest, response, next) => {
  try {
    const expense = await prisma.expense.findFirst({
      where: { id: request.params.id, userId: request.user!.id },
      select: { receiptImageUrl: true },
    });
    if (!expense) return sendError(response, 404, 'EXPENSE_NOT_FOUND', 'Despesa nao encontrada.');

    const filePath = receiptFilePath(expense.receiptImageUrl);
    if (!filePath) return sendError(response, 404, 'RECEIPT_NOT_FOUND', 'Esta despesa nao tem comprovativo.');
    try {
      await access(filePath);
    } catch {
      return sendError(response, 404, 'RECEIPT_NOT_FOUND', 'O comprovativo nao foi encontrado.');
    }

    return response.sendFile(filePath, (error) => {
      if (error && !response.headersSent) next(error);
    });
  } catch (error) {
    return next(error);
  }
});

router.get('/:id', async (request: AuthenticatedRequest, response, next) => {
  try {
    const expense = await prisma.expense.findFirst({
      where: { id: request.params.id, userId: request.user!.id },
      include: expenseInclude,
    });

    if (!expense) {
      return sendError(response, 404, 'EXPENSE_NOT_FOUND', 'Despesa não encontrada.');
    }

    return response.json({ data: presentExpense(expense) });
  } catch (error) {
    return next(error);
  }
});

router.post('/', upload.single('receipt'), async (request: AuthenticatedRequest, response, next) => {
  try {
    const input = expenseCreateSchema.parse(request.body);
    const category = await categoryBelongsToUser(input.categoryId, request.user!.id);
    if (!category) {
      await removeReceiptFile(request.file?.path);
      return sendError(response, 404, 'CATEGORY_NOT_FOUND', 'Categoria não encontrada.');
    }

    const expense = await prisma.expense.create({
      data: {
        description: input.description,
        location: input.location,
        amount: input.amount,
        date: input.date,
        categoryId: input.categoryId,
        userId: request.user!.id,
        receiptImageUrl: request.file?.filename ?? null,
      },
      include: expenseInclude,
    });

    return response.status(201).json({ data: presentExpense(expense) });
  } catch (error) {
    await removeReceiptFile(request.file?.path);
    return next(error);
  }
});

router.patch('/:id', upload.single('receipt'), async (request: AuthenticatedRequest, response, next) => {
  try {
    const input = expenseUpdateSchema.parse(request.body);
    const existing = await prisma.expense.findFirst({
      where: { id: request.params.id, userId: request.user!.id },
    });

    if (!existing) {
      await removeReceiptFile(request.file?.path);
      return sendError(response, 404, 'EXPENSE_NOT_FOUND', 'Despesa não encontrada.');
    }
    if (input.categoryId && !(await categoryBelongsToUser(input.categoryId, request.user!.id))) {
      await removeReceiptFile(request.file?.path);
      return sendError(response, 404, 'CATEGORY_NOT_FOUND', 'Categoria não encontrada.');
    }

    const { removeReceipt, ...changes } = input;
    const nextReceiptUrl = request.file
      ? request.file.filename
      : removeReceipt
        ? null
        : undefined;

    const expense = await prisma.expense.update({
      where: { id: existing.id },
      data: {
        ...changes,
        ...(nextReceiptUrl === undefined ? {} : { receiptImageUrl: nextReceiptUrl }),
      },
      include: expenseInclude,
    });

    if ((request.file || removeReceipt) && existing.receiptImageUrl) {
      await removeReceiptFile(receiptFilePath(existing.receiptImageUrl));
    }

    return response.json({ data: presentExpense(expense) });
  } catch (error) {
    await removeReceiptFile(request.file?.path);
    return next(error);
  }
});

router.delete('/:id', async (request: AuthenticatedRequest, response, next) => {
  try {
    const expense = await prisma.expense.findFirst({
      where: { id: request.params.id, userId: request.user!.id },
    });
    if (!expense) {
      return sendError(response, 404, 'EXPENSE_NOT_FOUND', 'Despesa não encontrada.');
    }

    await prisma.expense.delete({ where: { id: expense.id } });
    await removeReceiptFile(receiptFilePath(expense.receiptImageUrl));
    return response.status(204).end();
  } catch (error) {
    return next(error);
  }
});

export default router;
