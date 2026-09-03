import { motion, useReducedMotion } from "framer-motion";
import { ShieldCheck } from "lucide-react";
import { AuthFlowVisual } from "./AuthFlowVisual";
import { Brand } from "./Brand";
import { ThemeToggle } from "./ThemeToggle";

const storyContent = {
  login: {
    eyebrow: "Dinheiro sem distrações",
    title: (
      <>
        Tudo o que saiu. <em>Nada escondido.</em>
      </>
    ),
    description:
      "Um arquivo simples para perceber hábitos, comparar meses e decidir com mais calma.",
    footer: "Os comprovativos são lidos localmente no seu dispositivo.",
  },
  register: {
    eyebrow: "Comece pelo essencial",
    title: (
      <>
        Uma rotina leve para <em>cuidar do futuro.</em>
      </>
    ),
    description:
      "Crie a conta e conte-nos apenas o necessário para organizar a sua vida financeira.",
    footer: "Enviamos um email para confirmar que a conta é sua.",
  },
  verify: {
    eyebrow: "Confirmação de conta",
    title: (
      <>
        Um email para <em>proteger a sua conta.</em>
      </>
    ),
    description:
      "A confirmação garante que só quem tem acesso a este email consegue recuperar a conta.",
    footer: "Nunca partilhamos o seu email com terceiros.",
  },
  forgot: {
    eyebrow: "Recuperar acesso",
    title: (
      <>
        Um link para <em>voltar à conta.</em>
      </>
    ),
    description: "Se existir uma conta com este email, enviamos um link para escolher uma nova palavra-passe.",
    footer: "O link expira ao fim de uma hora e só pode ser usado uma vez.",
  },
  reset: {
    eyebrow: "Nova palavra-passe",
    title: (
      <>
        Escolha uma palavra-passe <em>só sua.</em>
      </>
    ),
    description: "Depois de gravar, inicie sessão com a nova palavra-passe.",
    footer: "As sessões abertas noutros dispositivos serão encerradas.",
  },
} as const;

export function AuthStory({ variant }: { variant: keyof typeof storyContent }) {
  const reduceMotion = useReducedMotion();
  const content = storyContent[variant];

  return (
    <section className="auth-story" aria-label="ExpenseSnap">
      <div className="auth-story__top">
        <Brand linked={false} />
        <ThemeToggle compact />
      </div>
      <motion.div
        className="auth-story__body"
        initial={reduceMotion ? false : { opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: reduceMotion ? 0 : 0.24, ease: [0.22, 1, 0.36, 1] }}
      >
        <div className="auth-story__content">
          <p className="eyebrow">{content.eyebrow}</p>
          <p className="auth-story__headline">{content.title}</p>
          <p>{content.description}</p>
        </div>
        <AuthFlowVisual />
      </motion.div>
      <div className="auth-story__footer">
        <ShieldCheck size={16} aria-hidden="true" /> {content.footer}
      </div>
    </section>
  );
}
