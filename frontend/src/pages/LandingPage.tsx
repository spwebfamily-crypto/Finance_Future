import { motion, useReducedMotion } from "framer-motion";
import {
  BarChart3,
  Check,
  CirclePlus,
  Home,
  Landmark,
  ListChecks,
  LockKeyhole,
  Menu,
  ReceiptText,
  ScanLine,
  ShieldCheck,
  Sparkles,
  Target,
  WalletCards,
  X,
} from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { Brand } from "../components/Brand";
import AnimatedGradient from "../components/ui/animated-gradient";
import { GradientWaveText } from "../components/ui/gradient-wave-text";
import { IPhoneMockup } from "../components/ui/iphone-mockup";
import Rays from "../components/ui/light-rays";
import { AntiMetalButton } from "../components/ui/anti-metal-button";
import { GlyphPortal } from "../components/ui/glyph-portal";
import { liveAppUrl } from "../config/liveApp";
import { LanguageSwitcher, useI18n } from "../i18n/I18nContext";

const movements = [
  ["Continente", "Supermercado", "− 42,80 €", "mist"],
  ["CP", "Transportes", "− 18,20 €", "blue"],
  ["Delta Cafés", "Restauração", "− 3,10 €", "rose"],
] as const;

const registerHref = liveAppUrl("/register");
const loginHref = liveAppUrl("/login");
const privacyHref = liveAppUrl("/privacy");

