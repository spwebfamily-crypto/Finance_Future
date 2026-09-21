# Plano: Remover `Outros` e corrigir a contabilização mensal de gastos

**Gerado**: 2026-09-21  
**Complexidade estimada**: Alta  
**Entrega desta etapa**: plano mais implementação do contrato de backend. A limpeza de dados continua separada e exige pré-voo, backup e confirmação explícita.

## Visão geral

O backend já possui uma separação útil entre movimentos manuais, movimentos bancários materializados como `Expense`, transferências internas e snapshots de saldo do banco. O problema está em dois contratos que hoje se contradizem:

1. `backend/src/open-banking/materialize.ts` cria ou reutiliza `Outros` quando um débito confirmado não recebe categoria. Isso permite que um gasto entre na contabilização sem classificação explícita.
2. O cálculo mensal percorre `Expense`, mas cada endpoint (`/api/analytics`, o overview do dashboard e os níveis) implementa partes da agregação por conta própria e usa limites UTC, embora a conta do utilizador tenha `timeZone`. Isso pode colocar o mesmo movimento no dia/mês errado e torna fácil divergir entre o dashboard, o planeamento e a aba de movimentos.

O plano propõe uma fonte canónica: **um `Expense` confirmado representa um gasto contabilizado, seja criado manualmente ou materializado de uma transação bancária**. `BankTransaction` é a origem/revisão do movimento, não uma segunda fonte para somar. Pendentes não revistos, ignorados, reembolsos e transferências internas não entram no total. Um pendente explicitamente confirmado como despesa mantém o comportamento atual e pode ser contabilizado, desde que tenha categoria válida.

### Decisões confirmadas pelo utilizador

- “Apagar os gastos de `Outros`” significa apagar os registos `Expense` manuais dessa categoria.
- Para gastos originados no banco, apagar o `Expense` materializado, mas preservar o `BankTransaction`, limpá-lo para `unreviewed` e devolvê-lo à fila de revisão. Assim o utilizador pode classificá-lo novamente sem perder o movimento bancário nem permitir dupla contabilização.
- Orçamentos e modelos de despesas recorrentes ligados a `Outros` serão apagados durante a limpeza. Notas legadas relacionadas devem perder apenas a referência (`SetNull`), preservando o texto da nota.
- Todo movimento bancário `pending` também deve passar pelo fluxo de classificação. Enquanto estiver `unreviewed` não conta; depois de uma classificação explícita válida, segue a mesma regra de materialização/contabilização do movimento confirmado.
- Não apagar uma conta bancária, saldo de provedor, transferência, `providerEntryReference`, `dedupeKey` ou payload de auditoria como parte desta mudança.

## Evidência atual do diagnóstico

- `backend/src/routes/auth.ts:76-84` cria `Outros` como categoria base para novos utilizadores.
- `backend/src/open-banking/materialize.ts:45-82` procura/cria `Outros` como fallback; `:277-290` materializa um débito confirmado sem exigir categoria.
- `backend/src/routes/openBanking.ts:642-699` permite confirmar uma despesa com `classification: expense` sem `categoryId`, o que aciona o fallback.
- `backend/src/routes/categories.ts:22-35` aceita criar uma categoria chamada `Outros`; a validação também não bloqueia variantes com espaços ou capitalização diferente.
- `backend/src/routes/analytics.ts:251-398`, `:400-487` e `:489-555` agregam `Expense` em implementações separadas.
- `backend/src/services/dashboardOverviewService.ts:94-455` repete a agregação para o overview; `monthKey()` e vários limites usam UTC, enquanto `currentMonthContext()` usa o fuso do utilizador.
- `backend/src/routes/accounts.ts:140-150` calcula saldo manual com rendimentos, despesas e transferências; para contas bancárias, `balanceView()` usa somente o snapshot compatível do provedor. Esse contrato deve ser mantido e testado junto com a nova contabilização mensal.
- O baseline da implementação passou: `npm test -- --run` no backend → 35 ficheiros e 308 testes; `npm run typecheck` e `npm run build` na raiz → sucesso.
- Foram implementados os bloqueios de `Outros`, a fila de revisão para débitos/créditos `pending`, a materialização sem fallback, a agregação canónica de `Expense` e os limites mensais/diários no fuso do utilizador.
- O comando `backend/src/scripts/removeOutrosCategory.ts` está pronto em modo somente leitura por padrão; nenhum `--apply` nem alteração de dados foi executado nesta etapa.

