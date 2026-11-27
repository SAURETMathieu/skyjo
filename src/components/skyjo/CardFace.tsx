import { memo, useEffect, useRef, useState } from "react";

import { CARD_STYLE } from "@/lib/skyjo/cards";

export const CardFace = memo(function CardFace({
  value,
  faceUp,
  empty = false,
  size = "md",
  interactive = false,
  indices = false,
  highlight = false,
  framed = false,
  settle = false,
  anticipate = false,
  onClick,
  label,
}: {
  value: number | null;
  faceUp: boolean;
  empty?: boolean;
  size?: "sm" | "md";
  interactive?: boolean;
  indices?: boolean;
  highlight?: boolean;
  framed?: boolean;
  settle?: boolean;
  anticipate?: boolean;
  onClick?: (element: HTMLElement) => void;
  label: string;
}) {
  const clickRef = useRef(onClick);
  clickRef.current = onClick;
  const faceRef = useRef(faceUp);
  const anticipateRef = useRef(anticipate);
  faceRef.current = faceUp;
  anticipateRef.current = anticipate;
  const reduce = useRef<boolean | null>(null);
  if (reduce.current === null) {
    reduce.current =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }
  const [phase, setPhase] = useState<"idle" | "shut" | "hold" | "open">("idle");
  const [showFace, setShowFace] = useState(faceUp);
  const wantsShut =
    !reduce.current &&
    !settle &&
    phase === "idle" &&
    ((anticipate && !faceUp) || (faceUp && !showFace));
  if (reduce.current || settle) {
    if (phase !== "idle") setPhase("idle");
    if (showFace !== faceUp) setShowFace(faceUp);
  } else if (wantsShut) {
    setPhase("shut");
  } else if (phase === "hold" && faceUp) {
    setShowFace(true);
    setPhase("open");
  } else if (phase === "hold" && !anticipate) {
    setPhase("open");
  } else if (phase === "idle" && !faceUp && showFace) {
    setShowFace(false);
  }

  useEffect(() => {
    if (phase !== "shut" && phase !== "open") return;
    const delay = phase === "shut" ? 140 : 180;
    const timer = window.setTimeout(() => {
      if (phase === "open") {
        setPhase("idle");
        return;
      }
      if (faceRef.current) {
        setShowFace(true);
        setPhase("open");
        return;
      }
      if (anticipateRef.current) {
        setPhase("hold");
        return;
      }
      setPhase("open");
    }, delay);
    return () => window.clearTimeout(timer);
  }, [phase]);

  const revealed = showFace && value !== null;
  const palette = revealed ? CARD_STYLE[value] : undefined;
  const className = [
    "relative flex aspect-[3/4] w-full items-center justify-center overflow-hidden font-extrabold tabular-nums select-none",
    size === "sm"
      ? "rounded-md text-[10px]"
      : "rounded-2xl text-[clamp(1.2rem,5.6vw,1.8rem)]",
    empty
      ? framed
        ? "border-2 border-dashed border-white/45 bg-black/25 shadow-none"
        : "border border-dashed border-white/20 bg-black/25 shadow-none"
      : [
          framed ? "border-2 border-white" : "",
          phase === "idle" && (highlight || interactive)
            ? "skyjo-ring"
            : "shadow-[0_8px_16px_rgba(0,0,0,0.32)]",
        ].join(" "),
    phase === "shut"
      ? "skyjo-flip-shut"
      : phase === "hold"
        ? "skyjo-flip-hold"
        : phase === "open"
          ? "skyjo-flip-open"
          : "",
  ].join(" ");
  const style = palette
    ? { background: palette.background, color: palette.color }
    : undefined;
  const body = empty ? null : revealed ? (
    <>
      <span className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(255,255,255,0.16),transparent_38%)]" />
      {framed ? null : (
        <span className="pointer-events-none absolute inset-0 shadow-[inset_0_0_0_1.5px_rgba(255,255,255,0.35)]" />
      )}
      {indices ? (
        <span className="absolute top-1.5 left-1.5 text-[10px] leading-none">
          {value}
        </span>
      ) : null}
      <span className="relative">{value}</span>
    </>
  ) : (
    <span className="absolute inset-0 bg-[linear-gradient(160deg,#2b6eb3_0%,#16345f_48%,#0b1c36_100%)]">
      <span className="absolute inset-[8%] rounded-[16%] border border-white/40" />
      <span className="absolute top-1/2 left-1/2 size-[32%] -translate-x-1/2 -translate-y-1/2 rotate-45 rounded-[3px] bg-white/10 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.4)]" />
    </span>
  );

  return (
    <div
      role={interactive ? "button" : "img"}
      tabIndex={interactive ? 0 : undefined}
      aria-label={label}
      onPointerDown={
        interactive && !faceUp && !empty
          ? () => setPhase((current) => (current === "idle" ? "shut" : current))
          : undefined
      }
      onClick={
        interactive
          ? (event) => clickRef.current?.(event.currentTarget)
          : undefined
      }
      onKeyDown={
        interactive
          ? (event) => {
              if (event.key !== "Enter" && event.key !== " ") return;
              event.preventDefault();
              clickRef.current?.(event.currentTarget);
            }
          : undefined
      }
      className={className}
      style={style}
    >
      {body}
    </div>
  );
}, sameCard);

function sameCard(
  prev: {
    value: number | null;
    faceUp: boolean;
    empty?: boolean;
    size?: "sm" | "md";
    interactive?: boolean;
    indices?: boolean;
    highlight?: boolean;
    framed?: boolean;
    settle?: boolean;
    anticipate?: boolean;
    label: string;
  },
  next: {
    value: number | null;
    faceUp: boolean;
    empty?: boolean;
    size?: "sm" | "md";
    interactive?: boolean;
    indices?: boolean;
    highlight?: boolean;
    framed?: boolean;
    settle?: boolean;
    anticipate?: boolean;
    label: string;
  }
) {
  return (
    prev.value === next.value &&
    prev.faceUp === next.faceUp &&
    prev.empty === next.empty &&
    prev.size === next.size &&
    prev.interactive === next.interactive &&
    prev.indices === next.indices &&
    prev.highlight === next.highlight &&
    prev.framed === next.framed &&
    prev.settle === next.settle &&
    prev.anticipate === next.anticipate &&
    prev.label === next.label
  );
}
