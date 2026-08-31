# Tarefa 6 — Despesas, rendimentos e transferências

Ficheiros: `backend/src/open-banking/materialize.ts`, `backend/src/open-banking/transferMatcher.ts`, integração no fim da sincronização (`syncService.ts`).

## Materialização (`materialize.ts`)

- Só movimentos **`booked`** são materializados. Pendentes nunca criam despesa nem rendimento e, por isso, não entram nas análises.
- **Débito** → `Expense`: categoria base "Outros", `description` = descrição sanitizada, `location` = contraparte ou "Movimento bancário", `accountId` = conta ligada, `date` = `bookingDate` (ou `valueDate`/`transactionDate`/`firstSeenAt`).
- **Crédito** → `Income` com `source` = contraparte.
- Reexecutar a materialização **não duplica**: se a `Expense`/`Income` já existe, apenas atualiza texto e valor; a **categoria escolhida pelo utilizador é preservada**.
- **Reembolsos**: um crédito com o mesmo valor, moeda e contraparte (ou descrição) de um débito recente (≤ 45 dias) fica `classification = "refund"` e **não** cria `Income` — nunca se assume salário.
- `classification = "ignored"` ou `excludedFromAnalytics = true`: não materializa.

## Transferências entre contas próprias (`transferMatcher.ts`)

- Compara débitos e créditos `booked` de contas ligadas do mesmo utilizador, com o mesmo valor e moeda e datas até 3 dias de diferença.
- A correspondência é reforçada pelos hashes: `counterpartyAccountHash` de um lado = `providerIbanHash` ou `providerAccountHash` do outro.
  - Para tal foi adicionada a coluna `providerIbanHash` (HMAC do IBAN normalizado) a `BankAccountLink` na migração `20260831191908_add_bank_account_iban_hash`; o IBAN completo nunca é guardado.
- **Correspondência inequívoca**: cria **uma** `Transfer`, liga os dois `BankTransaction` (`transferId`, `classification = internal_transfer`) e **remove** a `Expense`/`Income` que tenham sido criadas antes, na mesma transação PostgreSQL.
- **Mais do que um candidato**: não há correspondência automática; os movimentos ficam por rever e nada é apagado.
- Movimentos `internal_transfer` não são contabilizados como despesa nem rendimento, pelo que não entram nas análises.

## Testes

`backend/src/open-banking/materialize.test.ts` (10 casos): débito cria despesa, crédito cria rendimento, repetição não duplica e preserva a categoria, pendente não materializa, reembolso detetado, ignorados/excluídos, par débito/crédito cria uma transferência, ambiguidade bloqueia a correspondência, materialização removida após deteção da transferência, isolamento entre utilizadores e regras de valor/data.