## Pré-requisitos

- Usar as decisões de limpeza já fechadas abaixo como contrato da implementação.
- Obter backup verificável da base de dados antes de executar qualquer limpeza de dados. A execução do plano deve começar com `--dry-run`; nunca executar a limpeza diretamente num deploy.
- Validar uma instância PostgreSQL descartável para testes de integração; mocks unitários não provam constraints, transações ou contagens reais.
- Manter as invariantes existentes: `userId` em todas as queries, nenhuma moeda inventada, transferências próprias fora de receitas/despesas, `BankTransaction.expenseId` no máximo para uma despesa e nenhuma soma do saldo do provedor com movimentos importados.

## Sprint 1: Fixar o contrato de categoria e o pré-voo da migração

**Objetivo**: tornar impossível criar novos `Outros`, mapear todo o impacto existente e produzir uma operação de limpeza reversível/inspecionável.

**Demo/validação**:

- A API rejeita `Outros`, ` outros ` e variantes de capitalização com um erro estável.
- O fluxo de registo deixa de criar essa categoria.
- O comando de pré-voo lista contagens por utilizador sem alterar nada.
- O pré-voo identifica despesas manuais, despesas ligadas a banco, transações bancárias, orçamentos, recorrências e notas relacionadas.

### Tarefa 1.1: Criar a regra única de nome reservado

- **Localização**: novo `backend/src/services/categoryPolicy.ts`; `backend/src/routes/categories.ts`; `backend/src/routes/auth.ts`; `backend/src/routes/v1.ts`.
- **Descrição**: criar uma função pequena e testável que normalize espaços e capitalização de `name` e trate `Outros` como nome reservado. Reutilizar a política em criação, edição, bootstrap e qualquer rota legada que aceite `categoryId` ou crie categorias.
- **Dependências**: nenhuma.
- **Critérios de aceitação**:
  - Nenhuma rota de criação/edição aceita variantes de `Outros`.
  - A política não bloqueia nomes legítimos que apenas contenham a palavra como parte de uma frase, se a regra de produto for igualdade após normalização.
  - O erro é específico, por exemplo `CATEGORY_RESERVED`, sem expor detalhes internos.
- **Validação**: testes unitários da política e testes HTTP de `POST/PATCH /api/categories`; teste de regressão para isolamento por `userId`.

### Tarefa 1.2: Remover `Outros` do catálogo inicial

- **Localização**: `backend/src/routes/auth.ts`; testes de autenticação/registo e bootstrap.
- **Descrição**: retirar `Outros` de `defaultCategories`. Não alterar `AccountType.other`, `FinancialGoal.other` ou outros enums não relacionados: são conceitos diferentes.
- **Dependências**: Tarefa 1.1.
- **Critérios de aceitação**:
  - Utilizadores novos recebem apenas categorias suportadas.
  - Utilizadores existentes não recebem uma nova categoria `Outros` em refresh/bootstrap.
  - O catálogo não depende de uma categoria fallback para materialização bancária.
- **Validação**: testes de registo, bootstrap e busca global por `Outros` no código de produção.

### Tarefa 1.3: Implementar o pré-voo somente leitura

- **Localização**: novo `backend/src/scripts/removeOutrosCategory.ts`; novo teste do script/serviço se o repositório já tiver padrão de scripts testáveis.
- **Descrição**: localizar por utilizador categorias cujo nome normalizado seja `Outros` e gerar um relatório com:
  - categorias e IDs;
  - `Expense` manuais;
  - `Expense` ligados a `BankTransaction`;
  - transações bancárias que precisam voltar para revisão;
  - orçamentos, recorrências e notas relacionadas;
  - comprovativos armazenados na despesa;
  - totais monetários por moeda e mês, sem somar moedas diferentes.
