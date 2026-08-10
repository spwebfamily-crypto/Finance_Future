import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { Prisma } from '@prisma/client';
import express from 'express';
import jwt from 'jsonwebtoken';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { errorHandler } from '../middleware.js';
import expenseRoutes from './expenses.js';

const repositories = vi.hoisted(() => ({
  categoryFindFirst: vi.fn(),
  expenseFindFirst: vi.fn(),
  expenseCreate: vi.fn(),
  expenseUpdate: vi.fn(),
  expenseDelete: vi.fn(),
  expenseAggregate: vi.fn(),
  queryRaw: vi.fn(),
  transaction: vi.fn(),
}));

vi.mock('../prisma.js', () => {
  const transactionClient = {
    $queryRaw: repositories.queryRaw,
    expense: {
      aggregate: repositories.expenseAggregate,
      create: repositories.expenseCreate,
      update: repositories.expenseUpdate,
      findFirst: repositories.expenseFindFirst,
    },
  };
  return {
    prisma: {
      category: { findFirst: repositories.categoryFindFirst },
      expense: {
        findFirst: repositories.expenseFindFirst,
        create: repositories.expenseCreate,
        update: repositories.expenseUpdate,
        delete: repositories.expenseDelete,
      },
      $transaction: repositories.transaction.mockImplementation((callback) => callback(transactionClient)),
    },
  };
});

const userId = '7c8f0f14-1f87-4dfb-a2bf-85bf170a79c8';
const categoryId = 'dfc493e7-f9dc-48c5-9341-f659b5c5f288';
const expenseId = '7b5f1793-45d7-485f-ab68-e32d1a57ed0d';
const pdfBytes = Buffer.from('%PDF-1.7\n1 0 obj\n<<>>\nendobj\n%%EOF', 'ascii');

const presentedExpense = {
  id: expenseId,
  categoryId,
  description: 'Supermercado',
  location: 'Lisboa',
  amount: new Prisma.Decimal('24.90'),
  date: new Date('2026-08-10T00:00:00.000Z'),
  receiptImageUrl: null,
  receiptMimeType: 'application/pdf',
  createdAt: new Date('2026-08-10T12:00:00.000Z'),
  updatedAt: new Date('2026-08-10T12:00:00.000Z'),
  category: { id: categoryId, name: 'Alimentação', icon: 'shopping-basket', isDefault: true, userId },
};

function authorization() {
  const token = jwt.sign(
    { type: 'access', email: 'owner@example.com' },
    process.env.JWT_ACCESS_SECRET!,
    { subject: userId, expiresIn: '5m' },
  );
  return `Bearer ${token}`;
}

function expenseForm(file = new Blob([pdfBytes], { type: 'application/pdf' })) {
  const form = new FormData();
  form.set('description', 'Supermercado');
  form.set('location', 'Lisboa');
  form.set('amount', '24.90');
  form.set('date', '2026-08-10');
  form.set('categoryId', categoryId);
  form.set('receipt', file, 'fatura.pdf');
  return form;
}

