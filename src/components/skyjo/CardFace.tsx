import { CARD_STYLE } from "@/lib/skyjo/cards";

export function CardFace({
  value,
  faceUp,
  empty = false,
  size = "md",
  interactive = false,
  indices = false,
  highlight = false,
  framed = false,
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
  onClick?: () => void;
  label: string;
}) {
  const palette = faceUp && value !== null ? CARD_STYLE[value] : undefined;
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
          highlight || interactive
            ? "shadow-[0_0_0_2px_#fcd34d,0_8px_16px_rgba(0,0,0,0.32)]"
            : "shadow-[0_8px_16px_rgba(0,0,0,0.32)]",
        ].join(" "),
    interactive ? "transition active:scale-[0.97]" : "",
  ].join(" ");
  const style = palette
    ? { background: palette.background, color: palette.color }
    : undefined;
  const body = empty ? null : faceUp && value !== null ? (
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

  if (onClick) {
    return (
      <button
        type="button"
        aria-label={label}
        onClick={onClick}
        disabled={!interactive}
        className={className}
        style={style}
      >
        {body}
      </button>
    );
  }

  return (
    <div role="img" aria-label={label} className={className} style={style}>
      {body}
    </div>
  );
}
