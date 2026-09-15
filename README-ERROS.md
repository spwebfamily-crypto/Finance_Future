# Diagnóstico técnico — ExpenseSnap

Data da auditoria: 15 de setembro de 2026  
Âmbito: repositório completo (frontend, backend, Prisma e dependências de produção).  
Alterações de código/dados: nenhuma. Este documento é apenas o resultado da auditoria.

## Resumo executivo

| Severidade | Situação | Impacto |
| --- | --- | --- |
| Crítica | A migration de produção `20260911161000_add_movement_currency` está marcada como falhada no Render (`P3009`). | O deploy não aplica migrations novas. |
| Alta | A base PostgreSQL local não está acessível e o Docker local não está a correr. | Não foi possível testar migrations, health check com base real ou E2E. |
| Média | 10 ficheiros não respeitam Prettier. | O gate de formatação falha. |
| Baixa | ESLint devolve 36 avisos (sem erros bloqueantes). | Há riscos de renders redundantes, Fast Refresh menos fiável e logs inadequados. |
| Informativa | O build mostra avisos de API Vite depreciada. | Atualização futura de configuração/plugin. |

## 1. Bloqueador de produção: Prisma P3009

O Render indicou que `20260911161000_add_movement_currency`, iniciada em 2026-09-11, falhou. A causa no SQL originalmente publicado era um `UPDATE ... FROM ... LEFT JOIN` que referenciava a tabela alvo de maneira incompatível com PostgreSQL.

O ficheiro atual em `backend/prisma/migrations/20260911161000_add_movement_currency/migration.sql` já contém a versão corrigida, com subqueries correlacionadas. Antes de marcar a migration como revertida, criar backup e confirmar que nenhuma das colunas `currency` foi aplicada parcialmente. O procedimento seguro está em `docs/production-migration-recovery.md`.

Não usar `prisma db push` nem `prisma migrate reset` em produção.

## 2. Base local indisponível

`npm exec --workspace @expensesnap/backend prisma migrate status` falhou ao contactar PostgreSQL em `localhost:5432`, com `Schema engine error`. A verificação de `docker compose ps` também falhou: o daemon Docker não está a correr.

Consequências desta auditoria:

- Não foi possível confirmar o estado da tabela `_prisma_migrations` local.
- Não foi possível executar `test:e2e`: o script inicia PostgreSQL, aplica migrations e executa seed; isso altera a base local e requer Docker operacional.
- Não foi possível provar o endpoint `/api/health` com uma base PostgreSQL real.

## 3. Formatação: 10 ficheiros

`npm run format:check` falha nestes ficheiros:

- `backend/src/routes/openBanking.ts`
- `backend/src/server.ts`
- `frontend/src/components/AnimatedCurrency.tsx`
- `frontend/src/components/BankTransactionRow.tsx`
- `frontend/src/components/DailyBankReviewModal.test.tsx`
- `frontend/src/components/DailyBankReviewModal.tsx`
- `frontend/src/components/ReauthorizeBanner.tsx`
- `frontend/src/pages/PrivacyPage.tsx`
- `frontend/src/pages/ResetPasswordPage.tsx`
- `frontend/src/pages/VerifyEmailPage.tsx`

Correção: aplicar Prettier apenas depois de rever o diff gerado (`npm run format`).

## 4. Lint: 36 avisos

O lint termina com sucesso (`0 errors, 36 warnings`), mas os avisos devem ser tratados por ordem de risco.

### 4.1 `react-hooks/set-state-in-effect` — 19 avisos

Há atualizações síncronas de estado dentro de efeitos. Podem criar renderizações em cascata e são mais relevantes nas páginas de dados.

