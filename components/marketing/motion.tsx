"use client";

import { useEffect, useRef, type ComponentProps, type ReactNode } from "react";
import {
  animate,
  motion,
  useInView,
  useReducedMotion,
  useScroll,
  useSpring,
  useTransform,
  type Variants,
} from "framer-motion";
import { cn } from "@/lib/utils";

export const fadeUp: Variants = {
  hidden: { opacity: 0, y: 24 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1] } },
};

export const stagger: Variants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.12 } },
};

export const revealViewport = { once: true, amount: 0.15 } as const;

/** Barra fina de progreso de lectura en la parte superior. */
export function ScrollProgress() {
  const { scrollYProgress } = useScroll();
  const scaleX = useSpring(scrollYProgress, { stiffness: 140, damping: 28, restDelta: 0.001 });
  return (
    <motion.div
      aria-hidden="true"
      style={{ scaleX }}
      className="fixed inset-x-0 top-0 z-50 h-0.5 origin-left bg-gradient-to-r from-emerald-700 via-emerald-500 to-teal-400"
    />
  );
}

/** Tarjeta con luz que sigue al cursor (spotlight) y entrada en cascada. */
export function SpotlightCard({
  className,
  children,
  ...props
}: ComponentProps<typeof motion.article>) {
  return (
    <motion.article
      variants={fadeUp}
      onPointerMove={(event) => {
        const rect = event.currentTarget.getBoundingClientRect();
        event.currentTarget.style.setProperty("--mx", `${event.clientX - rect.left}px`);
        event.currentTarget.style.setProperty("--my", `${event.clientY - rect.top}px`);
      }}
      className={cn("spotlight", className)}
      {...props}
    >
      {children}
    </motion.article>
  );
}

/** Contador que sube hasta su valor al entrar en pantalla. */
export function CountUp({ value, pad = 2 }: { value: number; pad?: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, amount: 0.6 });
  const reduce = useReducedMotion();
  useEffect(() => {
    const node = ref.current;
    if (!node || !inView || reduce) return;
    const controls = animate(0, value, {
      duration: 1.1,
      ease: "easeOut",
      onUpdate: (latest) => {
        node.textContent = String(Math.round(latest)).padStart(pad, "0");
      },
    });
    return () => controls.stop();
  }, [inView, reduce, value, pad]);
  return <span ref={ref}>{String(value).padStart(pad, "0")}</span>;
}

/** El producto "se levanta" al hacer scroll: inclinación 3D que se corrige y escala. */
export function ScrollTilt({ children, className }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start end", "start 0.25"] });
  const rotateX = useTransform(scrollYProgress, [0, 1], [14, 0]);
  const scale = useTransform(scrollYProgress, [0, 1], [0.94, 1]);
  if (reduce) return <div className={className}>{children}</div>;
  return (
    <div ref={ref} className={className} style={{ perspective: 1400 }}>
      <motion.div style={{ rotateX, scale, transformOrigin: "50% 0%" }}>{children}</motion.div>
    </div>
  );
}

// Posiciones deterministas (evita diferencias entre servidor y cliente).
const stars = Array.from({ length: 46 }, (_, index) => {
  const seed = (index * 9301 + 49297) % 233280;
  const a = seed / 233280;
  const b = ((seed * 7 + 13) % 233280) / 233280;
  return {
    left: `${(a * 100).toFixed(2)}%`,
    top: `${(b * 100).toFixed(2)}%`,
    size: index % 7 === 0 ? 3 : index % 3 === 0 ? 2 : 1.5,
    delay: `${((index * 0.37) % 5).toFixed(2)}s`,
    duration: `${(3 + (index % 5)).toString()}s`,
  };
});

/** Campo de estrellas titilantes; `tone` ajusta el contraste para fondos claros u oscuros. */
export function StarField({ tone = "light" }: { tone?: "light" | "dark" }) {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
      {stars.map((star, index) => (
        <span
          key={index}
          className={cn("star", tone === "dark" ? "star-dark" : "star-light")}
          style={{
            left: star.left,
            top: star.top,
            width: star.size,
            height: star.size,
            animationDelay: star.delay,
            animationDuration: star.duration,
          }}
        />
      ))}
    </div>
  );
}
