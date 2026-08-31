# Tarefa 4 — Instituições, autorização e callback

## Rotas implementadas (`backend/src/routes/openBanking.ts`)

| Rota | Autenticação | Notas |
| --- | --- | --- |
| `GET /api/open-banking/institutions?country=PT&psuType=personal` | `requireAuth` + limite por utilizador | `country` validado contra allowlist; `psuType` só `personal`/`business`; logos só do domínio do provedor |
| `POST /api/open-banking/authorizations` | `requireAuth` + limite por utilizador | Confirma a instituição na lista do provedor antes de iniciar; responde `201` |
| `GET /api/open-banking/callback` | pública (validação por `state`), limite estrito por IP | Exige HTTPS em produção; responde `303` para o frontend |
| `GET /api/open-banking/connections` | `requireAuth` | Nunca devolve o identificador de sessão nem cifrados |
| `GET /api/open-banking/connections/:connectionId` | `requireAuth` + `userId` | Inclui contas ligadas e último `BankSyncJob` |
| `GET /api/open-banking/fake-authorize` | pública, apenas com provedor `fake` fora de produção | Simula o banco nos testes E2E e no desenvolvimento |

Todas as rotas passam primeiro pelo guard `requireOpenBankingEnabled`: com `OPEN_BANKING_ENABLED=false` respondem `403 OPEN_BANKING_DISABLED`.

## State

- 32 bytes aleatórios (`base64url`), validade de 10 minutos.
- Só o SHA-256 do state é guardado (`BankAuthorizationAttempt.stateHash`, único).
- Consumo atómico: `updateMany({ where: { id, usedAt: null } })`; se nenhuma linha for afetada o pedido é tratado como replay.
- O `userId` vem sempre do registo da tentativa: o callback nunca confia em dados do navegador.
- O código do banco é trocado uma única vez pelo provedor e a tentativa fica marcada como usada antes/durante a troca.

## Callback

- Responde sempre `303` para `FRONTEND_ORIGIN` + caminho de uma allowlist interna (`/accounts`, `/accounts/connections`, `/privacy`), com `bankConnection=success` ou `bankConnection=error&reason=<codigo-seguro>`.
- Cabeçalhos: `Cache-Control: no-store` e `Referrer-Policy: no-referrer`.
- O `code`, o `state`, `error_description` e qualquer payload do provedor nunca aparecem no redirecionamento nem na resposta.
- Motivos seguros devolvidos: `cancelled`, `expired`, `replayed`, `invalid_state`, `authorization_failed`, `institution_unavailable`, `provider_unavailable`, `rate_limited`, `provider_error`, `unexpected_error`.
- Em produção sem HTTPS responde `400 INSECURE_CALLBACK`.

## Pós-autorização

1. Troca do `code` por sessão no provedor.
2. Identificador da sessão cifrado (AES-256-GCM) e guardado em `providerSessionCiphertext`.
3. `BankConnection` criada com `status = active` e `nextSyncAt` = agora + `OPEN_BANKING_SYNC_INTERVAL_MINUTES`.
4. `BankSyncJob` criado com `trigger = initial` (a sincronização das contas e movimentos acontece no motor da Tarefa 5).
