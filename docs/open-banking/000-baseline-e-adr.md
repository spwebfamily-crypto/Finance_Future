# Tarefa 0 — Baseline e decisão arquitetural (Open Banking, somente leitura)

Data: 2026-08-31
Âmbito: leitura de informação de contas (AIS). Sem iniciação de pagamentos.

## 1. Baseline registada (antes de qualquer alteração)

| Comando | Resultado |
| --- | --- |
| `npm run format:check` | OK — todos os ficheiros com estilo Prettier |
| `npm run lint` | OK com 21 avisos, 0 erros (`react-hooks/set-state-in-effect` 12, `react-hooks/refs` 3, `react-hooks/static-components` 1, `react-hooks/use-memo` 1, avisos gerais 4) |
| `npm run typecheck` | OK (backend `tsc --noEmit` + `tsc -b frontend`) |
| `npm test` | OK — backend 112 testes (15 ficheiros), frontend 51 testes (8 ficheiros) |
| `npm run build` | OK (frontend Vite + backend `tsc -p tsconfig.json`) |
| `npm run test:e2e` | **Não executado** — o Docker daemon não está a correr, logo o PostgreSQL do `docker-compose.yml` não sobe. Requer execução manual antes do release (Tarefa 11). |

Estado do repositório: ramo com HEAD `81793ac`, árvore de trabalho sem alterações pendentes relevantes.

## 2. Estado atual que tem de ser preservado

- `Account`, `Expense`, `Income`, `Transfer` com saldo derivado (`openingBalance` + movimentos) — ver `backend/src/routes/accounts.ts:40`.
- Correção manual de saldo (`PATCH /api/accounts/:id/balance`), transferências internas, importação CSV, categorias, orçamentos, recorrências, metas, dívidas, calendário, análises.
- Envelope `{ data: ... }`, `requireAuth`, isolamento por `userId`, PWA com cache offline em `localStorage` (`frontend/src/api/offline-cache.ts`).

## 3. Decisão arquitetural

### 3.1 Adaptador: Enable Banking como primeiro provedor

**Decisão:** implementar a integração atrás de uma interface `OpenBankingProvider`, com `EnableBankingProvider` como primeiro adaptador e `FakeOpenBankingProvider` para testes. Um factory seleciona o provedor por `OPEN_BANKING_PROVIDER`.

**Motivo:** a interface devolve tipos normalizados (`Institution`, `ProviderSession`, `ProviderAccount`, `ProviderBalance`, `ProviderTransactionPage`), pelo que contratos específicos do Enable Banking não chegam às rotas, ao Prisma nem ao frontend. Acrescentar Salt Edge ou outro AISP passa a ser um novo ficheiro em `backend/src/open-banking/`, sem tocar nas rotas.

