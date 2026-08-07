# ExpenseSnap

ExpenseSnap é uma aplicação mobile-first para registar despesas pessoais e perceber, com números simples, onde o dinheiro está a ser gasto. A aplicação não usa IA generativa nem envia comprovativos para serviços externos.

## Funcionalidades

- Registo e login com access token e refresh token rotativo.
- Criação, edição, consulta e remoção de despesas.
- Fotografia ou PDF opcional do comprovativo, guardado de forma privada (até 10 MB).
- Leitura OCR opcional e local no navegador para sugerir descrição, local, valor, data e categoria. Os campos continuam editáveis e devem ser confirmados antes de guardar.
- Categorias com ícones Lucide, sem emojis.
- Dashboard com total mensal, médias históricas, comparação mensal, tendência e distribuição por categoria.
- Limites mensais por categoria e níveis determinísticos de gasto.
- PWA instalável, navegação otimizada para telefone e cache dos últimos dados quando fica sem ligação.

## Tecnologias

- React, TypeScript, Vite, Framer Motion e Lucide React no frontend.
- Node.js, Express, TypeScript, Prisma e PostgreSQL no backend.
- Tesseract.js apenas no navegador para OCR local.
- Vitest para testes unitários e Playwright para o fluxo E2E.
- npm workspaces para gerir o monorepo.

## Configuração local

Pré-requisitos: Node.js 20.19 ou superior, npm 10 ou superior e Docker Desktop.

```powershell
Copy-Item .env.example .env
Copy-Item backend/.env.example backend/.env
Copy-Item frontend/.env.example frontend/.env
npm install
npm run db:up
npm run db:migrate
npm run db:seed
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

## Deploy

### Netlify (frontend)

- Build command: `npm run build -w frontend`
- Publish directory: `frontend/dist`
- Variável de ambiente: `VITE_API_URL=https://expensesnap-api.onrender.com/api`

### Render (backend)

- Build command: `npm ci --include=dev && npm run build -w backend`
- Start command: `npm run db:migrate -w backend && npm start -w backend`
- Health check: `/api/health`

O OCR local pode descarregar o modelo de idioma para o navegador. Imagens são lidas localmente pelo Tesseract.js; PDFs digitais são analisados pelo texto incorporado. PDFs digitalizados sem camada de texto continuam a poder ser anexados, mas pedem confirmação manual dos campos. O ficheiro só é enviado para o backend quando a despesa é guardada.
