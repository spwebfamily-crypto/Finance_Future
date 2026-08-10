import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { useLocation, useOutlet } from 'react-router-dom';

export function RouteTransitionOutlet({ className = 'route-stage' }: { className?: string }) {
  const location = useLocation();
  const outlet = useOutlet();
  const reduceMotion = useReducedMotion();

  return (
    <AnimatePresence mode="popLayout" initial={false}>
      <motion.div
        className={className}
        key={location.pathname}
        initial={reduceMotion ? false : { opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        exit={reduceMotion ? undefined : { opacity: 0, y: -3, transition: { duration: 0.09, ease: 'easeOut' } }}
        transition={{ duration: reduceMotion ? 0 : 0.16, ease: [0.22, 1, 0.36, 1] }}
      >
        {outlet}
      </motion.div>
    </AnimatePresence>
  );
}
