"use client";

import { motion } from "framer-motion";
import { ShieldCheck, ShieldX, AlertTriangle, CheckCircle, XCircle } from "lucide-react";

/**
 * GovernanceDecisionTree - Generative UI Component
 * 
 * Rendered when AI explains governance decisions.
 * Shows visual decision flow and why content was allowed/refused.
 */

interface DecisionStep {
  label: string;
  status: "pass" | "fail" | "warning";
  description: string;
}

interface GovernanceDecisionTreeProps {
  decision: "ANSWER" | "REFUSE";
  reason?: string;
  steps: DecisionStep[];
  suggestedAlternatives?: string[];
}

export function GovernanceDecisionTree({
  decision,
  reason,
  steps,
  suggestedAlternatives = [],
}: GovernanceDecisionTreeProps) {
  const isRefused = decision === "REFUSE";

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm"
    >
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        {isRefused ? (
          <div className="p-3 bg-red-50 rounded-lg">
            <ShieldX className="w-6 h-6 text-red-600" />
          </div>
        ) : (
          <div className="p-3 bg-green-50 rounded-lg">
            <ShieldCheck className="w-6 h-6 text-green-600" />
          </div>
        )}
        <div>
          <h3 className="font-bold text-lg text-slate-900">
            {isRefused ? "Request Refused" : "Request Approved"}
          </h3>
          {reason && (
            <p className="text-sm text-slate-600 mt-1">{reason}</p>
          )}
        </div>
      </div>

      {/* Decision Steps */}
      <div className="space-y-3 mb-6">
        <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">
          Governance Checks
        </div>
        {steps.map((step, index) => (
          <div key={index} className="flex items-start gap-3">
            {/* Connector Line */}
            {index < steps.length - 1 && (
              <div className="absolute left-[27px] mt-8 w-0.5 h-6 bg-slate-200" />
            )}
            
            {/* Status Icon */}
            <div className="relative z-10">
              {step.status === "pass" && (
                <div className="p-1.5 bg-green-50 rounded-full">
                  <CheckCircle className="w-4 h-4 text-green-600" />
                </div>
              )}
              {step.status === "fail" && (
                <div className="p-1.5 bg-red-50 rounded-full">
                  <XCircle className="w-4 h-4 text-red-600" />
                </div>
              )}
              {step.status === "warning" && (
                <div className="p-1.5 bg-yellow-50 rounded-full">
                  <AlertTriangle className="w-4 h-4 text-yellow-600" />
                </div>
              )}
            </div>

            {/* Step Content */}
            <div className="flex-1 pb-4">
              <div className="font-medium text-sm text-slate-900 mb-1">
                {step.label}
              </div>
              <div className="text-xs text-slate-600">
                {step.description}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Suggested Alternatives (for refused requests) */}
      {isRefused && suggestedAlternatives.length > 0 && (
        <div className="border-t border-slate-200 pt-4">
          <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">
            Try Asking Instead
          </div>
          <div className="space-y-2">
            {suggestedAlternatives.map((alt, index) => (
              <div
                key={index}
                className="p-3 bg-blue-50 rounded-lg text-sm text-blue-900 border border-blue-100"
              >
                "{alt}"
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Summary */}
      <div className={`mt-4 p-3 rounded-lg ${
        isRefused 
          ? "bg-red-50 border border-red-100" 
          : "bg-green-50 border border-green-100"
      }`}>
        <div className={`text-xs font-medium ${
          isRefused ? "text-red-800" : "text-green-800"
        }`}>
          {isRefused 
            ? "This query violates governance rules and cannot be answered."
            : "This query passed all governance checks and was answered."}
        </div>
      </div>
    </motion.div>
  );
}
