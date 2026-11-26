import { OnlineGame } from "@/components/skyjo/OnlineGame";

export default async function Page({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  return <OnlineGame code={code.toUpperCase()} />;
}
