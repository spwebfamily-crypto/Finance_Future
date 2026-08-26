import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { Prisma } from "@prisma/client";
import express from "express";
import jwt from "jsonwebtoken";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { errorHandler } from "../middleware.js";
import categoryRoutes from "./categories.js";

const repositories = vi.hoisted(() => ({
  categoryFindFirst: vi.fn(),
  categoryFindMany: vi.fn(),
  categoryCreate: vi.fn(),
  categoryUpdate: vi.fn(),
  categoryDelete: vi.fn(),
}));

vi.mock("../prisma.js", () => {
  return {
    prisma: {
      category: {
        findFirst: repositories.categoryFindFirst,
        findMany: repositories.categoryFindMany,
        create: repositories.categoryCreate,
        update: repositories.categoryUpdate,
        delete: repositories.categoryDelete,
      },
    },
  };
});

const userId = "7c8f0f14-1f87-4dfb-a2bf-85bf170a79c8";
const categoryId = "dfc493e7-f9dc-48c5-9341-f659b5c5f288";

function buildCategory(overrides: Record<string, unknown> = {}) {
  return {
    id: categoryId,
    name: "Transportes",
    icon: "car",
    isDefault: false,
    userId,
    ...overrides,
  };
}

function authorization() {
  const token = jwt.sign(
    { type: "access", email: "owner@example.com" },
    process.env.JWT_ACCESS_SECRET!,
    { subject: userId, expiresIn: "5m" },
  );
  return `Bearer ${token}`;
}

