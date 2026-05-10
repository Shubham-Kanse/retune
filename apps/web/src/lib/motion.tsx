"use client";

import {
  Children,
  type ReactNode,
  cloneElement,
  isValidElement,
  useEffect,
  useRef,
  useState,
} from "react";

// ---------------------------------------------------------------------------
// useReveal — IntersectionObserver fade+slide on scroll, fires once
// ---------------------------------------------------------------------------
export function useReveal(threshold = 0.1) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { threshold },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [threshold]);

  return { ref, visible };
}

// ---------------------------------------------------------------------------
// Reveal — wrapper div that fades + slides in when scrolled into view
// ---------------------------------------------------------------------------
interface RevealProps {
  children: ReactNode;
  delay?: number;
  from?: "bottom" | "left" | "right";
  className?: string;
}

export function Reveal({ children, delay = 0, from = "bottom", className }: RevealProps) {
  const { ref, visible } = useReveal(0.1);

  const hiddenTransform =
    from === "bottom"
      ? "translateY(24px)"
      : from === "left"
        ? "translateX(-24px)"
        : "translateX(24px)";

  return (
    <div
      ref={ref}
      className={className}
      style={{
        opacity: visible ? 1 : 0,
        transform: visible ? "none" : hiddenTransform,
        transition: `opacity 0.6s cubic-bezier(0.16,1,0.3,1) ${delay}ms, transform 0.6s cubic-bezier(0.16,1,0.3,1) ${delay}ms`,
      }}
    >
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// PageEnter — fades + slides the entire page content up on mount
// ---------------------------------------------------------------------------
interface PageEnterProps {
  children: ReactNode;
  className?: string;
}

export function PageEnter({ children, className }: PageEnterProps) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setVisible(true), 60);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div
      className={className}
      style={{
        opacity: visible ? 1 : 0,
        transform: visible ? "none" : "translateY(12px)",
        transition: "opacity 0.4s ease, transform 0.4s ease",
      }}
    >
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// FadeIn — pure opacity fade
// ---------------------------------------------------------------------------
interface FadeInProps {
  children: ReactNode;
  delay?: number;
  className?: string;
}

export function FadeIn({ children, delay = 0, className }: FadeInProps) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setVisible(true), delay);
    return () => clearTimeout(timer);
  }, [delay]);

  return (
    <div
      className={className}
      style={{
        opacity: visible ? 1 : 0,
        transition: `opacity 0.5s ease ${delay}ms`,
      }}
    >
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// SlideIn — slides from a direction with fade
// ---------------------------------------------------------------------------
interface SlideInProps {
  children: ReactNode;
  delay?: number;
  from?: "bottom" | "left" | "right" | "top";
  className?: string;
}

export function SlideIn({ children, delay = 0, from = "bottom", className }: SlideInProps) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setVisible(true), delay);
    return () => clearTimeout(timer);
  }, [delay]);

  const hiddenTransform =
    from === "bottom"
      ? "translateY(24px)"
      : from === "top"
        ? "translateY(-24px)"
        : from === "left"
          ? "translateX(-24px)"
          : "translateX(24px)";

  return (
    <div
      className={className}
      style={{
        opacity: visible ? 1 : 0,
        transform: visible ? "none" : hiddenTransform,
        transition: `opacity 0.5s cubic-bezier(0.16,1,0.3,1) ${delay}ms, transform 0.5s cubic-bezier(0.16,1,0.3,1) ${delay}ms`,
      }}
    >
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// StaggerChildren — clones each child adding staggered animationDelay
// ---------------------------------------------------------------------------
interface StaggerChildrenProps {
  children: ReactNode;
  stagger?: number;
  className?: string;
}

export function StaggerChildren({ children, stagger = 80, className }: StaggerChildrenProps) {
  const childArray = Children.toArray(children);

  return (
    <div className={className}>
      {childArray.map((child, i) => {
        if (!isValidElement(child)) return child;
        return cloneElement(child as React.ReactElement<React.HTMLAttributes<HTMLElement>>, {
          style: {
            ...(child.props as React.HTMLAttributes<HTMLElement>).style,
            animationDelay: `${i * stagger}ms`,
          },
        });
      })}
    </div>
  );
}
