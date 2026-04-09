"use client";

const pad2 = (value: number) => String(value).padStart(2, "0");

export function getLocalDayKey(now: Date = new Date()) {
  const year = now.getFullYear();
  const month = pad2(now.getMonth() + 1);
  const day = pad2(now.getDate());
  return `${year}-${month}-${day}`;
}

type Listener = () => void;

const listeners = new Set<Listener>();
let timer: ReturnType<typeof setTimeout> | null = null;

const scheduleNextTick = () => {
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
  if (listeners.size === 0) return;

  const now = new Date();
  const nextMidnight = new Date(now);
  nextMidnight.setHours(24, 0, 0, 0);
  const ms = Math.max(0, nextMidnight.getTime() - now.getTime() + 50);

  timer = setTimeout(() => {
    for (const listener of [...listeners]) {
      try {
        listener();
      } catch {
        // ignore listener errors
      }
    }
    scheduleNextTick();
  }, ms);
};

export function subscribeLocalDayChange(listener: Listener) {
  listeners.add(listener);
  scheduleNextTick();

  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && timer) {
      clearTimeout(timer);
      timer = null;
    }
  };
}

