import {
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  Check,
  Landmark,
  LockKeyhole,
  Menu,
  ReceiptText,
  Sparkles,
  X,
} from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { Brand } from "../components/Brand";
import { GradientWaveText } from "../components/GradientWaveText";
import { ScrollStoryPortal } from "../components/ScrollStoryPortal";
import { ThemeToggle } from "../components/ThemeToggle";
import { TiltCard } from "../components/TiltCard";
import { Gauge } from "../components/ui/gauge-1";
import SpinningBorderButton from "../components/ui/spinning-border-button";
import { liveAppUrl } from "../config/liveApp";
import { LanguageSwitcher, useI18n } from "../i18n/I18nContext";

const features = [
  {
    icon: ReceiptText,
    number: "01",
    title: "Tudo o que saiu, junto.",
    text: "Escreva, importe ou fotografe o comprovativo. O arquivo fica simples de reler.",
  },
  {
    icon: Landmark,
    number: "02",
    title: "O banco entra. Você decide.",
    text: "Ligue as contas em modo de leitura. A palavra-passe nunca passa por aqui.",
  },
  {
    icon: Sparkles,
    number: "03",
    title: "Um plano que cabe no mês.",
    text: "Veja limites, compromissos e o que ainda pode gastar — sem ruído.",
  },
] as const;

const registerHref = liveAppUrl("/register");
const loginHref = liveAppUrl("/login");
const privacyHref = liveAppUrl("/privacy");

