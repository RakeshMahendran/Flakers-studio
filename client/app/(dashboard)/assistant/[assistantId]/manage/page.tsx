import { AssistantManageScreen } from "@/components/flakers-studio/screens/assistant-manage-screen";

export default async function AssistantManagePage({
  params,
}: {
  params: Promise<{ assistantId: string }>;
}) {
  const { assistantId } = await params;
  return <AssistantManageScreen assistantId={assistantId} />;
}
