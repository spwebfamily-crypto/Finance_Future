import { access, unlink } from 'node:fs/promises';
import path from 'node:path';
import { Prisma } from '@prisma/client';
import { Router, type NextFunction, type Response } from 'express';
import rateLimit from 'express-rate-limit';
import multer from 'multer';
import { env } from '../config.js';
import { ApiError, requireAuth, sendError } from '../middleware.js';
import { prisma } from '../prisma.js';
import type { AuthenticatedRequest } from '../types.js';
import { expenseCreateSchema, expenseFiltersSchema, expenseUpdateSchema } from '../validation.js';

const uploadDirectory = path.resolve(process.cwd(), env.UPLOAD_DIR);
const MEGABYTE = 1024 * 1024;
const MAX_RECEIPTS_PER_USER = 250;
const MAX_RECEIPTS_TOTAL = 2_500;
const receiptBytesPerUser = env.RECEIPT_QUOTA_MB_PER_USER * MEGABYTE;
const receiptBytesTotal = env.RECEIPT_TOTAL_QUOTA_MB * MEGABYTE;

const mimeExtensions: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'application/pdf': '.pdf',
};

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024,
    files: 1,
    fields: 8,
    parts: 9,
    fieldSize: 4 * 1024,
    fieldNameSize: 100,
  },
  fileFilter: (_request, file, callback) => {
    const isPdf = file.mimetype === 'application/pdf' || file.originalname.toLowerCase().endsWith('.pdf');
    if (!mimeExtensions[file.mimetype] && !isPdf) {
      callback(new ApiError(415, 'INVALID_RECEIPT_TYPE', 'Use uma imagem JPG, PNG, WEBP ou um PDF.'));
      return;
    }
    callback(null, true);
  },
});

const router = Router();
router.use(requireAuth);

const expenseMutationLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  keyGenerator: (request) => (request as AuthenticatedRequest).user!.id,
  handler: (_request, response) => sendError(
    response,
    429,
    'EXPENSE_RATE_LIMITED',
    'Foram feitas demasiadas alterações em pouco tempo. Aguarde alguns minutos e tente novamente.',
  ),
});

const expenseIpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 60,
  standardHeaders: false,
  legacyHeaders: false,
  handler: (_request, response) => sendError(
    response,
    429,
    'EXPENSE_IP_RATE_LIMITED',
    'Foram feitos demasiados pedidos a partir desta ligação. Aguarde alguns minutos e tente novamente.',
  ),
});

let activeReceiptMutations = 0;
const MAX_ACTIVE_RECEIPT_MUTATIONS = 4;
const activeReceiptUsers = new Set<string>();
const activeReceiptIps = new Map<string, number>();

function receiptMemoryGuard(request: AuthenticatedRequest, response: Response, next: NextFunction) {
  if (!request.is('multipart/form-data')) return next();
  const userId = request.user!.id;
  const ip = request.ip || request.socket.remoteAddress || 'unknown';
  const activeForIp = activeReceiptIps.get(ip) ?? 0;
  if (activeReceiptMutations >= MAX_ACTIVE_RECEIPT_MUTATIONS || activeReceiptUsers.has(userId) || activeForIp >= 2) {
    return sendError(response, 503, 'RECEIPT_BUSY', 'O serviço está a processar outros comprovativos. Tente novamente dentro de instantes.');
  }

  activeReceiptMutations += 1;
  activeReceiptUsers.add(userId);
  activeReceiptIps.set(ip, activeForIp + 1);
  let released = false;
  const release = () => {
    if (released) return;
    released = true;
    activeReceiptMutations = Math.max(0, activeReceiptMutations - 1);
    activeReceiptUsers.delete(userId);
    const remainingForIp = Math.max(0, (activeReceiptIps.get(ip) ?? 1) - 1);
    if (remainingForIp) activeReceiptIps.set(ip, remainingForIp);
    else activeReceiptIps.delete(ip);
  };
  response.once('finish', release);
  response.once('close', release);
  next();
}

const receiptDownloadUserLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 120,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  keyGenerator: (request) => (request as AuthenticatedRequest).user!.id,
  handler: (_request, response) => sendError(response, 429, 'RECEIPT_DOWNLOAD_RATE_LIMITED', 'Foram abertos demasiados comprovativos. Aguarde alguns minutos e tente novamente.'),
});

const receiptDownloadIpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 240,
  standardHeaders: false,
  legacyHeaders: false,
  handler: (_request, response) => sendError(response, 429, 'RECEIPT_DOWNLOAD_IP_RATE_LIMITED', 'Foram abertos demasiados comprovativos a partir desta ligação. Aguarde alguns minutos.'),
});

let activeReceiptDownloads = 0;
const MAX_ACTIVE_RECEIPT_DOWNLOADS = 6;
const MAX_ACTIVE_RECEIPT_DOWNLOADS_PER_USER = 2;
const MAX_ACTIVE_RECEIPT_DOWNLOADS_PER_IP = 4;
const activeReceiptDownloadUsers = new Map<string, number>();
const activeReceiptDownloadIps = new Map<string, number>();

function receiptDownloadGuard(request: AuthenticatedRequest, response: Response, next: NextFunction) {
  const userId = request.user!.id;
  const ip = request.ip || request.socket.remoteAddress || 'unknown';
  const activeForUser = activeReceiptDownloadUsers.get(userId) ?? 0;
  const activeForIp = activeReceiptDownloadIps.get(ip) ?? 0;
  if (activeReceiptDownloads >= MAX_ACTIVE_RECEIPT_DOWNLOADS || activeForUser >= MAX_ACTIVE_RECEIPT_DOWNLOADS_PER_USER || activeForIp >= MAX_ACTIVE_RECEIPT_DOWNLOADS_PER_IP) {
    return sendError(response, 503, 'RECEIPT_DOWNLOAD_BUSY', 'O serviço está a abrir outros comprovativos. Tente novamente dentro de instantes.');
  }

  activeReceiptDownloads += 1;
  activeReceiptDownloadUsers.set(userId, activeForUser + 1);
  activeReceiptDownloadIps.set(ip, activeForIp + 1);
  let released = false;
  const release = () => {
    if (released) return;
    released = true;
    activeReceiptDownloads = Math.max(0, activeReceiptDownloads - 1);
    const remainingForUser = Math.max(0, (activeReceiptDownloadUsers.get(userId) ?? 1) - 1);
    if (remainingForUser) activeReceiptDownloadUsers.set(userId, remainingForUser);
    else activeReceiptDownloadUsers.delete(userId);
    const remainingForIp = Math.max(0, (activeReceiptDownloadIps.get(ip) ?? 1) - 1);
    if (remainingForIp) activeReceiptDownloadIps.set(ip, remainingForIp);
    else activeReceiptDownloadIps.delete(ip);
  };
  response.once('finish', release);
  response.once('close', release);
  next();
}

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
} satisfies Prisma.ExpenseSelect;

type PublicExpenseRecord = Prisma.ExpenseGetPayload<{ select: typeof expensePublicSelect }>;

function presentExpense(expense: PublicExpenseRecord) {
  const { receiptImageUrl: legacyReceiptUrl, receiptMimeType: storedMimeType, ...publicExpense } = expense;
  const hasReceipt = Boolean(storedMimeType || legacyReceiptUrl);
  const receiptMimeType = storedMimeType === 'application/pdf' || legacyReceiptUrl?.endsWith('.pdf')
    ? 'application/pdf'
    : hasReceipt
      ? 'image/*'
      : null;
  return {
    ...publicExpense,
    amount: expense.amount.toFixed(2),
    receiptImageUrl: hasReceipt ? `/api/expenses/${expense.id}/receipt` : null,
    receiptMimeType,
  };
}

async function categoryBelongsToUser(categoryId: string, userId: string) {
  return prisma.category.findFirst({ where: { id: categoryId, userId }, select: { id: true } });
}

function normalizedReceiptMime(file: Express.Multer.File) {
  return file.mimetype === 'application/pdf' || file.originalname.toLowerCase().endsWith('.pdf')
    ? 'application/pdf'
    : file.mimetype;
}

