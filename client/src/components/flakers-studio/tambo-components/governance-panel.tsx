"use client";

import { useState } from "react";

interface GovernancePanelProps {
  rulesApplied: string[];
  decision: "ANSWER" | "REFUSE";
  reason?: string;
  processingTimeMs: number;
  children?: React.ReactNode;
}

const RULE_DESCRIPTIONS = {
  require_context: "Requires relevant content from knowledge base",
  tenant_isolation: "Prevents cross-tenant data access",
  intent_filtering: "Filters content by allowed intents",
  attribution_required: "Requires source attribution",
  policy_quote_only: "Policy content must be quoted directly",
  confidence_threshold: "Requires high confidence in retrieved content",
};

export function GovernancePanel({
  rulesApplied,
  decision,
  reason,
  processingTimeMs,
  children,
}: GovernancePanelProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <div className="bg-gray-50 rounded-lg border border-gray-200 p-4 mb-4">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex items-center justify-between w-full text-left"
      >
        <div className="flex items-center space-x-2">
          <div className={`w-3 h-3 rounded-full ${
            decision === "ANSWER" ? "bg-green-500" : "bg-amber-500"
          }`}></div>
          <span className="text-sm font-medium text-gray-700">
            Governance Decision: {decision}
          </span>
        </div>
        <div className="flex items-center space-x-2 text-xs text-gray-500">
          <span>{processingTimeMs}ms</span>
          <svg
            className={`w-4 h-4 transition-transform ${
              isExpanded ? "rotate-180" : ""
            }`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M19 9l-7 7-7-7"
            />
          </svg>
        </div>
      </button>

      {isExpanded && (
        <div className="mt-4 space-y-4">
          {/* Decision Details */}
          <div>
            <h4 className="text-sm font-medium text-gray-700 mb-2">
              Decision Details
            </h4>
            <div className="bg-white rounded-md p-3 text-sm">
              <div className="flex justify-between items-center mb-2">
                <span className="text-gray-600">Decision:</span>
                <span className={`font-medium ${
                  decision === "ANSWER" ? "text-green-600" : "text-amber-600"
                }`}>
                  {decision}
                </span>
              </div>
              {reason && (
                <div className="flex justify-between items-center mb-2">
                  <span className="text-gray-600">Reason:</span>
                  <span className="text-gray-900">{reason}</span>
                </div>
              )}
              <div className="flex justify-between items-center">
                <span className="text-gray-600">Processing Time:</span>
                <span className="text-gray-900">{processingTimeMs}ms</span>
              </div>
            </div>
          </div>

          {/* Applied Rules */}
          <div>
            <h4 className="text-sm font-medium text-gray-700 mb-2">
              Applied Rules ({rulesApplied.length})
            </h4>
            <div className="space-y-2">
              {rulesApplied.map((rule, index) => (
                <div key={index} className="bg-white rounded-md p-3">
                  <div className="flex items-start space-x-2">
                    <div className="w-2 h-2 bg-indigo-500 rounded-full mt-2 flex-shrink-0"></div>
                    <div className="flex-1">
                      <div className="text-sm font-medium text-gray-900">
                        {rule.replace(/_/g, " ").replace(/\b\w/g, l => l.toUpperCase())}
                      </div>
                      <div className="text-xs text-gray-600 mt-1">
                        {RULE_DESCRIPTIONS[rule as keyof typeof RULE_DESCRIPTIONS] || 
                         "Governance rule applied"}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {children}
    </div>
  );
}