- **Dependências**: Tarefa 1.1.
- **Critérios de aceitação**:
  - `--dry-run` é o modo padrão e não executa `delete`, `update` ou `create`.
  - O relatório não inclui segredos, payloads bancários cifrados nem credenciais.
  - O comando falha explicitamente se encontrar uma situação não suportada, em vez de fazer limpeza parcial.
- **Validação**: fixture PostgreSQL com as seis relações e snapshot do relatório antes/depois; teste que confirma zero writes em `--dry-run`.

## Sprint 2: Remover a categoria sem perder a origem bancária

**Objetivo**: apagar a categoria e os gastos históricos em `Outros` conforme a política, fazendo com que os gastos bancários possam ser classificados novamente e que nenhuma foreign key fique órfã.

**Demo/validação**:

- Depois do `--apply`, não existe categoria `Outros` para nenhum utilizador afetado.
- Não existe `Expense` nem `Budget`/`RecurringExpense` ligado à categoria removida.
- Um `BankTransaction` que tinha uma despesa materializada em `Outros` permanece disponível, sem `expenseId`, sem classificação contabilizável e sem aparecer no total mensal.
- Uma falha no meio da operação faz rollback da transação por utilizador.

### Tarefa 2.1: Definir o serviço transacional de limpeza/reclassificação

- **Localização**: novo `backend/src/services/removeOutrosCategoryService.ts`.
- **Descrição**: separar o plano de limpeza da CLI. Para cada utilizador, dentro de uma transação:
  1. reler a categoria alvo dentro da transação;
  2. para cada `Expense` bancário, limpar primeiro a projeção (`BankTransaction.expenseId = null`, `classification = unreviewed`, `reviewedAt = null`, `excludedFromAnalytics = false`), depois apagar o `Expense`;
  3. apagar `Expense` manuais em `Outros`, incluindo dados do comprovativo no PostgreSQL;
  4. apagar orçamentos e despesas recorrentes ligados à categoria;
  5. limpar apenas `relatedCategoryId` de notas legadas relacionadas;
  6. apagar a categoria no final;
  7. retornar contadores auditáveis.
- **Dependências**: Sprint 1; decisões de limpeza fechadas.
- **Critérios de aceitação**:
  - O serviço é idempotente: uma segunda execução encontra zero alvos já removidos.
  - O `userId` vem sempre do escopo autenticado/argumento controlado, nunca de input livre por linha.
  - Uma falha não deixa o `BankTransaction` sem a referência correta nem elimina a categoria antes de resolver as foreign keys.
  - A operação não toca em contas, transferências ou identificadores de deduplicação bancária.
- **Validação**: testes de sucesso, rollback, múltiplos utilizadores, categoria com nome variante, despesa manual com comprovativo, despesa bancária e transação já ignorada.

### Tarefa 2.2: Adicionar comando explícito de aplicação

- **Localização**: `backend/src/scripts/removeOutrosCategory.ts`; `backend/package.json`.
- **Descrição**: expor um script com `--dry-run`, `--apply` e, se necessário, `--user-id` para operação controlada. `--apply` deve exigir confirmação não ambígua, imprimir o relatório antes da escrita e devolver código de saída não zero se o pré-voo encontrar relações não cobertas pelo contrato.
- **Dependências**: Tarefa 2.1.
- **Critérios de aceitação**:
  - Não há limpeza automática no `postinstall`, no boot do servidor ou em deploy.
  - A operação registra apenas contagens e IDs técnicos mínimos; não imprime descrições bancárias completas nem dados sensíveis.
  - O rollback documentado é restauração do backup para despesas manuais, orçamentos e recorrências; projeções bancárias podem ser recriadas após nova classificação.
- **Validação**: executar primeiro em PostgreSQL descartável, comparar contagens e repetir o comando para provar idempotência.

### Tarefa 2.3: Expor uma fila clara de reclassificação bancária

