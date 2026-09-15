# Recuperar `P3009` sem expor a base de dados

Este procedimento aplica-se à migration `20260911161000_add_movement_currency` quando o
Render reporta `P3009`. Não execute nenhum passo com credenciais de produção numa máquina
local e não use `prisma db push` ou `prisma migrate reset`.

1. No painel do fornecedor PostgreSQL, crie um backup e confirme que o restauro pode ser
   iniciado antes de alterar o histórico.
2. Num shell seguro do serviço que já recebe `DATABASE_URL`, consulte o estado e o erro:

   ```sh
   npm exec --workspace @expensesnap/backend prisma migrate status
   npm exec --workspace @expensesnap/backend prisma db execute --stdin <<'SQL'
   SELECT migration_name, started_at, finished_at, rolled_back_at, logs
   FROM "_prisma_migrations"
   WHERE migration_name = '20260911161000_add_movement_currency';
   SQL
   ```

3. Confirme que `Expense`, `Income` e `Transfer` não receberam parcialmente a coluna
   `currency`. PostgreSQL executa esta migration numa transação; ainda assim, a verificação
   é obrigatória antes de resolver o histórico.
4. Só depois da confirmação, marque a tentativa como revertida e deixe o próximo deploy
   aplicar o SQL corrigido:

   ```sh
   npm exec --workspace @expensesnap/backend prisma migrate resolve \
     --rolled-back 20260911161000_add_movement_currency
   npm run db:migrate -w backend
   ```

5. Verifique `prisma migrate status`, o preenchimento de moedas e `/api/health` antes de
   aceitar tráfego normal. Se alguma coluna existir parcialmente, pare: restaure o backup ou
   prepare um SQL de reparação revisto, em vez de marcar a migration como revertida.
