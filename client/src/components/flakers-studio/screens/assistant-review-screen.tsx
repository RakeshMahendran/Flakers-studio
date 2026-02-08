"use client";

import { motion } from "framer-motion";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Button, Card, Badge } from "@/components/ui/enhanced-ui";
import { CheckCircle, Globe, Bot, FileText, ArrowRight } from "lucide-react";
import { useAuth } from "@/contexts/auth-context";
import type { Assistant } from "./dashboard-screen";
import { apiGet } from "@/lib/api-client";

interface AssistantReviewScreenProps {
  assistantId: string;
}

export function AssistantReviewScreen({
  assistantId,
}: AssistantReviewScreenProps) {
  const router = useRouter();
  const { user } = useAuth();
  const [assistant, setAssistant] = useState<Assistant | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchAssistant = async () => {
      if (!user) return;
      
      try {
        const response = await apiGet('/api/assistants', user.accessToken);
        const data = await response.json();
        const found = data.assistants?.find((a: Assistant) => a.id === assistantId);
        if (found) {
          setAssistant(found);
        }
      } catch (error) {
        console.error("Failed to fetch assistant:", error);
      } finally {
        setLoading(false);
      }
    };
    fetchAssistant();
  }, [assistantId, user]);

  if (loading || !assistant) {
    return <div className="flex h-screen items-center justify-center">Loading...</div>;
  }
  return (
    <div className="min-h-screen bg-slate-50">
      <nav className="bg-white border-b border-slate-200 px-6 py-4">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
              <span className="text-white font-bold text-sm">FS</span>
            </div>
            <span className="font-serif font-bold text-slate-900 text-lg">Review</span>
            <Badge color="green">Ready</Badge>
          </div>
        </div>
      </nav>

      <main className="max-w-4xl mx-auto px-6 py-12">
        <div className="text-center mb-10">
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.4 }}
          >
            <CheckCircle className="w-16 h-16 text-green-500 mx-auto mb-4" />
          </motion.div>
          <h1 className="text-3xl font-serif font-bold text-slate-900 mb-2">Setup Complete</h1>
          <p className="text-lg text-slate-600">Review your assistant details.</p>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          <Card>
            <h3 className="text-lg font-bold text-slate-900 mb-4">Project Details</h3>
            <dl className="space-y-3 text-sm">
              <div>
                <dt className="text-slate-500">Name</dt>
                <dd className="text-slate-900">{assistant.name}</dd>
              </div>
              {assistant.description && (
                <div>
                  <dt className="text-slate-500">Description</dt>
                  <dd className="text-slate-900">{assistant.description}</dd>
                </div>
              )}
              <div>
                <dt className="text-slate-500">URL</dt>
                <dd className="text-slate-900 break-all">{assistant.siteUrl}</dd>
              </div>
              <div>
                <dt className="text-slate-500">Assistant ID</dt>
                <dd className="text-slate-900 font-mono break-all">{assistantId}</dd>
              </div>
            </dl>
          </Card>

          <Card>
            <h3 className="text-lg font-bold text-slate-900 mb-4">Selections</h3>
            <div className="space-y-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-slate-600 flex items-center gap-2">
                  <Globe className="w-4 h-4" /> Source
                </span>
                <Badge color="blue" className="capitalize">{assistant.sourceType}</Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-600 flex items-center gap-2">
                  <Bot className="w-4 h-4" /> Template
                </span>
                <Badge color="blue" className="capitalize">{assistant.template}</Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-600 flex items-center gap-2">
                  <FileText className="w-4 h-4" /> Status
                </span>
                <Badge color="green">Ingested</Badge>
              </div>
            </div>
          </Card>

          <Card className="md:col-span-2">
            <h3 className="text-lg font-bold text-slate-900 mb-4">Ingestion Summary</h3>
            <div className="grid gap-4 md:grid-cols-3">
              <div className="text-center p-4 bg-blue-50 rounded-lg">
                <div className="text-2xl font-bold text-blue-600">{assistant.totalPagesCrawled}</div>
                <div className="text-sm text-slate-600">Pages</div>
              </div>
              <div className="text-center p-4 bg-green-50 rounded-lg">
                <div className="text-2xl font-bold text-green-600">{assistant.totalChunksIndexed}</div>
                <div className="text-sm text-slate-600">Chunks Indexed</div>
              </div>
              <div className="text-center p-4 bg-purple-50 rounded-lg">
                <div className="text-2xl font-bold text-purple-600">{assistant.allowedIntents?.length || 0}</div>
                <div className="text-sm text-slate-600">Intent Groups</div>
              </div>
            </div>
          </Card>
        </div>

        <div className="flex justify-end pt-10">
          <Button onClick={() => router.push('/dashboard')} size="lg">
            Continue
            <ArrowRight className="w-4 h-4 ml-2" />
          </Button>
        </div>
      </main>
    </div>
  );
}