- **Localização**: `backend/src/routes/openBanking.ts`; `backend/src/validation.ts`; testes de `openBanking`.
- **Descrição**: garantir que transações devolvidas a `unreviewed` e todos os movimentos `pending` apareçam no fluxo de revisão e que uma categoria válida seja obrigatória para transformar um débito em despesa.
- **Dependências**: Tarefa 2.1.
- **Critérios de aceitação**:
  - `classification: expense` sem `categoryId` e sem despesa existente responde `422 CATEGORY_REQUIRED_FOR_EXPENSE`.
  - `categoryId` reservado ou inexistente responde erro sem alterar a transação.
  - Um `pending` não revisto continua fora dos totais; depois de classificado explicitamente com categoria válida, segue o mesmo fluxo de materialização de um `booked`.
  - Reclassificar um movimento já materializado atualiza a despesa na mesma transação.
  - Marcar como ignorado remove a projeção e o movimento não volta ao total após nova sincronização.
- **Validação**: testes HTTP de confirmação, reclassificação, remoção, retry e concorrência básica da revisão.

## Sprint 3: Eliminar o fallback e consolidar a contabilização

**Objetivo**: fazer com que todos os gastos — manuais ou bancários — passem pelo mesmo contrato e que nenhum movimento sem classificação explícita entre no total.

**Demo/validação**:

- Um débito bancário sem categoria fica em revisão e não cria `Expense`.
- Um débito bancário confirmado com categoria cria exatamente um `Expense`.
- A segunda sincronização não duplica nem altera a categoria escolhida.
- O total mensal é a soma de despesas manuais e despesas bancárias materializadas, uma única vez.

### Tarefa 3.1: Retirar `getOrCreateFallbackCategoryId`

- **Localização**: `backend/src/open-banking/materialize.ts`; `backend/src/open-banking/materialize.test.ts`.
- **Descrição**: remover `getOrCreateFallbackCategoryId`, `defaultCategoryId` e o contador `categoryCreated`. Substituir por um resultado explícito como `awaitingReview`/`missingCategory`; não criar categoria e não materializar a despesa quando a categoria não for válida.
- **Dependências**: Tarefa 2.3.
- **Critérios de aceitação**:
  - Não existe criação de categoria no materializador.
  - Categoria selecionada é validada contra o mesmo utilizador antes da criação/atualização.
  - Uma categoria apagada entre a revisão e a materialização não causa uma foreign key quebrada; o movimento volta a `unreviewed` e fica observável.
  - `pending` não revisto, `ignored`, `excludedFromAnalytics`, `internal_transfer` e `refund` não criam despesa.
  - `pending` explicitamente classificado como despesa, com categoria válida, cria uma única despesa e passa a contar.
- **Validação**: ampliar `materialize.test.ts` para fallback inexistente, categoria apagada, pendente confirmado, transferência, exclusão e idempotência.

### Tarefa 3.2: Definir a regra canónica de movimento contabilizável

- **Localização**: novo `backend/src/services/financialAggregationService.ts`; eventualmente tipos partilhados em `backend/src/types.ts`.
- **Descrição**: criar uma camada que aceite `userId`, intervalo temporal e moeda e agregue somente `Expense` válidos. A consulta deve ser a mesma para manual e banco; a origem (`manual`/`bank`) deve ser apenas metadado de apresentação. Não consultar `BankTransaction` para somar novamente.
- **Dependências**: Tarefa 3.1.
- **Critérios de aceitação**:
  - Uma despesa ligada a um banco conta uma vez através de `Expense`.
  - Uma transação bancária pendente/unreviewed sem `Expense` não conta.
  - Transferências próprias não aparecem como despesa nem rendimento.
  - `currency` explícita do movimento/conta é respeitada; moedas diferentes aparecem em totais separados e não são convertidas sem uma taxa definida.
  - O serviço mantém `Decimal` até à resposta, arredondando apenas na apresentação.
- **Validação**: teste de tabela com manual, bancário, pendente, transferências, refund, excluído, EUR e USD; comparar total, por categoria e por moeda.

### Tarefa 3.3: Corrigir limites de mês/dia no fuso do utilizador

