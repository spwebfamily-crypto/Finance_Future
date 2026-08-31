# Tarefa 2 — Migração Open Banking: validação e rollback

Migração: `backend/prisma/migrations/20260831182724_open_banking_read_only/migration.sql`

## O que a migração faz

Operações **puramente aditivas**, sem `DROP`, sem alteração de tipos existentes e sem reescrita de dados:

1. Cria 8 enums: `AccountSource`, `BankProvider`, `BankConnectionStatus`, `BankTransactionStatus`, `BankTransactionDirection`, `BankTransactionClassification`, `BankSyncJobStatus`, `BankSyncTrigger`.
2. Adiciona a `Account`: `source` (`manual` por omissão), `currency` (`EUR` por omissão), `providerCurrentBalance`, `providerAvailableBalance`, `providerBalanceUpdatedAt`.
3. Cria 5 tabelas: `BankAuthorizationAttempt`, `BankConnection`, `BankAccountLink`, `BankTransaction`, `BankSyncJob`.
4. Cria índices e chaves estrangeiras (todas `ON DELETE CASCADE` exceto `expenseId`/`incomeId`/`transferId`, que são `SET NULL`).
5. Ligações opcionais `Expense`/`Income`/`Transfer` → `BankTransaction`.

## O que a migração nunca faz

- Não apaga movimentos, contas, despesas, rendimentos ou transferências.
- Não recalcula nem altera saldos existentes (`openingBalance` fica intacto).
- Não exige qualquer dado de Open Banking para utilizadores existentes: os novos campos têm omissões e as novas tabelas começam vazias.

## Validação executada (2026-08-31)

Ambiente: PostgreSQL 16 do `docker-compose.yml`, base já com dados (16 utilizadores, 106 categorias, 37 despesas) e dados "legados" criados de propósito para o teste (2 contas manuais, 1 rendimento, 1 transferência, 2 despesas associadas a contas).

Procedimento:

1. `npm run db:up && npm run db:migrate` (estado anterior à migração).
2. Retrato determinístico antes: contagens + `openingBalance` + saldo derivado de cada conta.
3. `npx prisma migrate dev --name open_banking_read_only`.
4. Retrato determinístico depois e comparação.

Resultado:

- Retratos **idênticos** (contagens e saldos derivados inalterados).
- Todas as contas existentes com `source = 'manual'` e `currency = 'EUR'`.
- Roll-forward verificado: `prisma migrate deploy` aplica as 8 migrações sem erros numa base vazia criada de propósito para o efeito (base temporária removida no fim).

## Rollback

A migração é aditiva, pelo que o rollback é seguro e não perde dados do produto:

```sql
DROP TABLE "BankSyncJob";
DROP TABLE "BankTransaction";
DROP TABLE "BankAccountLink";
DROP TABLE "BankConnection";
DROP TABLE "BankAuthorizationAttempt";
ALTER TABLE "Account"
  DROP COLUMN "providerBalanceUpdatedAt",
  DROP COLUMN "providerAvailableBalance",
  DROP COLUMN "providerCurrentBalance",
  DROP COLUMN "currency",
  DROP COLUMN "source";
DROP TYPE "BankSyncTrigger", "BankSyncJobStatus", "BankTransactionClassification",
  "BankTransactionDirection", "BankTransactionStatus", "BankConnectionStatus",
  "BankProvider", "AccountSource";
```

Antes de qualquer migração em produção: backup verificado do PostgreSQL (ver Tarefa 11) e deploy com `OPEN_BANKING_ENABLED=false`.
