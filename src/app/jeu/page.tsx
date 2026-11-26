import { isBotLevel, type BotLevel } from "@/lib/skyjo/types";
import { LocalGame } from "@/components/skyjo/LocalGame";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ bots?: string; level?: string; apercu?: string }>;
}) {
  const params = await searchParams;
  const bots = Number(params.bots ?? 0);
  return (
    <LocalGame
      bots={Number.isFinite(bots) ? bots : 0}
      level={readLevel(params.level)}
      preview={readPreview(params.apercu)}
    />
  );
}

function readPreview(value: string | undefined) {
  return value === "manche" || value === "partie" ? value : null;
}

function readLevel(value: string | undefined): BotLevel {
  return isBotLevel(value) ? value : "normal";
}
