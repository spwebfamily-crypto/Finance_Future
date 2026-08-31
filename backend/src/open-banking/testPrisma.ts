import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";

/**
 * Prisma em memória para os testes do motor de sincronização. Implementa as
 * restrições únicas e a paginação de que a idempotência depende, sem exigir
 * uma base de dados real (o CI não tem PostgreSQL).
 *
 * Não é um substituto do Prisma: suporta apenas as operações usadas pelos
 * serviços de Open Banking (filtros simples, `orderBy`, `take`, `select`,
 * `create`, `update`, `updateMany`, `deleteMany` e `count`).
 */
type Row = Record<string, unknown>;

interface ModelConfig {
  defaults?: () => Row;
  uniques?: string[][];
}

const models: Record<string, ModelConfig> = {
  bankConnection: {
    defaults: () => ({
      consentExpiresAt: null,
      lastSyncedAt: null,
      nextSyncAt: null,
      lastErrorCode: null,
      lastErrorAt: null,
      disconnectedAt: null,
    }),
    uniques: [["id"]],
  },
  bankAuthorizationAttempt: { uniques: [["id"], ["stateHash"]] },
  bankAccountLink: {
    defaults: () => ({ maskedIban: null, providerIbanHash: null, lastTransactionSyncAt: null }),
    uniques: [["id"], ["connectionId", "providerAccountHash"], ["accountId"]],
  },
  bankTransaction: {
    defaults: () => ({
      classification: "unreviewed",
      excludedFromAnalytics: false,
      providerEntryReference: null,
      providerTransactionId: null,
      counterpartyName: null,
      counterpartyAccountHash: null,
      merchantCategoryCode: null,
      bankTransactionCode: null,
      bookingDate: null,
      valueDate: null,
      transactionDate: null,
      expenseId: null,
      incomeId: null,
      transferId: null,
      rawDataEncrypted: null,
    }),
    uniques: [["id"], ["bankAccountLinkId", "dedupeKey"], ["expenseId"], ["incomeId"]],
  },
  bankSyncJob: {
    defaults: () => ({
      status: "queued",
      attemptCount: 0,
      accountsProcessed: 0,
      transactionsCreated: 0,
      transactionsUpdated: 0,
      transactionsSkipped: 0,
    }),
    uniques: [["id"]],
  },
  account: {
    defaults: () => ({
      source: "manual",
      currency: "EUR",
      openingBalance: decimal(0),
      creditLimit: null,
      providerCurrentBalance: null,
      providerAvailableBalance: null,
      providerBalanceUpdatedAt: null,
    }),
    uniques: [["id"], ["userId", "name"]],
  },
  expense: { uniques: [["id"]] },
  income: { uniques: [["id"]] },
  transfer: { uniques: [["id"]] },
  category: { uniques: [["id"]] },
};

function decimal(value: number | string) {
  return new Prisma.Decimal(value);
}

function isDecimal(value: unknown) {
  // A classe gerada pelo Prisma tem nome minificado: `instanceof` é a forma fiável.
  return value instanceof Prisma.Decimal;
}

function valueEquals(left: unknown, right: unknown) {
  if (isDecimal(left) || isDecimal(right)) {
    const leftDecimal = isDecimal(left) ? left : decimal(String(left));
    const rightDecimal = isDecimal(right) ? right : decimal(String(right));
    return (leftDecimal as { equals: (value: unknown) => boolean }).equals(rightDecimal);
  }
  if (left instanceof Date && right instanceof Date) return left.getTime() === right.getTime();
  return left === right;
}

function matchesValue(actual: unknown, expected: unknown): boolean {
  // Um Prisma.Decimal tem método `equals` (que o operador `in` encontra na
  // cadeia de protótipos): tem de ser tratado antes dos operadores.
  if (isDecimal(expected)) return valueEquals(actual, expected);
  if (expected !== null && typeof expected === "object" && !Array.isArray(expected)) {
    const operators = expected as Record<string, unknown>;
    if ("in" in operators) {
      return (operators.in as unknown[]).some((value) => valueEquals(actual, value));
    }
    if ("lte" in operators) return Number(actual) <= Number(operators.lte);
    if ("gte" in operators) return Number(actual) >= Number(operators.gte);
    if ("lt" in operators) return Number(actual) < Number(operators.lt);
    if ("gt" in operators) return Number(actual) > Number(operators.gt);
    if ("not" in operators) return !valueEquals(actual, operators.not);
    if ("equals" in operators) return valueEquals(actual, operators.equals);
    return valueEquals(actual, expected);
  }
  return valueEquals(actual, expected);
}

function normalizeWhere(model: string, where: Row): Row {
  const config = models[model];
  const result: Row = { ...where };
  for (const unique of config?.uniques ?? []) {
    // Só as chaves compostas podem chegar com o nome `campoA_campoB`.
    if (unique.length < 2) continue;
    const key = unique.join("_");
    if (result[key] && typeof result[key] === "object") {
      Object.assign(result, result[key] as Row);
      delete result[key];
    }
  }
  return result;
}

