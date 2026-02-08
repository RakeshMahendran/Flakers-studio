"use client";

import { TamboThreadMessage } from "@tambo-ai/react";
import { ExternalLink, FileText, CheckCircle, XCircle, Shield } from "lucide-react";
import { motion } from "framer-motion";

/**
 * CustomMessageRenderer
 * 
 * Enhanced message renderer that shows RAG tool results beautifully
 */

interface CustomMessageRendererProps {
  message: TamboThreadMessage;
}

export function CustomMessageRenderer({ message }: CustomMessageRendererProps) {
  // Check if this message has a query_rag_backend tool call
  const ragToolCall: any = message.tool_calls?.find(
    (tc: any) => tc.toolName === "query_rag_backend"
  );

  if (!ragToolCall || !ragToolCall.result) {
    return null;
  }

  const result = ragToolCall.result as any;
  
  if (!result.success) {
    return (
      <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-lg">
        <div className="flex items-center gap-2 text-red-800 font-bold mb-2">
          <XCircle className="w-4 h-4" />
          Error querying knowledge base
        </div>
        <p className="text-sm text-red-600">{result.error}</p>
      </div>
    );
  }

  const isRefused = result.decision === "REFUSE";

  return (
    <div className="mt-4 space-y-3">
      {/* Governance Decision */}
      {isRefused && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="p-4 bg-red-50 border border-red-200 rounded-lg"
        >
          <div className="flex items-center gap-2 text-red-800 font-bold mb-2">
            <Shield className="w-4 h-4" />
            Governance Rule Applied
          </div>
          <p className="text-sm text-red-600">{result.reason}</p>
        </motion.div>
      )}

      {/* Sources */}
      {result.sources && result.sources.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="space-y-3 mt-4"
        >
          <div className="flex items-center gap-2 text-sm font-bold text-slate-700">
            <FileText className="w-4 h-4 text-blue-600" />
            Sources ({result.sources.length})
          </div>
          <div className="space-y-2">
            {result.sources.map((source: any, index: number) => (
              <motion.a
                key={index}
                href={source.url}
                target="_blank"
                rel="noopener noreferrer"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.1 + index * 0.05 }}
                className="flex items-start gap-3 p-4 bg-blue-50 border-2 border-blue-200 rounded-xl hover:bg-blue-100 hover:border-blue-300 hover:shadow-md transition-all group cursor-pointer"
              >
                <div className="p-2 bg-blue-100 rounded-lg group-hover:bg-blue-200 transition-colors">
                  <ExternalLink className="w-4 h-4 text-blue-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-bold text-base text-blue-900 group-hover:text-blue-700 mb-1">
                    {source.title}
                  </div>
                  <div className="text-sm text-blue-600 flex items-center gap-1 break-all">
                    {source.url}
                  </div>
                  {source.intent && source.intent !== "unknown" && (
                    <div className="mt-2">
                      <span className="inline-block px-2 py-1 bg-blue-100 text-blue-700 text-xs rounded-md font-medium">
                        {source.intent}
                      </span>
                    </div>
                  )}
                </div>
              </motion.a>
            ))}
          </div>
        </motion.div>
      )}

      {/* Processing Time */}
      {result.processing_time_ms && (
        <div className="text-xs text-slate-500">
          Processed in {result.processing_time_ms}ms
        </div>
      )}

      {/* Rules Applied */}
      {result.rules_applied && result.rules_applied.length > 0 && (
        <div className="p-3 bg-green-50 border border-green-100 rounded-lg">
          <div className="flex items-center gap-2 text-green-800 text-xs font-bold mb-2">
            <CheckCircle className="w-3 h-3" />
            Governance Checks Passed
          </div>
          <div className="space-y-1">
            {result.rules_applied.map((rule: string, index: number) => (
              <div key={index} className="text-xs text-green-700">
                • {rule}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