function hasValidReceiptSignature(file: Express.Multer.File) {
  const mimeType = normalizedReceiptMime(file);
  const bytes = file.buffer;
  if (mimeType === 'application/pdf') return bytes.subarray(0, 1_024).indexOf(Buffer.from('%PDF-', 'ascii')) >= 0;
  if (mimeType === 'image/jpeg') return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (mimeType === 'image/png') return bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  if (mimeType === 'image/webp') return bytes.length >= 12 && bytes.subarray(0, 4).toString('ascii') === 'RIFF' && bytes.subarray(8, 12).toString('ascii') === 'WEBP';
  return false;
}

function assertValidReceipt(file: Express.Multer.File | undefined) {
  if (file && !hasValidReceiptSignature(file)) {
    throw new ApiError(415, 'INVALID_RECEIPT_CONTENT', 'O conteúdo do ficheiro não corresponde a um JPG, PNG, WEBP ou PDF válido.');
  }
}

function receiptFileName(file: Express.Multer.File) {
  const cleaned = file.originalname
    .normalize('NFKC')
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .trim()
    .slice(0, 180);
  return cleaned || `comprovativo${mimeExtensions[normalizedReceiptMime(file)] ?? ''}`;
}

function setPrivateReceiptHeaders(response: Response, fileName?: string | null) {
  response.set({
    'Cache-Control': 'private, no-store',
    Pragma: 'no-cache',
    Expires: '0',
    'X-Content-Type-Options': 'nosniff',
  });
  if (!fileName) return;
  const asciiFallback = fileName.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_');
  let encodedName: string;
  try {
    encodedName = encodeURIComponent(fileName);
  } catch {
    encodedName = encodeURIComponent(asciiFallback);
  }
  response.setHeader('Content-Disposition', `inline; filename="${asciiFallback}"; filename*=UTF-8''${encodedName}`);
}

