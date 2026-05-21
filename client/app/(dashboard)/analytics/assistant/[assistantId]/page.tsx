import { AssistantAnalyticsScreen } from "@/components/flakers-studio/screens/assistant-analytics-screen";

export default async function AssistantAnalyticsPage({
  params,
}: {
  params: Promise<{ assistantId: string }>;
}) {
  const { assistantId } = await params;
  return <AssistantAnalyticsScreen assistantId={assistantId} />;
}
