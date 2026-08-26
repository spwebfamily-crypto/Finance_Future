import { useCallback, useEffect, useMemo, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { Link, useLocation } from "react-router-dom";
import {
  AlertTriangle,
  BookOpen,
  Building2,
  Clock3,
  ExternalLink,
  Globe2,
  Landmark,
  PiggyBank,
  Scale,
  ShieldAlert,
  Target,
  Wallet,
} from "lucide-react";
import { errorMessage } from "../api/client";
import { financialProfileApi } from "../api/resources";
import { useAuth } from "../auth/AuthContext";
import { PageHeader } from "../components/PageHeader";
import { NoticeToast } from "../components/NoticeToast";
import { ErrorState, LoadingState } from "../components/States";
import type { FinancialProfile } from "../types";
import { formatCurrency } from "../utils/format";

interface StudyExample {
  kind: "ETF UCITS" | "Ação individual";
  name: string;
  identifier: string;
  scope: string;
  risks: string;
  officialLabel: string;
  officialUrl: string;
}

interface PlatformReference {
  name: string;
  officialUrl: string;
}

const studyExamples: StudyExample[] = [
  {
    kind: "ETF UCITS",
    name: "Vanguard FTSE All-World UCITS ETF",
    identifier: "ISIN IE00BK5BQT80",
    scope: "Ações de mercados desenvolvidos e emergentes num único fundo indexado global.",
    risks:
      "Risco de mercado acionista, cambial, de mercados emergentes e de acompanhamento do índice. O capital não é garantido.",
    officialLabel: "Documentação Vanguard",
    officialUrl:
      "https://www.vanguard.co.uk/uk-fund-directory/product/etf/equity/9679/ftse-all-world-ucits",
  },
  {
    kind: "ETF UCITS",
    name: "iShares Core MSCI World UCITS ETF",
    identifier: "ISIN IE00B4L5Y983",
    scope:
      "Ações de grande e média capitalização em mercados desenvolvidos; não inclui mercados emergentes.",
    risks:
      "Risco de mercado acionista e cambial, com peso relevante dos Estados Unidos e das maiores empresas. O capital não é garantido.",
    officialLabel: "Documentação iShares",
    officialUrl:
      "https://www.ishares.com/uk/individual/en/products/251882/ishares-msci-world-ucits-etf-acc-fund",
  },
  {
    kind: "ETF UCITS",
    name: "iShares Core S&P 500 UCITS ETF",
    identifier: "ISIN IE00B5BMR087",
    scope: "Exposição a grandes empresas cotadas nos Estados Unidos através do índice S&P 500.",
    risks:
      "Concentração geográfica e cambial nos Estados Unidos, oscilações do mercado e concentração nas maiores empresas do índice.",
    officialLabel: "Documentação iShares",
    officialUrl:
      "https://www.ishares.com/uk/individual/en/products/253743/ishares-core-sp-500-ucits-etf",
  },
  {
    kind: "Ação individual",
    name: "Apple",
    identifier: "NASDAQ: AAPL",
    scope:
      "Participação numa única empresa de tecnologia e serviços, com resultados próprios e negociação em dólares.",
    risks:
      "Concentração numa empresa, ciclo de produtos, cadeia de fornecimento, regulação, avaliação de mercado e risco cambial.",
    officialLabel: "Relações com investidores da Apple",
    officialUrl: "https://investor.apple.com/investor-relations/default.aspx",
  },
  {
    kind: "Ação individual",
    name: "Alphabet",
    identifier: "NASDAQ: GOOGL / GOOG",
    scope:
      "Participação numa única empresa, com receitas muito expostas a publicidade digital e produtos tecnológicos.",
    risks:
      "Concentração numa empresa, regulação, concorrência, execução tecnológica, estrutura de voto e risco cambial.",
    officialLabel: "Relações com investidores da Alphabet",
    officialUrl: "https://abc.xyz/investor/",
  },
  {
    kind: "Ação individual",
    name: "Tesla",
    identifier: "NASDAQ: TSLA",
    scope:
      "Participação numa única empresa ligada a veículos elétricos, energia e tecnologia, negociada em dólares.",
    risks:
      "Volatilidade elevada, concorrência, capacidade de execução, avaliação de mercado, governação e risco cambial.",
    officialLabel: "Relações com investidores da Tesla",
    officialUrl: "https://ir.tesla.com/",
  },
];

const platforms: PlatformReference[] = [
  { name: "DEGIRO", officialUrl: "https://www.degiro.pt/" },
  { name: "IBKR", officialUrl: "https://www.interactivebrokers.ie/" },
  { name: "Revolut", officialUrl: "https://www.revolut.com/pt-PT/stock-trading/" },
  { name: "Trading 212", officialUrl: "https://www.trading212.com/pt" },
  { name: "XTB", officialUrl: "https://www.xtb.com/pt" },
];

const profileLabels = {
  goal: {
    emergency_fund: "Criar reserva",
    debt_repayment: "Reduzir dívidas",
    home_purchase: "Comprar casa",
    major_purchase: "Compra importante",
    education: "Formação",
    retirement: "Reforma",
    wealth_growth: "Crescer património",
    other: "Outro objetivo",
  },
  horizon: { short_term: "Até 3 anos", medium_term: "3 a 7 anos", long_term: "Mais de 7 anos" },
  risk: { conservative: "Conservador", moderate: "Moderado", aggressive: "Agressivo" },
} as const;

function finiteAmount(value: number) {
  return Number.isFinite(value) ? value : 0;
}

function formatMonths(value: number) {
  return new Intl.NumberFormat("pt-PT", {
    minimumFractionDigits: value < 10 ? 1 : 0,
    maximumFractionDigits: 1,
  }).format(value);
}

export function InvestmentsPage() {
  const { user } = useAuth();
  const location = useLocation();
  const reduceMotion = useReducedMotion();
  const [profile, setProfile] = useState<FinancialProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [notice, setNotice] = useState(
    () => (location.state as { notice?: string } | null)?.notice || "",
  );

  const loadProfile = useCallback(async () => {
    setIsLoading(true);
    setLoadError("");
    try {
      setProfile(await financialProfileApi.get());
    } catch (requestError) {
      setLoadError(errorMessage(requestError));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadProfile();
  }, [loadProfile]);

  useEffect(() => {
    if (!notice) return;
    const timeout = window.setTimeout(() => setNotice(""), 4500);
    return () => window.clearTimeout(timeout);
  }, [notice]);

  const context = useMemo(() => {
    if (!profile) return null;

    const income = finiteAmount(profile.monthlyNetIncome);
    const essentialCosts = finiteAmount(profile.monthlyEssentialCosts);
    const housingCosts = finiteAmount(profile.monthlyHousingCosts);
    const debtPayments = finiteAmount(profile.monthlyDebtPayments);
    const savings = finiteAmount(profile.currentSavings);
    const declaredCommitments = essentialCosts + housingCosts + debtPayments;

    return {
      income,
      debtPayments,
      savings,
      declaredCommitments,
      declaredMargin: income - declaredCommitments,
      reserveMinimum: declaredCommitments * 3,
      reserveUpperReference: declaredCommitments * 6,
      coverageMonths: declaredCommitments > 0 ? savings / declaredCommitments : null,
    };
  }, [profile]);

  const currency = user?.currency || "EUR";
  const learningFocus =
    profile?.experience === "none"
      ? "bases de risco, diversificação e custos"
      : profile?.horizon === "short_term"
        ? "liquidez e risco de usar ativos voláteis num prazo curto"
        : profile?.riskTolerance === "aggressive"
          ? "quedas históricas, concentração e capacidade real de suportar perdas"
          : "diversificação, custos totais e leitura do KID";

  return (
    <motion.div
      className="page invest-page"
      initial={reduceMotion ? false : { opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={reduceMotion ? undefined : { opacity: 0, y: -4 }}
      transition={reduceMotion ? { duration: 0 } : { duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
    >
      <NoticeToast message={notice} onClose={() => setNotice("")} />
      <PageHeader
        eyebrow="Educação financeira"
        title="Investir começa por compreender"
        description="Contexto, conceitos e fontes primárias para estudar com calma — sem sinais de compra nem promessas de retorno."
        action={
          <Link className="button button--secondary" to="/onboarding">
            {profile ? "Atualizar perfil" : "Preencher perfil"}
          </Link>
        }
      />

      <section className="invest-context-section" aria-labelledby="invest-context-title">
        <div className="invest-section-heading">
          <div>
            <p className="invest-kicker">Antes dos mercados</p>
            <h2 id="invest-context-title">O seu contexto declarado</h2>
          </div>
          <PiggyBank aria-hidden="true" />
        </div>

        {isLoading ? (
          <LoadingState label="A carregar o contexto financeiro" />
        ) : loadError ? (
          <ErrorState message={loadError} onRetry={() => void loadProfile()} />
        ) : context ? (
          <div className="invest-context">
            <div className="invest-context__profile" aria-label="Resumo do perfil financeiro">
              <span>
                <Target aria-hidden="true" />
                <small>Objetivo</small>
                <strong>{profileLabels.goal[profile!.goal]}</strong>
              </span>
              <span>
                <Clock3 aria-hidden="true" />
                <small>Horizonte</small>
                <strong>{profileLabels.horizon[profile!.horizon]}</strong>
              </span>
              <span>
                <Scale aria-hidden="true" />
                <small>Tolerância declarada</small>
                <strong>{profileLabels.risk[profile!.riskTolerance]}</strong>
              </span>
            </div>
            <p className="invest-context__focus">
              <BookOpen aria-hidden="true" />
              <span>
                <small>Próxima leitura educativa</small>
                <strong>{learningFocus}</strong>
              </span>
            </p>
            <dl className="invest-context__figures">
              <div>
                <dt>Compromissos declarados por mês</dt>
                <dd>
                  <span>{formatCurrency(context.declaredCommitments, currency)}</span>
                  <small>Essenciais, habitação e prestações de dívida.</small>
                </dd>
              </div>
              <div>
                <dt>Margem mensal declarada</dt>
                <dd>
                  <span>{formatCurrency(context.declaredMargin, currency)}</span>
                  <small>Antes de despesas variáveis, impostos adicionais e imprevistos.</small>
                </dd>
              </div>
              <div>
                <dt>Referência educativa de reserva</dt>
                <dd>
                  <span>
                    {formatCurrency(context.reserveMinimum, currency)} –{" "}
                    {formatCurrency(context.reserveUpperReference, currency)}
                  </span>
                  <small>Equivale matematicamente a 3–6 meses dos compromissos declarados.</small>
                </dd>
              </div>
              <div>
                <dt>Poupança declarada</dt>
                <dd>
                  <span>{formatCurrency(context.savings, currency)}</span>
                  <small>
                    {context.coverageMonths === null
                      ? "Sem base mensal suficiente para estimar cobertura."
                      : `Corresponde a cerca de ${formatMonths(context.coverageMonths)} meses, se estivesse toda disponível para reserva.`}
                  </small>
                </dd>
              </div>
            </dl>
            <p className="invest-context__note">
              Estes valores são uma leitura aritmética do que declarou, não uma avaliação da sua
              situação. Uma margem positiva pode não estar disponível para investir e a reserva
              adequada varia com estabilidade de rendimento, agregado e acesso a liquidez.
            </p>
          </div>
        ) : (
          <div className="invest-context invest-context--empty">
            <Wallet aria-hidden="true" />
            <div>
              <h3>Falta o contexto financeiro</h3>
              <p>
                Quando preencher o perfil, esta área mostra apenas referências de reserva e margem
                com base nos valores declarados. O conteúdo educativo abaixo continua disponível.
              </p>
              <Link className="button button--primary button--small" to="/onboarding">
                Criar contexto financeiro
              </Link>
            </div>
          </div>
        )}
      </section>

      <section className="invest-path-section" aria-labelledby="invest-path-title">
        <div className="invest-section-heading">
          <div>
            <p className="invest-kicker">Sequência prudente</p>
            <h2 id="invest-path-title">Reserva, dívida, aprendizagem</h2>
          </div>
          <Landmark aria-hidden="true" />
        </div>
        <ol className="invest-path">
          <li className="invest-path__item">
            <span className="invest-path__number" aria-hidden="true">
              01
            </span>
            <div className="invest-path__icon">
              <PiggyBank aria-hidden="true" />
            </div>
            <div>
              <h3>Perceber a reserva</h3>
              <p>
                Use o intervalo de 3–6 meses apenas como simulação para estudar a sua liquidez, não
                como meta automática. Importam a estabilidade do rendimento, o agregado e quem
                depende desse dinheiro.
              </p>
            </div>
          </li>
          <li className="invest-path__item">
            <span className="invest-path__number" aria-hidden="true">
              02
            </span>
            <div className="invest-path__icon">
              <Scale aria-hidden="true" />
            </div>
            <div>
              <h3>Mapear a dívida</h3>
              <p>
                {context && context.debtPayments > 0
                  ? `Declarou ${formatCurrency(context.debtPayments, currency)} em prestações mensais. A prestação, por si só, não revela juros, TAEG, prazo ou custo total.`
                  : "Compare juros, TAEG, prazo, penalizações e custo total de cada dívida. A prestação mensal isolada não mostra o encargo completo."}
              </p>
            </div>
          </li>
          <li className="invest-path__item">
            <span className="invest-path__number" aria-hidden="true">
              03
            </span>
            <div className="invest-path__icon">
              <BookOpen aria-hidden="true" />
            </div>
            <div>
              <h3>Aprender antes de decidir</h3>
              <p>
                Estude risco, diversificação, custos, fiscalidade, horizonte e documentos legais. Só
                depois compare produtos e intermediários autorizados.
              </p>
            </div>
          </li>
        </ol>
      </section>

      <section className="invest-study-section" aria-labelledby="invest-study-title">
        <div className="invest-section-heading">
          <div>
            <p className="invest-kicker">Laboratório de leitura</p>
            <h2 id="invest-study-title">Exemplos concretos para estudar</h2>
            <p>
              Servem para praticar a leitura de índices, KID, prospetos, relatórios e riscos. A
              presença nesta lista não é uma seleção favorável nem uma lista de compra.
            </p>
          </div>
          <Globe2 aria-hidden="true" />
        </div>

        <div className="invest-example-list">
          {studyExamples.map((example) => (
            <article className="invest-example" key={example.name}>
              <div className="invest-example__identity">
                <span className="invest-example__kind">{example.kind}</span>
                <h3>{example.name}</h3>
                <p className="invest-example__identifier">{example.identifier}</p>
              </div>
              <div className="invest-example__reading">
                <p>{example.scope}</p>
                <p className="invest-example__risk">
                  <AlertTriangle aria-hidden="true" />
                  <span>
                    <strong>Riscos a investigar:</strong> {example.risks}
                  </span>
                </p>
              </div>
              <a
                className="invest-official-link"
                href={example.officialUrl}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`${example.officialLabel}, abre numa nova janela`}
              >
                {example.officialLabel}
                <ExternalLink aria-hidden="true" />
              </a>
            </article>
          ))}
        </div>
      </section>

      <section className="invest-platforms-section" aria-labelledby="invest-platforms-title">
        <div className="invest-section-heading">
          <div>
            <p className="invest-kicker">Intermediários</p>
            <h2 id="invest-platforms-title">Plataformas a comparar</h2>
            <p>
              Lista alfabética, sem classificação. Confirme sempre a entidade com que contrata, o
              país de supervisão e a tabela de preços atual.
            </p>
          </div>
          <Building2 aria-hidden="true" />
        </div>

        <div className="invest-product-warning" role="note">
          <AlertTriangle aria-hidden="true" />
          <p>
            <strong>Confirme o produto antes de dar uma ordem.</strong> Comprar uma ação ou ETF
            real, comprar uma fração e negociar um CFD alavancado são operações diferentes. Um CFD
            não lhe dá a propriedade do ativo subjacente e a alavancagem pode amplificar perdas.{" "}
            <a
              href="https://www.esma.europa.eu/investor-corner/product-intervention"
              target="_blank"
              rel="noopener noreferrer"
            >
              Ver as medidas de proteção da ESMA <ExternalLink aria-hidden="true" />
            </a>
          </p>
        </div>

        <ul className="invest-platform-list">
          {platforms.map((platform) => (
            <li key={platform.name}>
              <a
                className="invest-platform"
                href={platform.officialUrl}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`${platform.name}, site oficial, abre numa nova janela`}
              >
                <span className="invest-platform__wordmark">{platform.name}</span>
                <span className="invest-platform__action">
                  Site oficial <ExternalLink aria-hidden="true" />
                </span>
              </a>
            </li>
          ))}
        </ul>

        <div className="invest-comparison">
          <h3>Compare nos documentos oficiais</h3>
          <ul>
            <li>Autorização, entidade contratante e proteção aplicável ao cliente.</li>
            <li>Comissões de negociação, câmbio, custódia, inatividade e transferência.</li>
            <li>
              Propriedade dos ativos, ações fracionadas, empréstimo de títulos e disponibilidade por
              bolsa.
            </li>
            <li>
              Se a ordem compra o ativo real ou um derivado, como um CFD, e se existe alavancagem.
            </li>
            <li>
              Execução de ordens, apoio ao cliente, documentos fiscais e processo de reclamação.
            </li>
          </ul>
        </div>
      </section>

      <section className="invest-sources-section" aria-labelledby="invest-sources-title">
        <div className="invest-section-heading">
          <div>
            <p className="invest-kicker">Fontes primárias</p>
            <h2 id="invest-sources-title">Continue a aprendizagem</h2>
          </div>
          <BookOpen aria-hidden="true" />
        </div>
        <div className="invest-source-list">
          <a
            className="invest-source"
            href="https://www.investor.gov/introduction-investing/investing-basics/save-and-invest/save-rainy-day"
            target="_blank"
            rel="noopener noreferrer"
          >
            <span>Investor.gov</span>
            <strong>Poupança disponível para imprevistos</strong>
            <small>
              Uma referência educativa sobre liquidez de emergência; não define um valor universal
              para cada agregado.
            </small>
            <ExternalLink aria-hidden="true" />
          </a>
          <a
            className="invest-source"
            href="https://www.investor.gov/introduction-investing/investing-basics/save-and-invest/diversify-your-investments"
            target="_blank"
            rel="noopener noreferrer"
          >
            <span>Investor.gov</span>
            <strong>Diversificação e os seus limites</strong>
            <small>
              Diversificar pode reduzir concentração, mas não elimina perdas de mercado.
            </small>
            <ExternalLink aria-hidden="true" />
          </a>
          <a
            className="invest-source"
            href="https://www.esma.europa.eu/investor-corner/cost-investment-products"
            target="_blank"
            rel="noopener noreferrer"
          >
            <span>ESMA</span>
            <strong>Custos dos produtos de investimento</strong>
            <small>
              Como comissões e outros encargos afetam o resultado do investidor ao longo do tempo.
            </small>
            <ExternalLink aria-hidden="true" />
          </a>
        </div>
      </section>

      <aside className="invest-disclaimer" aria-labelledby="invest-disclaimer-title">
        <ShieldAlert aria-hidden="true" />
        <div>
          <h2 id="invest-disclaimer-title">Informação educativa, não aconselhamento</h2>
          <p>
            <strong>
              Esta página não recomenda, classifica ou dá ordens para comprar, vender ou manter
              qualquer ativo.
            </strong>{" "}
            Não avalia a adequação de um produto à sua situação e não substitui aconselhamento
            financeiro, jurídico ou fiscal prestado por profissionais habilitados.
          </p>
          <p>
            Investimentos podem perder valor, gerar perdas parciais ou totais e ter custos,
            impostos, risco cambial e restrições de liquidez. Leia o KID, o prospeto, os relatórios
            e a tabela de preços; confirme a autorização do intermediário antes de tomar qualquer
            decisão.
          </p>
        </div>
      </aside>
    </motion.div>
  );
}
