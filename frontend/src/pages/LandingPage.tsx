import { motion, useReducedMotion } from "framer-motion";
import {
  ArrowRight,
  BarChart3,
  Check,
  Landmark,
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
import { useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { Brand } from "../components/Brand";
import { ThemeToggle } from "../components/ThemeToggle";

const movements = [
  ["Continente", "Supermercado", "− 42,80 €", "lime"],
  ["CP", "Transportes", "− 18,20 €", "blue"],
  ["Delta Cafés", "Restauração", "− 3,10 €", "rose"],
];

function Reveal({ children, className = "" }: { children: ReactNode; className?: string }) {
  const reduced = useReducedMotion();
  return (
    <motion.div
      className={className}
      initial={reduced ? false : { opacity: 0, y: 28 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.18 }}
      transition={{ duration: reduced ? 0 : 0.65, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.div>
  );
}

function ProductPreview() {
  const reduced = useReducedMotion();
  return (
    <motion.div
      className="landing-product"
      initial={reduced ? false : { opacity: 0, y: 24, rotate: 1.5 }}
      animate={{ opacity: 1, y: 0, rotate: 0 }}
      transition={{ delay: reduced ? 0 : 0.18, duration: reduced ? 0 : 0.75 }}
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
        {movements.map(([merchant, category, amount, tone], index) => (
          <motion.div
            className="landing-movement"
            key={merchant}
            initial={reduced ? false : { opacity: 0, x: 16 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: reduced ? 0 : 0.45 + index * 0.1 }}
          >
            <span
              className={`landing-movement__dot landing-movement__dot--${tone}`}
              aria-hidden="true"
            />
            <span>
              <strong>{merchant}</strong>
              <small>{category}</small>
            </span>
            <b>{amount}</b>
          </motion.div>
        ))}
      </div>
      <div className="landing-product__footer">
        <span>2 de 3 classificações sugeridas</span>
        <span aria-hidden="true">→</span>
      </div>
    </motion.div>
  );
}

function DashboardStory() {
  return (
    <div className="landing-dashboard" aria-label="Exemplo ilustrativo da visão financeira">
      <div className="landing-dashboard__header">
        <div>
          <span>Visão geral</span>
          <strong>Bom dia, Marta</strong>
        </div>
        <span>Setembro</span>
      </div>
      <div className="landing-dashboard__today">
        <div>
          <span>Entradas hoje</span>
          <strong className="is-positive">+ 1.850 €</strong>
        </div>
        <div>
          <span>Saídas hoje</span>
          <strong>− 64,10 €</strong>
        </div>
        <div>
          <span>Resultado</span>
          <strong className="is-positive">+ 1.785,90 €</strong>
        </div>
      </div>
      <div className="landing-dashboard__grid">
        <div className="landing-dashboard__chart">
          <span>Despesas por categoria</span>
          <div>
            <i style={{ width: "82%" }} />
            <b>Casa</b>
            <small>620 €</small>
          </div>
          <div>
            <i style={{ width: "57%" }} />
            <b>Alimentação</b>
            <small>428 €</small>
          </div>
          <div>
            <i style={{ width: "31%" }} />
            <b>Transportes</b>
            <small>234 €</small>
          </div>
        </div>
        <div className="landing-dashboard__plan">
          <span>Plano do mês</span>
          <strong>68%</strong>
          <div>
            <i />
          </div>
          <small>1.020 € ainda disponíveis</small>
        </div>
      </div>
      <p>Dados ilustrativos para apresentar o produto.</p>
    </div>
  );
}

export function LandingPage() {
  const { isAuthenticated } = useAuth();
  const reduced = useReducedMotion();
  const [menuOpen, setMenuOpen] = useState(false);
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
        <nav
          className={`landing-nav__links ${menuOpen ? "is-open" : ""}`}
          aria-label="Navegação da apresentação"
        >
          <a href="#como-funciona" onClick={() => setMenuOpen(false)}>
            Como funciona
          </a>
          <a href="#produto" onClick={() => setMenuOpen(false)}>
            Produto
          </a>
          <a href="#vantagens" onClick={() => setMenuOpen(false)}>
            Vantagens
          </a>
          <a href="#privacidade" onClick={() => setMenuOpen(false)}>
            Privacidade
          </a>
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
          <button
            className="landing-nav__menu"
            type="button"
            aria-expanded={menuOpen}
            aria-label={menuOpen ? "Fechar menu" : "Abrir menu"}
            onClick={() => setMenuOpen((open) => !open)}
          >
            {menuOpen ? <X aria-hidden="true" /> : <Menu aria-hidden="true" />}
          </button>
        </div>
      </header>

      <div id="landing-content">
        <section className="landing-hero">
          <motion.div
            className="landing-hero__glow"
            aria-hidden="true"
            animate={reduced ? undefined : { scale: [1, 1.08, 1], x: [0, 16, 0] }}
            transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
          />
          <motion.div
            className="landing-hero__copy"
            initial={reduced ? false : { opacity: 0, y: 22 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: reduced ? 0 : 0.65 }}
          >
            <p className="landing-kicker">
              <Sparkles aria-hidden="true" /> Finanças pessoais, sem ruído
            </p>
            <h1>
              Saiba para onde vai o seu dinheiro. <em>Decida o que vem a seguir.</em>
            </h1>
            <p className="landing-hero__intro">
              Contas, movimentos e orçamento numa vista simples. Sincronize quando quiser, confirme
              o que importa e planeie o mês sem folhas de cálculo.
            </p>
            <div className="landing-hero__actions">
              <Link className="button button--primary landing-button--large" to={primaryHref}>
                {primaryLabel} <ArrowRight aria-hidden="true" />
              </Link>
              <a className="button button--secondary landing-button--large" href="#produto">
                Explorar o produto
              </a>
            </div>
            {!isAuthenticated && <small>Sem cartão. Comece ao seu ritmo.</small>}
          </motion.div>
          <div className="landing-hero__visual">
            <ProductPreview />
          </div>
          <a className="landing-hero__scroll" href="#como-funciona">
            <span>Descobrir</span>
            <i aria-hidden="true" />
          </a>
        </section>

        <section className="landing-trust" aria-label="Princípios do produto">
          <p>Uma rotina financeira que cabe no seu dia.</p>
          <ul>
            <li>
              <Check aria-hidden="true" /> Sincronização sob pedido
            </li>
            <li>
              <Check aria-hidden="true" /> Confirmação humana
            </li>
            <li>
              <Check aria-hidden="true" /> Dados sob controlo
            </li>
          </ul>
        </section>

        <section className="landing-section landing-how" id="como-funciona">
          <Reveal className="landing-section__intro">
            <p className="landing-kicker">Um fluxo, três momentos</p>
            <h2>
              Menos gestão.
              <br />
              Mais decisão.
            </h2>
            <p>
              O ExpenseSnap transforma movimentos dispersos numa visão que consegue usar todos os
              dias.
            </p>
          </Reveal>
          <ol className="landing-steps">
            <li>
              <span>01</span>
              <Landmark aria-hidden="true" />
              <h3>Junte as contas</h3>
              <p>Adicione contas manuais ou ligue o banco para centralizar saldos e movimentos.</p>
            </li>
            <li>
              <span>02</span>
              <ReceiptText aria-hidden="true" />
              <h3>Reveja o que mudou</h3>
              <p>
                Confirme descrições e categorias numa sequência curta, sempre sob o seu controlo.
              </p>
            </li>
            <li>
              <span>03</span>
              <Target aria-hidden="true" />
              <h3>Planeie com contexto</h3>
              <p>Compare o mês, acompanhe limites e escolha o próximo passo com calma.</p>
            </li>
          </ol>
        </section>

        <section className="landing-showcase" id="produto">
          <Reveal className="landing-showcase__copy">
            <p className="landing-kicker landing-kicker--light">O dashboard, explicado</p>
            <h2>Hoje, o mês e o plano. Sem andar à procura.</h2>
            <p>
              A informação principal do dashboard aparece aqui como demonstração: movimentos do dia,
              categorias e orçamento numa única leitura.
            </p>
            <ul>
              <li>
                <Check aria-hidden="true" /> Resultado do dia imediatamente visível
              </li>
              <li>
                <Check aria-hidden="true" /> Categorias comparáveis sem ruído
              </li>
              <li>
                <Check aria-hidden="true" /> Limites traduzidos em valor disponível
              </li>
            </ul>
          </Reveal>
          <Reveal className="landing-showcase__visual">
            <DashboardStory />
          </Reveal>
        </section>

        <section
          className="landing-section landing-features"
          id="vantagens"
          aria-labelledby="landing-features-title"
        >
          <Reveal className="landing-section__intro">
            <p className="landing-kicker">Do registo à decisão</p>
            <h2 id="landing-features-title">Mais contexto, menos trabalho.</h2>
            <p>Escolha como registar, reveja apenas o necessário e mantenha o mês legível.</p>
          </Reveal>
          <div className="landing-feature-grid">
            <article className="landing-feature landing-feature--wide">
              <ScanLine aria-hidden="true" />
              <div>
                <h3>Fotografe a fatura</h3>
                <p>
                  O leitor aproveita os dados do recibo no dispositivo. Confirme antes de guardar.
                </p>
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
              <h3>Contas no mesmo lugar</h3>
              <p>Veja contas manuais e bancárias com origem e estado claramente identificados.</p>
            </article>
            <article className="landing-feature">
              <BarChart3 aria-hidden="true" />
              <h3>Um mês que se explica</h3>
              <p>
                Totais, tendência e categorias ajudam a perceber mudanças sem transformar tudo num
                relatório.
              </p>
            </article>
            <article className="landing-feature">
              <Sparkles aria-hidden="true" />
              <h3>Sugestões, não decisões</h3>
              <p>A automação acelera a organização; a palavra final continua a ser sua.</p>
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
              Controle as ligações, sincronize quando decidir e use as ferramentas de privacidade
              dentro da aplicação.
            </p>
          </div>
          <ul>
            <li>
              <LockKeyhole aria-hidden="true" /> Sessão protegida
            </li>
            <li>
              <Check aria-hidden="true" /> Ligações bancárias controláveis
            </li>
            <li>
              <Check aria-hidden="true" /> Exportação e eliminação de dados
            </li>
          </ul>
        </section>
        <section className="landing-final">
          <p className="landing-kicker">Comece pelo que aconteceu hoje</p>
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
