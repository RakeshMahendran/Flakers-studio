"use client";

import { motion } from "framer-motion";
import { ExternalLink, FileText, TrendingUp } from "lucide-react";
import { useState } from "react";

/**
 * SourceExplorer - Generative UI Component
 * 
 * Rendered when user asks about sources or wants to verify information.
 * Shows interactive source cards with relevance scores.
 */

interface Source {
  id: string;
  title: string;
  url: string;
  snippet: string;
  relevanceScore: number;
  intent?: string;
}

interface SourceExplorerProps {
  sources: Source[];
}

export function SourceExplorer({ sources }: SourceExplorerProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const getScoreColor = (score: number) => {
    if (score >= 80) return "text-green-600 bg-green-50 border-green-200";
    if (score >= 60) return "text-blue-600 bg-blue-50 border-blue-200";
    if (score >= 40) return "text-yellow-600 bg-yellow-50 border-yellow-200";
    return "text-slate-600 bg-slate-50 border-slate-200";
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-4"
    >
      <div className="flex items-center gap-2 mb-4">
        <FileText className="w-5 h-5 text-blue-600" />
        <h3 className="font-bold text-lg text-slate-900">
          Sources ({sources.length})
        </h3>
      </div>

      <div className="space-y-3">
        {sources.map((source, index) => (
          <motion.div
            key={source.id}
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: index * 0.1 }}
            className="bg-white rounded-xl border border-slate-200 overflow-hidden hover:shadow-md transition-shadow"
          >
            {/* Header */}
            <div className="p-4">
              <div className="flex items-start justify-between gap-3 mb-3">
                <div className="flex-1">
                  <h4 className="font-bold text-slate-900 mb-1">
                    {source.title}
                  </h4>
                  <a
                    href={source.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-blue-600 hover:underline flex items-center gap-1"
                  >
                    {source.url}
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </div>

                {/* Relevance Score */}
                <div
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border ${getScoreColor(source.relevanceScore)}`}
                >
                  <TrendingUp className="w-3 h-3" />
                  <span className="text-xs font-bold">
                    {source.relevanceScore}%
                  </span>
                </div>
              </div>

              {/* Snippet */}
              <div className="relative">
                <p
                  className={`text-sm text-slate-600 leading-relaxed ${
                    expandedId === source.id ? "" : "line-clamp-2"
                  }`}
                >
                  {source.snippet}
                </p>
                {source.snippet.length > 150 && (
                  <button
                    onClick={() =>
                      setExpandedId(expandedId === source.id ? null : source.id)
                    }
                    className="text-xs text-blue-600 hover:underline mt-1"
                  >
                    {expandedId === source.id ? "Show less" : "Show more"}
                  </button>
                )}
              </div>

              {/* Intent Badge */}
              {source.intent && (
                <div className="mt-3">
                  <span className="inline-block px-2 py-1 bg-slate-100 text-slate-700 text-xs rounded-md">
                    {source.intent}
                  </span>
                </div>
              )}
            </div>

            {/* Action Bar */}
            <div className="border-t border-slate-100 bg-slate-50 px-4 py-2">
              <a
                href={source.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs font-medium text-blue-600 hover:text-blue-700 flex items-center gap-1"
              >
                View full source
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          </motion.div>
        ))}
      </div>

      {/* Summary */}
      <div className="mt-4 p-4 bg-blue-50 rounded-lg border border-blue-100">
        <p className="text-sm text-blue-900">
          <span className="font-bold">
            {sources.filter((s) => s.relevanceScore >= 80).length}
          </span>{" "}
          highly relevant sources •{" "}
          <span className="font-bold">
            {Math.round(
              sources.reduce((sum, s) => sum + s.relevanceScore, 0) /
                sources.length
            )}
            %
          </span>{" "}
          average relevance
        </p>
      </div>
    </motion.div>
  );
}
