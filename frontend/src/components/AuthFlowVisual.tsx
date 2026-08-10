import { motion, useReducedMotion } from 'framer-motion';
import { ChartNoAxesCombined, ReceiptText, WalletCards } from 'lucide-react';

const nodes = [
  { label: 'Registo', icon: ReceiptText, className: 'auth-flow__node--top' },
  { label: 'Equilíbrio', icon: WalletCards, className: 'auth-flow__node--middle' },
  { label: 'Clareza', icon: ChartNoAxesCombined, className: 'auth-flow__node--bottom' },
];

export function AuthFlowVisual() {
  const reduceMotion = useReducedMotion();

  return (
    <div className="auth-flow" aria-hidden="true">
      <svg className="auth-flow__lines" viewBox="0 0 420 220" fill="none" role="presentation">
        <motion.path
          d="M 90 44 C 160 44 160 110 210 110 C 260 110 260 176 330 176"
          pathLength="1"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeDasharray="0.16 0.08"
          initial={reduceMotion ? false : { opacity: 0, strokeDashoffset: 0.16 }}
          animate={reduceMotion ? undefined : { opacity: 1, strokeDashoffset: 0 }}
          transition={{ duration: reduceMotion ? 0 : 0.38, ease: [0.22, 1, 0.36, 1] }}
        />
        <motion.path
          d="M 90 176 C 160 176 160 110 210 110 C 260 110 260 44 330 44"
          pathLength="1"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeDasharray="0.16 0.08"
          initial={reduceMotion ? false : { opacity: 0, strokeDashoffset: -0.16 }}
          animate={reduceMotion ? undefined : { opacity: 1, strokeDashoffset: 0 }}
          transition={{ delay: reduceMotion ? 0 : 0.03, duration: reduceMotion ? 0 : 0.38, ease: [0.22, 1, 0.36, 1] }}
        />
      </svg>
      <div className="auth-flow__nodes">
        {nodes.map(({ label, icon: Icon, className }, index) => (
          <motion.div
            className={`auth-flow__node ${className}`}
            key={label}
            initial={reduceMotion ? false : { opacity: 0, y: 12 }}
            animate={reduceMotion ? undefined : { opacity: 1, y: 0 }}
            transition={{ delay: reduceMotion ? 0 : index * 0.045, duration: reduceMotion ? 0 : 0.24, ease: [0.22, 1, 0.36, 1] }}
          >
            <span className="auth-flow__icon"><Icon size={19} strokeWidth={1.8} /></span>
            <span>{label}</span>
          </motion.div>
        ))}
      </div>
      <p className="auth-flow__caption">Uma leitura simples do que sai e do que fica.</p>
    </div>
  );
}