- **Localização**: `backend/src/services/analyticsService.ts`; novo helper se necessário; `backend/src/routes/analytics.ts`; `backend/src/services/dashboardOverviewService.ts`.
- **Descrição**: centralizar a conversão de `YYYY-MM` e data local do utilizador em intervalos UTC `[start, end)`. Usar essa mesma função para summary, levels, trend, dashboard e “today”. Não usar `toISOString().slice(0, 10)` para decidir o dia local de uma transação bancária.
- **Dependências**: Tarefa 3.2.
- **Critérios de aceitação**:
  - Movimentos próximos da meia-noite são atribuídos ao dia/mês no fuso da conta do utilizador.
  - O cálculo funciona em mudança de horário de verão e em fevereiro bissexto.
  - Meses futuros continuam rejeitados.
  - As respostas mantêm os campos existentes (`total`, `byDay`, `totalsByCurrency`, `byCategory`, `history`, `trend`) salvo mudança documentada.
- **Validação**: testes com `Europe/Lisbon`, `UTC`, `America/Sao_Paulo`, virada de mês, DST e ano bissexto.

### Tarefa 3.4: Fazer dashboard e analytics consumirem a mesma agregação

- **Localização**: `backend/src/routes/analytics.ts`; `backend/src/services/dashboardOverviewService.ts`; testes correspondentes.
- **Descrição**: remover a duplicação de loops de soma e adaptar os dois contratos à camada canónica. Manter a semântica de níveis/orçamentos, mas alimentá-la com a mesma série mensal. Preservar a semântica parcial do overview (`partialErrors`) sem transformar falha de uma secção em total financeiro falso.
- **Dependências**: Tarefas 3.2 e 3.3.
- **Critérios de aceitação**:
  - `/api/analytics/summary` e `/api/dashboard/overview` devolvem o mesmo total para o mesmo utilizador/mês/moeda.
  - `/levels` e os cards de orçamento usam exatamente o total por categoria da mesma fonte.
  - `today` e o overview usam o mesmo limite de dia local.
  - Uma falha de uma query é distinguida de total zero.
- **Validação**: testes de contrato entre endpoints com os mesmos fixtures, além dos testes atuais de analytics/dashboard.

## Sprint 4: Preservar o comportamento de contas manuais e ligadas ao banco

**Objetivo**: garantir que a correção da contabilização mensal não reintroduz dupla contagem ou altera o contrato de saldo.

**Demo/validação**:

- Conta manual: saldo derivado por saldo inicial + rendimentos − despesas − transferências de saída + transferências de entrada.
- Conta bancária: saldo apresentado pelo snapshot compatível do provedor; movimentos importados não são somados novamente ao snapshot.
- Gasto mensal: soma apenas `Expense` confirmados, independentemente da origem.

### Tarefa 4.1: Alinhar o cálculo de saldo e o cálculo de gasto

- **Localização**: `backend/src/routes/accounts.ts`; `backend/src/services/dashboardOverviewService.ts`; testes de `accounts` e dashboard.
- **Descrição**: reutilizar funções de soma/invariantes onde for seguro, mantendo saldo bancário como provider-only e saldo manual como derived. Verificar explicitamente que `excludedFromAnalytics` remove a projeção `Expense` e que uma transferência interna nunca afeta o gasto mensal.
- **Dependências**: Sprint 3.
- **Critérios de aceitação**:
  - Não há diferença entre a vista de conta e a vista do dashboard sobre a origem do saldo.
  - `providerBalanceCurrency !== account.currency` deixa saldo bancário indisponível, sem fabricar conversão.
  - `balanceDelta` só é calculado quando houver uma comparação legítima; não usar um delta falso como gasto.
- **Validação**: matriz manual/banco, snapshot disponível/indisponível, moeda compatível/incompatível e transferências.

### Tarefa 4.2: Garantir idempotência sync → materialização → analytics

