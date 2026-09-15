/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { pageMessages, type PageTranslationKey } from "./pageMessages";

export const supportedLocales = ["pt-PT", "en-GB", "es-ES"] as const;
export type AppLocale = (typeof supportedLocales)[number];

const STORAGE_KEY = "expensesnap:locale";

type Messages = Record<string, string>;

const en: Messages = {
  Hoje: "Today",
  Movimentos: "Activity",
  Contas: "Accounts",
  Plano: "Plan",
  Investir: "Invest",
  Bancos: "Banks",
  Privacidade: "Privacy",
  Categorias: "Categories",
  Mais: "More",
  Fechar: "Close",
  Novo: "New",
  "Nova despesa": "New expense",
  "Registar despesa": "Add expense",
  "Terminar sessão": "Sign out",
  "A terminar sessão": "Signing out",
  "Terminar sessão?": "Sign out?",
  "Vai sair desta conta neste dispositivo.": "You will sign out of this account on this device.",
  "Saltar para o conteúdo": "Skip to content",
  "Navegação principal": "Main navigation",
  "Mais páginas": "More pages",
  "Sem ligação. A mostrar os últimos dados guardados.":
    "You are offline. Showing the latest saved data.",
  "A abrir esta página": "Opening this page",
  Entrar: "Sign in",
  "Criar conta": "Create account",
  "Recuperar palavra-passe": "Recover password",
  "Nova palavra-passe": "New password",
  "Verificar email": "Verify email",
  Começar: "Get started",
  "Ligar banco": "Connect bank",
  "Bancos ligados": "Connected banks",
  "Página não encontrada": "Page not found",
  Conta: "Account",
  "Contas e cartões": "Accounts and cards",
  "Dinheiro disponível": "Available money",
  "Saldos, cartões e transferências. Os gastos das contas ligadas ao banco entram automaticamente nas despesas.":
    "Balances, cards and transfers. Booked spending from connected accounts is added to expenses automatically.",
  "Os gastos contabilizados das contas ligadas já estão em Despesas.":
    "Booked spending from connected accounts is already in Expenses.",
  "Ligue o banco uma vez: os gastos passam a despesas sem as escrever à mão.":
    "Connect your bank once and booked spending becomes an expense automatically.",
  "Saldo combinado": "Combined balance",
  "{count} conta registada": "{count} account",
  "{count} contas registadas": "{count} accounts",
  Adicionar: "Add",
  "Nova conta": "New account",
  "Adicionar conta": "Add account",
  "Conta bancária, dinheiro ou cartão.": "Bank account, cash or card.",
  Nome: "Name",
  Tipo: "Type",
  "Saldo inicial": "Opening balance",
  "Limite do cartão": "Card limit",
  "À ordem": "Current account",
  Poupança: "Savings",
  Dinheiro: "Cash",
  "Cartão de crédito": "Credit card",
  Outra: "Other",
  "A guardar": "Saving",
  "Mover dinheiro": "Move money",
  Transferência: "Transfer",
  "Fazer transferência": "Make a transfer",
  "Mover dinheiro entre duas contas.": "Move money between two accounts.",
  "Crie pelo menos duas contas antes de fazer uma transferência.":
    "Create at least two accounts before making a transfer.",
  De: "From",
  Para: "To",
  Escolher: "Choose",
  Valor: "Amount",
  Data: "Date",
  Nota: "Note",
  opcional: "optional",
  "Ex.: reforço da poupança": "E.g. savings top-up",
  Transferir: "Transfer",
  Saldos: "Balances",
  "As suas contas": "Your accounts",
  "Ligada ao banco": "Bank connected",
  Manual: "Manual",
  Disponível: "Available",
  "Ainda sem sincronização": "Not synced yet",
  Sincronizar: "Sync",
  "Gerir ligação": "Manage connection",
  "Corrigir saldo": "Correct balance",
  Remover: "Remove",
  "Transferências recentes": "Recent transfers",
  "Ainda não existem transferências.": "There are no transfers yet.",
  "Crie uma conta ou ligue o banco para começar.":
    "Create an account or connect your bank to get started.",
  "A preparar as suas contas": "Preparing your accounts",
  "Ligações ativas": "Active connections",
  "Sincronize para trazer gastos como despesas. Renove o acesso ou desligue quando quiser.":
    "Sync to import booked spending as expenses. Renew access or disconnect at any time.",
  "Ainda não tem bancos ligados. Ligue um banco para importar saldos — cada gasto contabilizado passa a despesa.":
    "You have no connected banks yet. Connect one to import balances and booked spending.",
  "A carregar as ligações bancárias": "Loading bank connections",
  "Escolha o banco": "Choose your bank",
  "Só leitura de saldos e movimentos.": "Read-only access to balances and transactions.",
  "Confirme no banco": "Confirm with your bank",
  "A palavra-passe nunca passa por aqui.": "Your password never passes through ExpenseSnap.",
  "Gastos viram despesas": "Spending becomes expenses",
  "Ficam no arquivo no instante da sincronização.": "They appear as soon as sync finishes.",
  "Como funciona": "How it works",
  "Onde está o dinheiro": "Where your money is",
  "Tipo de conta": "Account type",
  Pessoal: "Personal",
  Empresarial: "Business",
  "Continuar no banco": "Continue to bank",
  "A abrir o banco": "Opening bank",
  "Escolha primeiro o banco.": "Choose a bank first.",
  "Só leitura. Pode desligar quando quiser.": "Read only. Disconnect at any time.",
  "Voltar às contas": "Back to accounts",
  "A carregar os bancos disponíveis": "Loading available banks",
  "Não há bancos disponíveis para este tipo de conta.":
    "No banks are available for this account type.",
  "Sem ligação. Para ligar um banco precisa de estar online.":
    "You are offline. Go online to connect a bank.",
  "Tentar novamente": "Try again",
  "Pesquisar banco": "Search banks",
  "Bancos disponíveis": "Available banks",
  "Nenhum banco encontrado.": "No banks found.",
  "O que vai autorizar": "What you will authorise",
  "Transformar cada gasto contabilizado numa despesa da aplicação.":
    "Turn each booked outgoing transaction into an app expense.",
  "Renovar o consentimento quando o banco o pedir (em regra a cada 90 dias).":
    "Renew consent when your bank requests it (usually every 90 days).",
  "Renovar acesso": "Renew access",
  Desligar: "Disconnect",
  "A sincronizar": "Syncing",
  "Aguarda confirmação no banco": "Waiting for bank confirmation",
  "Ligação ativa": "Connection active",
  "É necessário renovar o consentimento": "Consent renewal required",
  "Consentimento expirado": "Consent expired",
  "Consentimento revogado": "Consent revoked",
  "Banco desligado": "Bank disconnected",
  "Erro na última sincronização": "Last sync failed",
  "Ainda sem sincronização.": "Not synced yet.",
  "Algo não correu como esperado": "Something went wrong",
  Banco: "Bank",
  "Ex.: Banco": "E.g. bank name",
  "Ligar um banco": "Connect a bank",
  "Autorize a leitura no próprio banco. Cada gasto contabilizado passa a despesa — no arquivo, no painel e nos limites.":
    "Authorise read-only access with your bank. Each booked outgoing transaction becomes an expense across your activity, dashboard and limits.",
  "Ler saldo e movimentos.": "Read balances and transactions.",
  "Ler saldo e movimentos de {bank}.": "Read balances and transactions from {bank}.",
  "O ExpenseSnap nunca recebe nem guarda a sua palavra-passe do banco: a autorização é feita no ambiente seguro do próprio banco. Pode desligar o banco e apagar os dados importados quando quiser.":
    "ExpenseSnap never receives or stores your bank password. Authorisation happens in your bank's secure environment, and you can disconnect and delete imported data at any time.",
  "{count} conta ligada": "{count} connected account",
  "{count} contas ligadas": "{count} connected accounts",
  "Consentimento válido até {date}": "Consent valid until {date}",
  "Desligar {bank}": "Disconnect {bank}",
  "Sincronizar {bank}": "Sync {bank}",
  "Código de diagnóstico: {code}": "Diagnostic code: {code}",
  "Última atualização: {date}": "Last updated: {date}",
  "Não foi possível concluir a leitura do banco. Tente sincronizar novamente; se persistir, renove o acesso.":
    "The bank data could not be read. Try syncing again; if it persists, renew access.",
  "Banco ligado. A primeira sincronização começou — os gastos contabilizados passam a despesas.":
    "Bank connected. The first sync has started and booked spending will become expenses.",
  "Sincronização concluída. Os gastos contabilizados já estão em Despesas.":
    "Sync completed. Booked spending is now in Expenses.",
  "Sincronização pedida. Os gastos entram em Despesas quando terminar.":
    "Sync requested. Booked spending will appear in Expenses when it finishes.",
  "Sincronização terminada com o estado {status}.": "Sync finished with status {status}.",
  "Banco desligado. {count} movimentos eliminados.":
    "Bank disconnected. {count} transactions deleted.",
  "Banco desligado. Os dados importados foram conservados.":
    "Bank disconnected. Imported data was kept.",
  "Atualizado {date}": "Updated {date}",
  "Na app: {appAmount} · diferença {difference}": "In app: {appAmount} · difference {difference}",
  "Saldo contabilístico": "Booked balance",
  "Saldo disponível: {amount}": "Available balance: {amount}",
  "Valor fornecido pelo banco": "Value supplied by the bank",
  "Valor calculado na aplicação": "Value calculated in the app",
  "Ainda não há movimentos para os filtros escolhidos.":
    "There are no transactions for the selected filters.",
  "Sem data": "No date",
  "Banco ligado": "Linked bank",
  Pendente: "Pending",
  Categoria: "Category",
  "Não contar como despesa": "Do not count as an expense",
  "Conta ligada ao banco": "Bank-connected account",
  "Conta manual": "Manual account",
  "Os movimentos ficam por rever até confirmar se são gastos. Pendentes também podem entrar nas despesas.":
    "Transactions stay to review until you confirm they are expenses. Pending items can also be included.",
  "Confirme os débitos que são gastos. Pendentes e contabilizados ficam visíveis até decidir.":
    "Confirm which debits are expenses. Pending and booked items stay visible until you decide.",
  "Confirmar gasto": "Confirm expense",
  "Gasto confirmado.": "Expense confirmed.",
  "Não é um gasto": "Not an expense",
  Apagar: "Delete",
  "Apagar movimento": "Delete movement",
  "Apagar movimento importado?": "Delete imported movement?",
  "Este movimento será removido das despesas e não voltará a aparecer após nova sincronização.":
    "This movement will be removed from expenses and will not appear again after a new sync.",
  "Estado do movimento": "Movement status",
  "Movimento importado do banco": "Movement imported from your bank",
  "Classifique os gastos de hoje": "Review today's bank movements",
  "Confirme uma categoria para manter os seus resumos organizados.":
    "Confirm a category to keep your summaries organised.",
  "Sincronizado pelo banco": "Synced from your bank",
  "Por classificar": "To review",
  "Mais tarde": "Later",
  "Guardar e continuar": "Save and continue",
  Concluir: "Done",
  "Entre para consultar as suas finanças.": "Sign in to see your finances.",
  "Saldo e movimentos desta conta.": "Balance and activity for this account.",
  Voltar: "Back",
  "Histórico da conta": "Account activity",
  "Débitos contabilizados aparecem em Despesas. Use a categoria para os organizar, ou exclua o que não quiser contar.":
    "Booked debits appear in Expenses. Confirm the ones you want to count and exclude anything else.",
  Estado: "Status",
  Classificação: "Classification",
  "Todos os estados": "All statuses",
  Pendentes: "Pending",
  Contabilizados: "Booked",
  "Todas as classificações": "All classifications",
  "Por rever": "To review",
  Despesa: "Expense",
  Rendimento: "Income",
  "Transferência própria": "Internal transfer",
  Reembolso: "Refund",
  Ignorado: "Ignored",
  "A carregar a conta": "Loading account",
  "Conta não encontrada.": "Account not found.",
  "A carregar os movimentos": "Loading transactions",
  "Os movimentos de contas manuais aparecem no arquivo geral.":
    "Manual account activity appears in the main activity view.",
  "Ver movimentos": "View activity",
  Anterior: "Previous",
  Seguinte: "Next",
  "Página {page} de {count}": "Page {page} of {count}",
  "A conta foi carregada, mas as categorias estão temporariamente indisponíveis.":
    "The account loaded, but categories are temporarily unavailable.",
  "Categoria atualizada.": "Category updated.",
  "Este movimento deixou de contar como despesa.":
    "This transaction is no longer counted as an expense.",
  "Este gasto voltou às despesas.": "This transaction counts as an expense again.",
  "Corrigir valor da conta": "Correct account balance",
  "Defina o saldo atual de {account}. Os movimentos existentes não serão alterados.":
    "Set the current balance for {account}. Existing transactions will not change.",
  "Novo saldo": "New balance",
  "Saldo apresentado: {amount}": "Displayed balance: {amount}",
  Cancelar: "Cancel",
  "A corrigir…": "Correcting…",
  "Guardar correção": "Save correction",
  "A eliminar…": "Deleting…",
  "Remover conta": "Remove account",
  "Remover conta {account}": "Remove account {account}",
  "Corrigir saldo da conta {account}": "Correct balance for account {account}",
  "Remover esta conta?": "Remove this account?",
  "A conta {account} será removida. Os movimentos existentes deixam de estar associados a esta conta e as transferências serão removidas, sem alterar o saldo das restantes contas.":
    "The account {account} will be removed. Existing activity will be unlinked and its transfers removed without changing other account balances.",
  Histórico: "History",
  "Dinheiro sem distrações": "Money without distractions",
  "Tudo o que saiu.": "Everything you spent.",
  "Nada escondido.": "Nothing hidden.",
  "Um arquivo simples para perceber hábitos, comparar meses e decidir com mais calma.":
    "A simple record to understand habits, compare months and make calmer decisions.",
  "Os comprovativos são lidos localmente no seu dispositivo.":
    "Receipts are read locally on your device.",
  "Comece pelo essencial": "Start with the essentials",
  "Uma rotina leve para": "A simple routine to",
  "cuidar do futuro.": "look after your future.",
  "Crie a conta e conte-nos apenas o necessário para organizar a sua vida financeira.":
    "Create your account and share only what is needed to organise your finances.",
  "Enviamos um email para confirmar que a conta é sua.":
    "We send an email to confirm the account belongs to you.",
  "Confirmação de conta": "Account confirmation",
  "Um email para": "One email to",
  "proteger a sua conta.": "protect your account.",
  "A confirmação garante que só quem tem acesso a este email consegue recuperar a conta.":
    "Confirmation ensures only someone with access to this email can recover the account.",
  "Nunca partilhamos o seu email com terceiros.": "We never share your email with third parties.",
  "Recuperar acesso": "Recover access",
  "Um link para": "One link to",
  "voltar à conta.": "return to your account.",
  "Se existir uma conta com este email, enviamos um link para escolher uma nova palavra-passe.":
    "If an account exists for this email, we will send a link to choose a new password.",
  "O link expira ao fim de uma hora e só pode ser usado uma vez.":
    "The link expires after one hour and can only be used once.",
  "Escolha uma palavra-passe": "Choose a password",
  "só sua.": "that is yours alone.",
  "Depois de gravar, inicie sessão com a nova palavra-passe.":
    "After saving, sign in with your new password.",
  "As sessões abertas noutros dispositivos serão encerradas.":
    "Open sessions on other devices will be closed.",
  "Bem-vindo de volta": "Welcome back",
  "Entrar na conta": "Sign in to your account",
  "Continue de onde ficou.": "Pick up where you left off.",
  Email: "Email",
  "Palavra-passe": "Password",
  "Esqueceu a palavra-passe?": "Forgot your password?",
  "A sua palavra-passe": "Your password",
  "Ocultar palavra-passe": "Hide password",
  "Mostrar palavra-passe": "Show password",
  "A entrar": "Signing in",
  "Ainda não tem conta?": "Don't have an account yet?",
  "Acesso protegido": "Protected access",
  "Sessão privada e segura": "Private and secure session",
  "Os seus dados financeiros nunca são partilhados.": "Your financial data is never shared.",
  Registo: "Record",
  Equilíbrio: "Balance",
  Clareza: "Clarity",
  "Uma leitura simples do que sai e do que fica.":
    "A simple view of what goes out and what remains.",
  "Introduza o seu email.": "Enter your email.",
  "Introduza um email válido.": "Enter a valid email.",
  "Introduza a sua palavra-passe.": "Enter your password.",
  "A sua conta": "Your account",
  "Demora menos de um minuto.": "It takes less than a minute.",
  "Como quer ser tratado?": "What should we call you?",
  "Entre 8 e 128 caracteres": "Between 8 and 128 characters",
  "Use entre 8 e 128 caracteres.": "Use between 8 and 128 characters.",
  "Confirmar palavra-passe": "Confirm password",
  "Repita a palavra-passe": "Repeat your password",
  "Ocultar confirmação da palavra-passe": "Hide password confirmation",
  "Mostrar confirmação da palavra-passe": "Show password confirmation",
  "A criar conta": "Creating account",
  "Já tem conta?": "Already have an account?",
  "Introduza pelo menos 2 caracteres.": "Enter at least 2 characters.",
  "Use pelo menos 8 caracteres.": "Use at least 8 characters.",
  "Use no máximo 128 caracteres.": "Use no more than 128 characters.",
  "Confirme a palavra-passe.": "Confirm your password.",
  "As palavras-passe não coincidem.": "Passwords do not match.",
  "Se existir uma conta com este email, enviámos um link para repor a palavra-passe.":
    "If an account exists for this email, we sent a password reset link.",
  "Indique o email da conta. Se existir, enviamos um link de reposição.":
    "Enter the account email. If it exists, we will send a reset link.",
  "Voltar a entrar": "Back to sign in",
  "Verifique a caixa de entrada e o spam. O link expira ao fim de uma hora.":
    "Check your inbox and spam folder. The link expires after one hour.",
  "A enviar": "Sending",
  "Enviar link": "Send link",
  "Voltar ao início de sessão": "Back to sign in",
  "A autorização foi cancelada no banco. Nenhuma ligação foi criada.":
    "Authorisation was cancelled at the bank. No connection was created.",
  "A autorização expirou. Inicie novamente a ligação ao banco.":
    "Authorisation expired. Start the bank connection again.",
  "O banco recebeu demasiados pedidos. Aguarde alguns minutos e tente novamente.":
    "The bank received too many requests. Wait a few minutes and try again.",
  "O serviço do banco está temporariamente indisponível. Tente novamente.":
    "The bank service is temporarily unavailable. Try again.",
  "Este banco já não está disponível para ligação neste momento.":
    "This bank is not currently available to connect.",
  "Não foi possível validar esta autorização. Inicie novamente a ligação.":
    "This authorisation could not be validated. Start the connection again.",
  "Esta autorização já foi utilizada. Inicie uma nova ligação ao banco.":
    "This authorisation has already been used. Start a new bank connection.",
  "Não foi possível concluir a ligação ao banco. Tente novamente.":
    "The bank connection could not be completed. Try again.",
  "As contas manuais estão disponíveis, mas não foi possível carregar o estado dos bancos: {message}":
    "Manual accounts are available, but bank status could not be loaded: {message}",
  "A sincronização bancária não foi concluída. Tente novamente.":
    "Bank sync did not complete. Try again.",
  "Não foi possível confirmar a sincronização bancária.":
    "Bank sync status could not be confirmed.",
  "Sincronização concluída. Saldos e movimentos foram atualizados.":
    "Sync completed. Balances and transactions were updated.",
  "A sincronizar saldos e movimentos…": "Syncing balances and transactions…",
  "Introduza o nome da conta.": "Enter an account name.",
  "Indique um saldo inicial válido.": "Enter a valid opening balance.",
  "Indique um limite válido.": "Enter a valid limit.",
  "Conta criada.": "Account created.",
  "Escolha a conta de origem.": "Choose the source account.",
  "Escolha a conta de destino.": "Choose the destination account.",
  "Escolha duas contas diferentes.": "Choose two different accounts.",
  "Indique a data.": "Enter a date.",
  "Indique um valor maior do que zero.": "Enter an amount greater than zero.",
  "Transferência registada.": "Transfer recorded.",
  "Conta removida.": "Account removed.",
  "Indique um saldo válido, com no máximo duas casas decimais.":
    "Enter a valid balance with no more than two decimal places.",
  "Saldo corrigido.": "Balance corrected.",
  "{account} será removida. As despesas e rendimentos existentes deixam de estar associados a esta conta. As transferências desta conta também serão removidas, sem alterar o saldo das restantes contas.":
    "{account} will be removed. Existing expenses and income will be unlinked, and this account's transfers removed without changing other account balances.",
};