Contrato confirmado na documentação oficial (https://enablebanking.com/docs/api/reference/, consultada em 2026-08-31):

- Base URL: `https://api.enablebanking.com`. Autenticação da aplicação por JWT RS256 assinado com a chave privada RSA da app: header `typ=JWT`, `alg=RS256`, `kid=<app_id>`; body `iss=enablebanking.com`, `aud=api.enablebanking.com`, `iat`, `exp` (TTL máximo 86400 s).
- `GET /aspsps?country=PT&psu_type=personal&service=AIS` → `aspsps[]` com `name`, `country`, `logo` (URI), `psu_types[]` (`personal` | `business`), `maximum_consent_validity`, `beta`, `bic`.
- `POST /auth` → `url`, `authorization_id`, `psu_id_hash`. Pedido leva `access` (com `valid_until`, `balances`, `transactions`), `aspsp {name, country}`, `state`, `redirect_url`, `psu_type`.
- `POST /sessions` (`{ code }`) → `session_id`, `accounts[]` (`AccountResource`: `uid`, `account_id.iban`, `identification_hash`, `identification_hashes[]`, `currency`, `cash_account_type`, `usage`, `name`), `aspsp`, `access.valid_until`.
- `GET /sessions/{session_id}` → `status` (`AUTHORIZED`, `RETURNED_FROM_BANK`, `PENDING_AUTHORIZATION`, `CANCELLED`, `EXPIRED`, `REVOKED`, `CLOSED`, `INVALID`), `access.valid_until`, `accounts[]`, `accounts_data[]`.
- `DELETE /sessions/{session_id}` → fecha a sessão e, quando possível, o consentimento no banco.
- `GET /accounts/{account_id}/details`, `/balances`, `/transactions?date_from&date_to&continuation_key&transaction_status&strategy`.
- Saldos: `balances[] { balance_type, balance_amount {currency, amount}, reference_date, last_change_date_time, last_committed_transaction }`. `BalanceStatus` relevante: `CLBD` (contabilístico de fecho), `CLAV` (disponível de fecho), `ITBD`/`ITAV` (interinos/decurso do dia), `XPCD` (esperado), `OPBD`/`OPAV`, `PRCD`, `VALU`, `OTHR`, `INFO`, `FWAV`.
- Transações: `transactions[] { entry_reference, transaction_amount, credit_debit_indicator (CRDT|DBIT), status (BOOK|PDNG|HOLD|SCHD|RJCT|CNCL|OTHR), booking_date, value_date, transaction_date, remittance_information[], creditor/debtor (+contas), merchant_category_code, bank_transaction_code, transaction_id }` e `continuation_key`.
- `entry_reference` é **único e imutável para a mesma conta** e serve para casar transações entre sessões; `transaction_id` **não** é identificador estável (pode mudar entre pedidos).
- `uid` da conta é válido apenas enquanto a sessão estiver `AUTHORIZED`; `identification_hash` permite casar a mesma conta entre sessões.

### 3.2 Obtenção de dados: polling controlado, sem webhooks

**Decisão:** não haverá webhook de movimentos nesta fase. A atualização é feita por:

1. Sincronização inicial no callback (`BankSyncJob` com `trigger=initial`).
2. Sincronização manual pelo utilizador (`trigger=manual`), com rate limit e bloqueio de jobs concorrentes por ligação.
3. Sincronização agendada (`trigger=scheduled`) por um comando CLI + rota interna protegida por `OPEN_BANKING_CRON_SECRET`, executada por Render Cron, com claim atómico e lote limitado.

**Motivo:** o contrato público confirmado para AIS é pedido-resposta com paginação por `continuation_key`. Não se inventa um contrato de webhook que não está verificado. O intervalo padrão é `OPEN_BANKING_SYNC_INTERVAL_MINUTES=360` (6 h), conservador face a limites de taxa dos bancos.

A sincronização **consome todas as páginas** até `continuation_key` ser nulo, inclusive quando uma página vem sem transações mas ainda devolve chave.

### 3.3 Fonte do saldo: provedor para contas ligadas, derivado para manuais

**Decisão:**

- `Account.source = manual` → mantém-se o cálculo atual: `openingBalance + incomes - expenses - transfers out + transfers in`. `balanceSource = "derived"`.
- `Account.source = bank` → o saldo apresentado vem do snapshot do provedor guardado em `providerCurrentBalance` / `providerAvailableBalance` / `providerBalanceUpdatedAt`. `balanceSource = "provider"`. **Não** se somam novamente `Expense`/`Income`/`Transfer` ao saldo devolvido pelo banco: isso duplicaria valores.
- Correção manual de saldo e eliminação genérica ficam bloqueadas para contas ligadas (`409 BANK_LINKED_BALANCE_READ_ONLY` e `409 BANK_LINKED_ACCOUNT_REQUIRES_DISCONNECT`).
- Ao desligar com `keep_imported`, a conta passa a `source = manual` e o `openingBalance` é recalculado para que o saldo derivado reproduza o último saldo visível.

**Seleção do saldo:** usa-se por preferência `CLBD` (contabilístico de fecho) para `currentBalance` e `CLAV`/`ITAV` para `availableBalance`; na ausência de `CLBD`, aceita-se `ITBD`, depois `PRCD`/`OPBD`, registando qual o tipo usado. Se o provedor não devolver saldo, mantém-se o último snapshot conhecido e a ligação fica marcada como `stale` na interface — nunca se apresenta um valor inventado.

### 3.4 Segurança (resumo das regras aplicadas no desenho)

- Nunca são pedidas nem guardadas credenciais bancárias: a autorização é um redirecionamento para o ambiente do banco/provedor.
- `state`: 32 bytes aleatórios, validade 10 min, guardado **só** como SHA-256; marcação de uso atómica; comparação em tempo constante; rejeição de replay.
- O callback é público (não usa `requireAuth`) e só confia no `state`: o `userId` vem do registo da tentativa, nunca do navegador.
- Sessão, identificadores de conta e payload de diagnóstico são cifrados em repouso com AES-256-GCM (IV aleatório + authentication tag) usando `OPEN_BANKING_DATA_KEY_B64` (exatamente 32 bytes).
- IBAN nunca é guardado por completo: apenas máscara para apresentação e HMAC para comparação.
- Logs só com IDs internos; proibido registar tokens, `code`, `state`, IBAN ou payload bancário.

## 4. Fora de âmbito (confirmado)

Pagamentos/transferências reais, iniciação de pagamentos (PIS), cartões virtuais, crédito, negociação de investimentos, armazenamento de credenciais bancárias, webhooks de movimentos.

## 5. Riscos e limitações conhecidas

1. Sem Docker a correr neste ambiente: migração Prisma e E2E não puderam ser validados na baseline (Tarefa 11 terá de o fazer).
2. Cobertura real de bancos portugueses, custos do provedor e eventuais requisitos regulatórios (licença AISP própria vs. uso da licença do Enable Banking) **não** são assumidos: têm de ser confirmados com o provedor e com o enquadramento legal antes do rollout.
3. `maximum_consent_validity` varia por banco; o consentimento tem de ser tratado como expirável, com `reauth_required`.
4. O saldo do provedor pode estar dessincronizado do Derivado por transações pendentes: pendentes não materializam despesa/rendimento nem entram em análises.

## 6. Rollback

A funcionalidade fica atrás de `OPEN_BANKING_ENABLED=false` por omissão. Desligar a flag remove as rotas (`OPEN_BANKING_DISABLED`) sem tocar nos dados; as tabelas Open Banking são aditivas e as contas existentes permanecem `source=manual`, pelo que o rollback é só de configuração.
