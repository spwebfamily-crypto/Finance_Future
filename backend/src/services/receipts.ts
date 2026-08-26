import { unlink } from "node:fs/promises";
import path from "node:path";
import type { Prisma } from "@prisma/client";
import type { NextFunction, Response } from "express";
import rateLimit from "express-rate-limit";
import multer from "multer";
import { env } from "../config.js";
import { ApiError, sendError } from "../middleware.js";
import type { AuthenticatedRequest } from "../types.js";

const MEGABYTE = 1024 * 1024;
const MAX_RECEIPTS_PER_USER = 250;
const MAX_RECEIPTS_TOTAL = 2_500;
const receiptBytesPerUser = env.RECEIPT_QUOTA_MB_PER_USER * MEGABYTE;
const receiptBytesTotal = env.RECEIPT_TOTAL_QUOTA_MB * MEGABYTE;
const uploadDirectory = path.resolve(process.cwd(), env.UPLOAD_DIR);

export const mimeExtensions: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "application/pdf": ".pdf",
};

export const upload = multer({
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
    const isPdf =
      file.mimetype === "application/pdf" || file.originalname.toLowerCase().endsWith(".pdf");
    if (!mimeExtensions[file.mimetype] && !isPdf) {
      callback(
        new ApiError(415, "INVALID_RECEIPT_TYPE", "Use uma imagem JPG, PNG, WEBP ou um PDF."),
      );
      return;
    }
    callback(null, true);
  },
});

let activeReceiptMutations = 0;
const MAX_ACTIVE_RECEIPT_MUTATIONS = 4;
const activeReceiptUsers = new Set<string>();
const activeReceiptIps = new Map<string, number>();

export function receiptMemoryGuard(
  request: AuthenticatedRequest,
  response: Response,
  next: NextFunction,
) {
  if (!request.is("multipart/form-data")) return next();
  const userId = request.user!.id;
  const ip = request.ip || request.socket.remoteAddress || "unknown";
  const activeForIp = activeReceiptIps.get(ip) ?? 0;
  if (
    activeReceiptMutations >= MAX_ACTIVE_RECEIPT_MUTATIONS ||
    activeReceiptUsers.has(userId) ||
    activeForIp >= 2
  ) {
    return sendError(
      response,
      503,
      "RECEIPT_BUSY",
      "O serviço está a processar outros comprovativos. Tente novamente dentro de instantes.",
    );
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
  response.once("finish", release);
  response.once("close", release);
  next();
}

export const receiptDownloadUserLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 120,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  keyGenerator: (request) => (request as AuthenticatedRequest).user!.id,
  handler: (_request, response) =>
    sendError(
      response,
      429,
      "RECEIPT_DOWNLOAD_RATE_LIMITED",
      "Foram abertos demasiados comprovativos. Aguarde alguns minutos e tente novamente.",
    ),
});

export const receiptDownloadIpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 240,
  standardHeaders: false,
  legacyHeaders: false,
  handler: (_request, response) =>
    sendError(
      response,
      429,
      "RECEIPT_DOWNLOAD_IP_RATE_LIMITED",
      "Foram abertos demasiados comprovativos a partir desta ligação. Aguarde alguns minutos.",
    ),
});

let activeReceiptDownloads = 0;
const MAX_ACTIVE_RECEIPT_DOWNLOADS = 6;
const MAX_ACTIVE_RECEIPT_DOWNLOADS_PER_USER = 2;
const MAX_ACTIVE_RECEIPT_DOWNLOADS_PER_IP = 4;
const activeReceiptDownloadUsers = new Map<string, number>();
const activeReceiptDownloadIps = new Map<string, number>();

