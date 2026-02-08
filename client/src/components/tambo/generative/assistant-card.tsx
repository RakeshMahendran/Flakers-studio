"use client";

import { motion } from "framer-motion";
import { MessageSquare, Settings, Trash2, Play, Pause } from "lucide-react";
import { useState } from "react";

/**
 * AssistantCard - Generative UI Component
 * 
 * Rendered dynamically by AI when user asks about assistants.
 * Shows assistant details with interactive actions.
 */

interface AssistantCardProps {
  id: string;
  name: string;
  description?: string;
  status: "ready" | "creating" | "error";
  siteUrl: string;
  template: string;
  totalQueries?: number;
  satisfactionRate?: number;
  onChat?: (id: string) => void;
  onToggleStatus?: (id: string) => void;
  onDelete?: (id: string) => void;
}

export function AssistantCard({
  id,
  name,
  description,
  status,
  siteUrl,
  template,
  totalQueries = 0,
  satisfactionRate = 0,
  onChat,
  onToggleStatus,
  onDelete,
}: AssistantCardProps) {
  const [isActive, setIsActive] = useState(status === "ready");

  const handleToggle = () => {
    setIsActive(!isActive);
    onToggleStatus?.(id);
  };

  const statusColors = {
    ready: "bg-green-500",
    creating: "bg-yellow-500",
    error: "bg-red-500",
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm hover:shadow-md transition-shadow"
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div className="flex-1">
          <div className="flex items-center gap-3 mb-2">
            <h3 className="font-bold text-lg text-slate-900">{name}</h3>
            <div className={`w-2 h-2 rounded-full ${statusColors[status]}`} />
          </div>
          {description && (
            <p className="text-sm text-slate-600 mb-2">{description}</p>
          )}
          <p className="text-xs text-slate-500">{siteUrl}</p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4 mb-4 p-3 bg-slate-50 rounded-lg">
        <div>
          <div className="text-xs text-slate-500 mb-1">Template</div>
          <div className="text-sm font-bold text-slate-900 capitalize">
            {template}
          </div>
        </div>
        <div>
          <div className="text-xs text-slate-500 mb-1">Queries</div>
          <div className="text-sm font-bold text-slate-900">{totalQueries}</div>
        </div>
        <div>
          <div className="text-xs text-slate-500 mb-1">Satisfaction</div>
          <div className="text-sm font-bold text-slate-900">
            {satisfactionRate}%
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => onChat?.(id)}
          className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium"
        >
          <MessageSquare className="w-4 h-4" />
          Chat
        </button>
        <button
          onClick={handleToggle}
          className="px-4 py-2 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
          title={isActive ? "Pause" : "Activate"}
        >
          {isActive ? (
            <Pause className="w-4 h-4 text-slate-600" />
          ) : (
            <Play className="w-4 h-4 text-slate-600" />
          )}
        </button>
        <button
          onClick={() => onDelete?.(id)}
          className="px-4 py-2 border border-red-200 rounded-lg hover:bg-red-50 transition-colors"
          title="Delete"
        >
          <Trash2 className="w-4 h-4 text-red-600" />
        </button>
      </div>
    </motion.div>
  );
}
