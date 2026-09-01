import { access } from "node:fs/promises";
import { Prisma } from "@prisma/client";
import { Router } from "express";
import rateLimit from "express-rate-limit";
import { ApiError, requireAuth, sendError } from "../middleware.js";
import { prisma } from "../prisma.js";
import {
  assertReceiptQuota,
  assertValidReceipt,
  lockReceiptStorage,
  mimeExtensions,
  normalizedReceiptMime,
  receiptDownloadGuard,
  receiptDownloadIpLimiter,
  receiptDownloadUserLimiter,
  receiptFileName,
  receiptFilePath,
  receiptMemoryGuard,
  removeReceiptFileBestEffort,
  setPrivateReceiptHeaders,
  upload,
} from "../services/receipts.js";
import type { AuthenticatedRequest } from "../types.js";
import {
  expenseCreateSchema,
  expenseFiltersSchema,
  expenseImportSchema,
  expenseUpdateSchema,
} from "../validation.js";

const router = Router();
router.use(requireAuth);

const expenseMutationLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  keyGenerator: (request) => (request as AuthenticatedRequest).user!.id,
  handler: (_request, response) =>
    sendError(
      response,
      429,
      "EXPENSE_RATE_LIMITED",
      "Foram feitas demasiadas alterações em pouco tempo. Aguarde alguns minutos e tente novamente.",
    ),
});

const expenseIpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 60,
  standardHeaders: false,
  legacyHeaders: false,
  handler: (_request, response) =>
    sendError(
      response,
      429,
      "EXPENSE_IP_RATE_LIMITED",
      "Foram feitos demasiados pedidos a partir desta ligação. Aguarde alguns minutos e tente novamente.",
    ),
});

const expensePublicSelect = {
  id: true,
  categoryId: true,
  description: true,
  location: true,
  amount: true,
  date: true,
  receiptImageUrl: true,
  receiptMimeType: true,
  createdAt: true,
  updatedAt: true,
  category: {
    select: { id: true, name: true, icon: true, isDefault: true },
  },
  account: {
    select: { id: true, name: true, type: true },
  },
  bankTransaction: {
    select: { id: true },
  },
} satisfies Prisma.ExpenseSelect;

type PublicExpenseRecord = Prisma.ExpenseGetPayload<{ select: typeof expensePublicSelect }>;

function presentExpense(expense: PublicExpenseRecord) {
  const {
    receiptImageUrl: legacyReceiptUrl,
    receiptMimeType: storedMimeType,
    bankTransaction,
    ...publicExpense
  } = expense;
  const hasReceipt = Boolean(storedMimeType || legacyReceiptUrl);
  const receiptMimeType =
    storedMimeType === "application/pdf" || legacyReceiptUrl?.endsWith(".pdf")
      ? "application/pdf"
      : hasReceipt
        ? "image/*"
        : null;
  return {
    ...publicExpense,
    source: bankTransaction ? "bank" : "manual",
    amount: expense.amount.toFixed(2),
    receiptImageUrl: hasReceipt ? `/api/expenses/${expense.id}/receipt` : null,
    receiptMimeType,
  };
}

async function categoryBelongsToUser(categoryId: string, userId: string) {
  return prisma.category.findFirst({ where: { id: categoryId, userId }, select: { id: true } });
}

async function accountBelongsToUser(accountId: string, userId: string) {
  return prisma.account.findFirst({ where: { id: accountId, userId }, select: { id: true } });
}

function nextUtcDay(date: string) {
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + 1);
  return value;
}

function importSignature(item: {
  categoryId: string;
  description: string;
  amount: string;
  date: Date;
}) {
  return [
    item.date.toISOString().slice(0, 10),
    item.categoryId,
    item.description.trim().toLocaleLowerCase("pt-PT"),
    new Prisma.Decimal(item.amount).toFixed(2),
  ].join("|");
}

