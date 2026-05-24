"use client";

/**
 * Reveal — fades + slides children up when they enter the viewport.
 *
 * Pairs with `.kin-reveal` / `.kin-reveal-in` in globals.css. Used on the
 * landing page so each section feels intentional as it appears, instead of
 * everything being painted at once.
 *
 * Honors prefers-reduced-motion (the CSS rule disables the transform/opacity
 * transition, so children just appear immediately).
 */

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";

type RevealProps = {
  children: ReactNode;
  /** Stagger delay in ms before this element animates in. */
  delay?: number;
  /** Optional extra classes to apply alongside the reveal classes. */
  className?: string;
  /** Optional style overrides (rare; usually unnecessary). */
  style?: CSSProperties;
  /** Override the wrapping element tag (default: div). */
  as?: keyof React.JSX.IntrinsicElements;
};

export function Reveal({
  children,
  delay = 0,
  className = "",
  style,
  as: Tag = "div",
}: RevealProps) {
  const ref = useRef<HTMLElement | null>(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    // If the element starts already in view (above the fold), reveal it on
    // the next frame so we still get the entrance motion.
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setShown(true);
            io.disconnect();
            break;
          }
        }
      },
      { threshold: 0.08, rootMargin: "0px 0px -8% 0px" },
    );
    io.observe(node);
    return () => io.disconnect();
  }, []);

  const composed = `kin-reveal ${shown ? "kin-reveal-in" : ""} ${className}`.trim();
  const composedStyle: CSSProperties = {
    ...(delay ? { transitionDelay: `${delay}ms` } : null),
    ...(style ?? {}),
  };

  // We cast through `any` here because the JSX intrinsic union doesn't
  // narrow the ref type. The runtime behavior is identical.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const Element = Tag as any;
  return (
    <Element ref={ref} className={composed} style={composedStyle}>
      {children}
    </Element>
  );
}
