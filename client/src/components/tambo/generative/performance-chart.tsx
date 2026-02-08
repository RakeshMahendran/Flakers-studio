"use client";

import { motion } from "framer-motion";
import { TrendingUp, Users, ThumbsUp, MessageSquare } from "lucide-react";

/**
 * PerformanceChart - Generative UI Component
 * 
 * Rendered when user asks about assistant performance or metrics.
 * Shows query volume, satisfaction rates, and top queries.
 */

interface PerformanceData {
  date: string;
  queries: number;
  satisfaction: number;
}

interface TopQuery {
  query: string;
  count: number;
}

interface PerformanceChartProps {
  assistantId: string;
  assistantName: string;
  data: PerformanceData[];
  totalQueries: number;
  avgSatisfaction: number;
  topQueries?: TopQuery[];
}

export function PerformanceChart({
  assistantName,
  data,
  totalQueries,
  avgSatisfaction,
  topQueries = [],
}: PerformanceChartProps) {
  const maxQueries = Math.max(...data.map((d) => d.queries));

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm"
    >
      {/* Header */}
      <div className="mb-6">
        <h3 className="font-bold text-lg text-slate-900 mb-1">
          Performance: {assistantName}
        </h3>
        <p className="text-sm text-slate-600">
          Last {data.length} days of activity
        </p>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-2 gap-4 mb-6">
        <div className="p-4 bg-blue-50 rounded-lg border border-blue-100">
          <div className="flex items-center gap-2 mb-2">
            <MessageSquare className="w-4 h-4 text-blue-600" />
            <span className="text-xs font-bold text-blue-600 uppercase">
              Total Queries
            </span>
          </div>
          <div className="text-2xl font-bold text-blue-900">
            {totalQueries.toLocaleString()}
          </div>
        </div>

        <div className="p-4 bg-green-50 rounded-lg border border-green-100">
          <div className="flex items-center gap-2 mb-2">
            <ThumbsUp className="w-4 h-4 text-green-600" />
            <span className="text-xs font-bold text-green-600 uppercase">
              Satisfaction
            </span>
          </div>
          <div className="text-2xl font-bold text-green-900">
            {avgSatisfaction}%
          </div>
        </div>
      </div>

      {/* Simple Bar Chart */}
      <div className="mb-6">
        <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">
          Query Volume
        </div>
        <div className="space-y-2">
          {data.map((item, index) => (
            <div key={index} className="flex items-center gap-3">
              <div className="text-xs text-slate-500 w-20">
                {new Date(item.date).toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                })}
              </div>
              <div className="flex-1 bg-slate-100 rounded-full h-6 overflow-hidden">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{
                    width: `${(item.queries / maxQueries) * 100}%`,
                  }}
                  transition={{ delay: index * 0.05, duration: 0.5 }}
                  className="h-full bg-gradient-to-r from-blue-500 to-blue-600 flex items-center justify-end pr-2"
                >
                  <span className="text-xs font-bold text-white">
                    {item.queries}
                  </span>
                </motion.div>
              </div>
              <div className="text-xs text-slate-500 w-12 text-right">
                {item.satisfaction}%
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Top Queries */}
      {topQueries.length > 0 && (
        <div>
          <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">
            Top Queries
          </div>
          <div className="space-y-2">
            {topQueries.slice(0, 5).map((item, index) => (
              <div
                key={index}
                className="flex items-center justify-between p-3 bg-slate-50 rounded-lg"
              >
                <div className="flex items-center gap-3">
                  <div className="w-6 h-6 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-xs font-bold">
                    {index + 1}
                  </div>
                  <span className="text-sm text-slate-700">{item.query}</span>
                </div>
                <div className="flex items-center gap-1 text-slate-500">
                  <Users className="w-3 h-3" />
                  <span className="text-xs font-medium">{item.count}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Trend Indicator */}
      <div className="mt-6 p-3 bg-green-50 rounded-lg border border-green-100 flex items-center gap-2">
        <TrendingUp className="w-4 h-4 text-green-600" />
        <span className="text-sm text-green-800">
          <span className="font-bold">+12%</span> queries vs last period
        </span>
      </div>
    </motion.div>
  );
}
