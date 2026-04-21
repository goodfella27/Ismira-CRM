"use client";

import { useEffect, useState } from "react";
import { getLocalDayKey, subscribeLocalDayChange } from "@/lib/day-key";

export function useLocalDayKey() {
  const [dayKey, setDayKey] = useState(() => getLocalDayKey());

  useEffect(() => {
    return subscribeLocalDayChange(() => {
      setDayKey(getLocalDayKey());
    });
  }, []);

  return dayKey;
}

