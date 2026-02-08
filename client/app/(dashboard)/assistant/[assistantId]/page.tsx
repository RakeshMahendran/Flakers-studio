"use client";

import { ChatInterfaceTambo } from "@/components/flakers-studio/screens/chat-interface-tambo";
import { use } from "react";

export default function AssistantPage({ 
  params 
}: { 
  params: Promise<{ assistantId: string }> 
}) {
  const { assistantId } = use(params);
  return <ChatInterfaceTambo assistantId={assistantId} />;
}
