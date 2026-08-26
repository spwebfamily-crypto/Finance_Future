import { motion, useReducedMotion, type Variants } from "framer-motion";
import { Link } from "react-router-dom";

interface BrandProps {
  compact?: boolean;
  linked?: boolean;
  phase?: "idle" | "loading" | "exit";
}

const brandVariants: Variants = {
  hidden: { opacity: 0 },
  idle: { opacity: 1 },
  loading: { opacity: 1 },
  exit: { opacity: 0, transition: { duration: 0.09, ease: "easeIn" } },
};

const markVariants: Variants = {
  hidden: { opacity: 0, scale: 0.94, y: 3, rotate: -2 },
  idle: {
    opacity: 1,
    scale: 1,
    y: 0,
    rotate: 0,
    transition: { duration: 0.16, ease: [0.22, 1, 0.36, 1] },
  },
  loading: {
    opacity: [0.75, 1, 1],
    scale: [0.94, 1.025, 1],
    y: [3, 0, 0],
    rotate: [-2, 1, 0],
    transition: { duration: 0.22, times: [0, 0.7, 1], ease: [0.22, 1, 0.36, 1] },
  },
  exit: { opacity: 0, scale: 0.97, y: -2, transition: { duration: 0.09, ease: "easeIn" } },
  hover: { scale: 1.04, rotate: 1.5, transition: { duration: 0.12 } },
  tap: { scale: 0.96, transition: { duration: 0.08 } },
};

export function Brand({ compact = false, linked = true, phase = "idle" }: BrandProps) {
  const reduceMotion = useReducedMotion();
  const animation = reduceMotion
    ? { opacity: phase === "exit" ? 0 : 1, transition: { duration: 0 } }
    : phase;
  const content = (
    <motion.span
      className={`brand ${compact ? "brand--compact" : ""}`}
      aria-label="ExpenseSnap"
      initial={reduceMotion ? false : "hidden"}
      animate={animation}
      whileHover={reduceMotion || phase === "exit" ? undefined : "hover"}
      whileTap={reduceMotion || phase === "exit" ? undefined : "tap"}
      variants={reduceMotion ? undefined : brandVariants}
    >
      <motion.span
        className="brand__mark"
        aria-hidden="true"
        variants={reduceMotion ? undefined : markVariants}
      >
        <img src="/icon.svg" alt="" decoding="async" draggable={false} />
      </motion.span>
      <span className="brand__word">
        expense<span>snap</span>
      </span>
    </motion.span>
  );

  return linked ? (
    <Link to="/expenses" className="brand-link">
      {content}
    </Link>
  ) : (
    content
  );
}