async function lockReceiptStorage(transaction: Prisma.TransactionClient, userId: string) {
  // A ordem global -> utilizador evita corridas nas duas quotas e deadlocks.
  // pg_advisory_xact_lock devolve o tipo PostgreSQL `void`, que o Prisma não
  // consegue desserializar. O cast mantém a aquisição do lock e devolve texto.
  await transaction.$queryRaw`SELECT pg_advisory_xact_lock(8608102026::bigint)::text AS lock_result`;
  await transaction.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${userId}, 0::bigint))::text AS lock_result`;
}

async function assertReceiptQuota(
  transaction: Prisma.TransactionClient,
  userId: string,
  incomingBytes: number,
  replacedBytes: number,
  replacesExistingReceipt: boolean,
) {
  const storedReceiptFilter = {
    OR: [
      { receiptMimeType: { not: null } },
      { receiptImageUrl: { not: null } },
    ],
  } satisfies Prisma.ExpenseWhereInput;
  const [userStorage, totalStorage] = await Promise.all([
    transaction.expense.aggregate({
      where: { userId, ...storedReceiptFilter },
      _sum: { receiptFileSize: true },
      _count: { _all: true },
    }),
    transaction.expense.aggregate({
      where: storedReceiptFilter,
      _sum: { receiptFileSize: true },
      _count: { _all: true },
    }),
  ]);

  const projectedUserBytes = Math.max(0, (userStorage._sum.receiptFileSize ?? 0) - replacedBytes) + incomingBytes;
  const projectedTotalBytes = Math.max(0, (totalStorage._sum.receiptFileSize ?? 0) - replacedBytes) + incomingBytes;
  const projectedUserCount = userStorage._count._all + (replacesExistingReceipt ? 0 : 1);
  const projectedTotalCount = totalStorage._count._all + (replacesExistingReceipt ? 0 : 1);

  if (projectedUserBytes > receiptBytesPerUser || projectedUserCount > MAX_RECEIPTS_PER_USER) {
    throw new ApiError(
      413,
      'RECEIPT_USER_QUOTA_EXCEEDED',
      `A sua conta atingiu o limite de comprovativos (${env.RECEIPT_QUOTA_MB_PER_USER} MB ou ${MAX_RECEIPTS_PER_USER} ficheiros). Remova anexos antigos e tente novamente.`,
    );
  }
  if (projectedTotalBytes > receiptBytesTotal || projectedTotalCount > MAX_RECEIPTS_TOTAL) {
    throw new ApiError(503, 'RECEIPT_STORAGE_FULL', 'O armazenamento de comprovativos está temporariamente cheio. Tente novamente mais tarde.');
  }
}

function receiptFilePath(receiptImageUrl: string | null | undefined) {
  if (!receiptImageUrl) return null;
  const filename = path.basename(receiptImageUrl);
  return path.join(uploadDirectory, filename);
}

async function removeReceiptFile(filePath: string | null | undefined) {
  if (!filePath) return;
  try {
    await unlink(filePath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
}

async function removeReceiptFileBestEffort(filePath: string | null | undefined, message: string) {
  try {
    await removeReceiptFile(filePath);
  } catch (error) {
    console.error(message, error);
  }
}

function nextUtcDay(date: string) {
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + 1);
  return value;
}

router.get('/', async (request: AuthenticatedRequest, response, next) => {
  try {
    const filters = expenseFiltersSchema.parse(request.query);
    const dateFilter: Prisma.DateTimeFilter = {};
    if (filters.from) dateFilter.gte = new Date(`${filters.from}T00:00:00.000Z`);
    if (filters.to) dateFilter.lt = nextUtcDay(filters.to);

    const expenses = await prisma.expense.findMany({
      where: {
        userId: request.user!.id,
        ...(filters.category ? { categoryId: filters.category } : {}),
        ...(Object.keys(dateFilter).length ? { date: dateFilter } : {}),
      },
      select: expensePublicSelect,
      orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
    });

    return response.json({ data: expenses.map(presentExpense) });
  } catch (error) {
    return next(error);
  }
});

router.get('/:id/receipt', receiptDownloadIpLimiter, receiptDownloadUserLimiter, receiptDownloadGuard, async (request: AuthenticatedRequest, response, next) => {
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
    if (!expense) return sendError(response, 404, 'EXPENSE_NOT_FOUND', 'Despesa nao encontrada.');

    if (expense.receiptData) {
      const mimeType = mimeExtensions[expense.receiptMimeType ?? '']
        ? expense.receiptMimeType!
        : 'application/octet-stream';
      setPrivateReceiptHeaders(response, expense.receiptFileName);
      response.type(mimeType);
      const receiptBuffer = Buffer.isBuffer(expense.receiptData)
        ? expense.receiptData
        : Buffer.from(expense.receiptData.buffer, expense.receiptData.byteOffset, expense.receiptData.byteLength);
      return response.send(receiptBuffer);
    }

    const filePath = receiptFilePath(expense.receiptImageUrl);
    if (!filePath) return sendError(response, 404, 'RECEIPT_NOT_FOUND', 'Esta despesa nao tem comprovativo.');
    try {
      await access(filePath);
    } catch {
      return sendError(response, 404, 'RECEIPT_NOT_FOUND', 'O comprovativo nao foi encontrado.');
    }

    setPrivateReceiptHeaders(response);
    return response.sendFile(filePath, {
      cacheControl: false,
      etag: false,
      lastModified: false,
    }, (error) => {
      if (error && !response.headersSent) next(error);
    });
  } catch (error) {
    return next(error);
  }
});

router.get('/:id', async (request: AuthenticatedRequest, response, next) => {
  try {
    const expense = await prisma.expense.findFirst({
      where: { id: request.params.id, userId: request.user!.id },
      select: expensePublicSelect,
    });

    if (!expense) {
      return sendError(response, 404, 'EXPENSE_NOT_FOUND', 'Despesa não encontrada.');
    }

    return response.json({ data: presentExpense(expense) });
  } catch (error) {
    return next(error);
  }
});

router.post('/', expenseIpLimiter, expenseMutationLimiter, receiptMemoryGuard, upload.single('receipt'), async (request: AuthenticatedRequest, response, next) => {
  try {
    assertValidReceipt(request.file);
    const input = expenseCreateSchema.parse(request.body);
    const category = await categoryBelongsToUser(input.categoryId, request.user!.id);
    if (!category) {
      return sendError(response, 404, 'CATEGORY_NOT_FOUND', 'Categoria não encontrada.');
    }

    const receipt = request.file;
    const data: Prisma.ExpenseUncheckedCreateInput = {
      description: input.description,
      location: input.location,
      amount: input.amount,
      date: input.date,
      categoryId: input.categoryId,
      userId: request.user!.id,
      receiptImageUrl: null,
      receiptData: receipt ? Uint8Array.from(receipt.buffer) : null,
      receiptMimeType: receipt ? normalizedReceiptMime(receipt) : null,
      receiptFileName: receipt ? receiptFileName(receipt) : null,
      receiptFileSize: receipt?.size ?? null,
    };

    const expense = receipt
      ? await prisma.$transaction(async (transaction) => {
          await lockReceiptStorage(transaction, request.user!.id);
          await assertReceiptQuota(transaction, request.user!.id, receipt.size, 0, false);
          return transaction.expense.create({ data, select: expensePublicSelect });
        }, { maxWait: 10_000, timeout: 30_000 })
      : await prisma.expense.create({ data, select: expensePublicSelect });

    return response.status(201).json({ data: presentExpense(expense) });
  } catch (error) {
    return next(error);
  }
});

router.patch('/:id', expenseIpLimiter, expenseMutationLimiter, receiptMemoryGuard, upload.single('receipt'), async (request: AuthenticatedRequest, response, next) => {
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
      return sendError(response, 404, 'EXPENSE_NOT_FOUND', 'Despesa não encontrada.');
    }
    if (input.categoryId && !(await categoryBelongsToUser(input.categoryId, request.user!.id))) {
      return sendError(response, 404, 'CATEGORY_NOT_FOUND', 'Categoria não encontrada.');
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

    const updateExpense = (transaction: Prisma.TransactionClient) => transaction.expense.update({
      where: { id: existing.id },
      data: { ...changes, ...receiptChanges },
      select: expensePublicSelect,
    });

    const expense = changesReceipt
      ? await prisma.$transaction(async (transaction) => {
          await lockReceiptStorage(transaction, request.user!.id);
          const current = await transaction.expense.findFirst({
            where: { id: existing.id, userId: request.user!.id },
            select: {
              receiptImageUrl: true,
              receiptMimeType: true,
              receiptFileSize: true,
            },
          });
          if (!current) throw new ApiError(404, 'EXPENSE_NOT_FOUND', 'Despesa não encontrada.');
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
        }, { maxWait: 10_000, timeout: 30_000 })
      : await prisma.expense.update({
          where: { id: existing.id },
          data: changes,
          select: expensePublicSelect,
        });

    if (changesReceipt && legacyReceiptToRemove) {
      await removeReceiptFileBestEffort(
        receiptFilePath(legacyReceiptToRemove),
        'Não foi possível remover o comprovativo anterior do armazenamento legado.',
      );
    }

    return response.json({ data: presentExpense(expense) });
  } catch (error) {
    return next(error);
  }
});

router.delete('/:id', async (request: AuthenticatedRequest, response, next) => {
  try {
    const expense = await prisma.expense.findFirst({
      where: { id: request.params.id, userId: request.user!.id },
      select: { id: true, receiptImageUrl: true },
    });
    if (!expense) {
      return sendError(response, 404, 'EXPENSE_NOT_FOUND', 'Despesa não encontrada.');
    }

    await prisma.expense.delete({ where: { id: expense.id } });
    // O registo já foi removido; falhar a resposta não conseguiria restaurá-lo.
    await removeReceiptFileBestEffort(
      receiptFilePath(expense.receiptImageUrl),
      'Não foi possível remover o comprovativo da despesa eliminada.',
    );
    return response.status(204).end();
  } catch (error) {
    return next(error);
  }
});

export default router;
