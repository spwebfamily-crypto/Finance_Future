import type { Prisma } from "@prisma/client";
import { Router } from "express";
import rateLimit from "express-rate-limit";
import { prisma } from "../prisma.js";
import { requireAuth, sendError } from "../middleware.js";
import type { AuthenticatedRequest } from "../types.js";
import {
  generatePasswordResetToken,
  generateVerificationToken,
  hashPassword,
  hashToken,
  passwordResetExpiresAt,
  publicUser,
  refreshExpiresAt,
  signAccessToken,
  signRefreshToken,
  verificationExpiresAt,
  verifyPassword,
  verifyRefreshToken,
} from "../lib/auth.js";
import { sendPasswordResetEmail, sendVerificationEmail } from "../services/emailService.js";
import { env } from "../config.js";
import {
  forgotPasswordSchema,
  loginSchema,
  profileUpdateSchema,
  refreshSchema,
  registerSchema,
  resetPasswordSchema,
  verifyEmailSchema,
} from "../validation.js";

const router = Router();

// Exportado apenas para permitir reset entre testes; em produção o limite
// acumula por IP durante a janela, como pretendido.
export const authLimiter = rateLimit({
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

export const forgotPasswordLimiter = rateLimit({
  windowMs: 15 * 60_000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: {
      code: "RATE_LIMITED",
      message: "Demasiadas tentativas. Tente novamente dentro de alguns minutos.",
    },
  },
});

export const refreshLimiter = rateLimit({
  windowMs: 15 * 60_000,
  limit: 30,
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
    const verificationToken = generateVerificationToken();
    const result = await prisma.$transaction(async (transaction) => {
      const user = await transaction.user.create({
        data: {
          name: input.name,
          email: input.email,
          passwordHash,
          categories: { create: [...defaultCategories] },
          verificationToken: {
            create: {
              tokenHash: hashToken(verificationToken),
              expiresAt: verificationExpiresAt(),
            },
          },
        },
      });
      const tokens = await issueTokens(transaction, user);
      return { user, tokens };
    });

    // A conta fica utilizável de imediato; o email é um reforço de confirmação.
    // Uma falha de envio não deve bloquear o registo — há reenvio manual.
    try {
      await sendVerificationEmail({
        name: result.user.name,
        email: result.user.email,
        token: verificationToken,
      });
    } catch (emailError) {
      console.error("Falha ao enviar email de verificação:", emailError);
    }

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

// Confirmação por link no email. É pública porque o utilizador ainda pode não
// ter sessão aberta no dispositivo onde abre o link.
router.post("/verify-email", authLimiter, async (request, response, next) => {
  try {
    const { token } = verifyEmailSchema.parse(request.body);
    const stored = await prisma.emailVerificationToken.findUnique({
      where: { tokenHash: hashToken(token) },
      include: { user: true },
    });

    if (!stored || stored.expiresAt <= new Date()) {
      return sendError(
        response,
        400,
        "INVALID_VERIFICATION_TOKEN",
        "O link de verificação é inválido ou expirou. Peça um novo na aplicação.",
      );
    }

    if (stored.user.emailVerifiedAt) {
      // Já verificado: idempotente, mas limpamos o token pendente se existir.
      await prisma.emailVerificationToken.delete({ where: { id: stored.id } });
      return response.json({ data: { user: publicUser(stored.user) } });
    }

    const [user] = await prisma.$transaction([
      prisma.user.update({
        where: { id: stored.userId },
        data: { emailVerifiedAt: new Date() },
      }),
      prisma.emailVerificationToken.delete({ where: { id: stored.id } }),
    ]);

    return response.json({ data: { user: publicUser(user) } });
  } catch (error) {
    return next(error);
  }
});

// Reenvio do email de confirmação para a conta autenticada.
router.post(
  "/resend-verification",
  requireAuth,
  authLimiter,
  async (request: AuthenticatedRequest, response, next) => {
    try {
      const user = await prisma.user.findUnique({ where: { id: request.user!.id } });
      if (!user) {
        return sendError(response, 404, "USER_NOT_FOUND", "A conta já não existe.");
      }
      if (user.emailVerifiedAt) {
        return sendError(response, 409, "ALREADY_VERIFIED", "Este email já está verificado.");
      }

      const verificationToken = generateVerificationToken();
      // Um único token ativo por utilizador: substituímos o anterior.
      await prisma.emailVerificationToken.upsert({
        where: { userId: user.id },
        create: {
          userId: user.id,
          tokenHash: hashToken(verificationToken),
          expiresAt: verificationExpiresAt(),
        },
        update: {
          tokenHash: hashToken(verificationToken),
          expiresAt: verificationExpiresAt(),
        },
      });

      try {
        await sendVerificationEmail({
          name: user.name,
          email: user.email,
          token: verificationToken,
        });
      } catch (emailError) {
        console.error("Falha ao reenviar email de verificação:", emailError);
        return sendError(
          response,
          502,
          "EMAIL_SEND_FAILED",
          "Não foi possível enviar o email agora. Tente novamente em instantes.",
        );
      }

      return response.json({ data: { ok: true } });
    } catch (error) {
      return next(error);
    }
  },
);

router.post("/forgot-password", forgotPasswordLimiter, async (request, response, next) => {
  try {
    const input = forgotPasswordSchema.parse(request.body);

    // Sem Brevo em produção a funcionalidade não existe: 503 para todos os
    // pedidos (sem enumerar contas) e nunca se devolve o token.
    if (env.NODE_ENV === "production" && !env.BREVO_API_KEY) {
      return sendError(
        response,
        503,
        "EMAIL_UNAVAILABLE",
        "O envio de email não está disponível neste momento. Tente mais tarde.",
      );
    }
    const user = await prisma.user.findUnique({ where: { email: input.email } });
    if (!user) {
      return response.json({ data: { ok: true } });
    }

    const resetToken = generatePasswordResetToken();
    await prisma.passwordResetToken.upsert({
      where: { userId: user.id },
      create: {
        userId: user.id,
        tokenHash: hashToken(resetToken),
        expiresAt: passwordResetExpiresAt(),
      },
      update: {
        tokenHash: hashToken(resetToken),
        expiresAt: passwordResetExpiresAt(),
      },
    });

    try {
      await sendPasswordResetEmail({
        name: user.name,
        email: user.email,
        token: resetToken,
      });
    } catch (emailError) {
      console.error("Falha ao enviar email de reposição de palavra-passe:", emailError);
    }

    return response.json({ data: { ok: true } });
  } catch (error) {
    return next(error);
  }
});

router.post("/reset-password", authLimiter, async (request, response, next) => {
  try {
    const { token, password } = resetPasswordSchema.parse(request.body);
    const stored = await prisma.passwordResetToken.findUnique({
      where: { tokenHash: hashToken(token) },
    });

    if (!stored || stored.expiresAt <= new Date()) {
      return sendError(
        response,
        400,
        "INVALID_RESET_TOKEN",
        "O link de reposição é inválido ou expirou. Peça um novo na aplicação.",
      );
    }

    const passwordHash = await hashPassword(password);
    await prisma.$transaction([
      prisma.user.update({
        where: { id: stored.userId },
        data: { passwordHash },
      }),
      prisma.passwordResetToken.delete({ where: { id: stored.id } }),
      prisma.refreshToken.deleteMany({ where: { userId: stored.userId } }),
    ]);

    return response.json({ data: { ok: true } });
  } catch (error) {
    return next(error);
  }
});

router.post("/refresh", refreshLimiter, async (request, response, next) => {
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
