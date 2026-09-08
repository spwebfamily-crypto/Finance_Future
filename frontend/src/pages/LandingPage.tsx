import { motion, useReducedMotion } from "framer-motion";
import {
  ArrowRight,
  Check,
  Landmark,
  LockKeyhole,
  ScanLine,
  ShieldCheck,
  Sparkles,
  WalletCards,
} from "lucide-react";
import { Link } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { Brand } from "../components/Brand";
import { ThemeToggle } from "../components/ThemeToggle";
import { TiltCard } from "../components/TiltCard";
import { Gauge } from "../components/ui/Gauge";
import { GlyphPortal } from "../components/ui/GlyphPortal";

const movements = [
  { merchant: "Continente", category: "Supermercado", amount: "- 42,80 €", tone: "lime" },
  { merchant: "CP", category: "Transportes", amount: "- 18,20 €", tone: "blue" },
  { merchant: "Delta Cafés", category: "Restauração", amount: "- 3,10 €", tone: "rose" },
];

function ProductPreview({ compact = false }: { compact?: boolean }) {
  return (
    <TiltCard
      className={`landing-product ${compact ? "landing-product--compact" : ""}`}
      tiltLimit={4}
      spotlight={false}
    >
      <div className="landing-product__topline">
        <span>
          <i aria-hidden="true" /> Hoje
        </span>
        <span className="landing-product__synced">
          <Check aria-hidden="true" /> Sincronizado
        </span>
      </div>
      <div className="landing-product__summary">
        <span>Disponível nas contas</span>
        <strong>2.487,60 €</strong>
        <small>Atualizado agora</small>
      </div>
      <div className="landing-product__review">
        <div>
          <span className="landing-product__eyebrow">Revisão rápida</span>
          <strong>3 gastos para confirmar</strong>
        </div>
        <span className="landing-product__count">03</span>
      </div>
      <div className="landing-product__movements">
        {movements.map((movement) => (
          <div className="landing-movement" key={movement.merchant}>
            <span
              className={`landing-movement__dot landing-movement__dot--${movement.tone}`}
              aria-hidden="true"
            />
            <span>
              <strong>{movement.merchant}</strong>
              <small>{movement.category}</small>
            </span>
            <b>{movement.amount}</b>
          </div>
        ))}
      </div>
      <div className="landing-product__footer">
        <span>2 de 3 classificações sugeridas</span>
        <span aria-hidden="true">→</span>
      </div>
    </TiltCard>
  );
}

