import { Router } from "express";
import { requireAuth, sendError } from "../middleware.js";
import { getDashboardOverview } from "../services/dashboardOverviewService.js";
import type { AuthenticatedRequest } from "../types.js";

const router = Router();
router.use(requireAuth);

router.get("/overview", async (request: AuthenticatedRequest, response, next) => {
  try {
    const result = await getDashboardOverview(
      request.user!.id,
      typeof request.query.month === "string" ? request.query.month : undefined,
    );
    response.setHeader("Cache-Control", "private, max-age=30");
    return response.json({ data: result });
  } catch (error) {
    if (error instanceof RangeError)
      return sendError(response, 422, "INVALID_MONTH", "O mês indicado é inválido.");
    return next(error);
  }
});

export default router;
