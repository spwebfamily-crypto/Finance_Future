/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

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
  Pendente: "Pending",
  Categoria: "Category",
  "Não contar como despesa": "Do not count as an expense",
  "Conta ligada ao banco": "Bank-connected account",
  "Conta manual": "Manual account",
  "Cada gasto contabilizado entra nas despesas. Pendentes e transferências próprias ficam de fora.":
    "Each booked outgoing transaction becomes an expense. Pending items and internal transfers are excluded.",
  "Saldo e movimentos desta conta.": "Balance and activity for this account.",
  Voltar: "Back",
  "Histórico da conta": "Account activity",
  "Débitos contabilizados aparecem em Despesas. Use a categoria para os organizar, ou exclua o que não quiser contar.":
    "Booked debits appear in Expenses. Use categories to organise them, or exclude items you do not want to count.",
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
  Pendente: "Pendiente",
  Categoria: "Categoría",
  "Não contar como despesa": "No contar como gasto",
  "Conta ligada ao banco": "Cuenta conectada al banco",
  "Conta manual": "Cuenta manual",
  "Cada gasto contabilizado entra nas despesas. Pendentes e transferências próprias ficam de fora.":
    "Cada cargo contabilizado se convierte en gasto. Los pendientes y transferencias internas quedan fuera.",
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

const catalogs: Record<AppLocale, Messages> = { "pt-PT": {}, "en-GB": en, "es-ES": es };

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
  t: (source: string, values?: Record<string, string | number>) => string;
  formatDate: (value: string | Date, options?: Intl.DateTimeFormatOptions) => string;
}

const fallbackValue: I18nValue = {
  locale: "pt-PT",
  setLocale: () => undefined,
  t: (source, values) => interpolate(source, values),
  formatDate: (input, options) =>
    new Intl.DateTimeFormat("pt-PT", options).format(
      typeof input === "string" ? new Date(input) : input,
    ),
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
      t: (source, values) => interpolate(catalogs[locale][source] ?? source, values),
      formatDate: (input, options) =>
        new Intl.DateTimeFormat(locale, options).format(
          typeof input === "string" ? new Date(input) : input,
        ),
    }),
    [locale],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  return useContext(I18nContext);
}

export function LanguageSwitcher({ compact = false }: { compact?: boolean }) {
  const { locale, setLocale } = useI18n();
  return (
    <label className={`language-switcher${compact ? " language-switcher--compact" : ""}`}>
      <span className={compact ? "sr-only" : "language-switcher__label"}>Idioma</span>
      <select
        value={locale}
        onChange={(event) => setLocale(event.target.value as AppLocale)}
        aria-label="Idioma / Language / Idioma"
      >
        <option value="pt-PT">PT</option>
        <option value="en-GB">EN</option>
        <option value="es-ES">ES</option>
      </select>
    </label>
  );
}
