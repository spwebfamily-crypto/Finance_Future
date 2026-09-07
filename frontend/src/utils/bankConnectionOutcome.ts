const errorMessages: Record<string, string> = {
  cancelled: "A autorização foi cancelada no banco. Nenhuma ligação foi criada.",
  expired: "A autorização expirou. Inicie novamente a ligação ao banco.",
  rate_limited: "O banco recebeu demasiados pedidos. Aguarde alguns minutos e tente novamente.",
  provider_unavailable: "O serviço do banco está temporariamente indisponível. Tente novamente.",
  institution_unavailable: "Este banco já não está disponível para ligação neste momento.",
  invalid_state: "Não foi possível validar esta autorização. Inicie novamente a ligação.",
  replayed: "Esta autorização já foi utilizada. Inicie uma nova ligação ao banco.",
};

export function bankConnectionOutcomeMessage(outcome: string, reason = "") {
  if (outcome === "success") {
    return "Banco ligado. A primeira sincronização começou — os gastos contabilizados passam a despesas.";
  }
  return errorMessages[reason] ?? "Não foi possível concluir a ligação ao banco. Tente novamente.";
}
