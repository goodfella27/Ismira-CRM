"use client";

import * as React from "react";

import { cn } from "@/lib/utils";

export type LogoStackItem = {
  id: string;
  label: string;
  gradient?: string;
  src?: string;
};

export type LogoStackSliderProps = {
  items?: LogoStackItem[];
  size?: number;
  intervalMs?: number;
  transitionMs?: number;
  stackOffsetPx?: number;
  pauseOnHover?: boolean;
  className?: string;
};

const DEFAULT_ITEMS: LogoStackItem[] = [
  {
    id: "aurora",
    label: "A",
    gradient: "linear-gradient(135deg, #22c55e 0%, #0ea5e9 55%, #a855f7 100%)",
  },
  {
    id: "sunset",
    label: "S",
    gradient: "linear-gradient(135deg, #fb7185 0%, #f97316 45%, #facc15 100%)",
  },
  {
    id: "ocean",
    label: "O",
    gradient: "linear-gradient(135deg, #0ea5e9 0%, #2563eb 55%, #1e3a8a 100%)",
  },
  {
    id: "mint",
    label: "M",
    gradient: "linear-gradient(135deg, #14b8a6 0%, #22c55e 55%, #bef264 100%)",
  },
  {
    id: "berry",
    label: "B",
    gradient: "linear-gradient(135deg, #6366f1 0%, #a855f7 55%, #fb7185 100%)",
  },
  {
    id: "ember",
    label: "E",
    gradient: "linear-gradient(135deg, #f97316 0%, #ef4444 55%, #7c2d12 100%)",
  },
];

function usePrefersReducedMotion() {
  const [reduced, setReduced] = React.useState(false);

  React.useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(mq.matches);
    update();

    if (typeof mq.addEventListener === "function") {
      mq.addEventListener("change", update);
      return () => mq.removeEventListener("change", update);
    }

    mq.addListener(update);
    return () => mq.removeListener(update);
  }, []);

  return reduced;
}

export function LogoStackSlider({
  items = DEFAULT_ITEMS,
  size = 120,
  intervalMs = 1400,
  transitionMs = 520,
  stackOffsetPx = 14,
  pauseOnHover = true,
  className,
}: LogoStackSliderProps) {
  const prefersReducedMotion = usePrefersReducedMotion();
  const [activeIndex, setActiveIndex] = React.useState(0);
  const [paused, setPaused] = React.useState(false);

  const count = items.length;

  React.useEffect(() => {
    if (activeIndex >= count) setActiveIndex(0);
  }, [activeIndex, count]);

  React.useEffect(() => {
    if (prefersReducedMotion) return;
    if (count <= 1) return;
    if (paused) return;

    const interval = window.setInterval(() => {
      setActiveIndex((v) => (v + 1) % count);
    }, intervalMs);

    return () => window.clearInterval(interval);
  }, [count, intervalMs, paused, prefersReducedMotion]);

  const wrapperHeight = size + stackOffsetPx * 2 + 8;
  const activeLabel = items[activeIndex]?.label ?? "Logo";

  return (
    <div
      className={cn("relative isolate select-none", className)}
      style={{ width: size, height: wrapperHeight }}
      onMouseEnter={pauseOnHover ? () => setPaused(true) : undefined}
      onMouseLeave={pauseOnHover ? () => setPaused(false) : undefined}
      onFocusCapture={pauseOnHover ? () => setPaused(true) : undefined}
      onBlurCapture={pauseOnHover ? () => setPaused(false) : undefined}
      aria-label="Logo slider"
    >
      <span className="sr-only">Currently showing {activeLabel}</span>
      {items.map((item, index) => {
        const pos = (index - activeIndex + count) % count;

        const isActive = pos === 0;
        const isBehind1 = pos === 1;
        const isBehind2 = pos === 2;

        const opacity = isActive ? 1 : isBehind1 ? 0.58 : isBehind2 ? 0.34 : 0;
        const scale = isActive ? 1 : isBehind1 ? 0.93 : isBehind2 ? 0.86 : 0.82;
        const translateY = isActive
          ? 0
          : isBehind1
            ? -stackOffsetPx
            : isBehind2
              ? -stackOffsetPx * 2
              : -stackOffsetPx * 3;
        // Blur can "bleed" around the active card edges (especially on light fallback backgrounds),
        // creating thin white lines. Use scale/opacity only for the stacked depth effect.
        const blur = 0;
        const zIndex = isActive ? 30 : isBehind1 ? 20 : isBehind2 ? 10 : 0;

        const isVisible = isActive || isBehind1 || isBehind2;
        const showContent = isActive;
        const showImage = showContent && !!item.src;
        const fallbackBackground =
          "linear-gradient(180deg, rgba(255,255,255,0.98), rgba(241,245,249,0.98))";
        const backgroundImage = isActive ? item.gradient ?? fallbackBackground : fallbackBackground;

        return (
          <div
            key={item.id}
            className={cn(
              "absolute left-0 bottom-0 grid place-items-center",
              "overflow-hidden rounded-[28px] ring-1 ring-black/5 shadow-[0_26px_60px_-30px_rgba(0,0,0,0.45)]",
              "transition-[transform,opacity,filter] ease-out will-change-[transform,opacity,filter]",
              prefersReducedMotion && "transition-none",
            )}
            style={{
              width: size,
              height: size,
              zIndex,
              opacity,
              transform: `translate3d(0, ${translateY}px, 0) scale(${scale})`,
              filter: `blur(${blur}px)`,
              backgroundImage,
              backgroundColor: showImage ? "transparent" : "rgba(255,255,255,0.98)",
              backgroundSize: "cover",
              backgroundPosition: "center",
              transitionDuration: `${transitionMs}ms`,
              pointerEvents: isVisible ? "auto" : "none",
            }}
            aria-hidden={!isVisible}
          >
            {showImage ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={item.src}
                alt={item.label}
                className="h-full w-full object-cover"
                style={{ transform: "scale(1.12)" }}
                loading="eager"
                decoding="async"
              />
            ) : showContent ? (
              <span className="text-3xl font-semibold tracking-tight text-white/95 drop-shadow-sm">
                {item.label}
              </span>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
