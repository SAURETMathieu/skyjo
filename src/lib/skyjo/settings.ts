"use client";

import { useEffect, useState } from "react";

import { isBotLevel, type BotLevel } from "@/lib/skyjo/types";

const KEY = "skyjo-settings";

export type SkyjoSettings = {
  turnCallout: boolean;
  botLevel: BotLevel;
};

const defaults: SkyjoSettings = {
  turnCallout: false,
  botLevel: "normal",
};

function readLevel(value: unknown): BotLevel {
  return isBotLevel(value) ? value : "normal";
}

export function loadSettings(): SkyjoSettings {
  if (typeof window === "undefined") return defaults;
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return defaults;
    const parsed = JSON.parse(raw) as Partial<SkyjoSettings>;
    return {
      turnCallout: parsed.turnCallout === true,
      botLevel: readLevel(parsed.botLevel),
    };
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