export function LandingPage() {
  const { isAuthenticated } = useAuth();
  const reduceMotion = useReducedMotion();
  const primaryHref = isAuthenticated ? "/dashboard" : "/register";
  const primaryLabel = isAuthenticated ? "Abrir a minha conta" : "Começar grátis";

  return (
    <main className="landing-page">
      <a className="skip-link" href="#landing-content">
        Saltar para o conteúdo
      </a>

      <header className="landing-nav" aria-label="Cabeçalho">
        <Link className="landing-nav__brand" to="/" aria-label="ExpenseSnap, início">
          <Brand linked={false} />
        </Link>
        <nav className="landing-nav__links" aria-label="Navegação da apresentação">
          <a href="#como-funciona">Como funciona</a>
          <a href="#produto">Produto</a>
          <a href="#privacidade">Privacidade</a>
        </nav>
        <div className="landing-nav__actions">
          <ThemeToggle compact />
          {!isAuthenticated && (
            <Link className="landing-nav__login" to="/login">
              Entrar
            </Link>
          )}
          <Link className="button button--primary landing-nav__cta" to={primaryHref}>
            {isAuthenticated ? "Abrir app" : "Experimentar"}
          </Link>
        </div>
      </header>

      <div id="landing-content">
        <GlyphPortal
          word="CLAREZA"
          front={
            <div className="landing-hero">
              <motion.div
                className="landing-hero__copy"
                initial={reduceMotion ? false : { opacity: 0, y: 18 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: reduceMotion ? 0 : 0.6, ease: [0.22, 1, 0.36, 1] }}
              >
                <p className="landing-kicker">
                  <Sparkles aria-hidden="true" /> Finanças pessoais, sem ruído
                </p>
                <h1>
                  O seu dinheiro,
                  <br />
                  <em>finalmente simples.</em>
                </h1>
                <p className="landing-hero__intro">
                  Ligue o banco, reveja os gastos do dia e perceba quanto pode usar — sem folhas de
                  cálculo nem registos repetidos.
                </p>
                <div className="landing-hero__actions">
                  <Link className="button button--primary landing-button--large" to={primaryHref}>
                    {primaryLabel} <ArrowRight aria-hidden="true" />
                  </Link>
                  <a
                    className="button button--secondary landing-button--large"
                    href="#como-funciona"
                  >
                    Ver como funciona
                  </a>
                </div>
                {!isAuthenticated && <small>Sem cartão. Configure ao seu ritmo.</small>}
              </motion.div>
            </div>
          }
        >
          <div className="landing-portal-reveal">
            <div className="landing-portal-reveal__copy">
              <p className="landing-kicker landing-kicker--light">Do banco para o seu plano</p>
              <h2>
                O banco lança.
                <br />
                Você só confirma.
              </h2>
              <p>
                Os movimentos chegam organizados numa revisão curta, no momento certo. O resto do
                dia continua a ser seu.
              </p>
            </div>
            <ProductPreview compact />
          </div>
        </GlyphPortal>

        <section className="landing-trust" aria-label="Princípios do produto">
          <p>Feito para a sua rotina, não para ocupar o seu tempo.</p>
          <ul>
            <li>
              <Check aria-hidden="true" /> Sincronização quando pede
            </li>
            <li>
              <Check aria-hidden="true" /> Revisão diária guiada
            </li>
            <li>
              <Check aria-hidden="true" /> Dados sob o seu controlo
            </li>
          </ul>
        </section>

        <section className="landing-section landing-how" id="como-funciona">
          <div className="landing-section__intro">
            <p className="landing-kicker">Um fluxo, três momentos</p>
            <h2>
              Menos gestão.
              <br />
              Mais decisão.
            </h2>
            <p>
              O ExpenseSnap transforma movimentos bancários em informação que consegue realmente
              usar.
            </p>
          </div>
          <ol className="landing-steps">
            <li>
              <span>01</span>
              <Landmark aria-hidden="true" />
              <h3>Ligue as contas</h3>
              <p>Centralize saldos e movimentos sem copiar dados entre aplicações.</p>
            </li>
            <li>
              <span>02</span>
              <Sparkles aria-hidden="true" />
              <h3>Confirme o dia</h3>
              <p>Ao sincronizar, reveja e classifique os novos gastos numa sequência curta.</p>
            </li>
            <li>
              <span>03</span>
              <WalletCards aria-hidden="true" />
              <h3>Ajuste o plano</h3>
              <p>Veja o impacto no orçamento e escolha o próximo passo com contexto.</p>
            </li>
          </ol>
        </section>

        <section className="landing-section landing-product-section" id="produto">
          <div className="landing-product-section__visual">
            <ProductPreview />
          </div>
          <div className="landing-product-section__copy">
            <p className="landing-kicker">A sua manhã financeira</p>
            <h2>
              Tudo o que precisa.
              <br />
              Nada a mais.
            </h2>
            <p>
              Uma vista simples para saber onde está, o que mudou e o que ainda precisa da sua
              atenção.
            </p>
            <ul className="landing-checklist">
              <li>
                <Check aria-hidden="true" />
                <span>
                  <strong>Saldos num só lugar</strong>Contas bancárias, cartões e dinheiro lado a
                  lado.
                </span>
              </li>
              <li>
                <Check aria-hidden="true" />
                <span>
                  <strong>Categorias sob controlo</strong>A sugestão acelera; a decisão continua a
                  ser sua.
                </span>
              </li>
              <li>
                <Check aria-hidden="true" />
                <span>
                  <strong>Um plano que se atualiza</strong>As despesas confirmadas refletem-se no
                  orçamento.
                </span>
              </li>
            </ul>
          </div>
        </section>

        <section className="landing-budget">
          <div className="landing-budget__copy">
            <p className="landing-kicker landing-kicker--dark">Exemplo de orçamento mensal</p>
            <h2>
              Perceba o mês
              <br />
              antes do fim do mês.
            </h2>
            <p>
              O que já gastou, o que está reservado e quanto ainda pode decidir — traduzido em
              linguagem clara.
            </p>
          </div>
          <div className="landing-budget__gauge">
            <Gauge value={68} label="Orçamento disponível" detail="1.020 € de 1.500 € por usar" />
          </div>
          <div className="landing-budget__note">
            <span>Leitura rápida</span>
            <p>
              Os valores desta demonstração são ilustrativos. Na sua conta, o plano usa os seus
              próprios dados.
            </p>
          </div>
        </section>

        <section
          className="landing-section landing-features"
          aria-labelledby="landing-features-title"
        >
          <div className="landing-section__intro">
            <p className="landing-kicker">Pequenas fricções, removidas</p>
            <h2 id="landing-features-title">Criado para continuar.</h2>
          </div>
          <div className="landing-feature-grid">
            <article className="landing-feature landing-feature--wide">
              <ScanLine aria-hidden="true" />
              <div>
                <h3>Fatura fotografada, despesa pronta</h3>
                <p>Use OCR para aproveitar os dados do recibo e confirme apenas o necessário.</p>
              </div>
              <div className="landing-receipt" aria-hidden="true">
                <span>RECIBO</span>
                <i />
                <i />
                <i />
                <strong>24,90 €</strong>
              </div>
            </article>
            <article className="landing-feature">
              <WalletCards aria-hidden="true" />
              <h3>Movimentos e contas conectados</h3>
              <p>O mesmo valor deixa de aparecer em sítios sem relação entre si.</p>
            </article>
            <article className="landing-feature">
              <Sparkles aria-hidden="true" />
              <h3>Revisão no momento certo</h3>
              <p>Os gastos novos aparecem depois da sincronização — não antes.</p>
            </article>
          </div>
        </section>

        <section className="landing-security" id="privacidade">
          <div className="landing-security__mark">
            <ShieldCheck aria-hidden="true" />
          </div>
          <div>
            <p className="landing-kicker landing-kicker--light">Privacidade por desenho</p>
            <h2>O seu dinheiro não é conteúdo.</h2>
            <p>
              Consulte ligações, controle a sincronização e remova os seus dados a partir da própria
              aplicação.
            </p>
          </div>
          <ul>
            <li>
              <LockKeyhole aria-hidden="true" /> Sessão protegida
            </li>
            <li>
              <Check aria-hidden="true" /> Controlo das ligações bancárias
            </li>
            <li>
              <Check aria-hidden="true" /> Ferramentas de privacidade na app
            </li>
          </ul>
        </section>

        <section className="landing-final">
          <p className="landing-kicker">Comece pelo que já aconteceu hoje</p>
          <h2>
            Menos contas na cabeça.
            <br />
            <em>Mais clareza no dia.</em>
          </h2>
          <Link className="button button--primary landing-button--large" to={primaryHref}>
            {primaryLabel} <ArrowRight aria-hidden="true" />
          </Link>
          {!isAuthenticated && (
            <p>
              Já tem conta? <Link to="/login">Entrar no ExpenseSnap</Link>
            </p>
          )}
        </section>
      </div>

      <footer className="landing-footer">
        <Link to="/" aria-label="ExpenseSnap, início">
          <Brand linked={false} compact />
        </Link>
        <p>Finanças pessoais com menos ruído.</p>
        <div>
          <a href="#privacidade">Privacidade</a>
          <Link to="/login">Entrar</Link>
        </div>
      </footer>
    </main>
  );
}
