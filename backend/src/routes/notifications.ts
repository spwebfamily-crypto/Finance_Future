import { Router } from "express";
import { requireAuth, sendError } from "../middleware.js";
import { prisma } from "../prisma.js";
import type { AuthenticatedRequest } from "../types.js";
import { env } from "../config.js";

const router = Router();
router.use(requireAuth);

router.get("/push-config", (_request, response) => {
  return response.json({
    data: { enabled: Boolean(env.VAPID_PUBLIC_KEY), publicKey: env.VAPID_PUBLIC_KEY ?? null },
  });
});

router.put("/push-subscription", async (request: AuthenticatedRequest, response, next) => {
  const body = request.body as { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } };
  if (
    !env.VAPID_PUBLIC_KEY ||
    typeof body.endpoint !== "string" ||
    !body.endpoint.startsWith("https://") ||
    typeof body.keys?.p256dh !== "string" ||
    typeof body.keys.auth !== "string"
  ) {
    return sendError(
      response,
      400,
      "VALIDATION_ERROR",
      "A subscrição push é inválida ou não está disponível.",
    );
  }
  try {
    await prisma.webPushSubscription.upsert({
      where: { endpoint: body.endpoint },
      create: {
        userId: request.user!.id,
        endpoint: body.endpoint,
        p256dh: body.keys.p256dh,
        auth: body.keys.auth,
      },
      update: { userId: request.user!.id, p256dh: body.keys.p256dh, auth: body.keys.auth },
    });
    const preference = await prisma.notificationPreference.upsert({
      where: { userId: request.user!.id },
      create: { userId: request.user!.id, pushEnabled: true },
      update: { pushEnabled: true },
    });
    return response.status(201).json({ data: preference });
  } catch (error) {
    return next(error);
  }
});

router.get("/", async (request: AuthenticatedRequest, response, next) => {
  const limit = Math.min(Math.max(Number(request.query.limit) || 30, 1), 100);
  const unreadOnly = request.query.unread === "true";
  try {
    const [items, unreadCount] = await Promise.all([
      prisma.financialNotification.findMany({
        where: { userId: request.user!.id, ...(unreadOnly ? { readAt: null } : {}) },
        orderBy: [{ scheduledFor: "desc" }, { createdAt: "desc" }],
        take: limit,
      }),
      prisma.financialNotification.count({ where: { userId: request.user!.id, readAt: null } }),
    ]);
    return response.json({ data: { items, unreadCount } });
  } catch (error) {
    return next(error);
  }
});

router.patch("/:notificationId/read", async (request: AuthenticatedRequest, response, next) => {
  try {
    const existing = await prisma.financialNotification.findFirst({
      where: { id: request.params.notificationId, userId: request.user!.id },
      select: { id: true },
    });
    if (!existing)
      return sendError(response, 404, "NOTIFICATION_NOT_FOUND", "Aviso não encontrado.");
    const item = await prisma.financialNotification.update({
      where: { id: existing.id },
      data: { readAt: new Date() },
    });
    return response.json({ data: item });
  } catch (error) {
    return next(error);
  }
});

router.post("/read-all", async (request: AuthenticatedRequest, response, next) => {
  try {
    const result = await prisma.financialNotification.updateMany({
      where: { userId: request.user!.id, readAt: null },
      data: { readAt: new Date() },
    });
    return response.json({ data: { updated: result.count } });
  } catch (error) {
    return next(error);
  }
});

router.get("/preferences", async (request: AuthenticatedRequest, response, next) => {
  try {
    const preference = await prisma.notificationPreference.upsert({
      where: { userId: request.user!.id },
      create: { userId: request.user!.id },
      update: {},
    });
    return response.json({ data: preference });
  } catch (error) {
    return next(error);
  }
});

router.put("/preferences", async (request: AuthenticatedRequest, response, next) => {
  const { inAppEnabled, pushEnabled } = request.body as Record<string, unknown>;
  if (
    (inAppEnabled !== undefined && typeof inAppEnabled !== "boolean") ||
    (pushEnabled !== undefined && typeof pushEnabled !== "boolean")
  ) {
    return sendError(response, 400, "VALIDATION_ERROR", "As preferências são inválidas.");
  }
  try {
    const preference = await prisma.notificationPreference.upsert({
      where: { userId: request.user!.id },
      create: {
        userId: request.user!.id,
        inAppEnabled: inAppEnabled ?? true,
        pushEnabled: pushEnabled ?? false,
      },
      update: {
        ...(inAppEnabled === undefined ? {} : { inAppEnabled }),
        ...(pushEnabled === undefined ? {} : { pushEnabled }),
      },
    });
    return response.json({ data: preference });
  } catch (error) {
    return next(error);
  }
});

export default router;
