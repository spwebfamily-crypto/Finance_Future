# ExpenseSnap

ExpenseSnap é uma aplicação mobile-first para anotar despesas pessoais e perceber, com números simples, onde o dinheiro está a ser gasto. O produto não usa IA: não lê faturas, não interpreta recibos e não gera recomendações automáticas. O utilizador confirma sempre descrição, local, valor, data e categoria.

## O que está implementado

- Registo/login com access token e refresh token rotativo.
- Criação, edição, consulta e remoção de despesas.
- Fotografia opcional do recibo, guardada de forma privada e visível apenas pelo proprietário.
- Categorias predefinidas e categorias pessoais.
- Dashboard com total mensal, média histórica dos três meses anteriores, comparação com o mês anterior, tendência de seis meses e distribuição por categoria.
- Limites mensais por categoria e níveis determinísticos (normal, elevado, crítico ou dados insuficientes).
- PWA instalável, navegação inferior no telefone e consulta dos últimos dados em cache quando fica sem ligação.
- Validação de dados, isolamento por utilizador, rate limiting de autenticação e migrations Prisma.

## Tecnologias

- React, TypeScript e Vite no frontend.
- Node.js, Express, TypeScript, Prisma e PostgreSQL no backend.
- Vitest para testes unitários e Playwright para o fluxo E2E.
- npm workspaces para gerir o monorepo.

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

2. Alterar os segredos JWT em `backend/.env` antes de qualquer deploy.

3. Instalar dependências e o Chromium usado pelo E2E:

   ```bash
   npm install
   npx playwright install chromium
   ```

4. Preparar PostgreSQL e dados base:

   ```bash
   npm run db:up
   npm run db:migrate
   npm run db:seed
   ```

5. Iniciar API e frontend:

   ```bash
   npm run dev
   ```

O frontend fica em <http://localhost:5173>, a API em <http://localhost:3000/api> e o health check em <http://localhost:3000/api/health>.

## Comandos úteis

| Comando | Função |
|---|---|
| `npm run dev` | Arranca frontend e backend em desenvolvimento |
| `npm run build` | Compila todos os workspaces |
| `npm test` | Executa testes unitários |
| `npm run db:up` | Arranca PostgreSQL e aguarda pelo health check |
| `npm run db:down` | Para os contentores, preservando o volume |
| `npm run db:migrate` | Aplica migrations Prisma |
| `npm run db:seed` | Cria categorias base de forma idempotente |
| `npm run test:e2e` | Testa registo, fotografia e criação de despesa no Chromium |

Os dados ficam no volume Docker `postgres_data`. `npm run db:down` não o elimina.

## Decisões de produto

O comprovativo é apenas um anexo visual. Não existe endpoint OCR, integração Google Vision/Tesseract nem integração Anthropic/Claude. Todas as médias e níveis apresentados no dashboard são calculados localmente pelo serviço de analytics a partir dos registos confirmados pelo utilizador.