- **Localização**: `backend/src/open-banking/syncService.ts`; `backend/src/open-banking/dedupe.ts`; `backend/src/open-banking/materialize.ts`; testes de sync e dedupe.
- **Descrição**: provar que uma nova sincronização pode atualizar o mesmo `BankTransaction` sem criar outra despesa, preservando a categoria escolhida e mantendo o `dedupeKey` estável.
- **Dependências**: Tarefa 3.1.
- **Critérios de aceitação**:
  - O mesmo `entry_reference`/`dedupeKey` resulta em uma transação e, no máximo, uma despesa.
  - Reclassificação não modifica valor/data/moeda de forma incompatível com o movimento bancário.
  - Uma sincronização posterior não repõe `Outros` nem uma despesa removida/ignorada.
- **Validação**: fake provider E2E, repetição de sync, retry de job e cenário de transação que muda de pending para booked.

## Sprint 5: Completar contratos, observabilidade e rollout controlado

**Objetivo**: tornar a mudança verificável em produção sem aplicar limpeza destrutiva de forma silenciosa.

**Demo/validação**:

- O relatório de pré-voo é guardado como evidência operacional.
- Os endpoints têm erros localizáveis e métricas de quantos movimentos aguardam categoria.
- O rollout pode ser interrompido antes da limpeza e repetido com segurança.

### Tarefa 5.1: Atualizar tipos, documentação e contrato frontend

- **Localização**: `backend/src/types.ts`; contratos/clientes usados pela aplicação; documentação de Open Banking e analytics; eventualmente testes em `frontend/src/api` e páginas que exibem revisão.
- **Descrição**: documentar `CATEGORY_REQUIRED_FOR_EXPENSE`, `CATEGORY_RESERVED`, contadores de `awaitingReview`, origem manual/banco e semântica de pendente confirmado. Não esconder movimentos sem categoria como “Outro”; apresentá-los como “por classificar” no fluxo de revisão.
- **Dependências**: Sprints 2–4.
- **Critérios de aceitação**:
  - O frontend consegue distinguir ausência de categoria de uma categoria real.
  - Nenhum texto “Outros” é usado para representar um fallback.
  - O contrato não expõe dados bancários sensíveis.
- **Validação**: testes de cliente/API e teste visual funcional da fila de revisão, se a etapa frontend for autorizada.

### Tarefa 5.2: Criar observabilidade e auditoria da limpeza

- **Localização**: `backend/src/scripts/removeOutrosCategory.ts`; `backend/src/logger.ts`; eventualmente tabela/registro de audit já existente, sem introduzir segredo.
- **Descrição**: registrar início, modo (`dry-run`/`apply`), contagens, utilizadores afetados, falhas e duração. O log deve permitir provar o que foi removido e o que foi devolvido para revisão, sem guardar conteúdo bancário bruto.
- **Dependências**: Tarefa 2.2.
- **Critérios de aceitação**:
  - `dry-run` e `apply` são distinguíveis.
  - Falha por utilizador é explícita e não é mascarada por sucesso parcial.
  - Existe relatório pós-operação com zero referências à categoria removida.
- **Validação**: execução em base descartável com falha injetada e reexecução.

### Tarefa 5.3: Rollout em camadas

- **Localização**: documentação operacional; pipeline/deploy apenas após aprovação.
- **Descrição**: executar na ordem: build/testes locais → PostgreSQL descartável → staging com backup → `dry-run` no ambiente alvo → revisão humana dos contadores → `apply` controlado → verificação pós-operação → deploy da regra que impede novo `Outros`.
- **Dependências**: todas as tarefas anteriores.
- **Critérios de aceitação**:
  - Não há deploy nem alteração de produção como parte do plano atual.
  - O backup é verificável antes do `apply`.
  - Após o rollout, nenhuma categoria reservada é criada e os totais manual/banco batem nos endpoints.
- **Validação**: checklist assinado com contagens pré/pós, testes autenticados e consulta direta PostgreSQL de invariantes.

## Estratégia de testes

