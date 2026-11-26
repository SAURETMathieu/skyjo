"use client";

import { useEffect, useState } from "react";

const KEY = "skyjo-settings";

export type SkyjoSettings = {
  turnCallout: boolean;
};

const defaults: SkyjoSettings = {
  turnCallout: true,
};

export function loadSettings(): SkyjoSettings {
  if (typeof window === "undefined") return defaults;
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return defaults;
    const parsed = JSON.parse(raw) as Partial<SkyjoSettings>;
    return { turnCallout: parsed.turnCallout !== false };
  } catch {
    return defaults;
  }
}

export function saveSettings(next: SkyjoSettings) {
  localStorage.setItem(KEY, JSON.stringify(next));
}

export function useSkyjoSettings() {
  const [settings, setSettings] = useState(defaults);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setSettings(loadSettings());
    setReady(true);
  }, []);

  function update(patch: Partial<SkyjoSettings>) {
    setSettings((current) => {
      const next = { ...current, ...patch };
      saveSettings(next);
      return next;
    });
  }

  return { settings, ready, update };
}
