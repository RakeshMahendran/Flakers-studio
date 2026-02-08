"use client";

interface RefusalCardProps {
  reason: string;
  allowedScope: string[];
  rulesApplied: string[];
  processingTimeMs: number;
  children?: React.ReactNode;
}

const REFUSAL_MESSAGES = {
  OUT_OF_SCOPE: "This question is outside my allowed scope.",
  NO_CONTEXT: "I don't have information about that in my knowledge base.",
  POLICY_VIOLATION: "I cannot answer questions that violate content policies.",
  CROSS_TENANT: "Access to the requested information is not authorized.",
  INSUFFICIENT_CONFIDENCE: "I don't have enough reliable information to answer this question.",
};

const REFUSAL_ICONS = {
  OUT_OF_SCOPE: "🎯",
  NO_CONTEXT: "📚",
  POLICY_VIOLATION: "🛡️",
  CROSS_TENANT: "🔒",
  INSUFFICIENT_CONFIDENCE: "❓",
};

export function RefusalCard({
  reason,
  allowedScope,
  rulesApplied,
  processingTimeMs,
  children,
}: RefusalCardProps) {
  const message = REFUSAL_MESSAGES[reason as keyof typeof REFUSAL_MESSAGES] || 
    "I cannot answer this question.";
  const icon = REFUSAL_ICONS[reason as keyof typeof REFUSAL_ICONS] || "❌";

  return (
    <div className="bg-amber-50 rounded-lg border border-amber-200 p-6 mb-4">
      {/* Refusal Message */}
      <div className="flex items-start space-x-3 mb-4">
        <div className="text-2xl">{icon}</div>
        <div className="flex-1">
          <h3 className="text-lg font-medium text-amber-800 mb-2">
            Cannot Answer
          </h3>
          <p className="text-amber-700">{message}</p>
        </div>
      </div>

      {/* Allowed Scope */}
      {allowedScope.length > 0 && (
        <div className="bg-white rounded-md p-4 mb-4">
          <h4 className="text-sm font-medium text-gray-700 mb-2">
            I can help with:
          </h4>
          <div className="flex flex-wrap gap-2">
            {allowedScope.map((scope, index) => (
              <span
                key={index}
                className="px-2 py-1 bg-indigo-100 text-indigo-800 text-xs font-medium rounded-full"
              >
                {scope}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Governance Info */}
      <div className="border-t border-amber-200 pt-4">
        <div className="flex items-center justify-between text-xs text-amber-600">
          <div className="flex items-center space-x-4">
            <span>Reason: {reason}</span>
            <span>Rules applied: {rulesApplied.length}</span>
            <span>Processing: {processingTimeMs}ms</span>
          </div>
          <div className="flex items-center space-x-1">
            <div className="w-2 h-2 bg-amber-500 rounded-full"></div>
            <span>Governance blocked</span>
          </div>
        </div>
      </div>

      {children}
    </div>
  );
}