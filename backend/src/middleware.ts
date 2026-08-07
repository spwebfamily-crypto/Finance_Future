import { Prisma } from '@prisma/client';
import type { ErrorRequestHandler, NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import multer from 'multer';
import { ZodError } from 'zod';
import { env } from './config.js';
import type { AuthenticatedRequest } from './types.js';

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export function sendError(
  response: Response,
  status: number,
  code: string,
  message: string,
  details?: unknown,
) {
  return response.status(status).json({
    error: {
      code,
      message,
      ...(details === undefined ? {} : { details }),
    },
  });
}

export function requireAuth(
  request: AuthenticatedRequest,
  response: Response,
  next: NextFunction,
) {
  const authorization = request.headers.authorization;
  const token = authorization?.startsWith('Bearer ') ? authorization.slice(7) : null;

  if (!token) {
    return sendError(response, 401, 'UNAUTHORIZED', 'É necessária autenticação.');
  }

  try {
    const payload = jwt.verify(token, env.JWT_ACCESS_SECRET) as jwt.JwtPayload;
    if (payload.type !== 'access' || typeof payload.sub !== 'string' || typeof payload.email !== 'string') {
      throw new Error('Invalid access token payload');
    }

    request.user = { id: payload.sub, email: payload.email };
    return next();
  } catch {
    return sendError(response, 401, 'UNAUTHORIZED', 'O token de acesso é inválido ou expirou.');
  }
}

export function notFound(_request: Request, response: Response) {
  return sendError(response, 404, 'NOT_FOUND', 'Rota não encontrada.');
}

export const errorHandler: ErrorRequestHandler = (error, _request, response, _next) => {
  if (error instanceof ApiError) {
    sendError(response, error.status, error.code, error.message, error.details);
    return;
  }

  if (error instanceof ZodError) {
    sendError(response, 400, 'VALIDATION_ERROR', 'Existem campos inválidos.', error.flatten());
    return;
  }

  if (error instanceof multer.MulterError) {
    const isTooLarge = error.code === 'LIMIT_FILE_SIZE';
    sendError(
      response,
      isTooLarge ? 413 : 400,
      'INVALID_RECEIPT',
      isTooLarge ? 'A fotografia não pode exceder 5 MB.' : 'Não foi possível processar a fotografia.',
    );
    return;
  }

  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === 'P2002') {
      sendError(response, 409, 'CONFLICT', 'Já existe um registo com estes dados.');
      return;
    }
    if (error.code === 'P2003') {
      sendError(response, 409, 'RESOURCE_IN_USE', 'Este registo está a ser utilizado e não pode ser eliminado.');
      return;
    }
  }

  console.error(error);
  sendError(response, 500, 'INTERNAL_ERROR', 'Ocorreu um erro inesperado.');
};