export function receiptDownloadGuard(
  request: AuthenticatedRequest,
  response: Response,
  next: NextFunction,
) {
  const userId = request.user!.id;
  const ip = request.ip || request.socket.remoteAddress || "unknown";
  const activeForUser = activeReceiptDownloadUsers.get(userId) ?? 0;
  const activeForIp = activeReceiptDownloadIps.get(ip) ?? 0;
  if (
    activeReceiptDownloads >= MAX_ACTIVE_RECEIPT_DOWNLOADS ||
    activeForUser >= MAX_ACTIVE_RECEIPT_DOWNLOADS_PER_USER ||
    activeForIp >= MAX_ACTIVE_RECEIPT_DOWNLOADS_PER_IP
  ) {
    return sendError(
      response,
      503,
      "RECEIPT_DOWNLOAD_BUSY",
      "O serviço está a abrir outros comprovativos. Tente novamente dentro de instantes.",
    );
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
  response.once("finish", release);
  response.once("close", release);
  next();
}

export function normalizedReceiptMime(file: Express.Multer.File) {
  return file.mimetype === "application/pdf" || file.originalname.toLowerCase().endsWith(".pdf")
    ? "application/pdf"
    : file.mimetype;
}

function hasValidReceiptSignature(file: Express.Multer.File) {
  const mimeType = normalizedReceiptMime(file);
  const bytes = file.buffer;
  if (mimeType === "application/pdf")
    return bytes.subarray(0, 1_024).indexOf(Buffer.from("%PDF-", "ascii")) >= 0;
  if (mimeType === "image/jpeg")
    return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (mimeType === "image/png")
    return (
      bytes.length >= 8 &&
      bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
    );
  if (mimeType === "image/webp")
    return (
      bytes.length >= 12 &&
      bytes.subarray(0, 4).toString("ascii") === "RIFF" &&
      bytes.subarray(8, 12).toString("ascii") === "WEBP"
    );
  return false;
}

export function assertValidReceipt(file: Express.Multer.File | undefined) {
  if (file && !hasValidReceiptSignature(file)) {
    throw new ApiError(
      415,
      "INVALID_RECEIPT_CONTENT",
      "O conteúdo do ficheiro não corresponde a um JPG, PNG, WEBP ou PDF válido.",
    );
  }
}

export function receiptFileName(file: Express.Multer.File) {
  const cleaned = file.originalname
    .normalize("NFKC")
    // eslint-disable-next-line no-control-regex -- remove deliberadamente caracteres de controlo
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .trim()
    .slice(0, 180);
  return cleaned || `comprovativo${mimeExtensions[normalizedReceiptMime(file)] ?? ""}`;
}

export function setPrivateReceiptHeaders(response: Response, fileName?: string | null) {
  response.set({
    "Cache-Control": "private, no-store",
    Pragma: "no-cache",
    Expires: "0",
    "X-Content-Type-Options": "nosniff",
  });
  if (!fileName) return;
  const asciiFallback = fileName.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_");
  let encodedName: string;
  try {
    encodedName = encodeURIComponent(fileName);
  } catch {
    encodedName = encodeURIComponent(asciiFallback);
  }
  response.setHeader(
    "Content-Disposition",
    `inline; filename="${asciiFallback}"; filename*=UTF-8''${encodedName}`,
  );
}

export async function lockReceiptStorage(transaction: Prisma.TransactionClient, userId: string) {
  // A ordem global -> utilizador evita corridas nas duas quotas e deadlocks.
  // pg_advisory_xact_lock devolve o tipo PostgreSQL `void`, que o Prisma não
  // consegue desserializar. O cast mantém a aquisição do lock e devolve texto.
  await transaction.$queryRaw`SELECT pg_advisory_xact_lock(8608102026::bigint)::text AS lock_result`;
  await transaction.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${userId}, 0::bigint))::text AS lock_result`;
}

export async function assertReceiptQuota(
  transaction: Prisma.TransactionClient,
  userId: string,
  incomingBytes: number,
  replacedBytes: number,
  replacesExistingReceipt: boolean,
) {
  const storedReceiptFilter = {
    OR: [{ receiptMimeType: { not: null } }, { receiptImageUrl: { not: null } }],
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

  const projectedUserBytes =
    Math.max(0, (userStorage._sum.receiptFileSize ?? 0) - replacedBytes) + incomingBytes;
  const projectedTotalBytes =
    Math.max(0, (totalStorage._sum.receiptFileSize ?? 0) - replacedBytes) + incomingBytes;
  const projectedUserCount = userStorage._count._all + (replacesExistingReceipt ? 0 : 1);
  const projectedTotalCount = totalStorage._count._all + (replacesExistingReceipt ? 0 : 1);

  if (projectedUserBytes > receiptBytesPerUser || projectedUserCount > MAX_RECEIPTS_PER_USER) {
    throw new ApiError(
      413,
      "RECEIPT_USER_QUOTA_EXCEEDED",
      `A sua conta atingiu o limite de comprovativos (${env.RECEIPT_QUOTA_MB_PER_USER} MB ou ${MAX_RECEIPTS_PER_USER} ficheiros). Remova anexos antigos e tente novamente.`,
    );
  }
  if (projectedTotalBytes > receiptBytesTotal || projectedTotalCount > MAX_RECEIPTS_TOTAL) {
    throw new ApiError(
      503,
      "RECEIPT_STORAGE_FULL",
      "O armazenamento de comprovativos está temporariamente cheio. Tente novamente mais tarde.",
    );
  }
}

export function receiptFilePath(receiptImageUrl: string | null | undefined) {
  if (!receiptImageUrl) return null;
  const filename = path.basename(receiptImageUrl);
  return path.join(uploadDirectory, filename);
}

async function removeReceiptFile(filePath: string | null | undefined) {
  if (!filePath) return;
  try {
    await unlink(filePath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
}

export async function removeReceiptFileBestEffort(
  filePath: string | null | undefined,
  message: string,
) {
  try {
    await removeReceiptFile(filePath);
  } catch (error) {
    console.error(message, error);
  }
}
