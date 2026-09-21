import { Router, type Response } from "express";
import { requireAuth, sendError } from "../middleware.js";
import { prisma } from "../prisma.js";
import { isReservedCategoryName, RESERVED_CATEGORY_ERROR } from "../services/categoryPolicy.js";
import type { AuthenticatedRequest } from "../types.js";
import { expenseCreateSchema, incomeCreateSchema } from "../validation.js";

const router = Router();
router.use(requireAuth);

function envelope(response: Response, data: unknown, meta: Record<string, unknown> = {}) {
  return response.json({ data, meta: { requestId: response.locals.requestId, ...meta } });
}

function idempotencyKey(request: AuthenticatedRequest, response: Response) {
  const value = request.header("Idempotency-Key")?.trim();
  if (!value || value.length > 255) {
    sendError(
      response,
      400,
      "IDEMPOTENCY_KEY_REQUIRED",
      "Idempotency-Key é obrigatório para criações na API v1.",
    );
    return null;
  }
  return value;
}

async function replay(userId: string, scope: string, key: string) {
  return prisma.apiIdempotencyKey.findUnique({
    where: { userId_scope_key: { userId, scope, key } },
  });
}

router.get("/me", async (request: AuthenticatedRequest, response, next) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: request.user!.id },
      select: {
        id: true,
        name: true,
        email: true,
        currency: true,
        timeZone: true,
        createdAt: true,
      },
    });
    return envelope(response, user);
  } catch (error) {
    return next(error);
  }
});

router.get("/expenses", async (request: AuthenticatedRequest, response, next) => {
  try {
    const limit = Math.min(Math.max(Number(request.query.limit) || 50, 1), 100);
    const cursor = typeof request.query.cursor === "string" ? request.query.cursor : undefined;
    const rows = await prisma.expense.findMany({
      where: { userId: request.user!.id },
      select: {
        id: true,
        description: true,
        location: true,
        amount: true,
        currency: true,
        date: true,
        createdAt: true,
        updatedAt: true,
        category: { select: { id: true, name: true, icon: true } },
        bankTransaction: { select: { id: true } },
      },
      orderBy: [{ date: "desc" }, { id: "desc" }],
      cursor: cursor ? { id: cursor } : undefined,
      skip: cursor ? 1 : 0,
      take: limit + 1,
    });
    const hasMore = rows.length > limit;
    const data = rows.slice(0, limit).map((row) => ({
      ...row,
      amount: row.amount.toFixed(2),
      source: row.bankTransaction ? "bank" : "manual",
      bankTransaction: undefined,
    }));
    return envelope(response, data, { nextCursor: hasMore ? data.at(-1)?.id : null, hasMore });
  } catch (error) {
    return next(error);
  }
});

router.post("/expenses", async (request: AuthenticatedRequest, response, next) => {
  try {
    const key = idempotencyKey(request, response);
    if (!key) return;
    const existing = await replay(request.user!.id, "expenses:create", key);
    if (existing) return response.status(existing.statusCode).json(existing.response);
    const input = expenseCreateSchema.parse(request.body);
    const category = await prisma.category.findFirst({
      where: { id: input.categoryId, userId: request.user!.id },
      select: { id: true, name: true },
    });
    if (!category)
      return sendError(response, 404, "CATEGORY_NOT_FOUND", "Categoria não encontrada.");
    if (isReservedCategoryName(category.name))
      return sendError(
        response,
        422,
        RESERVED_CATEGORY_ERROR.code,
        RESERVED_CATEGORY_ERROR.message,
      );
    const account = input.accountId
      ? await prisma.account.findFirst({
          where: { id: input.accountId, userId: request.user!.id },
          select: { id: true, currency: true },
        })
      : null;
    if (input.accountId && !account)
      return sendError(response, 404, "ACCOUNT_NOT_FOUND", "Conta não encontrada.");
    const user = await prisma.user.findUnique({
      where: { id: request.user!.id },
      select: { currency: true },
    });
    const expense = await prisma.expense.create({
      data: {
        ...input,
        accountId: input.accountId || null,
        userId: request.user!.id,
        currency: account?.currency ?? user?.currency ?? "EUR",
      },
      select: {
        id: true,
        description: true,
        amount: true,
        currency: true,
        date: true,
        createdAt: true,
      },
    });
    const payload = {
      data: { ...expense, amount: expense.amount.toFixed(2), source: "manual" },
      meta: { requestId: response.locals.requestId },
    };
    await prisma.apiIdempotencyKey.create({
      data: {
        userId: request.user!.id,
        scope: "expenses:create",
        key,
        statusCode: 201,
        response: payload,
        expiresAt: new Date(Date.now() + 86_400_000),
      },
    });
    return response.status(201).json(payload);
  } catch (error) {
    return next(error);
  }
});

router.post("/incomes", async (request: AuthenticatedRequest, response, next) => {
  try {
    const key = idempotencyKey(request, response);
    if (!key) return;
    const existing = await replay(request.user!.id, "incomes:create", key);
    if (existing) return response.status(existing.statusCode).json(existing.response);
    const input = incomeCreateSchema.parse(request.body);
    const account = input.accountId
      ? await prisma.account.findFirst({
          where: { id: input.accountId, userId: request.user!.id },
          select: { id: true, currency: true },
        })
      : null;
    if (input.accountId && !account)
      return sendError(response, 404, "ACCOUNT_NOT_FOUND", "Conta não encontrada.");
    const user = await prisma.user.findUnique({
      where: { id: request.user!.id },
      select: { currency: true },
    });
    const income = await prisma.income.create({
      data: {
        ...input,
        source: input.source || null,
        accountId: input.accountId || null,
        userId: request.user!.id,
        currency: account?.currency ?? user?.currency ?? "EUR",
      },
      select: {
        id: true,
        description: true,
        amount: true,
        currency: true,
        date: true,
        createdAt: true,
      },
    });
    const payload = {
      data: { ...income, amount: income.amount.toFixed(2), source: "manual" },
      meta: { requestId: response.locals.requestId },
    };
    await prisma.apiIdempotencyKey.create({
      data: {
        userId: request.user!.id,
        scope: "incomes:create",
        key,
        statusCode: 201,
        response: payload,
        expiresAt: new Date(Date.now() + 86_400_000),
      },
    });
    return response.status(201).json(payload);
  } catch (error) {
    return next(error);
  }
});

export default router;