function matches(row: Row, where: Row): boolean {
  const { OR, AND, ...fields } = where;
  if (Array.isArray(OR) && !OR.some((condition) => matches(row, condition as Row))) return false;
  if (Array.isArray(AND) && !AND.every((condition) => matches(row, condition as Row))) return false;
  return Object.entries(fields).every(([key, expected]) => matchesValue(row[key], expected));
}

function applyData(row: Row, data: Row) {
  for (const [key, value] of Object.entries(data)) {
    if (value !== null && typeof value === "object" && !Array.isArray(value)) {
      const operations = value as Record<string, unknown>;
      if ("increment" in operations) {
        row[key] = decimal(Number(row[key] ?? 0) + Number(operations.increment));
        continue;
      }
      if ("decrement" in operations) {
        row[key] = decimal(Number(row[key] ?? 0) - Number(operations.decrement));
        continue;
      }
      if ("set" in operations) {
        row[key] = operations.set;
        continue;
      }
    }
    row[key] = value;
  }
  row.updatedAt = new Date();
}

type Relation =
  | { model: string; type: "hasMany"; foreignKey: string }
  | { model: string; type: "belongsTo"; localKey: string };

const relations: Record<string, Record<string, Relation>> = {
  account: {
    expenses: { model: "expense", type: "hasMany", foreignKey: "accountId" },
    incomes: { model: "income", type: "hasMany", foreignKey: "accountId" },
    outgoingTransfers: { model: "transfer", type: "hasMany", foreignKey: "fromAccountId" },
    incomingTransfers: { model: "transfer", type: "hasMany", foreignKey: "toAccountId" },
  },
  bankAccountLink: {
    connection: { model: "bankConnection", type: "belongsTo", localKey: "connectionId" },
  },
  bankConnection: {
    accounts: { model: "bankAccountLink", type: "hasMany", foreignKey: "connectionId" },
    syncJobs: { model: "bankSyncJob", type: "hasMany", foreignKey: "connectionId" },
  },
  bankTransaction: {
    bankAccountLink: { model: "bankAccountLink", type: "belongsTo", localKey: "bankAccountLinkId" },
    expense: { model: "expense", type: "belongsTo", localKey: "expenseId" },
    income: { model: "income", type: "belongsTo", localKey: "incomeId" },
    transfer: { model: "transfer", type: "belongsTo", localKey: "transferId" },
  },
  expense: {
    category: { model: "category", type: "belongsTo", localKey: "categoryId" },
  },
};

function project(store: Record<string, Row[]>, model: string, row: Row, select?: Row): Row {
  if (!select) return { ...row };
  const result: Row = {};
  for (const [key, value] of Object.entries(select)) {
    if (key === "_count") {
      const requested = (value as { select?: Row }).select ?? {};
      result._count = Object.fromEntries(
        Object.keys(requested).map((field) => {
          const relation = relations[model]?.[field];
          if (!relation || relation.type !== "hasMany") return [field, 0];
          return [
            field,
            rows(store, relation.model).filter((item) => item[relation.foreignKey] === row.id)
              .length,
          ];
        }),
      );
      continue;
    }
    const relation = relations[model]?.[key];
    if (relation) {
      result[key] = resolveRelation(store, relation, row, nestedSelection(value));
      continue;
    }
    if (value === true) result[key] = row[key];
  }
  return result;
}

function nestedSelection(value: unknown): Row | undefined {
  if (value === true || value === undefined) return undefined;
  const spec = value as Row;
  // Prisma permite `relation: { select: { ... } }` e `relation: true`.
  return (spec.select as Row | undefined) ?? spec;
}

function resolveRelation(store: Record<string, Row[]>, relation: Relation, row: Row, nested?: Row) {
  if (relation.type === "hasMany") {
    const target = rows(store, relation.model).filter(
      (item) => item[relation.foreignKey] === row.id,
    );
    return target.map((item) => project(store, relation.model, item, nested));
  }
  const id = row[relation.localKey];
  if (!id) return null;
  const found = rows(store, relation.model).find((item) => item.id === id);
  return found ? project(store, relation.model, found, nested) : null;
}

function sortRows(rows: Row[], orderBy: unknown) {
  if (!orderBy) return rows;
  const orders = Array.isArray(orderBy) ? orderBy : [orderBy];
  return [...rows].sort((left, right) => {
    for (const order of orders as Array<Record<string, string>>) {
      for (const [key, direction] of Object.entries(order)) {
        const leftValue = left[key] as number | string | Date;
        const rightValue = right[key] as number | string | Date;
        if (leftValue === rightValue) continue;
        const comparison = leftValue > rightValue ? 1 : -1;
        return direction === "desc" ? -comparison : comparison;
      }
    }
    return 0;
  });
}

function rows(store: Record<string, Row[]>, model: string): Row[] {
  store[model] ??= [];
  return store[model]!;
}

export class InMemoryPrisma {
  readonly data: Record<string, Row[]> = {};