const es: Messages = {
  Hoje: "Hoy",
  Movimentos: "Movimientos",
  Contas: "Cuentas",
  Plano: "Plan",
  Investir: "Invertir",
  Bancos: "Bancos",
  Privacidade: "Privacidad",
  Categorias: "Categorías",
  Mais: "Más",
  Fechar: "Cerrar",
  Novo: "Nuevo",
  "Nova despesa": "Nuevo gasto",
  "Registar despesa": "Registrar gasto",
  "Terminar sessão": "Cerrar sesión",
  "A terminar sessão": "Cerrando sesión",
  "Terminar sessão?": "¿Cerrar sesión?",
  "Vai sair desta conta neste dispositivo.": "Cerrarás esta cuenta en este dispositivo.",
  "Saltar para o conteúdo": "Saltar al contenido",
  "Navegação principal": "Navegación principal",
  "Mais páginas": "Más páginas",
  "Sem ligação. A mostrar os últimos dados guardados.":
    "Sin conexión. Mostrando los últimos datos guardados.",
  "A abrir esta página": "Abriendo esta página",
  Entrar: "Entrar",
  "Criar conta": "Crear cuenta",
  "Recuperar palavra-passe": "Recuperar contraseña",
  "Nova palavra-passe": "Nueva contraseña",
  "Verificar email": "Verificar correo",
  Começar: "Empezar",
  "Ligar banco": "Conectar banco",
  "Bancos ligados": "Bancos conectados",
  "Página não encontrada": "Página no encontrada",
  Conta: "Cuenta",
  "Contas e cartões": "Cuentas y tarjetas",
  "Dinheiro disponível": "Dinero disponible",
  "Saldos, cartões e transferências. Os gastos das contas ligadas ao banco entram automaticamente nas despesas.":
    "Saldos, tarjetas y transferencias. Los gastos contabilizados de cuentas conectadas se añaden automáticamente.",
  "Os gastos contabilizados das contas ligadas já estão em Despesas.":
    "Los gastos contabilizados de las cuentas conectadas ya están en Gastos.",
  "Ligue o banco uma vez: os gastos passam a despesas sem as escrever à mão.":
    "Conecta tu banco una vez y los gastos contabilizados se registran automáticamente.",
  "Saldo combinado": "Saldo combinado",
  "{count} conta registada": "{count} cuenta",
  "{count} contas registadas": "{count} cuentas",
  Adicionar: "Añadir",
  "Nova conta": "Nueva cuenta",
  "Adicionar conta": "Añadir cuenta",
  "Conta bancária, dinheiro ou cartão.": "Cuenta bancaria, efectivo o tarjeta.",
  Nome: "Nombre",
  Tipo: "Tipo",
  "Saldo inicial": "Saldo inicial",
  "Limite do cartão": "Límite de la tarjeta",
  "À ordem": "Cuenta corriente",
  Poupança: "Ahorros",
  Dinheiro: "Efectivo",
  "Cartão de crédito": "Tarjeta de crédito",
  Outra: "Otra",
  "A guardar": "Guardando",
  "Mover dinheiro": "Mover dinero",
  Transferência: "Transferencia",
  "Fazer transferência": "Hacer transferencia",
  "Mover dinheiro entre duas contas.": "Mover dinero entre dos cuentas.",
  "Crie pelo menos duas contas antes de fazer uma transferência.":
    "Crea al menos dos cuentas antes de hacer una transferencia.",
  De: "Desde",
  Para: "Hacia",
  Escolher: "Elegir",
  Valor: "Importe",
  Data: "Fecha",
  Nota: "Nota",
  opcional: "opcional",
  "Ex.: reforço da poupança": "Ej.: aporte al ahorro",
  Transferir: "Transferir",
  Saldos: "Saldos",
  "As suas contas": "Tus cuentas",
  "Ligada ao banco": "Conectada al banco",
  Manual: "Manual",
  Disponível: "Disponible",
  "Ainda sem sincronização": "Aún sin sincronizar",
  Sincronizar: "Sincronizar",
  "Gerir ligação": "Gestionar conexión",
  "Corrigir saldo": "Corregir saldo",
  Remover: "Eliminar",
  "Transferências recentes": "Transferencias recientes",
  "Ainda não existem transferências.": "Todavía no hay transferencias.",
  "Crie uma conta ou ligue o banco para começar.":
    "Crea una cuenta o conecta tu banco para empezar.",
  "A preparar as suas contas": "Preparando tus cuentas",
  "Ligações ativas": "Conexiones activas",
  "Sincronize para trazer gastos como despesas. Renove o acesso ou desligue quando quiser.":
    "Sincroniza para importar gastos. Renueva el acceso o desconecta cuando quieras.",
  "Ainda não tem bancos ligados. Ligue um banco para importar saldos — cada gasto contabilizado passa a despesa.":
    "Aún no tienes bancos conectados. Conecta uno para importar saldos y gastos contabilizados.",
  "A carregar as ligações bancárias": "Cargando conexiones bancarias",
  "Escolha o banco": "Elige el banco",
  "Só leitura de saldos e movimentos.": "Solo lectura de saldos y movimientos.",
  "Confirme no banco": "Confirma en el banco",
  "A palavra-passe nunca passa por aqui.": "Tu contraseña nunca pasa por ExpenseSnap.",
  "Gastos viram despesas": "Los movimientos se convierten en gastos",
  "Ficam no arquivo no instante da sincronização.": "Aparecen al terminar la sincronización.",
  "Como funciona": "Cómo funciona",
  "Onde está o dinheiro": "Dónde está tu dinero",
  "Tipo de conta": "Tipo de cuenta",
  Pessoal: "Personal",
  Empresarial: "Empresa",
  "Continuar no banco": "Continuar al banco",
  "A abrir o banco": "Abriendo el banco",
  "Escolha primeiro o banco.": "Elige primero un banco.",
  "Só leitura. Pode desligar quando quiser.": "Solo lectura. Desconecta cuando quieras.",
  "Voltar às contas": "Volver a cuentas",
  "A carregar os bancos disponíveis": "Cargando bancos disponibles",
  "Não há bancos disponíveis para este tipo de conta.":
    "No hay bancos disponibles para este tipo de cuenta.",
  "Sem ligação. Para ligar um banco precisa de estar online.":
    "Sin conexión. Conéctate a internet para vincular un banco.",
  "Tentar novamente": "Intentar de nuevo",
  "Pesquisar banco": "Buscar banco",
  "Bancos disponíveis": "Bancos disponibles",
  "Nenhum banco encontrado.": "No se encontraron bancos.",
  "O que vai autorizar": "Qué vas a autorizar",
  "Transformar cada gasto contabilizado numa despesa da aplicação.":
    "Convertir cada cargo contabilizado en un gasto de la aplicación.",
  "Renovar o consentimento quando o banco o pedir (em regra a cada 90 dias).":
    "Renovar el consentimiento cuando el banco lo solicite (normalmente cada 90 días).",
  "Renovar acesso": "Renovar acceso",
  Desligar: "Desconectar",
  "A sincronizar": "Sincronizando",
  "Aguarda confirmação no banco": "Esperando confirmación del banco",
  "Ligação ativa": "Conexión activa",
  "É necessário renovar o consentimento": "Es necesario renovar el consentimiento",
  "Consentimento expirado": "Consentimiento caducado",
  "Consentimento revogado": "Consentimiento revocado",
  "Banco desligado": "Banco desconectado",
  "Erro na última sincronização": "Error en la última sincronización",
  "Ainda sem sincronização.": "Aún sin sincronizar.",
  "Algo não correu como esperado": "Algo salió mal",
  Banco: "Banco",
  "Ex.: Banco": "Ej.: nombre del banco",
  "Ligar um banco": "Conectar un banco",
  "Autorize a leitura no próprio banco. Cada gasto contabilizado passa a despesa — no arquivo, no painel e nos limites.":
    "Autoriza el acceso de solo lectura en tu banco. Cada cargo contabilizado se convierte en un gasto en movimientos, panel y límites.",
  "Ler saldo e movimentos.": "Leer saldos y movimientos.",
  "Ler saldo e movimentos de {bank}.": "Leer saldos y movimientos de {bank}.",
  "O ExpenseSnap nunca recebe nem guarda a sua palavra-passe do banco: a autorização é feita no ambiente seguro do próprio banco. Pode desligar o banco e apagar os dados importados quando quiser.":
    "ExpenseSnap nunca recibe ni guarda la contraseña de tu banco. La autorización se realiza en el entorno seguro del banco y puedes desconectarlo y borrar los datos cuando quieras.",
  "{count} conta ligada": "{count} cuenta conectada",
  "{count} contas ligadas": "{count} cuentas conectadas",
  "Consentimento válido até {date}": "Consentimiento válido hasta {date}",
  "Desligar {bank}": "Desconectar {bank}",
  "Sincronizar {bank}": "Sincronizar {bank}",
  "Código de diagnóstico: {code}": "Código de diagnóstico: {code}",
  "Última atualização: {date}": "Última actualización: {date}",
  "Não foi possível concluir a leitura do banco. Tente sincronizar novamente; se persistir, renove o acesso.":
    "No se pudo leer la información del banco. Intenta sincronizar de nuevo; si persiste, renueva el acceso.",
  "Banco ligado. A primeira sincronização começou — os gastos contabilizados passam a despesas.":
    "Banco conectado. La primera sincronización ha comenzado y los cargos contabilizados se convertirán en gastos.",
  "Sincronização concluída. Os gastos contabilizados já estão em Despesas.":
    "Sincronización completada. Los cargos contabilizados ya están en Gastos.",
  "Sincronização pedida. Os gastos entram em Despesas quando terminar.":
    "Sincronización solicitada. Los cargos aparecerán en Gastos al terminar.",
  "Sincronização terminada com o estado {status}.":
    "Sincronización finalizada con estado {status}.",
  "Banco desligado. {count} movimentos eliminados.":
    "Banco desconectado. {count} movimientos eliminados.",
  "Banco desligado. Os dados importados foram conservados.":
    "Banco desconectado. Se conservaron los datos importados.",
  "Atualizado {date}": "Actualizado {date}",
  "Na app: {appAmount} · diferença {difference}":
    "En la app: {appAmount} · diferencia {difference}",
  "Saldo contabilístico": "Saldo contabilizado",
  "Saldo disponível: {amount}": "Saldo disponible: {amount}",
  "Valor fornecido pelo banco": "Valor proporcionado por el banco",
  "Valor calculado na aplicação": "Valor calculado en la aplicación",
  "Ainda não há movimentos para os filtros escolhidos.":
    "No hay movimientos para los filtros seleccionados.",
  "Sem data": "Sin fecha",
  "Banco ligado": "Banco conectado",
  Pendente: "Pendiente",
  Categoria: "Categoría",
  "Não contar como despesa": "No contar como gasto",
  "Conta ligada ao banco": "Cuenta conectada al banco",
  "Conta manual": "Cuenta manual",
  "Os movimentos ficam por rever até confirmar se são gastos. Pendentes também podem entrar nas despesas.":
    "Los movimientos quedan pendientes de revisión hasta confirmar que son gastos. Los pendientes también pueden incluirse.",
  "Confirme os débitos que são gastos. Pendentes e contabilizados ficam visíveis até decidir.":
    "Confirma qué débitos son gastos. Los pendientes y contabilizados siguen visibles hasta decidir.",
  "Confirmar gasto": "Confirmar gasto",
  "Gasto confirmado.": "Gasto confirmado.",
  "Não é um gasto": "No es un gasto",
  Apagar: "Eliminar",
  "Apagar movimento": "Eliminar movimiento",
  "Apagar movimento importado?": "¿Eliminar movimiento importado?",
  "Este movimento será removido das despesas e não voltará a aparecer após nova sincronização.":
    "Este movimiento se eliminará de los gastos y no volverá a aparecer tras una nueva sincronización.",
  "Estado do movimento": "Estado del movimiento",
  "Movimento importado do banco": "Movimiento importado del banco",
  "Classifique os gastos de hoje": "Revisa los movimientos de hoy",
  "Confirme uma categoria para manter os seus resumos organizados.":
    "Confirma una categoría para mantener tus resúmenes organizados.",
  "Sincronizado pelo banco": "Sincronizado por el banco",
  "Por classificar": "Por revisar",
  "Mais tarde": "Más tarde",
  "Guardar e continuar": "Guardar y continuar",
  Concluir: "Listo",
  "Entre para consultar as suas finanças.": "Inicia sesión para consultar tus finanzas.",
  "Saldo e movimentos desta conta.": "Saldo y movimientos de esta cuenta.",
  Voltar: "Volver",
  "Histórico da conta": "Historial de la cuenta",
  "Débitos contabilizados aparecem em Despesas. Use a categoria para os organizar, ou exclua o que não quiser contar.":
    "Los débitos contabilizados aparecen en Gastos. Usa categorías para organizarlos o excluye lo que no quieras contar.",
  Estado: "Estado",
  Classificação: "Clasificación",
  "Todos os estados": "Todos los estados",
  Pendentes: "Pendientes",
  Contabilizados: "Contabilizados",
  "Todas as classificações": "Todas las clasificaciones",
  "Por rever": "Por revisar",
  Despesa: "Gasto",
  Rendimento: "Ingreso",
  "Transferência própria": "Transferencia interna",
  Reembolso: "Reembolso",
  Ignorado: "Ignorado",
  "A carregar a conta": "Cargando cuenta",
  "Conta não encontrada.": "Cuenta no encontrada.",
  "A carregar os movimentos": "Cargando movimientos",
  "Os movimentos de contas manuais aparecem no arquivo geral.":
    "Los movimientos de cuentas manuales aparecen en el historial general.",
  "Ver movimentos": "Ver movimientos",
  Anterior: "Anterior",
  Seguinte: "Siguiente",
  "Página {page} de {count}": "Página {page} de {count}",
  "A conta foi carregada, mas as categorias estão temporariamente indisponíveis.":
    "La cuenta se cargó, pero las categorías no están disponibles temporalmente.",
  "Categoria atualizada.": "Categoría actualizada.",
  "Este movimento deixou de contar como despesa.": "Este movimiento ya no cuenta como gasto.",
  "Este gasto voltou às despesas.": "Este movimiento vuelve a contar como gasto.",
  "Corrigir valor da conta": "Corregir saldo de la cuenta",
  "Defina o saldo atual de {account}. Os movimentos existentes não serão alterados.":
    "Define el saldo actual de {account}. Los movimientos existentes no cambiarán.",
  "Novo saldo": "Nuevo saldo",
  "Saldo apresentado: {amount}": "Saldo mostrado: {amount}",
  Cancelar: "Cancelar",
  "A corrigir…": "Corrigiendo…",
  "Guardar correção": "Guardar corrección",
  "A eliminar…": "Eliminando…",
  "Remover conta": "Eliminar cuenta",
  "Remover conta {account}": "Eliminar cuenta {account}",
  "Corrigir saldo da conta {account}": "Corregir saldo de la cuenta {account}",
  "Remover esta conta?": "¿Eliminar esta cuenta?",
  "A conta {account} será removida. Os movimentos existentes deixam de estar associados a esta conta e as transferências serão removidas, sem alterar o saldo das restantes contas.":
    "La cuenta {account} se eliminará. Los movimientos quedarán desvinculados y sus transferencias se eliminarán sin cambiar el saldo de las demás cuentas.",
  Histórico: "Historial",
  "Dinheiro sem distrações": "Dinero sin distracciones",
  "Tudo o que saiu.": "Todo lo que gastaste.",
  "Nada escondido.": "Nada oculto.",
  "Um arquivo simples para perceber hábitos, comparar meses e decidir com mais calma.":
    "Un registro sencillo para entender hábitos, comparar meses y decidir con más calma.",
  "Os comprovativos são lidos localmente no seu dispositivo.":
    "Los comprobantes se leen localmente en tu dispositivo.",
  "Comece pelo essencial": "Empieza por lo esencial",
  "Uma rotina leve para": "Una rutina sencilla para",
  "cuidar do futuro.": "cuidar tu futuro.",
  "Crie a conta e conte-nos apenas o necessário para organizar a sua vida financeira.":
    "Crea tu cuenta y dinos solo lo necesario para organizar tus finanzas.",
  "Enviamos um email para confirmar que a conta é sua.":
    "Enviamos un correo para confirmar que la cuenta es tuya.",
  "Confirmação de conta": "Confirmación de cuenta",
  "Um email para": "Un correo para",
  "proteger a sua conta.": "proteger tu cuenta.",
  "A confirmação garante que só quem tem acesso a este email consegue recuperar a conta.":
    "La confirmación garantiza que solo quien accede a este correo puede recuperar la cuenta.",
  "Nunca partilhamos o seu email com terceiros.": "Nunca compartimos tu correo con terceros.",
  "Recuperar acesso": "Recuperar acceso",
  "Um link para": "Un enlace para",
  "voltar à conta.": "volver a tu cuenta.",
  "Se existir uma conta com este email, enviamos um link para escolher uma nova palavra-passe.":
    "Si existe una cuenta con este correo, enviaremos un enlace para elegir una nueva contraseña.",
  "O link expira ao fim de uma hora e só pode ser usado uma vez.":
    "El enlace caduca en una hora y solo puede usarse una vez.",
  "Escolha uma palavra-passe": "Elige una contraseña",
  "só sua.": "solo tuya.",
  "Depois de gravar, inicie sessão com a nova palavra-passe.":
    "Después de guardarla, inicia sesión con la nueva contraseña.",
  "As sessões abertas noutros dispositivos serão encerradas.":
    "Las sesiones abiertas en otros dispositivos se cerrarán.",
  "Bem-vindo de volta": "Bienvenido de nuevo",
  "Entrar na conta": "Entrar en tu cuenta",
  "Continue de onde ficou.": "Continúa donde lo dejaste.",
  Email: "Correo electrónico",
  "Palavra-passe": "Contraseña",
  "Esqueceu a palavra-passe?": "¿Olvidaste la contraseña?",
  "A sua palavra-passe": "Tu contraseña",
  "Ocultar palavra-passe": "Ocultar contraseña",
  "Mostrar palavra-passe": "Mostrar contraseña",
  "A entrar": "Entrando",
  "Ainda não tem conta?": "¿Aún no tienes cuenta?",
  "Acesso protegido": "Acceso protegido",
  "Sessão privada e segura": "Sesión privada y segura",
  "Os seus dados financeiros nunca são partilhados.": "Tus datos financieros nunca se comparten.",
  Registo: "Registro",
  Equilíbrio: "Equilibrio",
  Clareza: "Claridad",
  "Uma leitura simples do que sai e do que fica.":
    "Una visión simple de lo que sale y lo que queda.",
  "Introduza o seu email.": "Introduce tu correo.",
  "Introduza um email válido.": "Introduce un correo válido.",
  "Introduza a sua palavra-passe.": "Introduce tu contraseña.",
  "A sua conta": "Tu cuenta",
  "Demora menos de um minuto.": "Tarda menos de un minuto.",
  "Como quer ser tratado?": "¿Cómo quieres que te llamemos?",
  "Entre 8 e 128 caracteres": "Entre 8 y 128 caracteres",
  "Use entre 8 e 128 caracteres.": "Usa entre 8 y 128 caracteres.",
  "Confirmar palavra-passe": "Confirmar contraseña",
  "Repita a palavra-passe": "Repite la contraseña",
  "Ocultar confirmação da palavra-passe": "Ocultar confirmación de contraseña",
  "Mostrar confirmação da palavra-passe": "Mostrar confirmación de contraseña",
  "A criar conta": "Creando cuenta",
  "Já tem conta?": "¿Ya tienes cuenta?",
  "Introduza pelo menos 2 caracteres.": "Introduce al menos 2 caracteres.",
  "Use pelo menos 8 caracteres.": "Usa al menos 8 caracteres.",
  "Use no máximo 128 caracteres.": "Usa como máximo 128 caracteres.",
  "Confirme a palavra-passe.": "Confirma la contraseña.",
  "As palavras-passe não coincidem.": "Las contraseñas no coinciden.",
  "Se existir uma conta com este email, enviámos um link para repor a palavra-passe.":
    "Si existe una cuenta con este correo, enviamos un enlace para restablecer la contraseña.",
  "Indique o email da conta. Se existir, enviamos um link de reposição.":
    "Indica el correo de la cuenta. Si existe, enviaremos un enlace de restablecimiento.",
  "Voltar a entrar": "Volver a entrar",
  "Verifique a caixa de entrada e o spam. O link expira ao fim de uma hora.":
    "Revisa la bandeja de entrada y spam. El enlace caduca en una hora.",
  "A enviar": "Enviando",
  "Enviar link": "Enviar enlace",
  "Voltar ao início de sessão": "Volver al inicio de sesión",
  "A autorização foi cancelada no banco. Nenhuma ligação foi criada.":
    "La autorización se canceló en el banco. No se creó ninguna conexión.",
  "A autorização expirou. Inicie novamente a ligação ao banco.":
    "La autorización caducó. Inicia de nuevo la conexión bancaria.",
  "O banco recebeu demasiados pedidos. Aguarde alguns minutos e tente novamente.":
    "El banco recibió demasiadas solicitudes. Espera unos minutos e inténtalo de nuevo.",
  "O serviço do banco está temporariamente indisponível. Tente novamente.":
    "El servicio bancario no está disponible temporalmente. Inténtalo de nuevo.",
  "Este banco já não está disponível para ligação neste momento.":
    "Este banco no está disponible para conectarlo en este momento.",
  "Não foi possível validar esta autorização. Inicie novamente a ligação.":
    "No se pudo validar la autorización. Inicia de nuevo la conexión.",
  "Esta autorização já foi utilizada. Inicie uma nova ligação ao banco.":
    "Esta autorización ya se utilizó. Inicia una nueva conexión bancaria.",
  "Não foi possível concluir a ligação ao banco. Tente novamente.":
    "No se pudo completar la conexión bancaria. Inténtalo de nuevo.",
  "As contas manuais estão disponíveis, mas não foi possível carregar o estado dos bancos: {message}":
    "Las cuentas manuales están disponibles, pero no se pudo cargar el estado de los bancos: {message}",
  "A sincronização bancária não foi concluída. Tente novamente.":
    "La sincronización bancaria no se completó. Inténtalo de nuevo.",
  "Não foi possível confirmar a sincronização bancária.":
    "No se pudo confirmar la sincronización bancaria.",
  "Sincronização concluída. Saldos e movimentos foram atualizados.":
    "Sincronización completada. Saldos y movimientos actualizados.",
  "A sincronizar saldos e movimentos…": "Sincronizando saldos y movimientos…",
  "Introduza o nome da conta.": "Introduce el nombre de la cuenta.",
  "Indique um saldo inicial válido.": "Introduce un saldo inicial válido.",
  "Indique um limite válido.": "Introduce un límite válido.",
  "Conta criada.": "Cuenta creada.",
  "Escolha a conta de origem.": "Elige la cuenta de origen.",
  "Escolha a conta de destino.": "Elige la cuenta de destino.",
  "Escolha duas contas diferentes.": "Elige dos cuentas diferentes.",
  "Indique a data.": "Indica la fecha.",
  "Indique um valor maior do que zero.": "Introduce un importe mayor que cero.",
  "Transferência registada.": "Transferencia registrada.",
  "Conta removida.": "Cuenta eliminada.",
  "Indique um saldo válido, com no máximo duas casas decimais.":
    "Introduce un saldo válido con un máximo de dos decimales.",
  "Saldo corrigido.": "Saldo corregido.",
  "{account} será removida. As despesas e rendimentos existentes deixam de estar associados a esta conta. As transferências desta conta também serão removidas, sem alterar o saldo das restantes contas.":
    "Se eliminará {account}. Los gastos e ingresos quedarán desvinculados y sus transferencias se eliminarán sin cambiar los saldos de las demás cuentas.",
};

