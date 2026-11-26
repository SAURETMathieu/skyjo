import { LocalGame } from "@/components/skyjo/LocalGame";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ bots?: string }>;
}) {
  const params = await searchParams;
  const bots = Number(params.bots ?? 0);
  return <LocalGame bots={Number.isFinite(bots) ? bots : 0} />;
}
