"use client";

import { ComponentRenderOrChildren } from "@/components/tambo/base/types/component-render-or-children";

interface Source {
  url: string;
  title: string;
  intent: string;
}

interface AnswerCardProps {
  answer: string;
  sources: Source[];
  rulesApplied: string[];
  processingTimeMs: number;
  children?: ComponentRenderOrChildren;
}

export function AnswerCard({
  answer,
  sources,
  rulesApplied,
  processingTimeMs,
  children,
}: AnswerCardProps) {
  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-4">
      {/* Answer Content */}
      <div className="prose prose-sm max-w-none mb-6">
        <div className="text-gray-900 leading-relaxed whitespace-pre-wrap">
          {answer}
        </div>
      </div>

      {/* Sources Section */}
      {sources.length > 0 && (
        <div className="border-t border-gray-100 pt-4 mb-4">
          <h4 className="text-sm font-medium text-gray-700 mb-3">Sources</h4>
          <div className="space-y-2">
            {sources.map((source, index) => (
              <div key={index} className="flex items-start space-x-3">
                <div className="flex-shrink-0">
                  <div className="w-2 h-2 bg-indigo-500 rounded-full mt-2"></div>
                </div>
                <div className="flex-1 min-w-0">
                  <a
                    href={source.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-indigo-600 hover:text-indigo-800 font-medium"
                  >
                    {source.title}
                  </a>
                  <div className="text-xs text-gray-500 mt-1">
                    Intent: {source.intent}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Governance Info */}
      <div className="border-t border-gray-100 pt-4">
        <div className="flex items-center justify-between text-xs text-gray-500">
          <div className="flex items-center space-x-4">
            <span>Rules applied: {rulesApplied.length}</span>
            <span>Processing: {processingTimeMs}ms</span>
          </div>
          <div className="flex items-center space-x-1">
            <div className="w-2 h-2 bg-green-500 rounded-full"></div>
            <span>Governance approved</span>
          </div>
        </div>
      </div>

      {children}
    </div>
  );
}