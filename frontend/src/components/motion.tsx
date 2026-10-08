import { motion, useReducedMotion, type HTMLMotionProps } from "framer-motion";
import { useEffect, useState } from "react";

/** Fade-and-rise entrance for a block, with an optional stagger index. */
export function Reveal({ index = 0, children, className, ...rest }: HTMLMotionProps<"div"> & { index?: number }) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      initial={reduce ? false : { opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, delay: Math.min(index, 12) * 0.05, ease: [0.22, 1, 0.36, 1] }}
      className={className}
      {...rest}
    >
      {children}
    </motion.div>
  );
}

/** Counts up to a number the first time it is shown; plain text for non-numeric values. */
export function CountUp({ value, duration = 900 }: { value: number | string; duration?: number }) {
  const reduce = useReducedMotion();
  const target = typeof value === "number" ? value : Number.NaN;
  const [shown, setShown] = useState(reduce || Number.isNaN(target) ? target : 0);
  useEffect(() => {
    if (reduce || Number.isNaN(target)) return;
    let frame = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const progress = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - progress, 3);
      setShown(Math.round(target * eased));
      if (progress < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [target, duration, reduce]);
  if (Number.isNaN(target)) return <>{value}</>;
  return <>{shown.toLocaleString()}</>;
}