/**
 * New UI copy uses stable semantic keys. The legacy phrase catalog remains
 * supported so existing screens can migrate incrementally without changing
 * API/provider/status identifiers.
 */
export const semanticMessages = {
  "pt-PT": {
    "language.label": "Idioma",
    "language.aria": "Idioma / Language / Idioma",
    "status.connection.pending": "Aguarda confirmação no banco",
    "status.connection.active": "Ligação ativa",
    "status.connection.reauth_required": "É necessário renovar o consentimento",
    "status.connection.expired": "Consentimento expirado",
    "status.connection.revoked": "Consentimento revogado",
    "status.connection.disconnected": "Banco desligado",
    "status.connection.error": "Erro na última sincronização",
    "status.syncing": "A sincronizar",
    "auth.verify.sent": "Novo email enviado",
    "auth.verify.title": "Confirme o seu email",
    "auth.verify.sentDescription": "Verifique a caixa de entrada de {email} e a pasta de spam.",
    "auth.verify.pendingDescription":
      "Enviámos um link para {email}. Confirmar protege o acesso à sua conta.",
    "auth.verify.resend": "Reenviar",
    "auth.verify.dismiss": "Dispensar aviso de verificação",
    "auth.verify.dismissTitle": "Dispensar",
    "privacy.eyebrow": "Privacidade",
    "privacy.title": "Os seus dados bancários",
    "privacy.description": "O que é guardado, para que serve e como revogar ou eliminar o acesso.",
    "privacy.dataEyebrow": "Dados",
    "privacy.dataTitle": "O que guardamos",
    "privacy.connectionsEyebrow": "Ligações",
    "privacy.connectionsTitle": "Bancos ligados",
    "privacy.controlEyebrow": "Controlo",
    "privacy.controlTitle": "Renovar, revogar e eliminar",
    "privacy.manage": "Gerir",
    "privacy.manageConnections": "Gerir ligações bancárias",
    "privacy.loading": "A carregar as ligações",
    "privacy.empty": "Não tem bancos ligados.",
    "privacy.status": "Estado: {status}",
    "privacy.lastSync": "Última sincronização: {date}",
    "privacy.notSynced": "Ainda sem sincronização",
    "privacy.consentUntil": "Consentimento até {date}",
    "privacy.storedInstitution": "Nome da instituição e identificador da ligação",
    "privacy.storedInstitutionDescription": "para mostrar que banco está ligado.",
    "privacy.storedSession": "Identificador da sessão, cifrado",
    "privacy.storedSessionDescription":
      "necessário para ler saldos e movimentos enquanto o consentimento existir.",
    "privacy.storedIban": "IBAN mascarado e um hash da conta",
    "privacy.storedIbanDescription":
      "apenas para apresentação e para casar transferências entre as suas contas. O IBAN completo nunca é guardado.",
    "privacy.storedTransactions": "Saldos e movimentos",
    "privacy.storedTransactionsDescription":
      "descrição, valor, data, estado (pendente ou contabilizado) e, quando existir, o nome da contraparte.",
    "privacy.storedRecords": "Despesas, rendimentos e transferências criadas",
    "privacy.storedRecordsDescription":
      "a partir de movimentos contabilizados, para entrarem nas análises que já usa.",
    "privacy.noPassword":
      "Nunca guardamos a palavra-passe do banco nem credenciais bancárias. Não há iniciação de pagamentos.",
    "privacy.rightsDescription":
      "Pode renovar o consentimento quando o banco o exigir, desligar um banco conservando os dados já importados ou apagar esses dados. A eliminação remove apenas o que veio do banco: os registos manuais não são apagados.",
    "notFound.eyebrow": "Página não encontrada",
    "notFound.title": "Esta conta não fecha.",
    "notFound.description": "O endereço pode ter mudado, ou a página nunca chegou a existir.",
    "notFound.home": "Ir para Hoje",
    "notFound.activity": "Ver movimentos",
    "notFound.newExpense": "Registar despesa",
    "notFound.signIn": "Entrar na conta",
    "notFound.register": "Criar conta",
    "reset.invalidTitle": "Link inválido ou expirado",
    "reset.invalidDescription":
      "Peça um novo link de recuperação para escolher outra palavra-passe.",
    "reset.requestLink": "Pedir novo link",
    "reset.successTitle": "Palavra-passe atualizada",
    "reset.successDescription": "Já pode entrar com a nova palavra-passe.",
    "reset.signIn": "Entrar na conta",
    "reset.title": "Escolha uma palavra-passe",
    "reset.description": "Defina uma nova palavra-passe para a sua conta.",
    "reset.newPassword": "Nova palavra-passe",
    "reset.confirmPassword": "Confirmar palavra-passe",
    "reset.save": "Guardar palavra-passe",
    "reset.saving": "A guardar",
    "reset.back": "Voltar ao início de sessão",
    "reset.missingEyebrow": "Link incompleto",
    "reset.missingTitle": "Falta o código de reposição",
    "reset.missingDescription":
      "Abra o link diretamente a partir do email que recebeu, ou peça um novo.",
    "reset.successEyebrow": "Palavra-passe atualizada",
    "reset.successTitleShort": "Já pode entrar",
    "reset.successDescriptionShort":
      "A nova palavra-passe está ativa. As sessões anteriores foram encerradas.",
    "reset.passwordHint": "Use pelo menos 8 caracteres.",
    "reset.passwordPlaceholder": "Pelo menos 8 caracteres",
    "reset.passwordLabel": "Nova palavra-passe",
    "reset.hidePassword": "Ocultar palavra-passe",
    "reset.showPassword": "Mostrar palavra-passe",
    "verify.errorTitle": "Não foi possível verificar o email",
    "verify.errorDescription": "O link pode ter expirado ou já ter sido utilizado.",
    "verify.requestNew": "Pedir novo email",
    "verify.successTitle": "Email confirmado",
    "verify.successDescription": "A sua conta está pronta. Pode continuar para a aplicação.",
    "verify.continue": "Continuar",
    "verify.pendingTitle": "Confirme o seu email",
    "verify.pendingDescription": "Enviámos um link de confirmação para o seu email.",
    "verify.resend": "Reenviar email",
    "verify.sending": "A enviar",
    "verify.sent": "Email enviado. Verifique também a pasta de spam.",
    "verify.back": "Voltar ao início de sessão",
    "verify.verificationEyebrow": "Verificação",
    "verify.verifyingTitle": "A confirmar o seu email",
    "verify.verifyingDescription": "Só um instante — estamos a validar o link.",
    "verify.confirmedEyebrow": "Conta confirmada",
    "verify.confirmedTitle": "Email verificado",
    "verify.confirmedDescription":
      "Obrigado. A sua conta está confirmada e pode continuar a organizar as suas finanças.",
    "verify.invalidEyebrow": "Link inválido",
    "verify.invalidTitle": "Não conseguimos confirmar",
    "verify.invalidDescription":
      "O link é inválido ou já expirou. Peça um novo email de confirmação.",
    "verify.missingDescription":
      "Este endereço não inclui um código de verificação. Abra o link diretamente a partir do email que recebeu.",
    "verify.dashboard": "Ir para o painel",
    "verify.newEmail": "Enviar novo email",
    "verify.continueUnverified": "Continuar sem verificar",
    "verify.signInToResend": "Entrar para reenviar",
    "verify.afterSignInHint":
      "Depois de entrar, pode pedir um novo email de confirmação a partir do aviso no topo da aplicação.",
    "verify.noAccount": "Ainda não tem conta?",
    "Movimento do dia": "Movimento do dia",
    "Ver todos": "Ver todos",
    Entradas: "Entradas",
    Saídas: "Saídas",
    "Resultado do dia": "Resultado do dia",
    "Saldo das contas": "Saldo das contas",
    "Adicionar ou ligar uma conta": "Adicionar ou ligar uma conta",
    Atividade: "Atividade",
    "{count} movimento": "{count} movimento",
    "{count} movimentos": "{count} movimentos",
    Banco: "Banco",
    "Ainda não há movimentos hoje.": "Ainda não há movimentos hoje.",
    "Total em {month}": "Total em {month}",
    "Inclui os gastos das contas ligadas ao banco.":
      "Inclui os gastos das contas ligadas ao banco.",
    "Ligue um banco para os gastos contabilizados entrarem sozinhos.":
      "Ligue um banco para os gastos contabilizados entrarem sozinhos.",
    "Sem comparação": "Sem comparação",
    "Igual ao mês anterior": "Igual ao mês anterior",
    "{amount} face ao mês anterior": "{amount} face ao mês anterior",
    "Estado do mês": "Estado do mês",
    "Orçamento acompanhado": "Orçamento acompanhado",
    "Utilização do orçamento acompanhado": "Utilização do orçamento acompanhado",
    "{percent}% utilizado": "{percent}% utilizado",
    "Definir limites": "Definir limites",
    Distribuição: "Distribuição",
    "Por categoria": "Por categoria",
    "Requer atenção": "Requer atenção",
    "Uma categoria ultrapassou o limite ou o ritmo previsto.":
      "Uma categoria ultrapassou o limite ou o ritmo previsto.",
    "{count} categorias ultrapassaram o limite ou o ritmo previsto.":
      "{count} categorias ultrapassaram o limite ou o ritmo previsto.",
    "A acompanhar": "A acompanhar",
    "Uma categoria está acima do ritmo habitual.": "Uma categoria está acima do ritmo habitual.",
    "{count} categorias estão acima do ritmo habitual.":
      "{count} categorias estão acima do ritmo habitual.",
    "Mês sob controlo": "Mês sob controlo",
    "Os limites definidos estão dentro do ritmo esperado.":
      "Os limites definidos estão dentro do ritmo esperado.",
    "Defina um limite": "Defina um limite",
    "Os orçamentos tornam os sinais deste mês mais úteis.":
      "Os orçamentos tornam os sinais deste mês mais úteis.",
  },
  "en-GB": {
    "language.label": "Language",
    "language.aria": "Language",
    "status.connection.pending": "Waiting for bank confirmation",
    "status.connection.active": "Connection active",
    "status.connection.reauth_required": "Consent renewal required",
    "status.connection.expired": "Consent expired",
    "status.connection.revoked": "Consent revoked",
    "status.connection.disconnected": "Bank disconnected",
    "status.connection.error": "Last sync failed",
    "status.syncing": "Syncing",
    "auth.verify.sent": "New email sent",
    "auth.verify.title": "Confirm your email",
    "auth.verify.sentDescription": "Check the inbox for {email} and the spam folder.",
    "auth.verify.pendingDescription":
      "We sent a link to {email}. Confirming protects access to your account.",
    "auth.verify.resend": "Resend",
    "auth.verify.dismiss": "Dismiss email verification notice",
    "auth.verify.dismissTitle": "Dismiss",
    "privacy.eyebrow": "Privacy",
    "privacy.title": "Your bank data",
    "privacy.description": "What is stored, why it is used, and how to revoke or delete access.",
    "privacy.dataEyebrow": "Data",
    "privacy.dataTitle": "What we store",
    "privacy.connectionsEyebrow": "Connections",
    "privacy.connectionsTitle": "Connected banks",
    "privacy.controlEyebrow": "Control",
    "privacy.controlTitle": "Renew, revoke and delete",
    "privacy.manage": "Manage",
    "privacy.manageConnections": "Manage bank connections",
    "privacy.loading": "Loading connections",
    "privacy.empty": "You have no connected banks.",
    "privacy.status": "Status: {status}",
    "privacy.lastSync": "Last sync: {date}",
    "privacy.notSynced": "Not synced yet",
    "privacy.consentUntil": "Consent until {date}",
    "privacy.storedInstitution": "Institution name and connection identifier",
    "privacy.storedInstitutionDescription": "to show which bank is connected.",
    "privacy.storedSession": "Encrypted session identifier",
    "privacy.storedSessionDescription":
      "needed to read balances and transactions while consent exists.",
    "privacy.storedIban": "Masked IBAN and an account hash",
    "privacy.storedIbanDescription":
      "for display and matching transfers between your accounts. The full IBAN is never stored.",
    "privacy.storedTransactions": "Balances and transactions",
    "privacy.storedTransactionsDescription":
      "description, amount, date, status (pending or booked) and, when available, counterparty name.",
    "privacy.storedRecords": "Expenses, income and transfers created",
    "privacy.storedRecordsDescription":
      "from booked transactions so they can appear in the analyses you already use.",
    "privacy.noPassword":
      "We never store your bank password or banking credentials. Payments cannot be initiated.",
    "privacy.rightsDescription":
      "You can renew consent when your bank requires it, disconnect a bank while keeping imported data, or delete that data. Deletion only removes data imported from the bank; manual records are not deleted.",
    "notFound.eyebrow": "Page not found",
    "notFound.title": "This account does not balance.",
    "notFound.description": "The address may have changed, or the page may never have existed.",
    "notFound.home": "Go to Today",
    "notFound.activity": "View activity",
    "notFound.newExpense": "Add expense",
    "notFound.signIn": "Sign in",
    "notFound.register": "Create account",
    "reset.invalidTitle": "Link invalid or expired",
    "reset.invalidDescription": "Request a new recovery link to choose another password.",
    "reset.requestLink": "Request a new link",
    "reset.successTitle": "Password updated",
    "reset.successDescription": "You can now sign in with your new password.",
    "reset.signIn": "Sign in",
    "reset.title": "Choose a password",
    "reset.description": "Set a new password for your account.",
    "reset.newPassword": "New password",
    "reset.confirmPassword": "Confirm password",
    "reset.save": "Save password",
    "reset.saving": "Saving",
    "reset.back": "Back to sign in",
    "reset.missingEyebrow": "Incomplete link",
    "reset.missingTitle": "The reset code is missing",
    "reset.missingDescription":
      "Open the link directly from the email you received, or request a new one.",
    "reset.successEyebrow": "Password updated",
    "reset.successTitleShort": "You can now sign in",
    "reset.successDescriptionShort":
      "Your new password is active. Previous sessions have been signed out.",
    "reset.passwordHint": "Use at least 8 characters.",
    "reset.passwordPlaceholder": "At least 8 characters",
    "reset.passwordLabel": "New password",
    "reset.hidePassword": "Hide password",
    "reset.showPassword": "Show password",
    "verify.errorTitle": "Email could not be verified",
    "verify.errorDescription": "The link may have expired or already been used.",
    "verify.requestNew": "Request a new email",
    "verify.successTitle": "Email confirmed",
    "verify.successDescription": "Your account is ready. You can continue to the app.",
    "verify.continue": "Continue",
    "verify.pendingTitle": "Confirm your email",
    "verify.pendingDescription": "We sent a confirmation link to your email.",
    "verify.resend": "Resend email",
    "verify.sending": "Sending",
    "verify.sent": "Email sent. Check your spam folder too.",
    "verify.back": "Back to sign in",
    "verify.verificationEyebrow": "Verification",
    "verify.verifyingTitle": "Confirming your email",
    "verify.verifyingDescription": "Just a moment — we are validating the link.",
    "verify.confirmedEyebrow": "Account confirmed",
    "verify.confirmedTitle": "Email verified",
    "verify.confirmedDescription":
      "Thank you. Your account is confirmed and you can continue organising your finances.",
    "verify.invalidEyebrow": "Invalid link",
    "verify.invalidTitle": "We could not confirm it",
    "verify.invalidDescription":
      "The link is invalid or has expired. Request a new confirmation email.",
    "verify.missingDescription":
      "This address does not include a verification code. Open the link directly from the email you received.",
    "verify.dashboard": "Go to dashboard",
    "verify.newEmail": "Send a new email",
    "verify.continueUnverified": "Continue without verifying",
    "verify.signInToResend": "Sign in to resend",
    "verify.afterSignInHint":
      "After signing in, you can request a new confirmation email from the notice at the top of the app.",
    "verify.noAccount": "Don't have an account yet?",
    "Movimento do dia": "Today's activity",
    "Ver todos": "View all",
    Entradas: "Income",
    Saídas: "Outgoings",
    "Resultado do dia": "Today's net",
    "Saldo das contas": "Account balances",
    "Adicionar ou ligar uma conta": "Add or connect an account",
    Atividade: "Activity",
    "{count} movimento": "{count} transaction",
    "{count} movimentos": "{count} transactions",
    Banco: "Bank",
    "Ainda não há movimentos hoje.": "There are no transactions today yet.",
    "Total em {month}": "Total in {month}",
    "Inclui os gastos das contas ligadas ao banco.":
      "Includes spending from connected bank accounts.",
    "Ligue um banco para os gastos contabilizados entrarem sozinhos.":
      "Connect a bank to add booked spending automatically.",
    "Sem comparação": "No comparison",
    "Igual ao mês anterior": "Same as last month",
    "{amount} face ao mês anterior": "{amount} compared with last month",
    "Estado do mês": "Month status",
    "Orçamento acompanhado": "Tracked budget",
    "Utilização do orçamento acompanhado": "Tracked budget usage",
    "{percent}% utilizado": "{percent}% used",
    "Definir limites": "Set limits",
    Distribuição: "Breakdown",
    "Por categoria": "By category",
    "Requer atenção": "Needs attention",
    "Uma categoria ultrapassou o limite ou o ritmo previsto.":
      "One category exceeded its limit or expected pace.",
    "{count} categorias ultrapassaram o limite ou o ritmo previsto.":
      "{count} categories exceeded their limit or expected pace.",
    "A acompanhar": "Keep an eye on this",
    "Uma categoria está acima do ritmo habitual.": "One category is above its usual pace.",
    "{count} categorias estão acima do ritmo habitual.":
      "{count} categories are above their usual pace.",
    "Mês sob controlo": "Month under control",
    "Os limites definidos estão dentro do ritmo esperado.":
      "Your limits are within the expected pace.",
    "Defina um limite": "Set a limit",
    "Os orçamentos tornam os sinais deste mês mais úteis.":
      "Budgets make this month's signals more useful.",
  },
  "es-ES": {
    "language.label": "Idioma",
    "language.aria": "Idioma",
    "status.connection.pending": "Esperando la confirmación del banco",
    "status.connection.active": "Conexión activa",
    "status.connection.reauth_required": "Es necesario renovar el consentimiento",
    "status.connection.expired": "Consentimiento caducado",
    "status.connection.revoked": "Consentimiento revocado",
    "status.connection.disconnected": "Banco desconectado",
    "status.connection.error": "Error en la última sincronización",
    "status.syncing": "Sincronizando",
    "auth.verify.sent": "Nuevo correo enviado",
    "auth.verify.title": "Confirma tu correo",
    "auth.verify.sentDescription": "Revisa la bandeja de entrada de {email} y la carpeta de spam.",
    "auth.verify.pendingDescription":
      "Enviamos un enlace a {email}. Confirmarlo protege el acceso a tu cuenta.",
    "auth.verify.resend": "Reenviar",
    "auth.verify.dismiss": "Descartar aviso de verificación",
    "auth.verify.dismissTitle": "Descartar",
    "privacy.eyebrow": "Privacidad",
    "privacy.title": "Tus datos bancarios",
    "privacy.description": "Qué se guarda, para qué sirve y cómo revocar o eliminar el acceso.",
    "privacy.dataEyebrow": "Datos",
    "privacy.dataTitle": "Qué guardamos",
    "privacy.connectionsEyebrow": "Conexiones",
    "privacy.connectionsTitle": "Bancos conectados",
    "privacy.controlEyebrow": "Control",
    "privacy.controlTitle": "Renovar, revocar y eliminar",
    "privacy.manage": "Gestionar",
    "privacy.manageConnections": "Gestionar conexiones bancarias",
    "privacy.loading": "Cargando conexiones",
    "privacy.empty": "Aún no tienes bancos conectados.",
    "privacy.status": "Estado: {status}",
    "privacy.lastSync": "Última sincronización: {date}",
    "privacy.notSynced": "Aún sin sincronizar",
    "privacy.consentUntil": "Consentimiento hasta {date}",
    "privacy.storedInstitution": "Nombre de la institución e identificador de la conexión",
    "privacy.storedInstitutionDescription": "para mostrar qué banco está conectado.",
    "privacy.storedSession": "Identificador de sesión cifrado",
    "privacy.storedSessionDescription":
      "necesario para leer saldos y movimientos mientras exista el consentimiento.",
    "privacy.storedIban": "IBAN oculto y hash de la cuenta",
    "privacy.storedIbanDescription":
      "solo para mostrar y relacionar transferencias entre tus cuentas. El IBAN completo nunca se guarda.",
    "privacy.storedTransactions": "Saldos y movimientos",
    "privacy.storedTransactionsDescription":
      "descripción, importe, fecha, estado (pendiente o contabilizado) y, cuando exista, nombre de la contraparte.",
    "privacy.storedRecords": "Gastos, ingresos y transferencias creados",
    "privacy.storedRecordsDescription":
      "a partir de movimientos contabilizados para incluirlos en los análisis que ya usas.",
    "privacy.noPassword":
      "Nunca guardamos tu contraseña bancaria ni tus credenciales. No se pueden iniciar pagos.",
    "privacy.rightsDescription":
      "Puedes renovar el consentimiento cuando el banco lo pida, desconectar un banco conservando los datos importados o eliminar esos datos. La eliminación solo borra lo importado del banco; los registros manuales no se borran.",
    "notFound.eyebrow": "Página no encontrada",
    "notFound.title": "Esta cuenta no cuadra.",
    "notFound.description": "La dirección puede haber cambiado o la página quizá nunca existió.",
    "notFound.home": "Ir a Hoy",
    "notFound.activity": "Ver movimientos",
    "notFound.newExpense": "Registrar gasto",
    "notFound.signIn": "Entrar en la cuenta",
    "notFound.register": "Crear cuenta",
    "reset.invalidTitle": "Enlace no válido o caducado",
    "reset.invalidDescription": "Pide un nuevo enlace de recuperación para elegir otra contraseña.",
    "reset.requestLink": "Pedir un nuevo enlace",
    "reset.successTitle": "Contraseña actualizada",
    "reset.successDescription": "Ya puedes entrar con tu nueva contraseña.",
    "reset.signIn": "Entrar",
    "reset.title": "Elige una contraseña",
    "reset.description": "Define una nueva contraseña para tu cuenta.",
    "reset.newPassword": "Nueva contraseña",
    "reset.confirmPassword": "Confirmar contraseña",
    "reset.save": "Guardar contraseña",
    "reset.saving": "Guardando",
    "reset.back": "Volver a iniciar sesión",
    "reset.missingEyebrow": "Enlace incompleto",
    "reset.missingTitle": "Falta el código de recuperación",
    "reset.missingDescription":
      "Abre el enlace directamente desde el correo que recibiste o pide uno nuevo.",
    "reset.successEyebrow": "Contraseña actualizada",
    "reset.successTitleShort": "Ya puedes entrar",
    "reset.successDescriptionShort":
      "La nueva contraseña está activa. Se cerraron las sesiones anteriores.",
    "reset.passwordHint": "Usa al menos 8 caracteres.",
    "reset.passwordPlaceholder": "Al menos 8 caracteres",
    "reset.passwordLabel": "Nueva contraseña",
    "reset.hidePassword": "Ocultar contraseña",
    "reset.showPassword": "Mostrar contraseña",
    "verify.errorTitle": "No se pudo verificar el correo",
    "verify.errorDescription": "El enlace puede haber caducado o ya se ha utilizado.",
    "verify.requestNew": "Pedir un correo nuevo",
    "verify.successTitle": "Correo confirmado",
    "verify.successDescription": "Tu cuenta está lista. Puedes continuar a la aplicación.",
    "verify.continue": "Continuar",
    "verify.pendingTitle": "Confirma tu correo",
    "verify.pendingDescription": "Enviamos un enlace de confirmación a tu correo.",
    "verify.resend": "Reenviar correo",
    "verify.sending": "Enviando",
    "verify.sent": "Correo enviado. Revisa también la carpeta de spam.",
    "verify.back": "Volver a iniciar sesión",
    "verify.verificationEyebrow": "Verificación",
    "verify.verifyingTitle": "Confirmando tu correo",
    "verify.verifyingDescription": "Un momento — estamos validando el enlace.",
    "verify.confirmedEyebrow": "Cuenta confirmada",
    "verify.confirmedTitle": "Correo verificado",
    "verify.confirmedDescription":
      "Gracias. Tu cuenta está confirmada y puedes seguir organizando tus finanzas.",
    "verify.invalidEyebrow": "Enlace no válido",
    "verify.invalidTitle": "No pudimos confirmarlo",
    "verify.invalidDescription":
      "El enlace no es válido o ha caducado. Pide un nuevo correo de confirmación.",
    "verify.missingDescription":
      "Esta dirección no incluye un código de verificación. Abre el enlace directamente desde el correo que recibiste.",
    "verify.dashboard": "Ir al panel",
    "verify.newEmail": "Enviar un correo nuevo",
    "verify.continueUnverified": "Continuar sin verificar",
    "verify.signInToResend": "Entrar para reenviar",
    "verify.afterSignInHint":
      "Después de entrar, puedes pedir un nuevo correo de confirmación desde el aviso en la parte superior de la aplicación.",
    "verify.noAccount": "¿Aún no tienes cuenta?",
    "Movimento do dia": "Actividad de hoy",
    "Ver todos": "Ver todos",
    Entradas: "Ingresos",
    Saídas: "Salidas",
    "Resultado do dia": "Resultado de hoy",
    "Saldo das contas": "Saldo de las cuentas",
    "Adicionar ou ligar uma conta": "Añadir o conectar una cuenta",
    Atividade: "Actividad",
    "{count} movimento": "{count} movimiento",
    "{count} movimentos": "{count} movimientos",
    Banco: "Banco",
    "Ainda não há movimentos hoje.": "Todavía no hay movimientos hoy.",
    "Total em {month}": "Total en {month}",
    "Inclui os gastos das contas ligadas ao banco.":
      "Incluye los gastos de las cuentas bancarias conectadas.",
    "Ligue um banco para os gastos contabilizados entrarem sozinhos.":
      "Conecta un banco para añadir automáticamente los gastos contabilizados.",
    "Sem comparação": "Sin comparación",
    "Igual ao mês anterior": "Igual que el mes anterior",
    "{amount} face ao mês anterior": "{amount} respecto al mes anterior",
    "Estado do mês": "Estado del mes",
    "Orçamento acompanhado": "Presupuesto supervisado",
    "Utilização do orçamento acompanhado": "Uso del presupuesto supervisado",
    "{percent}% utilizado": "{percent}% utilizado",
    "Definir limites": "Definir límites",
    Distribuição: "Distribución",
    "Por categoria": "Por categoría",
    "Requer atenção": "Requiere atención",
    "Uma categoria ultrapassou o limite ou o ritmo previsto.":
      "Una categoría superó el límite o el ritmo previsto.",
    "{count} categorias ultrapassaram o limite ou o ritmo previsto.":
      "{count} categorías superaron el límite o el ritmo previsto.",
    "A acompanhar": "A vigilar",
    "Uma categoria está acima do ritmo habitual.":
      "Una categoría está por encima del ritmo habitual.",
    "{count} categorias estão acima do ritmo habitual.":
      "{count} categorías están por encima del ritmo habitual.",
    "Mês sob controlo": "Mes bajo control",
    "Os limites definidos estão dentro do ritmo esperado.":
      "Los límites definidos están dentro del ritmo esperado.",
    "Defina um limite": "Define un límite",
    "Os orçamentos tornam os sinais deste mês mais úteis.":
      "Los presupuestos hacen más útiles las señales de este mes.",
  },
} satisfies Record<AppLocale, Messages>;