describe("category routes", () => {
  let server: Server;
  let baseUrl: string;

  beforeAll(async () => {
    const app = express();
    app.use(express.json());
    app.use("/api/categories", categoryRoutes);
    app.use(errorHandler);
    await new Promise<void>((resolve) => {
      server = app.listen(0, "127.0.0.1", resolve);
    });
    const address = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  });

  beforeEach(() => {
    repositories.categoryFindFirst.mockReset();
    repositories.categoryFindMany.mockReset().mockResolvedValue([]);
    repositories.categoryCreate.mockReset();
    repositories.categoryUpdate.mockReset();
    repositories.categoryDelete.mockReset().mockResolvedValue({ id: categoryId });
  });

  it("lista as categorias do utilizador com as base primeiro e ordenadas por nome", async () => {
    repositories.categoryFindMany.mockResolvedValue([
      buildCategory({ name: "Alimentação", isDefault: true }),
      buildCategory({ name: "Transportes" }),
    ]);

    const response = await fetch(`${baseUrl}/api/categories`, {
      headers: { Authorization: authorization() },
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data).toHaveLength(2);
    expect(body.data[0].name).toBe("Alimentação");
    const listCall = repositories.categoryFindMany.mock.calls[0][0];
    expect(listCall.where).toEqual({ userId });
    expect(listCall.orderBy).toEqual([{ isDefault: "desc" }, { name: "asc" }]);
  });

  it("cria uma categoria própria com nome e ícone", async () => {
    repositories.categoryCreate.mockResolvedValue(buildCategory());

    const response = await fetch(`${baseUrl}/api/categories`, {
      method: "POST",
      headers: { Authorization: authorization(), "Content-Type": "application/json" },
      body: JSON.stringify({ name: "  Transportes  ", icon: "car" }),
    });
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.data).toMatchObject({ name: "Transportes", icon: "car" });
    expect(repositories.categoryCreate).toHaveBeenCalledOnce();
    expect(repositories.categoryCreate.mock.calls[0][0].data).toEqual({
      name: "Transportes",
      icon: "car",
      userId,
    });
  });

  it("guarda null quando a categoria é criada sem ícone", async () => {
    repositories.categoryCreate.mockResolvedValue(buildCategory({ icon: null }));

    const response = await fetch(`${baseUrl}/api/categories`, {
      method: "POST",
      headers: { Authorization: authorization(), "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Saúde" }),
    });
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.data.icon).toBeNull();
    expect(repositories.categoryCreate.mock.calls[0][0].data.icon).toBeNull();
  });

  it("rejeita um nome vazio com VALIDATION_ERROR", async () => {
    const response = await fetch(`${baseUrl}/api/categories`, {
      method: "POST",
      headers: { Authorization: authorization(), "Content-Type": "application/json" },
      body: JSON.stringify({ name: "   " }),
    });
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error.code).toBe("VALIDATION_ERROR");
    expect(repositories.categoryCreate).not.toHaveBeenCalled();
  });

  it("reporta conflito quando já existe uma categoria com o mesmo nome", async () => {
    repositories.categoryCreate.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError(
        "Unique constraint failed on the constraint: `Category_userId_name_key`",
        { code: "P2002", clientVersion: "6.2.1" },
      ),
    );

    const response = await fetch(`${baseUrl}/api/categories`, {
      method: "POST",
      headers: { Authorization: authorization(), "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Alimentação" }),
    });
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.error.code).toBe("CONFLICT");
    expect(body.error.message).toBe("Já existe um registo com estes dados.");
  });

  it("edita o nome e o ícone de uma categoria própria", async () => {
    repositories.categoryFindFirst.mockResolvedValue(buildCategory());
    repositories.categoryUpdate.mockResolvedValue(
      buildCategory({ name: "Combustível", icon: "fuel" }),
    );

    const response = await fetch(`${baseUrl}/api/categories/${categoryId}`, {
      method: "PATCH",
      headers: { Authorization: authorization(), "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Combustível", icon: " fuel " }),
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.name).toBe("Combustível");
    expect(repositories.categoryFindFirst.mock.calls[0][0].where).toEqual({
      id: categoryId,
      userId,
    });
    expect(repositories.categoryUpdate).toHaveBeenCalledOnce();
    expect(repositories.categoryUpdate.mock.calls[0][0]).toMatchObject({
      where: { id: categoryId },
      data: { name: "Combustível", icon: "fuel" },
    });
  });

  it("impede editar uma categoria base", async () => {
    repositories.categoryFindFirst.mockResolvedValue(buildCategory({ isDefault: true }));

    const response = await fetch(`${baseUrl}/api/categories/${categoryId}`, {
      method: "PATCH",
      headers: { Authorization: authorization(), "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Novo nome" }),
    });
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.error.code).toBe("DEFAULT_CATEGORY");
    expect(repositories.categoryUpdate).not.toHaveBeenCalled();
  });

  it("devolve 404 ao editar uma categoria de outro utilizador", async () => {
    repositories.categoryFindFirst.mockResolvedValue(null);

    const response = await fetch(`${baseUrl}/api/categories/${categoryId}`, {
      method: "PATCH",
      headers: { Authorization: authorization(), "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Novo nome" }),
    });
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.error.code).toBe("CATEGORY_NOT_FOUND");
    expect(repositories.categoryUpdate).not.toHaveBeenCalled();
  });

  it("remove uma categoria própria que não é base", async () => {
    repositories.categoryFindFirst.mockResolvedValue(buildCategory());

    const response = await fetch(`${baseUrl}/api/categories/${categoryId}`, {
      method: "DELETE",
      headers: { Authorization: authorization() },
    });

    expect(response.status).toBe(204);
    expect(await response.text()).toBe("");
    expect(repositories.categoryDelete).toHaveBeenCalledWith({ where: { id: categoryId } });
  });

  it("impede eliminar uma categoria base", async () => {
    repositories.categoryFindFirst.mockResolvedValue(buildCategory({ isDefault: true }));

    const response = await fetch(`${baseUrl}/api/categories/${categoryId}`, {
      method: "DELETE",
      headers: { Authorization: authorization() },
    });
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.error.code).toBe("DEFAULT_CATEGORY");
    expect(repositories.categoryDelete).not.toHaveBeenCalled();
  });

  it("devolve 404 ao remover uma categoria de outro utilizador", async () => {
    repositories.categoryFindFirst.mockResolvedValue(null);

    const response = await fetch(`${baseUrl}/api/categories/${categoryId}`, {
      method: "DELETE",
      headers: { Authorization: authorization() },
    });
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.error.code).toBe("CATEGORY_NOT_FOUND");
    expect(repositories.categoryDelete).not.toHaveBeenCalled();
  });

  it("reporta conflito ao remover uma categoria utilizada por despesas", async () => {
    repositories.categoryFindFirst.mockResolvedValue(buildCategory());
    repositories.categoryDelete.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError(
        "Foreign key constraint failed on the field: `categoryId`",
        { code: "P2003", clientVersion: "6.2.1" },
      ),
    );

    const response = await fetch(`${baseUrl}/api/categories/${categoryId}`, {
      method: "DELETE",
      headers: { Authorization: authorization() },
    });
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.error.code).toBe("RESOURCE_IN_USE");
    expect(body.error.message).toBe("Este registo está a ser utilizado e não pode ser eliminado.");
  });
});