- `frontend/src/components/AuthenticatedReceiptImage.tsx:29`
- `frontend/src/components/DisconnectBankDialog.tsx:33`
- `frontend/src/components/PdfReceiptPreview.tsx:49`
- `frontend/src/components/SessionLoadingOverlay.tsx:14`
- `frontend/src/layout/AppShell.tsx:338`
- `frontend/src/pages/AccountDetailPage.tsx:105`
- `frontend/src/pages/AccountsConnectPage.tsx:59`
- `frontend/src/pages/AccountsPage.tsx:147,188`
- `frontend/src/pages/BankConnectionsPage.tsx:84`
- `frontend/src/pages/CategoriesPage.tsx:73`
- `frontend/src/pages/DashboardPage.tsx:173`
- `frontend/src/pages/ExpenseFormPage.tsx:119`
- `frontend/src/pages/ExpensesPage.tsx:160,170`
- `frontend/src/pages/FinancialOnboardingPage.tsx:200`
- `frontend/src/pages/InvestmentsPage.tsx:174`
- `frontend/src/pages/PlanningPage.tsx:244`
- `frontend/src/pages/PrivacyPage.tsx:41`

Correção recomendada: derivar estado quando possível; para carregamentos assíncronos, iniciar o pedido sem resets síncronos desnecessários e manter cancelamento/estado de loading controlado.

### 4.2 `react-hooks/refs` — 3 avisos

`frontend/src/pages/ExpenseFormPage.tsx:652,656,660` lê `lastAutofillRef.current` durante o render. Transferir o valor que afeta a interface para state ou calcular a informação no manipulador que atualiza o formulário.

### 4.3 `react-hooks/static-components` — 1 aviso

`frontend/src/components/CategoryIcon.tsx:77` escolhe e instancia um componente de ícone durante o render. Estabilizar o mapa de componentes fora do render ou usar uma camada de renderização que não recrie o tipo de componente.

### 4.4 `react-refresh/only-export-components` — 6 avisos

Separar constantes/funções utilitárias dos componentes nestes pontos:

- `frontend/src/auth/AuthContext.tsx:144`
- `frontend/src/components/CategoryIcon.tsx:26,59`
- `frontend/src/components/CommandPalette.tsx:58`
- `frontend/src/components/ThemeToggle.tsx:25`
- `frontend/src/pages/FinancialOnboardingPage.tsx:151`

### 4.5 `no-console` — 7 avisos

Substituir logs de diagnóstico por logger estruturado (ou justificar explicitamente em testes):

- `backend/src/scripts/processOpenBankingJobs.ts:25,28`
- `backend/src/services/emailService.ts:102,105`
- `backend/src/services/emailService.test.ts:82,150,162`

## 5. Build: avisos de compatibilidade Vite

O build termina com sucesso, mas Vite 8 avisa que `esbuild` no plugin `vite:react-babel` e `optimizeDeps.esbuildOptions` estão depreciados. Atualizar a configuração/plugin para as alternativas `oxc` e `optimizeDeps.rolldownOptions` numa tarefa isolada, validando OCR e build depois.

## 6. Verificações aprovadas

| Comando | Resultado |
| --- | --- |
| `npm run lint` | Passou com 36 avisos e 0 erros. |
| `npm run typecheck` | Passou. |
| `npm test` | Passou: frontend 19 ficheiros/88 testes; backend 32 ficheiros/289 testes. |
| `npm run build` | Passou; apenas avisos Vite documentados acima. |
| `npm exec --workspace @expensesnap/backend prisma validate` | Passou. |
| `npm audit --omit=dev --json` | 0 vulnerabilidades nas 188 dependências de produção. |
| `git diff --check` | Passou antes da criação deste relatório. |

## Ordem de correção sugerida

1. Recuperar a migration falhada no Render com backup e o procedimento de produção.
2. Restaurar PostgreSQL/Docker local e executar `prisma migrate status`, health check e E2E numa base descartável.
3. Corrigir os 10 ficheiros Prettier.
4. Corrigir `ExpenseFormPage` e `CategoryIcon` antes dos restantes avisos React, pois são os de maior probabilidade de afetar renderização.
5. Eliminar os restantes `set-state-in-effect` por página/componente, protegendo cada grupo com testes.
6. Atualizar configuração Vite/React quando houver janela para atualização de ferramentas.

## Comandos de reprodução

```sh
npm run format:check
npm run lint
npm run typecheck
npm test
npm run build
npm exec --workspace @expensesnap/backend prisma validate
npm exec --workspace @expensesnap/backend prisma migrate status
npm audit --omit=dev --json
```