/** Stable keys for newly migrated UI. Phrase keys remain accepted while the
 * legacy screens are moved domain by domain. */
export type TranslationKey = keyof (typeof semanticMessages)["pt-PT"] | PageTranslationKey;
const semanticCatalogs: Record<AppLocale, Messages> = semanticMessages;

const catalogs: Record<AppLocale, Messages> = {
  "pt-PT": {
    ...Object.fromEntries([...Object.keys(en), ...Object.keys(es)].map((key) => [key, key])),
    ...pageMessages["pt-PT"],
  },
  "en-GB": { ...en, ...semanticMessages["en-GB"], ...pageMessages["en-GB"] },
  "es-ES": { ...es, ...semanticMessages["es-ES"], ...pageMessages["es-ES"] },
};

function interpolate(message: string, values?: Record<string, string | number>) {
  if (!values) return message;
  return message.replace(/\{(\w+)\}/g, (_, key: string) => String(values[key] ?? `{${key}}`));
}

function initialLocale(): AppLocale {
  if (typeof window === "undefined") return "pt-PT";
  const stored = window.localStorage.getItem(STORAGE_KEY);
  return supportedLocales.includes(stored as AppLocale) ? (stored as AppLocale) : "pt-PT";
}

interface I18nValue {
  locale: AppLocale;
  setLocale: (locale: AppLocale) => void;
  t: (source: TranslationKey | string, values?: Record<string, string | number>) => string;
  formatDate: (value: string | Date, options?: Intl.DateTimeFormatOptions) => string;
  formatNumber: (value: number, options?: Intl.NumberFormatOptions) => string;
  formatCurrency: (value: number, currency?: string) => string;
  plural: (
    count: number,
    forms: { one: string; other: string },
    values?: Record<string, string | number>,
  ) => string;
}

