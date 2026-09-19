# Notificações financeiras: migração e operação

Esta alteração é **expand-only**: cria as tabelas de avisos, preferências e subscrições Web Push. Não altera saldos nem cria movimentos financeiros.

## Antes de aplicar em produção

1. Crie e confirme um backup recuperável no fornecedor PostgreSQL.
2. Verifique o estado, apenas para leitura, a partir do serviço que já possui `DATABASE_URL`:

   ```sh
   npm exec --workspace=@expensesnap/backend -- prisma migrate status --schema prisma/schema.prisma
   ```

3. Aplique pelo processo normal de deploy:

   ```sh
   npm run db:migrate -w backend
   ```

4. Verifique novamente o estado e `GET /api/health` autenticado contra o PostgreSQL real.

Não use `prisma db push`, `prisma migrate reset` nem altere `_prisma_migrations` manualmente.

## Job de lembretes

Defina `CRON_SECRET` (mínimo 32 caracteres) e execute `POST /api/internal/notifications/generate` com `Authorization: Bearer <CRON_SECRET>`. A chave única por utilizador, tipo, origem e data torna retries seguros. O job cria apenas avisos — despesas, rendimentos e transferências continuam a exigir confirmação explícita.

## Web Push opcional

Para ativar push, defina conjuntamente `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` e `VAPID_SUBJECT`. Sem estas variáveis, os avisos persistentes dentro da aplicação continuam disponíveis e nenhum push é enviado.
