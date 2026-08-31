# Open Banking (somente leitura)

Integração de leitura de contas (**AIS**): saldos e movimentos. **Não** faz pagamentos,
transferências, cartões, crédito nem investimentos, e **nunca** guarda credenciais bancárias.

A funcionalidade está inteiramente atrás de `OPEN_BANKING_ENABLED` (por omissão `false`).
Com a flag desligada as rotas respondem `403 OPEN_BANKING_DISABLED` e nada muda nas contas
manuais, no dinheiro nem na importação CSV.

## Configuração (backend)

| Variável | Obrigatória | Notas |
| --- | --- | --- |
| `OPEN_BANKING_ENABLED` | sim | `false` por omissão |
| `OPEN_BANKING_PROVIDER` | sim | `fake` (testes) ou `enable_banking` |
| `OPEN_BANKING_DEFAULT_COUNTRY` | não | `PT` por omissão; validada contra allowlist |
| `OPEN_BANKING_CALLBACK_URL` | quando ativo | URL absoluto, tem de terminar em `/api/open-banking/callback`, sem query/fragmento; HTTPS obrigatório em produção |
| `OPEN_BANKING_DATA_KEY_B64` | quando ativo | base64 de **exatamente 32 bytes** (AES-256-GCM). Gerar com `openssl rand -base64 32` |
| `OPEN_BANKING_CRON_SECRET` | quando ativo | mínimo 32 caracteres; protege as rotas internas |
| `OPEN_BANKING_SYNC_INTERVAL_MINUTES` | não | 360 por omissão (mínimo 15) |
| `ENABLE_BANKING_ENV` | não | `sandbox` por omissão; `production` só com `NODE_ENV=production` |
| `ENABLE_BANKING_APP_ID` | com `enable_banking` | application id do Enable Banking |
| `ENABLE_BANKING_PRIVATE_KEY_B64` | em produção com `enable_banking` | chave privada RSA (PEM) em base64 |

`FRONTEND_ORIGIN` tem de ser a origem exata e pública do frontend (em produção: HTTPS, sem
caminho nem barra final). É a única origem usada nos redirecionamentos do callback, o que
impede open redirects. O `redirect_url` enviado ao provedor é sempre o valor de
`OPEN_BANKING_CALLBACK_URL`, que tem de estar registado na aplicação do Enable Banking.

Produção falha no arranque se o Open Banking estiver ativo e faltar uma variável obrigatória.

## Adaptares

- `EnableBankingProvider` — API real/sandbox (documentação: <https://enablebanking.com/docs/api/reference/>).
- `FakeOpenBankingProvider` — estado em memória, usado por testes unitários e E2E; inclui a rota
  `/api/open-banking/fake-authorize`, que só existe fora de produção com o provedor `fake`.
- Um novo AISP entra em `contracts.ts` + `providerFactory.ts`, sem tocar em rotas, Prisma ou frontend.

## Rotas

| Rota | Autenticação |
| --- | --- |
| `GET /api/open-banking/institutions` | utilizador |
| `POST /api/open-banking/authorizations` | utilizador |
| `GET /api/open-banking/callback` | pública, validada por `state` |
| `GET /api/open-banking/connections` | utilizador |
| `GET /api/open-banking/connections/:id` | utilizador |
| `POST /api/open-banking/connections/:id/sync` | utilizador |
| `POST /api/open-banking/connections/:id/reauthorize` | utilizador |
| `POST /api/open-banking/connections/:id/disconnect` | utilizador |
| `GET /api/open-banking/transactions` | utilizador |
| `PATCH /api/open-banking/transactions/:id` | utilizador |
| `GET /api/open-banking/sync-jobs/:id` | utilizador |
| `POST /api/internal/open-banking/sync-due` | `Authorization: Bearer <OPEN_BANKING_CRON_SECRET>` |
| `POST /api/internal/open-banking/cleanup` | idem |
| `GET /api/internal/open-banking/stats` | idem |

Agendamento no Render (Cron Job):

```
npm run open-banking:sync -- --limit 20 --retention-days 30
```

Alternativamente, chamar `POST /api/internal/open-banking/sync-due` com o segredo do cron.

## Saldos

- Conta `manual`: saldo derivado (`openingBalance` + rendimentos − despesas − transferências).
- Conta `bank`: snapshot do banco (`providerCurrentBalance`, `providerAvailableBalance`),
  preferindo `CLBD`/`CLAV`. Os movimentos **não** voltam a ser somados.
- Correção manual de saldo e remoção genérica de conta estão bloqueadas para contas ligadas
  (`BANK_LINKED_BALANCE_READ_ONLY`, `BANK_LINKED_ACCOUNT_REQUIRES_DISCONNECT`).

## Segurança

- Palavra-passe do banco: nunca pedida, recebida nem guardada.
- `state`: 32 bytes aleatórios, 10 minutos de validade, guardado só como SHA-256, consumo atómico
  (replay detetado).
- Sessão, identificadores de conta e hashes cifrados/derivados com AES-256-GCM e HMAC-SHA256.
- IBAN nunca guardado por completo: só máscara para apresentação e HMAC para comparação.
- Logs só com IDs internos e códigos sanitizados: sem tokens, `code`, `state`, IBAN ou payloads.

## Limitações conhecidas

1. Cobertura real de bancos portugueses, custos e enquadramento regulatório (licença AISP própria
   vs. licença do provedor) **não** foram verificados: confirmar com o provedor antes do rollout.
2. O consentimento é pedido por 90 dias; cada banco pode impor um máximo inferior.
3. Transferências entre contas próprias são detetadas por valor, moeda, data e hashes de conta/IBAN.
   Se o banco não devolver a conta da contraparte, a correspondência pode ficar por rever.
4. Não há webhooks de movimentos: a atualização é por polling (sincronização manual ou agendada).
5. Movimentos pendentes não criam despesas/rendimentos e não entram nas análises.
6. O saldo do banco pode divergir do derivado enquanto existirem pendentes.

## Migrações aplicadas

- `20260831182724_open_banking_read_only` — tabelas, enums e campos aditivos.
- `20260831191908_add_bank_account_iban_hash` — `providerIbanHash` em `BankAccountLink`.
- `20260831193739_add_authorization_attempt_connection` — `connectionId` na tentativa (renovação).

## Rollback

1. Backup verificado do PostgreSQL antes de qualquer migração.
2. Desativar com `OPEN_BANKING_ENABLED=false` (rollback só de configuração; os dados ficam).
3. Em último caso, remover as tabelas e colunas criadas (SQL em
   [`001-migracao-e-rollback.md`](./001-migracao-e-rollback.md)).
