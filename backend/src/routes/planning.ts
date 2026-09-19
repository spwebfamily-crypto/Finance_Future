import { Router } from "express";
import { requireAuth, sendError } from "../middleware.js";
import { getPlanningOverview } from "../services/planningOverviewService.js";
import type { AuthenticatedRequest } from "../types.js";

const datePattern = /^\d{4}-\d{2}-\d{2}$/;
const router = Router();
router.use(requireAuth);

router.get("/overview", async (request: AuthenticatedRequest, response, next) => {
  const from = typeof request.query.from === "string" ? request.query.from : "";
  const to = typeof request.query.to === "string" ? request.query.to : "";
  if (!datePattern.test(from) || !datePattern.test(to) || from >= to) {
    return sendError(response, 400, "VALIDATION_ERROR", "Indique um intervalo de datas válido.");
  }
  try {
    const result = await getPlanningOverview(
      request.user!.id,
      new Date(`${from}T00:00:00.000Z`),
      new Date(`${to}T00:00:00.000Z`),
    );
    response.setHeader("Cache-Control", "private, max-age=30");
    return response.json({ data: result });
  } catch (error) {
    return next(error);
  }
});

export default router;