export function LandingPage() {
  const { t } = useI18n();
  const [menuOpen, setMenuOpen] = useState(false);
  const primaryLabel = t("Começar grátis");
  const closingLabel = t("Criar conta grátis");

  return (
    <main className="landing-page">
      <a className="skip-link" href="#landing-content">
        {t("Saltar para o conteúdo")}
      </a>

      <header className="landing-nav" aria-label={t("Navegação principal")}>
        <Link to="/" className="brand-link" aria-label={t("Página inicial ExpenseSnap")}>
          <Brand linked={false} />
        </Link>
        <nav
          className={`landing-nav__links ${menuOpen ? "is-open" : ""}`}
          aria-label={t("Navegação da página")}
        >
          <a href="#como-funciona" onClick={() => setMenuOpen(false)}>
            {t("Como funciona")}
          </a>
          <a href="#privacidade" onClick={() => setMenuOpen(false)}>
            {t("Privacidade")}
          </a>
        </nav>
        <div className="landing-nav__actions">
          <ThemeToggle compact />
          <LanguageSwitcher compact />
          <a
            className="button button--secondary landing-nav__login"
            href={loginHref}
            rel="noreferrer"
          >
            {t("Entrar")}
          </a>
          <a className="button button--primary" href={registerHref} rel="noreferrer">
            {t("Começar")} <ArrowRight aria-hidden="true" />
          </a>
          <button
            className="landing-nav__menu"
            type="button"
            aria-expanded={menuOpen}
            aria-label={menuOpen ? t("Fechar menu") : t("Abrir menu")}
            onClick={() => setMenuOpen((open) => !open)}
          >
            {menuOpen ? <X aria-hidden="true" /> : <Menu aria-hidden="true" />}
          </button>
        </div>
      </header>

      <div id="landing-content">
        <ScrollStoryPortal
          ariaLabel={t("Da visão geral ao painel da aplicação")}
          hint={t("Deslize para ver o painel")}
          actionLabel={t("Ver o produto")}
          front={
            <section className="landing-hero" aria-labelledby="landing-title">
              <p className="landing-kicker">
                <span aria-hidden="true" /> {t("Finanças pessoais, sem ruído")}
              </p>
              <h1 id="landing-title">
                {t("Para onde vai o seu dinheiro?")}
                <GradientWaveText
                  className="landing-hero__accent"
                  ariaLabel={t("Agora consegue ver.")}
                  colors={["var(--brand)", "var(--brand-dark)", "var(--chart-3)", "var(--brand)"]}
                >
                  {t("Agora consegue ver.")}
                </GradientWaveText>
              </h1>
              <div className="landing-hero__footer">
                <p>
                  {t(
                    "Contas, gastos e orçamento no mesmo sítio. Confirme o que mudou e planeie o mês com calma.",
                  )}
                </p>
                <SpinningBorderButton
                  className="landing-hero__cta"
                  href={registerHref}
                  ariaLabel={primaryLabel}
                >
                  {primaryLabel}
                </SpinningBorderButton>
                <p className="landing-hero__note">
                  {t("Sem cartão. Pode ligar o banco só em leitura.")}
                </p>
              </div>
            </section>
          }
        >
          <div className="landing-story-reveal">
            <div className="landing-story-reveal__copy">
              <p className="landing-kicker landing-kicker--story">
                <span aria-hidden="true" /> {t("O painel, à vista")}
              </p>
              <h2>{t("Hoje, o mês e o que ainda pode gastar.")}</h2>
              <p>
                {t(
                  "O essencial aparece numa só vista, para perceber o que mudou antes de decidir.",
                )}
              </p>
              <ul>
                <li>
                  <Check aria-hidden="true" /> {t("Resultado do dia imediatamente visível")}
                </li>
                <li>
                  <Check aria-hidden="true" /> {t("Categorias comparáveis sem ruído")}
                </li>
                <li>
                  <Check aria-hidden="true" /> {t("Limites traduzidos em valor disponível")}
                </li>
              </ul>
            </div>

            <TiltCard
              className="landing-ledger"
              aria-label={t("Exemplo do painel financeiro")}
              tiltLimit={3.5}
              scale={1.004}
              spotlight
            >
              <div className="landing-ledger__top">
                <span>{t("Visão mensal")}</span>
                <span>{t("Dados ilustrativos")}</span>
              </div>
              <div className="landing-ledger__grid">
                <div className="landing-ledger__summary">
                  <div className="landing-ledger__balance">
                    <small>{t("Total de despesas em setembro")}</small>
                    <strong>€ 1.284,30</strong>
                    <span className="landing-ledger__change">
                      <ArrowDownRight aria-hidden="true" /> 12,6% {t("menos do que em agosto")}
                    </span>
                  </div>
                  <div className="landing-ledger__today">
                    <p>{t("Movimento de hoje")}</p>
                    <div>
                      <span>
                        <ArrowUpRight aria-hidden="true" />
                        <small>{t("Entradas")}</small>
                        <strong>+ € 850,00</strong>
                      </span>
                      <span>
                        <ArrowDownRight aria-hidden="true" />
                        <small>{t("Saídas")}</small>
                        <strong>− € 42,80</strong>
                      </span>
                    </div>
                  </div>
                </div>
                <div className="landing-ledger__gauge">
                  <Gauge
                    value={81}
                    size={200}
                    gradient
                    primary="success"
                    tickMarks
                    label={t("Orçamento utilizado")}
                    transition={{ length: 1200, delay: 200 }}
                  />
                  <p>
                    <strong>{t("€ 316,40 disponíveis")}</strong>
                    <small>{t("até ao limite definido para o mês")}</small>
                  </p>
                </div>
              </div>
              <div className="landing-ledger__categories">
                <span>
                  <i style={{ width: "72%" }} />
                  <small>{t("Casa")}</small>
                  <strong>72%</strong>
                </span>
                <span>
                  <i style={{ width: "58%" }} />
                  <small>{t("Alimentação")}</small>
                  <strong>58%</strong>
                </span>
                <span>
                  <i style={{ width: "43%" }} />
                  <small>{t("Transportes")}</small>
                  <strong>43%</strong>
                </span>
              </div>
            </TiltCard>
          </div>
        </ScrollStoryPortal>

        <section className="landing-features" id="como-funciona" aria-labelledby="features-title">
          <div className="landing-section-heading">
            <p className="eyebrow">{t("Três gestos. Uma rotina.")}</p>
            <h2 id="features-title">{t("Do comprovativo à decisão.")}</h2>
          </div>
          <div className="landing-feature-grid">
            {features.map(({ icon: Icon, number, title, text }) => (
              <TiltCard key={number} className="landing-feature-card" tiltLimit={5} scale={1.008}>
                <div className="landing-feature-card__top">
                  <span>{number}</span>
                  <span className="landing-feature-card__icon">
                    <Icon aria-hidden="true" />
                  </span>
                </div>
                <h3>{t(title)}</h3>
                <p>{t(text)}</p>
              </TiltCard>
            ))}
          </div>
        </section>

        <section className="landing-trust" id="privacidade" aria-labelledby="trust-title">
          <div className="landing-trust__mark" aria-hidden="true">
            <LockKeyhole />
          </div>
          <div>
            <p className="eyebrow">{t("Privacidade à partida")}</p>
            <h2 id="trust-title">{t("Os seus dados continuam seus.")}</h2>
          </div>
          <p>
            {t(
              "A ligação ao banco é só de leitura. A palavra-passe nunca passa por aqui. Desliga quando quiser.",
            )}
          </p>
        </section>

        <section className="landing-closing" aria-labelledby="closing-title">
          <p className="eyebrow">{t("Comece hoje")}</p>
          <h2 id="closing-title">{t("Menos contas na cabeça. Mais clareza no mês.")}</h2>
          <SpinningBorderButton href={registerHref} ariaLabel={closingLabel}>
            {closingLabel}
          </SpinningBorderButton>
        </section>
      </div>

      <footer className="landing-footer">
        <Brand linked={false} compact />
        <span>© {new Date().getFullYear()} ExpenseSnap</span>
        <a href={privacyHref} rel="noreferrer">
          {t("Privacidade")}
        </a>
      </footer>
    </main>
  );
}
