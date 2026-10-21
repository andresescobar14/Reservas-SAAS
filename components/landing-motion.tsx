"use client";

import { useEffect } from "react";
import { gsap } from "gsap";

export function LandingMotion() {
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const context = gsap.context(() =>
      gsap.fromTo(
        ".hero-reveal",
        { y: 18, opacity: 0 },
        { y: 0, opacity: 1, duration: 0.65, stagger: 0.09, ease: "power2.out" },
      ),
    );
    let disposed = false;
    void import("aos").then(({ default: AOS }) => {
      if (!disposed) AOS.init({ duration: 550, once: true, offset: 45 });
    });
    return () => {
      disposed = true;
      context.revert();
    };
  }, []);
  return null;
}
