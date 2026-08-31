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
- Plano financeiro com rendimentos, saldo disponível do mês, metas de poupança com valor e data-alvo, e alertas de prazo.
- Despesas recorrentes para antecipar vencimentos; cada pagamento só cria uma despesa depois da confirmação do utilizador.
- Onboarding financeiro privado com rendimento, custos, poupança, objetivo, prazo, experiência e tolerância declarada ao risco.
- Área educativa de investimento com exemplos para estudo, riscos, fontes oficiais e comparação neutra de plataformas; não dá ordens de compra nem promete retorno.
- PWA instalável, navegação otimizada para telefone e cache dos últimos dados quando fica sem ligação.

## Novas areas do plano financeiro

- Contas, dinheiro e cartoes com saldo derivado de movimentos e transferencias internas.
- Importacao de CSV com pre-visualizacao, categoria/conta de reserva e deteccao de duplicados.
- Rendimentos recorrentes: o utilizador confirma cada recebimento antes de este afetar o saldo.
- Calendario financeiro que junta vencimentos, rendimentos previstos, dividas e metas.
- Alertas no plano e notificacoes opcionais do navegador.
- Dividas com saldo, taxa anual, prestacao, proximo vencimento e atualizacao manual apos cada pagamento.

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
| `npm run open-banking:sync` | Processa sincronizações bancárias agendadas (CLI/cron) |

## Open Banking (somente leitura)

Ligação de contas bancárias para leitura de saldos e movimentos (AIS), sem pagamentos. Está atrás
da flag `OPEN_BANKING_ENABLED=false` por omissão: enquanto estiver desligada, nada muda na
aplicação. Documentação completa, configuração, limitações e rollback em
[`docs/open-banking/README.md`](./docs/open-banking/README.md).

```powershell
# Chave de cifragem dos dados sensíveis em repouso (exatamente 32 bytes)
openssl rand -base64 32
```

## Deploy

### Netlify (frontend)

- Build command: `npm run build -w frontend`
- Publish directory: `frontend/dist`
- Variável de ambiente: `VITE_API_URL=https://expensesnap-api.onrender.com/api`

O Netlify Drop publica o `dist` já compilado e não aplica variáveis do painel. Se a URL da API mudar, ligue o site ao repositório Git ou reconstrua antes do upload manual: `$env:VITE_API_URL='https://sua-api.onrender.com/api'; npm run build -w frontend`.

### Render (backend)

- Build command: `npm ci --include=dev && npm run build -w backend`
- Start command: `npm run db:migrate -w backend && npm start -w backend`
- Health check: `/api/health`
- Variável recomendada no Render: `TRUST_PROXY_HOPS=2` (edge + load balancer; ajuste se a topologia mudar)

Os novos comprovativos são guardados de forma privada no PostgreSQL, com limite de 10 MB por ficheiro e quotas configuráveis (`RECEIPT_QUOTA_MB_PER_USER`, 100 MB por omissão; `RECEIPT_TOTAL_QUOTA_MB`, 500 MB por omissão). `UPLOAD_DIR` serve apenas para abrir e limpar anexos legados criados antes desta migração. A migração não copia esses ficheiros antigos: descarregue-os antes do deploy e volte a anexá-los se existirem dados reais.

A durabilidade de contas, despesas, perfis e comprovativos passa a depender do PostgreSQL. Não use uma base temporária como arquivo: o Render Free PostgreSQL expira, não fornece backups e deve ser substituído por um plano/base durável antes de produção. Mantenha backups verificados.

O OCR local usa o worker, o motor e os modelos em português/inglês publicados com o próprio frontend. Imagens são lidas localmente pelo Tesseract.js; PDFs digitais usam a camada de texto e páginas digitalizadas recorrem ao OCR apenas quando necessário. Depois da primeira leitura, o navegador também reutiliza os modelos em cache. O ficheiro não é enviado para um serviço de IA ou CDN externo; só é enviado para o backend quando a despesa é guardada. As sugestões devem ser confirmadas antes de guardar.
