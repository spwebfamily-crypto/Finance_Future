import { motion, useReducedMotion } from "framer-motion";
import { ShieldCheck } from "lucide-react";
import { Brand } from "./Brand";

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
    footer: "Pode rever os seus dados financeiros quando quiser.",
  },
} as const;

export function AuthStory({ variant }: { variant: keyof typeof storyContent }) {
  const reduceMotion = useReducedMotion();
  const content = storyContent[variant];

  return (
    <section className="auth-story" aria-label="ExpenseSnap">
      <Brand linked={false} />
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
      </motion.div>
      <div className="auth-story__footer">
        <ShieldCheck size={16} aria-hidden="true" /> {content.footer}
      </div>
    </section>
  );
}
