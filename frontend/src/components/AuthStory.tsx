import { motion, useReducedMotion } from "framer-motion";
import { ShieldCheck } from "lucide-react";
import { AuthFlowVisual } from "./AuthFlowVisual";
import { Brand } from "./Brand";
import { ThemeToggle } from "./ThemeToggle";
import { LanguageSwitcher, useI18n } from "../i18n/I18nContext";

const storyContent = {
  login: {
    eyebrow: "Dinheiro sem distrações",
    title: "Tudo o que saiu.",
    emphasis: "Nada escondido.",
    description:
      "Um arquivo simples para perceber hábitos, comparar meses e decidir com mais calma.",
    footer: "Os comprovativos são lidos localmente no seu dispositivo.",
  },
  register: {
    eyebrow: "Comece pelo essencial",
    title: "Uma rotina leve para",
    emphasis: "cuidar do futuro.",
    description:
      "Crie a conta e conte-nos apenas o necessário para organizar a sua vida financeira.",
    footer: "Enviamos um email para confirmar que a conta é sua.",
  },
  verify: {
    eyebrow: "Confirmação de conta",
    title: "Um email para",
    emphasis: "proteger a sua conta.",
    description:
      "A confirmação garante que só quem tem acesso a este email consegue recuperar a conta.",
    footer: "Nunca partilhamos o seu email com terceiros.",
  },
  forgot: {
    eyebrow: "Recuperar acesso",
    title: "Um link para",
    emphasis: "voltar à conta.",
    description:
      "Se existir uma conta com este email, enviamos um link para escolher uma nova palavra-passe.",
    footer: "O link expira ao fim de uma hora e só pode ser usado uma vez.",
  },
  reset: {
    eyebrow: "Nova palavra-passe",
    title: "Escolha uma palavra-passe",
    emphasis: "só sua.",
    description: "Depois de gravar, inicie sessão com a nova palavra-passe.",
    footer: "As sessões abertas noutros dispositivos serão encerradas.",
  },
} as const;

export function AuthStory({ variant }: { variant: keyof typeof storyContent }) {
  const { t } = useI18n();
  const reduceMotion = useReducedMotion();
  const content = storyContent[variant];

  return (
    <section className="auth-story" aria-label="ExpenseSnap">
      <div className="auth-story__top">
        <Brand linked={false} />
        <div className="auth-story__actions">
          <LanguageSwitcher compact />
          <ThemeToggle compact />
        </div>
      </div>
      <motion.div
        className="auth-story__body"
        initial={reduceMotion ? false : { opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: reduceMotion ? 0 : 0.24, ease: [0.22, 1, 0.36, 1] }}
      >
        <div className="auth-story__content">
          <p className="eyebrow">{t(content.eyebrow)}</p>
          <p className="auth-story__headline">
            {t(content.title)} <em>{t(content.emphasis)}</em>
          </p>
          <p>{t(content.description)}</p>
        </div>
        <AuthFlowVisual />
      </motion.div>
      <div className="auth-story__footer">
        <ShieldCheck size={16} aria-hidden="true" /> {t(content.footer)}
      </div>
    </section>
  );
}
