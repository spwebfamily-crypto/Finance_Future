import { Router } from "express";
import { prisma } from "../prisma.js";
import { requireAuth, sendError } from "../middleware.js";
import { categoryCreateSchema, categoryUpdateSchema } from "../validation.js";
import type { AuthenticatedRequest } from "../types.js";

const router = Router();
router.use(requireAuth);

router.get("/", async (request: AuthenticatedRequest, response, next) => {
  try {
    const categories = await prisma.category.findMany({
      where: { userId: request.user!.id },
      orderBy: [{ isDefault: "desc" }, { name: "asc" }],
    });
    return response.json({ data: categories });
  } catch (error) {
    return next(error);
  }
});

router.post("/", async (request: AuthenticatedRequest, response, next) => {
  try {
    const input = categoryCreateSchema.parse(request.body);
    const category = await prisma.category.create({
      data: {
        name: input.name,
        icon: input.icon || null,
        userId: request.user!.id,
      },
    });
    return response.status(201).json({ data: category });
  } catch (error) {
    return next(error);
  }
});

router.patch("/:id", async (request: AuthenticatedRequest, response, next) => {
  try {
    const input = categoryUpdateSchema.parse(request.body);
    const existing = await prisma.category.findFirst({
      where: { id: request.params.id, userId: request.user!.id },
    });

    if (!existing) {
      return sendError(response, 404, "CATEGORY_NOT_FOUND", "Categoria não encontrada.");
    }
    if (existing.isDefault) {
      return sendError(
        response,
        403,
        "DEFAULT_CATEGORY",
        "As categorias base não podem ser alteradas.",
      );
    }

    const category = await prisma.category.update({
      where: { id: existing.id },
      data: {
        ...(input.name === undefined ? {} : { name: input.name }),
        ...(input.icon === undefined ? {} : { icon: input.icon || null }),
      },
    });
    return response.json({ data: category });
  } catch (error) {
    return next(error);
  }
});

router.delete("/:id", async (request: AuthenticatedRequest, response, next) => {
  try {
    const category = await prisma.category.findFirst({
      where: { id: request.params.id, userId: request.user!.id },
    });

    if (!category) {
      return sendError(response, 404, "CATEGORY_NOT_FOUND", "Categoria não encontrada.");
    }
    if (category.isDefault) {
      return sendError(
        response,
        403,
        "DEFAULT_CATEGORY",
        "As categorias base não podem ser eliminadas.",
      );
    }

    await prisma.category.delete({ where: { id: category.id } });
    return response.status(204).end();
  } catch (error) {
    return next(error);
  }
});

export default router;
