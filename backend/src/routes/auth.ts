import type { Prisma } from "@prisma/client";
import { Router } from "express";
import rateLimit from "express-rate-limit";
import { prisma } from "../prisma.js";
import { requireAuth, sendError } from "../middleware.js";
import type { AuthenticatedRequest } from "../types.js";
import {
  hashPassword,
  hashToken,
  publicUser,
  refreshExpiresAt,
  signAccessToken,
  signRefreshToken,
  verifyPassword,
  verifyRefreshToken,
} from "../lib/auth.js";
import { loginSchema, profileUpdateSchema, refreshSchema, registerSchema } from "../validation.js";

const router = Router();

const authLimiter = rateLimit({
  windowMs: 15 * 60_000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: {
      code: "RATE_LIMITED",
      message: "Demasiadas tentativas. Tente novamente dentro de alguns minutos.",
    },
  },
});

const defaultCategories = [
  { name: "Alimentação", icon: "utensils", isDefault: true },
  { name: "Transportes", icon: "car", isDefault: true },
  { name: "Casa", icon: "house", isDefault: true },
  { name: "Saúde", icon: "heart-pulse", isDefault: true },
  { name: "Lazer", icon: "party-popper", isDefault: true },
  { name: "Compras", icon: "shopping-bag", isDefault: true },
  { name: "Outros", icon: "sparkles", isDefault: true },
] as const;

async function issueTokens(
  client: Prisma.TransactionClient | typeof prisma,
  user: { id: string; email: string },
) {
  const accessToken = signAccessToken(user);
  const refreshToken = signRefreshToken(user);

  await client.refreshToken.create({
    data: {
      userId: user.id,
      tokenHash: hashToken(refreshToken),
      expiresAt: refreshExpiresAt(),
    },
  });

  return { accessToken, refreshToken };
}

router.post("/register", authLimiter, async (request, response, next) => {
  try {
    const input = registerSchema.parse(request.body);
    const existingUser = await prisma.user.findUnique({ where: { email: input.email } });

    if (existingUser) {
      return sendError(response, 409, "EMAIL_TAKEN", "Já existe uma conta com este email.");
    }

    const passwordHash = await hashPassword(input.password);
    const result = await prisma.$transaction(async (transaction) => {
      const user = await transaction.user.create({
        data: {
          name: input.name,
          email: input.email,
          passwordHash,
          categories: { create: [...defaultCategories] },
        },
      });
      const tokens = await issueTokens(transaction, user);
      return { user, tokens };
    });

    return response.status(201).json({
      user: publicUser(result.user),
      ...result.tokens,
    });
  } catch (error) {
    return next(error);
  }
});

router.post("/login", authLimiter, async (request, response, next) => {
  try {
    const input = loginSchema.parse(request.body);
    const user = await prisma.user.findUnique({ where: { email: input.email } });

    if (!user || !(await verifyPassword(input.password, user.passwordHash))) {
      return sendError(response, 401, "INVALID_CREDENTIALS", "Email ou palavra-passe incorretos.");
    }

    await prisma.refreshToken.deleteMany({
      where: { userId: user.id, expiresAt: { lte: new Date() } },
    });
    const tokens = await issueTokens(prisma, user);

    return response.json({ user: publicUser(user), ...tokens });
  } catch (error) {
    return next(error);
  }
});

router.post("/refresh", async (request, response, next) => {
  try {
    const { refreshToken } = refreshSchema.parse(request.body);
    let payload: ReturnType<typeof verifyRefreshToken>;

    try {
      payload = verifyRefreshToken(refreshToken);
    } catch {
      return sendError(
        response,
        401,
        "INVALID_REFRESH_TOKEN",
        "A sessão expirou. Inicie sessão novamente.",
      );
    }

    const storedToken = await prisma.refreshToken.findUnique({
      where: { tokenHash: hashToken(refreshToken) },
      include: { user: true },
    });

    if (!storedToken || storedToken.userId !== payload.id || storedToken.expiresAt <= new Date()) {
      return sendError(
        response,
        401,
        "INVALID_REFRESH_TOKEN",
        "A sessão expirou. Inicie sessão novamente.",
      );
    }

    const nextTokens = await prisma.$transaction(async (transaction) => {
      await transaction.refreshToken.delete({ where: { id: storedToken.id } });
      return issueTokens(transaction, storedToken.user);
    });

    return response.json(nextTokens);
  } catch (error) {
    return next(error);
  }
});

router.get("/me", requireAuth, async (request: AuthenticatedRequest, response, next) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: request.user!.id } });
    if (!user) {
      return sendError(response, 404, "USER_NOT_FOUND", "A conta já não existe.");
    }
    return response.json({ data: publicUser(user) });
  } catch (error) {
    return next(error);
  }
});

router.patch("/me", requireAuth, async (request: AuthenticatedRequest, response, next) => {
  try {
    const input = profileUpdateSchema.parse(request.body);
    const user = await prisma.user.update({
      where: { id: request.user!.id },
      data: input,
    });
    return response.json({ data: publicUser(user) });
  } catch (error) {
    return next(error);
  }
});

router.post("/logout", async (request, response, next) => {
  try {
    const { refreshToken } = refreshSchema.parse(request.body);
    // Idempotente: um token desconhecido ou já revogado não é erro — o
    // objetivo é garantir que deixa de ser aceite.
    await prisma.refreshToken.deleteMany({ where: { tokenHash: hashToken(refreshToken) } });
    return response.json({ data: { ok: true } });
  } catch (error) {
    return next(error);
  }
});

export default router;
