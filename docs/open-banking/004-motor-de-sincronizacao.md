# Tarefa 5 — Motor de sincronização

Ficheiros: `backend/src/open-banking/dedupe.ts`, `backend/src/open-banking/syncService.ts`, rotas `POST /connections/:id/sync` e `GET /sync-jobs/:jobId` em `backend/src/routes/openBanking.ts`.

## Sequência da sincronização

1. **Claim atómico** do `BankSyncJob`: `updateMany({ where: { id, status: "queued" }, data: { status: "running", ... } })`. Se nenhuma linha for afetada, outro worker já ficou com o job.
2. Desencripta o identificador da sessão **apenas em memória** (`decryptSessionId`).
3. `provider.getSession(sessionId)` → valida estado e consentimento.
4. Sessão não autorizada (expirada/revogada/fechada/inválida): atualiza a ligação (`expired`, `reauth_required`, `pending` ou `error`) e termina o job.
5. Consentimento expirado: ligação fica `expired` e o job falha com `BANK_CONNECTION_EXPIRED`.
6. Para cada conta autorizada (máximo 25):
   - upsert do `BankAccountLink` por `(connectionId, providerAccountHash)`;
   - criação da `Account` (`source = bank`) só quando não existir, com nome único por utilizador;
   - leitura dos saldos e atualização dos snapshots (`providerCurrentBalance`, `providerAvailableBalance`, `providerBalanceUpdatedAt`);
   - leitura das transações **página a página** enquanto existir `continuation_key` (máximo 100 páginas), continuando mesmo quando uma página vem vazia;
   - normalização dos montantes com `Prisma.Decimal` e cálculo da `dedupeKey`;
   - upsert de `BankTransaction` por `(bankAccountLinkId, dedupeKey)`.
7. `lastTransactionSyncAt` por conta; `lastSyncedAt`, `nextSyncAt` e limpeza do erro na ligação.
8. Contadores e estado final gravados no job (`completed`, `partial` ou `failed`).

## Idempotência

- A chave única `(bankAccountLinkId, dedupeKey)` garante que repetir uma sincronização com os mesmos dados não cria registos: a segunda passagem apenas atualiza (`transactionsUpdated`).
- `dedupeKey`: `HMAC(provider + conta + entry_reference)` quando existe referência estável; caso contrário `HMAC(conta + sentido + valor + moeda + data + descrição normalizada + contraparte)`. Nunca se usa data + descrição + valor de forma global.

## Pendente → contabilizado

- Com a mesma `entry_reference` a chave é igual: o registo é atualizado.
- Sem referência estável, procura-se na mesma conta um movimento pendente com o mesmo sentido, moeda e valor, data dentro de 5 dias e descrição/contraparte compatível.
  - Um candidato: **atualiza o mesmo registo lógico** (inclui a nova referência e a nova chave).
  - Zero candidatos: cria-se o registo contabilizado.
  - Mais do que um candidato: **não há correspondência automática**; cria-se o registo contabilizado e nada é apagado (o pendente fica para revisão).

## Erros

| Situação | Estado da ligação | Job |
| --- | --- | --- |
| Falha transitória (`rate_limited`, `timeout`, `unavailable`) | `active` + `nextSyncAt` com backoff (15/60/240 min) | `failed`, `BANK_PROVIDER_UNAVAILABLE` |
| Consentimento expirado | `expired` | `failed`, `BANK_CONNECTION_EXPIRED` |
| Consentimento revogado | `reauth_required` | `failed`, `BANK_CONNECTION_REAUTH_REQUIRED` |
| Sessão pendente no provedor | `pending` | `partial` |
| Outro erro | `error` | `failed`, código sanitizado |

`lastErrorCode` guarda apenas `PROVIDER_<codigo>` ou `SYNC_FAILED`; nunca há payload bancário nem mensagem do provedor.

## Saldos

`selectBalances` prefere `closing_booked` (`CLBD`/`PRCD`) para o saldo contabilístico e `closing_available` (`CLAV`) para o disponível, com fallback para os interinos (`ITBD`/`ITAV`) e de abertura (`OPBD`). Se o provedor não devolver saldos, o último snapshot é mantido.

## Testes

`backend/src/open-banking/syncService.test.ts` (16 casos) cobre: sincronização inicial, idempotência (segunda sincronização idêntica), página vazia com `continuation_key`, pendente → contabilizado, duas moedas, sessão expirada, falha transitória com backoff, dois workers a reclamar o mesmo job, falha a meio (conta parcial), ligação inexistente, chaves de deduplicação e correspondência ambígua.

Os testes usam um Prisma em memória (`testPrisma.ts`) que aplica as restrições únicas e a comparação de `Decimal`, para garantir a idempotência sem exigir PostgreSQL no CI.