describe('expense receipt storage', () => {
  let server: Server;
  let baseUrl: string;

  beforeAll(async () => {
    const app = express();
    app.use(express.json());
    app.use('/api/expenses', expenseRoutes);
    app.use(errorHandler);
    await new Promise<void>((resolve) => {
      server = app.listen(0, '127.0.0.1', resolve);
    });
    const address = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    });
  });

  beforeEach(() => {
    repositories.categoryFindFirst.mockReset().mockResolvedValue({ id: categoryId });
    repositories.expenseFindFirst.mockReset();
    repositories.expenseCreate.mockReset().mockResolvedValue(presentedExpense);
    repositories.expenseUpdate.mockReset();
    repositories.expenseDelete.mockReset();
    repositories.expenseAggregate.mockReset().mockResolvedValue({
      _sum: { receiptFileSize: 0 },
      _count: { _all: 0 },
    });
    repositories.queryRaw.mockReset().mockResolvedValue([]);
  });

  it('stores an authenticated PDF in PostgreSQL instead of the local filesystem', async () => {
    const response = await fetch(`${baseUrl}/api/expenses`, {
      method: 'POST',
      headers: { Authorization: authorization() },
      body: expenseForm(),
    });
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.data.receiptImageUrl).toBe(`/api/expenses/${expenseId}/receipt`);
    expect(repositories.queryRaw).toHaveBeenCalledTimes(2);
    expect(repositories.expenseCreate).toHaveBeenCalledOnce();
    const createCall = repositories.expenseCreate.mock.calls[0][0];
    expect(createCall.data.receiptImageUrl).toBeNull();
    expect(createCall.data.receiptMimeType).toBe('application/pdf');
    expect(createCall.data.receiptFileName).toBe('fatura.pdf');
    expect(Buffer.from(createCall.data.receiptData)).toEqual(pdfBytes);
  });

  it('serves the private blob without allowing browser or shared-cache storage', async () => {
    repositories.expenseFindFirst.mockResolvedValue({
      receiptData: Uint8Array.from(pdfBytes),
      receiptMimeType: 'application/pdf',
      receiptFileName: 'fatura agosto.pdf',
      receiptImageUrl: null,
    });

    const response = await fetch(`${baseUrl}/api/expenses/${expenseId}/receipt`, {
      headers: { Authorization: authorization() },
    });

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(response.headers.get('content-type')).toContain('application/pdf');
    expect(response.headers.get('content-disposition')).toContain("filename*=UTF-8''fatura%20agosto.pdf");
    expect(Buffer.from(await response.arrayBuffer())).toEqual(pdfBytes);
  });

  it('rejects a renamed non-PDF before writing to the database', async () => {
    const response = await fetch(`${baseUrl}/api/expenses`, {
      method: 'POST',
      headers: { Authorization: authorization() },
      body: expenseForm(new Blob(['<script>alert(1)</script>'], { type: 'application/pdf' })),
    });
    const body = await response.json();

    expect(response.status).toBe(415);
    expect(body.error.code).toBe('INVALID_RECEIPT_CONTENT');
    expect(repositories.expenseCreate).not.toHaveBeenCalled();
  });

  it('enforces the persistent per-user quota before inserting another receipt', async () => {
    repositories.expenseAggregate
      .mockResolvedValueOnce({ _sum: { receiptFileSize: 100 * 1024 * 1024 }, _count: { _all: 10 } })
      .mockResolvedValueOnce({ _sum: { receiptFileSize: 100 * 1024 * 1024 }, _count: { _all: 10 } });

    const response = await fetch(`${baseUrl}/api/expenses`, {
      method: 'POST',
      headers: { Authorization: authorization() },
      body: expenseForm(),
    });
    const body = await response.json();

    expect(response.status).toBe(413);
    expect(body.error.code).toBe('RECEIPT_USER_QUOTA_EXCEEDED');
    expect(repositories.expenseCreate).not.toHaveBeenCalled();
  });

  it('removes an existing receipt when a JSON PATCH sends a boolean flag', async () => {
    const storedReceipt = {
      id: expenseId,
      receiptImageUrl: null,
      receiptMimeType: 'application/pdf',
      receiptFileSize: pdfBytes.length,
    };
    repositories.expenseFindFirst
      .mockResolvedValueOnce(storedReceipt)
      .mockResolvedValueOnce(storedReceipt);
    repositories.expenseUpdate.mockResolvedValue({
      ...presentedExpense,
      receiptImageUrl: null,
      receiptMimeType: null,
    });

    const response = await fetch(`${baseUrl}/api/expenses/${expenseId}`, {
      method: 'PATCH',
      headers: {
        Authorization: authorization(),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ removeReceipt: true }),
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.receiptImageUrl).toBeNull();
    expect(repositories.expenseUpdate).toHaveBeenCalledOnce();
    expect(repositories.expenseUpdate.mock.calls[0][0].data).toMatchObject({
      receiptImageUrl: null,
      receiptData: null,
      receiptMimeType: null,
      receiptFileName: null,
      receiptFileSize: null,
    });
  });
});