router.get("/", async (request: AuthenticatedRequest, response, next) => {
  try {
    const filters = expenseFiltersSchema.parse(request.query);
    const dateFilter: Prisma.DateTimeFilter = {};
    if (filters.from) dateFilter.gte = new Date(`${filters.from}T00:00:00.000Z`);
    if (filters.to) dateFilter.lt = nextUtcDay(filters.to);

    const page = filters.page ?? 1;
    const pageSize = filters.pageSize ?? 100;
    const where: Prisma.ExpenseWhereInput = {
      userId: request.user!.id,
      ...(filters.category ? { categoryId: filters.category } : {}),
      ...(Object.keys(dateFilter).length ? { date: dateFilter } : {}),
    };

    const [total, expenses] = await prisma.$transaction([
      prisma.expense.count({ where }),
      prisma.expense.findMany({
        where,
        select: expensePublicSelect,
        orderBy: [{ date: "desc" }, { createdAt: "desc" }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    return response.json({
      data: expenses.map(presentExpense),
      meta: {
        page,
        pageSize,
        total,
        pageCount: Math.max(1, Math.ceil(total / pageSize)),
      },
    });
  } catch (error) {
    return next(error);
  }
});

router.post(
  "/import",
  expenseMutationLimiter,
  async (request: AuthenticatedRequest, response, next) => {
    try {
      const { items } = expenseImportSchema.parse(request.body);
      const categoryIds = [...new Set(items.map((item) => item.categoryId))];
      const accountIds = [
        ...new Set(items.flatMap((item) => (item.accountId ? [item.accountId] : []))),
      ];
      const [categories, accounts] = await Promise.all([
        prisma.category.findMany({
          where: { userId: request.user!.id, id: { in: categoryIds } },
          select: { id: true },
        }),
        accountIds.length
          ? prisma.account.findMany({
              where: { userId: request.user!.id, id: { in: accountIds } },
              select: { id: true },
            })
          : Promise.resolve([]),
      ]);
      if (categories.length !== categoryIds.length)
        return sendError(
          response,
          404,
          "CATEGORY_NOT_FOUND",
          "Uma das categorias não foi encontrada.",
        );
      if (accounts.length !== accountIds.length)
        return sendError(response, 404, "ACCOUNT_NOT_FOUND", "Uma das contas não foi encontrada.");

      const dates = items.map((item) => item.date.getTime());
      const start = new Date(Math.min(...dates));
      const end = nextUtcDay(new Date(Math.max(...dates)).toISOString().slice(0, 10));
      const existing = await prisma.expense.findMany({
        where: { userId: request.user!.id, date: { gte: start, lt: end } },
        select: { categoryId: true, description: true, amount: true, date: true },
      });
      const signatures = new Set(
        existing.map((expense) =>
          importSignature({ ...expense, amount: expense.amount.toFixed(2) }),
        ),
      );
      const uniqueItems = items.filter((item) => {
        const signature = importSignature(item);
        if (signatures.has(signature)) return false;
        signatures.add(signature);
        return true;
      });
      if (uniqueItems.length) {
        await prisma.expense.createMany({
          data: uniqueItems.map((item) => ({
            userId: request.user!.id,
            categoryId: item.categoryId,
            accountId: item.accountId ?? null,
            description: item.description,
            location: item.location,
            amount: item.amount,
            date: item.date,
          })),
        });
      }
      return response.status(201).json({
        data: { imported: uniqueItems.length, skipped: items.length - uniqueItems.length },
      });
    } catch (error) {
      return next(error);
    }
  },
);

router.get(
  "/:id/receipt",
  receiptDownloadIpLimiter,
  receiptDownloadUserLimiter,
  receiptDownloadGuard,
  async (request: AuthenticatedRequest, response, next) => {
    try {
      const expense = await prisma.expense.findFirst({
        where: { id: request.params.id, userId: request.user!.id },
        select: {
          receiptData: true,
          receiptMimeType: true,
          receiptFileName: true,
          receiptImageUrl: true,
        },
      });
      if (!expense) return sendError(response, 404, "EXPENSE_NOT_FOUND", "Despesa nao encontrada.");

      if (expense.receiptData) {
        const mimeType = mimeExtensions[expense.receiptMimeType ?? ""]
          ? expense.receiptMimeType!
          : "application/octet-stream";
        setPrivateReceiptHeaders(response, expense.receiptFileName);
        response.type(mimeType);
        const receiptBuffer = Buffer.isBuffer(expense.receiptData)
          ? expense.receiptData
          : Buffer.from(
              expense.receiptData.buffer,
              expense.receiptData.byteOffset,
              expense.receiptData.byteLength,
            );
        return response.send(receiptBuffer);
      }

      const filePath = receiptFilePath(expense.receiptImageUrl);
      if (!filePath)
        return sendError(response, 404, "RECEIPT_NOT_FOUND", "Esta despesa nao tem comprovativo.");
      try {
        await access(filePath);
      } catch {
        return sendError(response, 404, "RECEIPT_NOT_FOUND", "O comprovativo nao foi encontrado.");
      }

      setPrivateReceiptHeaders(response);
      return response.sendFile(
        filePath,
        {
          cacheControl: false,
          etag: false,
          lastModified: false,
        },
        (error) => {
          if (error && !response.headersSent) next(error);
        },
      );
    } catch (error) {
      return next(error);
    }
  },
);

router.get("/:id", async (request: AuthenticatedRequest, response, next) => {
  try {
    const expense = await prisma.expense.findFirst({
      where: { id: request.params.id, userId: request.user!.id },
      select: expensePublicSelect,
    });

    if (!expense) {
      return sendError(response, 404, "EXPENSE_NOT_FOUND", "Despesa não encontrada.");
    }

    return response.json({ data: presentExpense(expense) });
  } catch (error) {
    return next(error);
  }
});

router.post(
  "/",
  expenseIpLimiter,
  expenseMutationLimiter,
  receiptMemoryGuard,
  upload.single("receipt"),
  async (request: AuthenticatedRequest, response, next) => {
    try {
      assertValidReceipt(request.file);
      const input = expenseCreateSchema.parse(request.body);
      const category = await categoryBelongsToUser(input.categoryId, request.user!.id);
      if (!category) {
        return sendError(response, 404, "CATEGORY_NOT_FOUND", "Categoria não encontrada.");
      }
      if (input.accountId && !(await accountBelongsToUser(input.accountId, request.user!.id))) {
        return sendError(response, 404, "ACCOUNT_NOT_FOUND", "Conta não encontrada.");
      }

      const receipt = request.file;
      const data: Prisma.ExpenseUncheckedCreateInput = {
        description: input.description,
        location: input.location,
        amount: input.amount,
        date: input.date,
        categoryId: input.categoryId,
        accountId: input.accountId ?? null,
        userId: request.user!.id,
        receiptImageUrl: null,
        receiptData: receipt ? Uint8Array.from(receipt.buffer) : null,
        receiptMimeType: receipt ? normalizedReceiptMime(receipt) : null,
        receiptFileName: receipt ? receiptFileName(receipt) : null,
        receiptFileSize: receipt?.size ?? null,
      };

      const expense = receipt
        ? await prisma.$transaction(
            async (transaction) => {
              await lockReceiptStorage(transaction, request.user!.id);
              await assertReceiptQuota(transaction, request.user!.id, receipt.size, 0, false);
              return transaction.expense.create({ data, select: expensePublicSelect });
            },
            { maxWait: 10_000, timeout: 30_000 },
          )
        : await prisma.expense.create({ data, select: expensePublicSelect });

      return response.status(201).json({ data: presentExpense(expense) });
    } catch (error) {
      return next(error);
    }
  },
);

router.patch(
  "/:id",
  expenseIpLimiter,
  expenseMutationLimiter,
  receiptMemoryGuard,
  upload.single("receipt"),
  async (request: AuthenticatedRequest, response, next) => {
    try {
      assertValidReceipt(request.file);
      const input = expenseUpdateSchema.parse(request.body);
      const existing = await prisma.expense.findFirst({
        where: { id: request.params.id, userId: request.user!.id },
        select: {
          id: true,
          receiptImageUrl: true,
          receiptMimeType: true,
          receiptFileSize: true,
        },
      });

      if (!existing) {
        return sendError(response, 404, "EXPENSE_NOT_FOUND", "Despesa não encontrada.");
      }
      if (input.categoryId && !(await categoryBelongsToUser(input.categoryId, request.user!.id))) {
        return sendError(response, 404, "CATEGORY_NOT_FOUND", "Categoria não encontrada.");
      }
      if (input.accountId && !(await accountBelongsToUser(input.accountId, request.user!.id))) {
        return sendError(response, 404, "ACCOUNT_NOT_FOUND", "Conta não encontrada.");
      }

      const { removeReceipt, ...changes } = input;
      const receipt = request.file;
      const changesReceipt = Boolean(receipt || removeReceipt);
      let legacyReceiptToRemove = changesReceipt ? existing.receiptImageUrl : null;
      const receiptChanges: Prisma.ExpenseUncheckedUpdateInput = receipt
        ? {
            receiptImageUrl: null,
            receiptData: Uint8Array.from(receipt.buffer),
            receiptMimeType: normalizedReceiptMime(receipt),
            receiptFileName: receiptFileName(receipt),
            receiptFileSize: receipt.size,
          }
        : removeReceipt
          ? {
              receiptImageUrl: null,
              receiptData: null,
              receiptMimeType: null,
              receiptFileName: null,
              receiptFileSize: null,
            }
          : {};

      const updateExpense = (transaction: Prisma.TransactionClient) =>
        transaction.expense.update({
          where: { id: existing.id },
          data: { ...changes, ...receiptChanges },
          select: expensePublicSelect,
        });

      const expense = changesReceipt
        ? await prisma.$transaction(
            async (transaction) => {
              await lockReceiptStorage(transaction, request.user!.id);
              const current = await transaction.expense.findFirst({
                where: { id: existing.id, userId: request.user!.id },
                select: {
                  receiptImageUrl: true,
                  receiptMimeType: true,
                  receiptFileSize: true,
                },
              });
              if (!current) throw new ApiError(404, "EXPENSE_NOT_FOUND", "Despesa não encontrada.");
              legacyReceiptToRemove = current.receiptImageUrl;
              if (receipt) {
                await assertReceiptQuota(
                  transaction,
                  request.user!.id,
                  receipt.size,
                  current.receiptFileSize ?? 0,
                  Boolean(current.receiptMimeType || current.receiptImageUrl),
                );
              }
              return updateExpense(transaction);
            },
            { maxWait: 10_000, timeout: 30_000 },
          )
        : await prisma.expense.update({
            where: { id: existing.id },
            data: changes,
            select: expensePublicSelect,
          });

      if (changesReceipt && legacyReceiptToRemove) {
        await removeReceiptFileBestEffort(
          receiptFilePath(legacyReceiptToRemove),
          "Não foi possível remover o comprovativo anterior do armazenamento legado.",
        );
      }

      return response.json({ data: presentExpense(expense) });
    } catch (error) {
      return next(error);
    }
  },
);

router.delete("/:id", async (request: AuthenticatedRequest, response, next) => {
  try {
    const expense = await prisma.expense.findFirst({
      where: { id: request.params.id, userId: request.user!.id },
      select: { id: true, receiptImageUrl: true },
    });
    if (!expense) {
      return sendError(response, 404, "EXPENSE_NOT_FOUND", "Despesa não encontrada.");
    }

    await prisma.expense.delete({ where: { id: expense.id } });
    // O registo já foi removido; falhar a resposta não conseguiria restaurá-lo.
    await removeReceiptFileBestEffort(
      receiptFilePath(expense.receiptImageUrl),
      "Não foi possível remover o comprovativo da despesa eliminada.",
    );
    return response.status(204).end();
  } catch (error) {
    return next(error);
  }
});

export default router;
