import { createHash, randomUUID } from 'node:crypto';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { env } from '../config.js';

interface TokenUser {
  id: string;
  email: string;
}

interface PublicUserSource extends TokenUser {
  name: string;
  currency: string;
}

const refreshLifetimeMs = 7 * 24 * 60 * 60 * 1_000;

export const hashPassword = (value: string) => bcrypt.hash(value, 12);
export const verifyPassword = (value: string, hash: string) => bcrypt.compare(value, hash);

export function hashToken(value: string) {
  return createHash('sha256').update(value).digest('hex');
}

export function signAccessToken(user: TokenUser) {
  return jwt.sign(
    { email: user.email, type: 'access' },
    env.JWT_ACCESS_SECRET,
    { subject: user.id, expiresIn: '15m' },
  );
}

export function signRefreshToken(user: TokenUser) {
  return jwt.sign(
    { email: user.email, type: 'refresh' },
    env.JWT_REFRESH_SECRET,
    { subject: user.id, expiresIn: '7d', jwtid: randomUUID() },
  );
}

export function verifyRefreshToken(token: string) {
  const payload = jwt.verify(token, env.JWT_REFRESH_SECRET) as jwt.JwtPayload;
  if (payload.type !== 'refresh' || typeof payload.sub !== 'string' || typeof payload.email !== 'string') {
    throw new Error('Invalid refresh token payload');
  }
  return { id: payload.sub, email: payload.email };
}

export function refreshExpiresAt() {
  return new Date(Date.now() + refreshLifetimeMs);
}

export function publicUser(user: PublicUserSource) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    currency: user.currency,
  };
}