  constructor() {
    for (const model of Object.keys(models)) this.data[model] = [];
    for (const model of ["bankConnection", "bankTransaction", "bankSyncJob", "account"]) {
      this.data[model] = [];
    }
  }

  private rows(model: string) {
    return rows(this.data, model);
  }

  delegate(model: string) {
    const rows = () => this.rows(model);
    const config = models[model];

    return {
      findUnique: async ({ where, select }: { where: Row; select?: Row }) => {
        const normalized = normalizeWhere(model, where);
        const row = rows().find((item) => matches(item, normalized));
        return row ? project(this.data, model, row, select) : null;
      },
      findFirst: async ({ where, select }: { where?: Row; select?: Row } = {}) => {
        const normalized = where ? normalizeWhere(model, where) : {};
        const row = rows().find((item) => matches(item, normalized));
        return row ? project(this.data, model, row, select) : null;
      },
      findMany: async ({
        where,
        select,
        orderBy,
        take,
        skip,
      }: { where?: Row; select?: Row; orderBy?: unknown; take?: number; skip?: number } = {}) => {
        const normalized = where ? normalizeWhere(model, where) : {};
        let result = rows().filter((item) => matches(item, normalized));
        result = sortRows(result, orderBy);
        if (skip) result = result.slice(skip);
        if (take !== undefined) result = result.slice(0, take);
        return result.map((item) => project(this.data, model, item, select));
      },
      count: async ({ where }: { where?: Row } = {}) => {
        const normalized = where ? normalizeWhere(model, where) : {};
        return rows().filter((item) => matches(item, normalized)).length;
      },
      create: async ({ data, select }: { data: Row; select?: Row }) => {
        const row: Row = {
          ...(config?.defaults?.() ?? {}),
          id: randomUUID(),
          createdAt: new Date(),
          updatedAt: new Date(),
          ...data,
        };
        this.assertUnique(model, row, null);
        rows().push(row);
        return project(this.data, model, row, select);
      },
      update: async ({ where, data, select }: { where: Row; data: Row; select?: Row }) => {
        const normalized = normalizeWhere(model, where);
        const row = rows().find((item) => matches(item, normalized));
        if (!row) throw new Error(`Registo não encontrado em ${model}`);
        applyData(row, data);
        this.assertUnique(model, row, row.id as string);
        return project(this.data, model, row, select);
      },
      updateMany: async ({ where, data }: { where: Row; data: Row }) => {
        const normalized = normalizeWhere(model, where);
        const targets = rows().filter((item) => matches(item, normalized));
        for (const target of targets) applyData(target, data);
        return { count: targets.length };
      },
      deleteMany: async ({ where }: { where: Row }) => {
        const normalized = normalizeWhere(model, where);
        const remaining = rows().filter((item) => !matches(item, normalized));
        const count = rows().length - remaining.length;
        this.data[model] = remaining;
        return { count };
      },
      delete: async ({ where }: { where: Row }) => {
        const normalized = normalizeWhere(model, where);
        const index = rows().findIndex((item) => matches(item, normalized));
        if (index < 0) throw new Error(`Registo não encontrado em ${model}`);
        const [removed] = rows().splice(index, 1);
        return removed;
      },
    };
  }

  private assertUnique(model: string, row: Row, selfId: string | null) {
    for (const unique of models[model]?.uniques ?? []) {
      if (unique.length === 1 && unique[0] === "id") continue;
      const conflict = this.rows(model).find(
        (item) =>
          item.id !== selfId && unique.every((field) => valueEquals(item[field], row[field])),
      );
      // Valores nulos não colidem (comportamento do PostgreSQL).
      if (conflict && unique.every((field) => row[field] !== null && row[field] !== undefined)) {
        throw new Error(`Violação de unicidade em ${model} (${unique.join(", ")})`);
      }
    }
  }

  /**
   * Executa o callback com um cliente equivalente. Não há isolamento
   * transacional real: serve para os serviços usarem a mesma API do Prisma.
   */
  async $transaction<T>(callback: (client: InMemoryPrisma) => Promise<T>): Promise<T> {
    return callback(this);
  }

  get bankConnection() {
    return this.delegate("bankConnection");
  }
  get bankAuthorizationAttempt() {
    return this.delegate("bankAuthorizationAttempt");
  }
  get bankAccountLink() {
    return this.delegate("bankAccountLink");
  }
  get bankTransaction() {
    return this.delegate("bankTransaction");
  }
  get bankSyncJob() {
    return this.delegate("bankSyncJob");
  }
  get account() {
    return this.delegate("account");
  }
  get expense() {
    return this.delegate("expense");
  }
  get income() {
    return this.delegate("income");
  }
  get transfer() {
    return this.delegate("transfer");
  }
  get category() {
    return this.delegate("category");
  }
}

export function createInMemoryPrisma() {
  return new InMemoryPrisma();
}

/** Instância partilhada pelos testes que simulam a base de dados. */
export const testPrisma = new InMemoryPrisma();

export function resetTestPrisma() {
  for (const model of Object.keys(testPrisma.data)) testPrisma.data[model] = [];
}
