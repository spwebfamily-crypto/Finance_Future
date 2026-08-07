import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import multer from 'multer';
import { env } from '../config.js';
import { ApiError, requireAuth, sendError } from '../middleware.js';
import { extractReceipt } from '../services/ocrService.js';

const allowedMimeTypes = new Set(['image/jpeg', 'image/png', 'image/webp']);
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
  fileFilter: (_request, file, callback) => {
    if (!allowedMimeTypes.has(file.mimetype)) {
      callback(new ApiError(415, 'INVALID_RECEIPT_TYPE', 'Use uma imagem JPG, PNG ou WEBP.'));
      return;
    }
    callback(null, true);
  },
});

const ocrLimiter = rateLimit({
  windowMs: 15 * 60_000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: {
      code: 'OCR_RATE_LIMITED',
      message: 'Foram feitas demasiadas leituras. Tente novamente dentro de alguns minutos.',
    },
  },
});

const router = Router();
router.use(requireAuth);

router.post('/extract', ocrLimiter, upload.single('receipt'), async (request, response, next) => {
  try {
    if (!request.file) {
      return sendError(response, 400, 'RECEIPT_REQUIRED', 'Selecione uma fotografia do recibo.');
    }

    try {
      const extraction = await extractReceipt(request.file.buffer, request.file.mimetype, {
        googleApiKey: env.GOOGLE_VISION_API_KEY,
      });
      return response.json({
        data: {
          ...extraction,
          rawText: extraction.rawText.slice(0, 20_000),
        },
      });
    } catch {
      return sendError(
        response,
        422,
        'OCR_FAILED',
        'Não foi possível ler o recibo. Pode continuar a preencher os campos manualmente.',
      );
    }
  } catch (error) {
    return next(error);
  }
});

export default router;
