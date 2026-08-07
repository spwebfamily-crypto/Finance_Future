# ExpenseSnap

ExpenseSnap é uma aplicação web mobile-first para registar e organizar despesas pessoais. Este repositório contém a **Fase 1 (MVP)**: autenticação, gestão de despesas com fotografia, categorias e filtros básicos.

## Tecnologias

- React, TypeScript, Vite e Tailwind CSS no frontend
- Node.js, Express, TypeScript, Prisma e PostgreSQL no backend
- Vitest para testes unitários e Playwright para o fluxo E2E
- npm workspaces para gerir o monorepo

## Pré-requisitos

- Node.js 20.19 ou superior
- npm 10 ou superior
- Docker Desktop com Docker Compose

## Configuração local

1. Criar os ficheiros de ambiente a partir dos exemplos:

   ```powershell
   Copy-Item .env.example .env
   Copy-Item backend/.env.example backend/.env
   Copy-Item frontend/.env.example frontend/.env
   ```

2. Rever os segredos JWT em `backend/.env`. Os valores de exemplo destinam-se apenas a desenvolvimento local.

3. Instalar todas as dependências do monorepo:

   ```bash
   npm install
   npx playwright install chromium
   ```

4. Iniciar a base de dados e preparar o schema:

   ```bash
   npm run db:up
   npm run db:migrate
   npm run db:seed
   ```

5. Iniciar API e frontend em simultâneo:

   ```bash
   npm run dev
   ```

O frontend fica disponível em <http://localhost:5173> e a API em <http://localhost:3000/api>. O endpoint <http://localhost:3000/api/health> permite confirmar que a API está ativa.

## Comandos úteis

| Comando | Função |
|---|---|
| `npm run dev` | Arranca frontend e backend em modo de desenvolvimento |
| `npm run build` | Compila todos os workspaces |
| `npm run lint` | Executa o lint disponível em cada workspace |
| `npm test` | Executa os testes unitários dos workspaces |
| `npm run db:up` | Arranca o PostgreSQL e aguarda até estar saudável |
| `npm run db:down` | Para os contentores, preservando os dados |
| `npm run db:migrate` | Aplica as migrations Prisma pendentes |
| `npm run db:seed` | Cria os dados base de forma idempotente |
| `npm run test:e2e` | Prepara a BD e testa registo + criação de despesa no Chromium |
| `npm run test:e2e:ui` | Abre o runner interativo do Playwright |

Os dados do PostgreSQL ficam no volume Docker `postgres_data`. `npm run db:down` não os elimina.

## Âmbito da Fase 1

- Registo e login com tokens JWT
- Criação, consulta, edição e remoção de despesas
- Upload local de fotografias de recibos, sem OCR
- Categorias predefinidas e categorias pessoais
- Lista de despesas com filtros básicos

Analytics, orçamentos, OCR, notas financeiras com IA, PWA e exportação pertencem às fases seguintes e não fazem parte deste MVP.
