"use client";

import { AssistantReviewScreen } from "@/components/flakers-studio/screens/assistant-review-screen";
import { use } from "react";

export default function AssistantReviewPage({ 
  params 
}: { 
  params: Promise<{ assistantId: string }> 
}) {
  const { assistantId } = use(params);
  return <AssistantReviewScreen assistantId={assistantId} />;
}