- **Unitários**: política de categoria, limites de mês no fuso, agregação decimal, filtros de moeda e níveis de gasto.
- **Rotas**: criação/edição de categorias, revisão bancária sem categoria, revisão com categoria inválida, reclassificação, exclusão e erros estáveis.
- **Materialização**: sem fallback, confirmação explícita, pending, booked, transferência própria, refund, ignorado, excluído e execução repetida.
- **Integração PostgreSQL**: foreign keys, transação de limpeza, rollback, múltiplos utilizadores, comprovativos e categorias com variantes de nome.
- **E2E fake provider**: autorização, sync, revisão, materialização, mudança de mês e igualdade entre dashboard/analytics.
- **Verificação de invariantes pós-migração**:
  - `COUNT(Category WHERE normalized(name) = 'outros') = 0`;
  - nenhum `Expense` aponta para categoria reservada;
  - nenhum `RecurringExpense`/`Budget` fica órfão;
  - todo `BankTransaction` com `expenseId` aponta para uma despesa existente e válida;
  - movimentos `unreviewed`, `ignored`, `internal_transfer` e `refund` não têm projeção contabilizável;
  - nenhuma soma mistura moedas;
  - total mensal dos endpoints concorda com uma query independente de auditoria.

## Riscos e pontos de atenção

- **Apagar despesas manuais é destrutivo**: exigir backup e relatório antes do `apply`; não prometer rollback lógico sem restauração do backup.
- **Foreign keys adicionais**: recorrências e orçamentos precisam ser removidos dentro da mesma transação antes da categoria; qualquer relação não prevista deve parar o pré-voo antes de alterar dados.
- **Duplicação manual/banco**: nunca somar `BankTransaction` além de `Expense`; preservar a relação única e testar retry.
- **Fuso horário**: datas de formulário são date-only, mas datas bancárias são instantes; a regra deve distinguir os dois e não corrigir dados históricos sem uma migração explicitamente aprovada.
- **Pendente confirmado**: todo `pending` precisa de classificação explícita; um débito só conta depois de receber categoria válida. Não contar `pending` apenas por ter sido importado.
- **Moeda**: manter totais separados; não converter por aproximação nem usar a moeda do utilizador para sobrescrever a moeda de um banco.
- **Categorias com capitalização diferente**: a limpeza e a proibição devem usar nome normalizado, incluindo variantes de espaços e capitalização.
- **Rotas legadas**: corrigir apenas a API principal e esquecer `/api/v1` deixaria uma porta para reintroduzir categorias inválidas.
- **Estado de trabalho atual**: preservar quaisquer alterações já existentes no working tree e alterar apenas os ficheiros previstos na implementação.

## Decisões fechadas antes da implementação

1. Despesas bancárias em `Outros` são apagadas apenas como projeção; a transação bancária original permanece e volta para reclassificação.
2. Orçamentos e despesas recorrentes em `Outros` são apagados; notas legadas apenas perdem a referência à categoria.
3. Todo movimento `pending` precisa de classificação explícita. Um pending não revisto não conta; um débito pending classificado com categoria válida conta como despesa.

## Plano de rollback

- **Antes da limpeza**: criar e testar backup PostgreSQL; guardar o relatório `dry-run` com contagens e IDs técnicos.
- **Durante a limpeza**: usar transação por utilizador e abortar em qualquer constraint ou inconsistência.
- **Após falha**: não repetir `apply` às cegas; preservar logs, investigar a contagem e restaurar o backup se alguma despesa manual, recorrência ou orçamento tiver sido removido.
- **Para projeções bancárias**: restaurar `BankTransaction` e reexecutar a revisão/materialização após escolher categorias; não reimportar cegamente do provedor.
- **Para código**: reverter apenas os commits da implementação depois de confirmar que a base de dados continua compatível; não usar `prisma db push`, `migrate reset` nem editar migrations aplicadas.

## Critério de conclusão do plano

O código de backend e os testes automatizados estão implementados. A etapa de dados só deve ser considerada concluída após executar o pré-voo em PostgreSQL, guardar o relatório, obter backup verificável e aplicar a limpeza com `--confirm=REMOVE_OUTROS`; as invariantes pós-operação ainda precisam de evidência diretamente na base alvo.