const fallbackValue: I18nValue = {
  locale: "pt-PT",
  setLocale: () => undefined,
  t: (source, values) => interpolate(semanticCatalogs["pt-PT"][source] ?? source, values),
  formatDate: (input, options) =>
    new Intl.DateTimeFormat("pt-PT", options).format(
      typeof input === "string" ? new Date(input) : input,
    ),
  formatNumber: (value, options) => new Intl.NumberFormat("pt-PT", options).format(value),
  formatCurrency: (value, currency = "EUR") =>
    new Intl.NumberFormat("pt-PT", { style: "currency", currency }).format(value),
  plural: (count, forms, values) =>
    interpolate(count === 1 ? forms.one : forms.other, { count, ...values }),
};

const I18nContext = createContext<I18nValue>(fallbackValue);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocale] = useState<AppLocale>(initialLocale);

  useEffect(() => {
    document.documentElement.lang = locale;
    window.localStorage.setItem(STORAGE_KEY, locale);
  }, [locale]);

  const value = useMemo<I18nValue>(
    () => ({
      locale,
      setLocale,
      t: (source, values) =>
        interpolate(
          catalogs[locale][source] ??
            semanticCatalogs[locale][source] ??
            semanticCatalogs["pt-PT"][source] ??
            source,
          values,
        ),
      formatDate: (input, options) =>
        new Intl.DateTimeFormat(locale, options).format(
          typeof input === "string" ? new Date(input) : input,
        ),
      formatNumber: (value, options) => new Intl.NumberFormat(locale, options).format(value),
      formatCurrency: (value, currency = "EUR") =>
        new Intl.NumberFormat(locale, { style: "currency", currency }).format(value),
      plural: (count, forms, values) =>
        interpolate(count === 1 ? forms.one : forms.other, { count, ...values }),
    }),
    [locale],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  return useContext(I18nContext);
}

export function LanguageSwitcher({ compact = false }: { compact?: boolean }) {
  const { locale, setLocale, t } = useI18n();
  return (
    <label className={`language-switcher${compact ? " language-switcher--compact" : ""}`}>
      <span className={compact ? "sr-only" : "language-switcher__label"}>
        {t("language.label")}
      </span>
      <select
        value={locale}
        onChange={(event) => setLocale(event.target.value as AppLocale)}
        aria-label={t("language.aria")}
      >
        <option value="pt-PT">PT</option>
        <option value="en-GB">EN</option>
        <option value="es-ES">ES</option>
      </select>
    </label>
  );
}
