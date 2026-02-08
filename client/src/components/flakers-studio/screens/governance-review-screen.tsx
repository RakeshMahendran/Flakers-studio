"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Button, Card, Badge } from "@/components/ui/enhanced-ui";
import { 
  AlertTriangle, 
  Edit3, 
  Terminal, 
  Shield,
  CheckCircle,
  Loader2,
  Brain,
  ArrowRight
} from "lucide-react";

interface GovernanceReviewScreenProps {
  assistantId: string;
  assistantName: string;
  template: string;
  discoveredContent: {
    totalPages: number;
    contentTypes: Array<{
      type: string;
      count: number;
    }>;
    intents: Array<{
      intent: string;
      confidence: number;
      pageCount: number;
    }>;
  };
  onConfirm: () => void;
  onBack: () => void;
}

export function GovernanceReviewScreen({
  assistantId,
  assistantName,
  template,
  discoveredContent,
  onConfirm,
  onBack
}: GovernanceReviewScreenProps) {
  const [systemPrompt, setSystemPrompt] = useState<string>("");
  const [isLoading, setIsLoading] = useState(true);
  const [isDeploying, setIsDeploying] = useState(false);

  useEffect(() => {
    fetchSystemPrompt();
  }, [assistantId]);

  const fetchSystemPrompt = async () => {
    try {
      const response = await fetch(`/api/assistant/${assistantId}/system-prompt`);
      if (response.ok) {
        const data = await response.json();
        setSystemPrompt(data.system_prompt || generateDefaultPrompt());
      } else {
        setSystemPrompt(generateDefaultPrompt());
      }
    } catch (error) {
      console.error("Error fetching system prompt:", error);
      setSystemPrompt(generateDefaultPrompt());
    } finally {
      setIsLoading(false);
    }
  };

  const generateDefaultPrompt = () => {
    return `### ROLE
You are an AI assistant for ${assistantName}.
Your goal is to answer questions based ONLY on the provided context.

### CONTEXT SOURCES
${discoveredContent.contentTypes.map(ct => `- ${ct.type} (${ct.count} pages)`).join('\n')}

### GOVERNANCE RULES
1. REFUSAL: If the answer is not in the context, you must say: "I can't answer that because it's outside the approved content scope."
2. CITATIONS: You must cite the URL of the source document for every claim.
3. SCOPE: Only answer questions related to: ${discoveredContent.intents.map(i => i.intent).join(', ')}
4. TONE: Professional, concise, and helpful.

### FORMAT
Answer in markdown. Use bullet points for steps.`;
  };

  const handleConfirmAndDeploy = async () => {
    setIsDeploying(true);
    try {
      onConfirm();
    } catch (error) {
      console.error("Error starting ingestion:", error);
      setIsDeploying(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <Card className="max-w-md mx-auto text-center">
          <Loader2 className="w-12 h-12 animate-spin text-blue-600 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-slate-900 mb-2">
            Loading Governance Configuration...
          </h2>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <nav className="bg-white border-b border-slate-200 px-6 py-4">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
              <span className="text-white font-bold text-sm">FS</span>
            </div>
            <span className="font-serif font-bold text-slate-900 text-lg">Governance Review</span>
            <Badge color="blue">Step 2 of 2</Badge>
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <main className="max-w-6xl mx-auto px-6 py-12">
        <div className="text-center mb-12">
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.5 }}
          >
            <Shield className="w-16 h-16 text-blue-600 mx-auto mb-4" />
          </motion.div>
          <h1 className="text-3xl font-serif font-bold text-slate-900 mb-3">
            Review Assistant Behavior & Guardrails
          </h1>
          <p className="text-lg text-slate-600 max-w-2xl mx-auto">
            Review the auto-generated system instructions and governance rules before deploying your assistant.
          </p>
        </div>

        {/* Content Summary */}
        <Card className="mb-8">
          <h3 className="text-lg font-bold text-slate-900 mb-4">Discovered Content Summary</h3>
          <div className="grid gap-4 md:grid-cols-3">
            <div className="text-center p-4 bg-blue-50 rounded-lg">
              <div className="text-2xl font-bold text-blue-600">{discoveredContent.totalPages}</div>
              <div className="text-sm text-slate-600">Total Pages</div>
            </div>
            <div className="text-center p-4 bg-green-50 rounded-lg">
              <div className="text-2xl font-bold text-green-600">{discoveredContent.contentTypes.length}</div>
              <div className="text-sm text-slate-600">Content Types</div>
            </div>
            <div className="text-center p-4 bg-purple-50 rounded-lg">
              <div className="text-2xl font-bold text-purple-600">{discoveredContent.intents.length}</div>
              <div className="text-sm text-slate-600">Intent Categories</div>
            </div>
          </div>
        </Card>

        {/* System Prompt */}
        <Card className="mb-8 bg-[#1e1e1e] border-slate-800 text-slate-300 overflow-hidden shadow-2xl shadow-black/20" noPadding>
          <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 bg-[#252526]">
            <div className="flex items-center gap-3 text-sm font-bold text-slate-400">
              <Terminal className="w-4 h-4" />
              <span>System Prompt</span>
            </div>
            <Button variant="ghost" size="sm" className="text-blue-400 hover:text-blue-300 hover:bg-white/5">
              <Edit3 className="w-3 h-3 mr-2" />
              Edit (Advanced)
            </Button>
          </div>
          <div className="p-8 overflow-x-auto font-mono text-sm leading-relaxed text-[#d4d4d4] max-h-96 overflow-y-auto">
            <pre className="whitespace-pre-wrap">{systemPrompt}</pre>
          </div>
        </Card>

        {/* Warning */}
        <div className="flex items-start gap-4 p-5 bg-amber-50 border border-amber-100 rounded-xl text-amber-800 text-sm mb-8">
          <AlertTriangle className="w-5 h-5 shrink-0 text-amber-600 mt-0.5" />
          <p className="leading-relaxed">
            Changes to the prompt affect how strictly the assistant adheres to your governance rules. 
            We recommend testing extensively if you modify the "Governance Rules" section.
          </p>
        </div>

        {/* Next Steps Info */}
        <Card className="mb-8 bg-blue-50 border-blue-200">
          <div className="flex items-start gap-3">
            <Brain className="w-5 h-5 text-blue-600 mt-0.5" />
            <div>
              <h4 className="font-medium text-blue-900 mb-1">What happens next?</h4>
              <p className="text-sm text-blue-700 mb-2">
                When you click "Confirm & Deploy", we will:
              </p>
              <ul className="text-sm text-blue-700 space-y-1 ml-4">
                <li className="flex items-center gap-2">
                  <CheckCircle className="w-3 h-3" />
                  Process and chunk the discovered content
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle className="w-3 h-3" />
                  Generate AI embeddings for semantic search
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle className="w-3 h-3" />
                  Upload to vector database (Qdrant)
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle className="w-3 h-3" />
                  Activate your assistant for chat
                </li>
              </ul>
              <p className="text-sm text-blue-700 mt-2">
                This process typically takes 2-5 minutes depending on content size.
              </p>
            </div>
          </div>
        </Card>

        {/* Actions */}
        <div className="flex justify-between">
          <Button variant="ghost" onClick={onBack} disabled={isDeploying}>
            Back
          </Button>
          <Button 
            onClick={handleConfirmAndDeploy} 
            size="lg"
            disabled={isDeploying}
            className="bg-emerald-600 hover:bg-emerald-700 shadow-xl shadow-emerald-500/20"
          >
            {isDeploying ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Starting Deployment...
              </>
            ) : (
              <>
                Confirm & Deploy
                <ArrowRight className="w-4 h-4 ml-2" />
              </>
            )}
          </Button>
        </div>
      </main>
    </div>
  );
}
