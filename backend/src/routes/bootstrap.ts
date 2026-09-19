import { Router } from "express";
import { requireAuth } from "../middleware.js";
import { getBootstrap } from "../services/bootstrapService.js";
import type { AuthenticatedRequest } from "../types.js";

const router = Router();
router.use(requireAuth);

router.get("/", async (request: AuthenticatedRequest, response, next) => {
  try {
    response.setHeader("Cache-Control", "private, max-age=60");
    return response.json({ data: await getBootstrap(request.user!.id) });
  } catch (error) {
    return next(error);
  }
});

export default router;
