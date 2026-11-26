"use client";

import type { BotLevel } from "@/lib/skyjo/types";

const LEVELS: { id: BotLevel; label: string; hint: string }[] = [
  { id: "easy", label: "Facile", hint: "Coups simples" },
  { id: "normal", label: "Normal", hint: "Joue solide" },
  { id: "hard", label: "Difficile", hint: "Compte les cartes" },
  { id: "extreme", label: "Extrême", hint: "Voit son jeu caché" },
];

export function botLevelLabel(level: BotLevel | undefined) {
  return LEVELS.find((entry) => entry.id === level)?.label ?? "Normal";
}

export function BotLevelPicker({
  value,
  onChange,
}: {
  value: BotLevel;
  onChange: (level: BotLevel) => void;
}) {
  const hint = LEVELS.find((entry) => entry.id === value)?.hint ?? "";
  return (
    <div>
      <p className="text-center text-sm font-bold text-white/70">Difficulté</p>
      <div
        className="mt-2 grid grid-cols-4 gap-1.5"
        role="radiogroup"
        aria-label="Difficulté des bots"
      >
        {LEVELS.map((level) => {
          const selected = value === level.id;
          return (
            <button
              key={level.id}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => onChange(level.id)}
              className={`h-11 rounded-2xl px-1 text-xs font-extrabold ${
                selected
                  ? "bg-amber-300 text-[#1a1405]"
                  : "bg-white/10 text-white"
              }`}
            >
              {level.label}
            </button>
          );
        })}
      </div>
      <p className="mt-2 min-h-5 text-center text-xs text-white/60">{hint}</p>
    </div>
  );
}