function Reveal({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <motion.div className={className}>{children}</motion.div>;
}

function ProductPreview() {
  const { t } = useI18n();
  const reduced = useReducedMotion();
  return (
    <motion.div
      className="landing-product"
      initial={reduced ? false : { opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: reduced ? 0 : 0.14, duration: reduced ? 0 : 0.54 }}
      aria-label={t("Exemplo da revisão rápida do ExpenseSnap")}
    >
      <div className="landing-product__topline">
        <span><i aria-hidden="true" /> {t("Hoje")}</span>
        <span className="landing-product__synced"><Check aria-hidden="true" /> {t("Sincronizado")}</span>
      </div>
      <div className="landing-product__summary">
        <span>{t("Disponível nas contas")}</span>
        <strong>2.487,60 €</strong>
        <small>{t("Atualizado agora")}</small>
      </div>
      <div className="landing-product__review">
        <div><span className="landing-product__eyebrow">{t("Revisão rápida")}</span><strong>{t("3 gastos para confirmar")}</strong></div>
        <span className="landing-product__count">03</span>
      </div>
      <div className="landing-product__movements">
        {movements.map(([merchant, category, amount, tone], index) => (
          <motion.div
            className="landing-movement"
            key={merchant}
            initial={reduced ? false : { opacity: 0, x: 12 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: reduced ? 0 : 0.32 + index * 0.08 }}
          >
            <span className={`landing-movement__dot landing-movement__dot--${tone}`} aria-hidden="true" />
            <span><strong>{merchant}</strong><small>{t(category)}</small></span>
            <b>{amount}</b>
          </motion.div>
        ))}
      </div>
      <div className="landing-product__footer"><span>{t("2 de 3 classificações sugeridas")}</span><span aria-hidden="true">→</span></div>
    </motion.div>
  );
}

function DashboardStory() {
  const { t } = useI18n();
  return (
    <div className="landing-dashboard" aria-label={t("Exemplo ilustrativo da visão financeira")}>
      <div className="landing-dashboard__header">
        <div><span>{t("Visão geral")}</span><strong>{t("Bom dia, Marta")}</strong></div>
        <span>{t("Setembro")}</span>
      </div>
      <div className="landing-dashboard__today">
        <div><span>{t("Entradas hoje")}</span><strong className="is-positive">+ 1.850 €</strong></div>
        <div><span>{t("Saídas hoje")}</span><strong>− 64,10 €</strong></div>
        <div><span>{t("Resultado")}</span><strong className="is-positive">+ 1.785,90 €</strong></div>
      </div>
      <div className="landing-dashboard__grid">
        <div className="landing-dashboard__chart">
          <span>{t("Despesas por categoria")}</span>
          <div><i style={{ width: "82%" }} /><b>{t("Casa")}</b><small>620 €</small></div>
          <div><i style={{ width: "57%" }} /><b>{t("Alimentação")}</b><small>428 €</small></div>
          <div><i style={{ width: "31%" }} /><b>{t("Transportes")}</b><small>234 €</small></div>
        </div>
        <div className="landing-dashboard__plan">
          <span>{t("Plano do mês")}</span><strong>68%</strong><div><i /></div><small>{t("1.020 € ainda disponíveis")}</small>
        </div>
      </div>
      <p>{t("Dados ilustrativos para apresentar o produto.")}</p>
    </div>
  );
}

function MobileDashboardPreview() {
  const { t } = useI18n();
  return (
    <IPhoneMockup model="15-pro" color="#527d79" scale={0.72} shadow={false} innerShadow={false} screenBg="#011d1c" ariaLabel={t("Pré-visualização do dashboard do ExpenseSnap num iPhone")}>
      <div className="mobile-dashboard-shot">
        <div className="mobile-dashboard-shot__topbar"><img src="/brand-mark.svg" alt="" /><span>{t("Hoje")}</span><span className="mobile-dashboard-shot__avatar" aria-hidden="true">R</span></div>
        <div className="mobile-dashboard-shot__welcome"><small>{t("Bom dia, Rita")}</small><strong>{t("O seu mês está no caminho certo.")}</strong></div>
        <article className="mobile-dashboard-shot__balance">
          <span>{t("Disponível até ao fim do mês")}</span><strong>€ 1.246,80</strong><small>{t("depois de contas e objetivos")}</small>
          <div><span><small>{t("Entrou")}</small><strong>€ 2.850</strong></span><span><small>{t("Saiu")}</small><strong>€ 1.284</strong></span></div>
        </article>
        <div className="mobile-dashboard-shot__section-title"><strong>{t("Orçamento")}</strong><span>81%</span></div>
        <div className="mobile-dashboard-shot__budget" role="progressbar" aria-label={t("Orçamento mensal utilizado")} aria-valuemin={0} aria-valuemax={100} aria-valuenow={81}><span /></div>
        <div className="mobile-dashboard-shot__section-title"><strong>{t("Últimos movimentos")}</strong><span>{t("Ver todos")}</span></div>
        <div className="mobile-dashboard-shot__transactions">
          <div><span className="mobile-dashboard-shot__transaction-icon"><ReceiptText aria-hidden="true" /></span><span><strong>{t("Supermercado")}</strong><small>{t("Hoje · Alimentação")}</small></span><strong>− € 42,80</strong></div>
          <div><span className="mobile-dashboard-shot__transaction-icon"><Landmark aria-hidden="true" /></span><span><strong>{t("Transferência recebida")}</strong><small>{t("Hoje · Conta principal")}</small></span><strong className="is-positive">+ € 850,00</strong></div>
        </div>
        <nav className="mobile-dashboard-shot__nav" aria-label={t("Navegação demonstrativa")}>
          <span className="is-active"><Home aria-hidden="true" />{t("Hoje")}</span><span><ListChecks aria-hidden="true" />{t("Movimentos")}</span><span className="mobile-dashboard-shot__add" aria-label={t("Adicionar movimento")}><CirclePlus aria-hidden="true" /></span><span><WalletCards aria-hidden="true" />{t("Contas")}</span><span><Sparkles aria-hidden="true" />{t("Plano")}</span>
        </nav>
      </div>
    </IPhoneMockup>
  );
}

export function LandingPage() {
  const { t } = useI18n();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!menuOpen) return;

    const closeWithEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setMenuOpen(false);
      menuButtonRef.current?.focus();
    };

    document.addEventListener("keydown", closeWithEscape);
    return () => document.removeEventListener("keydown", closeWithEscape);
  }, [menuOpen]);

  const closeMenu = () => setMenuOpen(false);

  return (
    <main className="landing-page landing-page--product-led">
      <a className="skip-link" href="#landing-content">{t("Saltar para o conteúdo")}</a>
      <header className="landing-nav" aria-label={t("Navegação principal")}>
        <Link className="landing-nav__brand" to="/" aria-label={t("Página inicial ExpenseSnap")}><Brand linked={false} /></Link>
        <nav id="landing-navigation" className={`landing-nav__links ${menuOpen ? "is-open" : ""}`} aria-label={t("Navegação da página")}>
          <a href="#como-funciona" onClick={closeMenu}>{t("Como funciona")}</a><a href="#produto" onClick={closeMenu}>{t("Produto")}</a><a href="#mobile" onClick={closeMenu}>{t("Mobile")}</a><a href="#privacidade" onClick={closeMenu}>{t("Privacidade")}</a>
        </nav>
        <div className="landing-nav__actions">
          <LanguageSwitcher compact /><a className="button button--secondary landing-nav__login" href={loginHref} rel="noreferrer">{t("Entrar")}</a><AntiMetalButton className="landing-nav__cta" href={registerHref} label={t("Experimentar")} />
          <button ref={menuButtonRef} className="landing-nav__menu" type="button" aria-controls="landing-navigation" aria-expanded={menuOpen} aria-label={menuOpen ? t("Fechar menu") : t("Abrir menu")} onClick={() => setMenuOpen((open) => !open)}>{menuOpen ? <X aria-hidden="true" /> : <Menu aria-hidden="true" />}</button>
        </div>
      </header>

      <div id="landing-content">
        <GlyphPortal
          className="landing-glyph-hero"
          word="EXPENSESNAP"
          scrollLength={2.3}
          enterLabel={t("Entrar na secção")}
          enterHint={t("Deslize para entrar")}
          chooseLetterLabel={t("Escolha uma letra")}
          ariaLabel={t("Portal visual do ExpenseSnap")}
          fontFamily="var(--font-display), Arial, sans-serif"
          background={
            <>
              <AnimatedGradient
                className="landing-hero__animated-gradient"
                config={{
                  preset: "custom",
                  color1: "#1b1d16",
                  color2: "#103f32",
                  color3: "#718d34",
                  rotation: -42,
                  proportion: 24,
                  scale: 0.38,
                  speed: 10,
                  distortion: 8,
                  swirl: 34,
                  swirlIterations: 4,
                  softness: 90,
                  offset: -8,
                  shape: "Edge",
                  shapeSize: 48,
                }}
                noise={{ opacity: 0.04, scale: 0.7 }}
              />
              <Rays
                className="landing-hero__rays"
                intensity={11}
                rays={24}
                reach={26}
                position={74}
                backgroundColor="transparent"
                animation={{ animate: true, speed: 2.5 }}
                raysColor={{ mode: "multi", color1: "#bbf451", color2: "#198266" }}
              />
              <div className="landing-hero__signal" aria-hidden="true"><i /><i /><i /><i /><i /></div>
            </>
          }
          front={
            <div className="landing-glyph-hero__front">
              <Brand linked={false} compact />
              <p className="landing-kicker"><Sparkles aria-hidden="true" /> {t("Finanças pessoais, sem ruído")}</p>
              <p>{t("Uma nova forma de organizar o dinheiro.")}</p>
            </div>
          }
        >
          <div className="landing-portal-reveal">
            <div className="landing-portal-reveal__copy">
              <p className="landing-kicker"><Sparkles aria-hidden="true" /> {t("Finanças pessoais, sem ruído")}</p>
              <h1 id="landing-title"><GradientWaveText className="landing-hero__wave" speed={0.45} repeat inView customColors={["#f4f5ed", "#dceab7", "#bbf451", "#198266", "#bbf451", "#f4f5ed"]} ariaLabel={`${t("Saiba para onde vai o seu dinheiro.")} ${t("Decida o que vem a seguir.")}`}>{t("Saiba para onde vai o seu dinheiro.")}<br />{t("Decida o que vem a seguir.")}</GradientWaveText></h1>
              <p>{t("Contas, movimentos e orçamento numa vista simples. Sincronize quando quiser, confirme o que importa e planeie o mês sem folhas de cálculo.")}</p>
              <div className="landing-hero__actions"><AntiMetalButton className="landing-button--large" href={registerHref} label={t("Começar grátis")} /><a className="button button--secondary landing-button--large" href="#produto">{t("Explorar o produto")}</a></div>
              <small>{t("Sem cartão. Comece ao seu ritmo.")}</small>
            </div>
            <div className="landing-portal-reveal__visual"><ProductPreview /></div>
          </div>
        </GlyphPortal>

        <section className="landing-principles" aria-label={t("Princípios do produto")}><p>{t("Uma rotina financeira que cabe no seu dia.")}</p><ul><li><Check aria-hidden="true" /> {t("Sincronização sob pedido")}</li><li><Check aria-hidden="true" /> {t("Confirmação humana")}</li><li><Check aria-hidden="true" /> {t("Dados sob controlo")}</li></ul></section>

        <section className="landing-section landing-how" id="como-funciona">
          <Reveal className="landing-section__intro"><p className="landing-kicker">{t("Um fluxo, três momentos")}</p><h2>{t("Menos gestão.")}<br />{t("Mais decisão.")}</h2><p>{t("O ExpenseSnap transforma movimentos dispersos numa visão que consegue usar todos os dias.")}</p></Reveal>
          <ol className="landing-steps"><li><span>01</span><Landmark aria-hidden="true" /><h3>{t("Junte as contas")}</h3><p>{t("Adicione contas manuais ou ligue o banco para centralizar saldos e movimentos.")}</p></li><li><span>02</span><ReceiptText aria-hidden="true" /><h3>{t("Reveja o que mudou")}</h3><p>{t("Confirme descrições e categorias numa sequência curta, sempre sob o seu controlo.")}</p></li><li><span>03</span><Target aria-hidden="true" /><h3>{t("Planeie com contexto")}</h3><p>{t("Compare o mês, acompanhe limites e escolha o próximo passo com calma.")}</p></li></ol>
        </section>

        <section className="landing-showcase" id="produto">
          <Reveal className="landing-showcase__copy"><p className="landing-kicker landing-kicker--light">{t("O dashboard, explicado")}</p><h2>{t("Hoje, o mês e o plano. Sem andar à procura.")}</h2><p>{t("Movimentos do dia, categorias e orçamento aparecem numa única leitura — como dentro da aplicação.")}</p><ul><li><Check aria-hidden="true" /> {t("Resultado do dia imediatamente visível")}</li><li><Check aria-hidden="true" /> {t("Categorias comparáveis sem ruído")}</li><li><Check aria-hidden="true" /> {t("Limites traduzidos em valor disponível")}</li></ul></Reveal>
          <Reveal className="landing-showcase__visual"><DashboardStory /></Reveal>
        </section>

        <section className="landing-mobile-story" id="mobile" aria-labelledby="mobile-title">
          <Reveal className="landing-mobile-story__copy"><p className="landing-kicker">{t("A mesma clareza, no bolso")}</p><h2 id="mobile-title">{t("O dia financeiro cabe no seu iPhone.")}</h2><p>{t("Consulte o disponível, reveja movimentos e registe uma despesa sem esperar pelo computador.")}</p><span>{t("Pré-visualização com dados de demonstração")}</span></Reveal>
          <Reveal className="landing-mobile-story__device"><MobileDashboardPreview /></Reveal>
        </section>

        <section className="landing-section landing-features" id="vantagens" aria-labelledby="landing-features-title">
          <Reveal className="landing-section__intro"><p className="landing-kicker">{t("Do registo à decisão")}</p><h2 id="landing-features-title">{t("Mais contexto, menos trabalho.")}</h2><p>{t("Escolha como registar, reveja apenas o necessário e mantenha o mês legível.")}</p></Reveal>
          <div className="landing-feature-grid landing-feature-grid--product">
            <article className="landing-feature landing-feature--wide"><ScanLine aria-hidden="true" /><div><h3>{t("Fotografe a fatura")}</h3><p>{t("O leitor aproveita os dados do recibo no dispositivo. Confirme antes de guardar.")}</p></div><div className="landing-receipt" aria-hidden="true"><span>RECIBO</span><i /><i /><i /><strong>24,90 €</strong></div></article>
            <article className="landing-feature"><WalletCards aria-hidden="true" /><h3>{t("Contas no mesmo lugar")}</h3><p>{t("Veja contas manuais e bancárias com origem e estado claramente identificados.")}</p></article>
            <article className="landing-feature"><BarChart3 aria-hidden="true" /><h3>{t("Um mês que se explica")}</h3><p>{t("Totais, tendência e categorias ajudam a perceber mudanças sem transformar tudo num relatório.")}</p></article>
            <article className="landing-feature"><Sparkles aria-hidden="true" /><h3>{t("Sugestões, não decisões")}</h3><p>{t("A automação acelera a organização; a palavra final continua a ser sua.")}</p></article>
          </div>
        </section>

        <section className="landing-security" id="privacidade"><div className="landing-security__mark"><ShieldCheck aria-hidden="true" /></div><div><p className="landing-kicker landing-kicker--light">{t("Privacidade por desenho")}</p><h2>{t("O seu dinheiro não é conteúdo.")}</h2><p>{t("Controle as ligações, sincronize quando decidir e use as ferramentas de privacidade dentro da aplicação.")}</p></div><ul><li><LockKeyhole aria-hidden="true" /> {t("Sessão protegida")}</li><li><Check aria-hidden="true" /> {t("Ligações bancárias controláveis")}</li><li><Check aria-hidden="true" /> {t("Exportação e eliminação de dados")}</li></ul></section>

        <section className="landing-final"><p className="landing-kicker">{t("Comece pelo que aconteceu hoje")}</p><h2>{t("Menos contas na cabeça.")}<br /><span>{t("Mais clareza no dia.")}</span></h2><AntiMetalButton className="landing-button--large" href={registerHref} label={t("Começar grátis")} /><p>{t("Já tem conta?")} <a href={loginHref} rel="noreferrer">{t("Entrar no ExpenseSnap")}</a></p></section>
      </div>

      <footer className="landing-footer"><Brand linked={false} compact /><p>{t("Finanças pessoais com menos ruído.")}</p><div><a href={privacyHref} rel="noreferrer">{t("Privacidade")}</a><a href={loginHref} rel="noreferrer">{t("Entrar")}</a></div></footer>
    </main>
  );
}
