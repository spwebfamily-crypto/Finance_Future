# Tarefa 3 — Segurança e adaptadores

## Cifragem em repouso (`crypto.ts`)

- AES-256-GCM com IV de 12 bytes gerado por mensagem e authentication tag verificada na leitura.
- Envelope versionado: `v1.<iv base64url>.<tag base64url>.<ciphertext base64url>`. A versão permite rotação futura de chaves.
- Qualquer adulteração (IV, tag, ciphertext), chave errada, versão inválida ou envelope truncado lança `DecryptionError`. O chamador trata como dados ilegíveis, nunca como dados válidos.
- Chave: `OPEN_BANKING_DATA_KEY_B64`, exatamente 32 bytes em base64 canónico. Em ambiente de teste a chave é derivada do segredo de JWT do processo (`ephemeralTestKey`) e nunca é persistida.
- `hmacHex` gera identificadores estáveis (contas, contrapartes, chaves de deduplicação); `sha256Hex` guarda apenas o hash do `state`.
- `constantTimeEquals` para comparações sensíveis (segredo do cron).
- `maskIban` guarda apenas país + dígitos de controlo + últimos 4 caracteres. O IBAN completo nunca é gravado nem devolvido.

## Autenticação no provedor (`providerAuth.ts`)

- JWT da aplicação assinado com RS256: header `{ typ: "JWT", alg: "RS256", kid: <app_id> }`; body `{ iss: "enablebanking.com", aud: "api.enablebanking.com", iat, exp }`, TTL de 300 s (o limite documentado é 86 400 s).
- A chave privada RSA (`ENABLE_BANKING_PRIVATE_KEY_B64`, PEM em base64) é descodificada apenas no backend.
- Todos os pedidos usam `AbortController` com timeout (15 s por omissão) e não enviam credenciais do PSU.
- Respostas de erro são traduzidas para códigos internos (`consent_expired`, `consent_revoked`, `authorization_failed`, `provider_rate_limited`, `provider_timeout`, `unauthorized`, `invalid_request`, `provider_unavailable`, `provider_invalid_response`). O `message` do provedor **nunca** é propagado: pode conter dados do PSU.

## Normalização (`normalize.ts`)

- Montantes normalizados para string decimal positiva com duas casas; o sentido fica em `direction`.
- `status`: `BOOK` → `booked`; `RJCT` → `rejected`; `CNCL` → `removed`; `PDNG`, `HOLD`, `SCHD` e desconhecidos → `pending` (nunca materializam despesa/rendimento).
- Saldos: `CLBD`/`PRCD` → `closing_booked`; `CLAV` → `closing_available`; `ITBD`/`ITAV` → interinos; `XPCD` → esperado; `OPBD` → abertura; resto → `other`.
- Logos só são aceites em HTTPS do domínio `enablebanking.com`; qualquer outro valor é descartado (`logoUrl: null`).
- Textos passam por `sanitizeText` (remove caracteres de controlo, normaliza espaços, limita tamanho).

## Adaptadores

- `EnableBankingProvider`: implementa a interface normalizada; o método HTTP é injetável (`request`) para os testes não fazerem rede.
- `FakeOpenBankingProvider`: estado em memória, usado por testes unitários e E2E. Inclui uma rota de simulação do banco (`/api/open-banking/fake-authorize`), que só será montada quando o provedor configurado for `fake` e o ambiente não for produção.
- `providerFactory`: registo por nome (`fake`, `enable_banking`); um novo AISP entra aqui sem tocar em rotas, Prisma ou frontend.

## Limitações conhecidas

- O consentimento é pedido por 90 dias, abaixo do máximo anunciado de 180 dias, por segurança.
- `entry_reference` é usado como identificador estável quando existe; `transaction_id` nunca é usado como chave lógica.
- A correspondência de transferências próprias por IBAN exigirá um hash adicional na ligação da conta (decisão adiada para a Tarefa 5, com migração aditiva própria).
