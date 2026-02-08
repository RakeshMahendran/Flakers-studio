"use client";

import { useState, useEffect, useRef } from "react";

import { motion } from "framer-motion";
import { Button, Card, Badge } from "@/components/ui/enhanced-ui";
import { 
  Loader2, 
  CheckCircle, 
  AlertCircle, 
  Globe, 
  FileText, 
  Brain,
  ArrowRight,
  RefreshCw
} from "lucide-react";

interface ContentIngestionScreenProps {
  assistantId: string;
  jobId: string;
  autoStartIngestion?: boolean;
  onComplete: (discoveredContent?: any) => void;
}

interface JobStatus {
  job_id: string;
  assistant_id: string;
  status: string;
  current_stage?: string;
  progress_percentage: number;
  pages_discovered: number;
  pages_processed: number;
  chunks_created: number;
  chunks_uploaded?: number;
  errors_count: number;
  error_details?: Array<{ error: string; timestamp: string }>;
  started_at?: string;
  completed_at?: string;
}

const statusMessages = {
  running: "Initializing content discovery...",
  scraping: "Crawling website pages...",
  processing: "Processing and chunking content...",
  embedding: "Generating AI embeddings...",
  ingestion: "Uploading to vector database...",
  indexing: "Creating searchable index...",
  storing: "Storing in knowledge base...",
  completed: "Content ingestion complete!",
  failed: "Content ingestion failed",
  cancelled: "Content ingestion cancelled"
};

const statusIcons = {
  running: Loader2,
  scraping: Globe,
  processing: FileText,
  embedding: Brain,
  ingestion: Brain,
  indexing: Brain,
  storing: CheckCircle,
  completed: CheckCircle,
  failed: AlertCircle,
  cancelled: AlertCircle
};

export function ContentIngestionScreen({
  assistantId,
  jobId,
  autoStartIngestion = false,
  onComplete
}: ContentIngestionScreenProps) {
  const [jobStatus, setJobStatus] = useState<JobStatus | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const ingestionTriggeredRef = useRef(false);

  const startIngestionWithSSE = async () => {
    if (!autoStartIngestion) return;
    if (ingestionTriggeredRef.current) return;

    ingestionTriggeredRef.current = true;
    
    try {
      const response = await fetch(`/api/projects/website/ingest?assistant_id=${assistantId}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ detail: "Failed to start ingestion" }));
        throw new Error(errorData.detail || "Failed to start ingestion");
      }

      // Process SSE stream
      const reader = response.body?.getReader();
      const decoder = new TextDecoder();

      if (!reader) {
        throw new Error("No response body");
      }

      let buffer = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.trim() || !line.startsWith("data: ")) continue;

          const payload = line.slice(6);
          if (!payload) continue;

          try {
            const data = JSON.parse(payload);

            if (data.event_type === "init") {
              console.log("Ingestion initialized:", data);
            } else if (data.event_type === "progress") {
              setJobStatus({
                job_id: jobId,
                assistant_id: assistantId,
                status: data.status || "running",
                current_stage: data.stage,
                progress_percentage: data.progress_percentage || 0,
                pages_discovered: 0,
                pages_processed: 0,
                chunks_created: data.chunks_created || 0,
                chunks_uploaded: data.chunks_uploaded || 0,
                errors_count: 0,
              });
            } else if (data.event_type === "complete") {
              setJobStatus({
                job_id: jobId,
                assistant_id: assistantId,
                status: "completed",
                current_stage: "completed",
                progress_percentage: 100,
                pages_discovered: 0,
                pages_processed: 0,
                chunks_created: data.chunks_created || 0,
                chunks_uploaded: data.chunks_uploaded || 0,
                errors_count: 0,
              });
              setIsLoading(false);
            } else if (data.event_type === "error") {
              setError(data.error || "Ingestion failed");
              setJobStatus({
                job_id: jobId,
                assistant_id: assistantId,
                status: "failed",
                current_stage: "failed",
                progress_percentage: 0,
                pages_discovered: 0,
                pages_processed: 0,
                chunks_created: 0,
                chunks_uploaded: 0,
                errors_count: 1,
                error_details: data.details || [{ error: data.error, timestamp: new Date().toISOString() }],
              });
              setIsLoading(false);
            } else if (data.event_type === "timeout") {
              setError(data.message || "Ingestion timeout");
              setIsLoading(false);
            }
          } catch (parseError) {
            console.error("Error parsing SSE data:", parseError);
          }
        }
      }
    } catch (err) {
      console.error("Error in ingestion SSE:", err);
      setError(err instanceof Error ? err.message : "Failed to start ingestion");
      setIsLoading(false);
      ingestionTriggeredRef.current = false;
    }
  };

  useEffect(() => {
    startIngestionWithSSE();
  }, [autoStartIngestion, assistantId]);

  const handleRetry = async () => {
    try {
      setError(null);
      setIsLoading(true);
      
      // Trigger re-scraping
      const response = await fetch(`/api/assistant/${assistantId}/rescrape`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          max_pages: 100,
          max_depth: 3,
          delay_between_requests: 1.0,
          timeout: 30,
          follow_external_links: false
        }),
      });
      
      if (!response.ok) {
        throw new Error("Failed to restart scraping");
      }
      
      const result = await response.json();
      
      // Update with new job ID
      if (result.job_id) {
        window.location.href = `/assistant/${assistantId}/ingestion?jobId=${result.job_id}`;
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to retry");
      setIsLoading(false);
    }
  };

  if (error && !jobStatus) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <Card className="max-w-md mx-auto text-center">
          <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-slate-900 mb-2">
            Error Loading Status
          </h2>
          <p className="text-slate-600 mb-4">{error}</p>
          <Button onClick={() => window.location.reload()}>
            Try Again
          </Button>
        </Card>
      </div>
    );
  }

  if (!jobStatus) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <Card className="max-w-md mx-auto text-center">
          <Loader2 className="w-12 h-12 animate-spin text-blue-600 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-slate-900 mb-2">
            Loading Status...
          </h2>
        </Card>
      </div>
    );
  }

  const displayStatus =
    jobStatus.status === "running" && jobStatus.current_stage
      ? jobStatus.current_stage
      : jobStatus.status;

  const StatusIcon = statusIcons[displayStatus as keyof typeof statusIcons] || Loader2;
  const isAnimated = !["completed", "failed", "cancelled"].includes(jobStatus.status);

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <nav className="bg-white border-b border-slate-200 px-6 py-4">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
              <span className="text-white font-bold text-sm">FS</span>
            </div>
            <span className="font-serif font-bold text-slate-900 text-lg">Content Ingestion</span>
            <Badge color={
              jobStatus.status === "completed" ? "green" :
              jobStatus.status === "failed" ? "red" : "blue"
            }>
              {jobStatus.status}
            </Badge>
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <main className="max-w-4xl mx-auto px-6 py-12">
        <div className="text-center mb-8">
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.5 }}
          >
            <StatusIcon 
              className={`w-16 h-16 mx-auto mb-4 ${
                jobStatus.status === "completed" ? "text-green-500" :
                jobStatus.status === "failed" ? "text-red-500" :
                "text-blue-600"
              } ${isAnimated ? "animate-spin" : ""}`}
            />
          </motion.div>
          
          <h1 className="text-3xl font-serif font-bold text-slate-900 mb-2">
            {jobStatus.status === "completed" ? "Ingestion Complete!" :
             jobStatus.status === "failed" ? "Ingestion Failed" :
             "Processing Content"}
          </h1>
          
          <p className="text-lg text-slate-600 mb-6">
            {statusMessages[displayStatus as keyof typeof statusMessages] || "Processing..."}
          </p>

          {/* Progress Bar */}
          <div className="max-w-md mx-auto mb-8">
            <div className="flex justify-between text-sm text-slate-600 mb-2">
              <span>Progress</span>
              <span>{jobStatus.progress_percentage}%</span>
            </div>
            <div className="w-full bg-slate-200 rounded-full h-3">
              <motion.div
                className={`h-3 rounded-full transition-all duration-500 ${
                  jobStatus.status === "completed" ? "bg-green-500" :
                  jobStatus.status === "failed" ? "bg-red-500" :
                  "bg-blue-600"
                }`}
                initial={{ width: 0 }}
                animate={{ width: `${jobStatus.progress_percentage}%` }}
                transition={{ duration: 0.5 }}
              />
            </div>
          </div>
        </div>

        {/* Statistics */}
        <div className="grid gap-6 md:grid-cols-3 mb-8">
          <Card className="text-center">
            <Globe className="w-8 h-8 text-blue-600 mx-auto mb-2" />
            <div className="text-2xl font-bold text-slate-900">
              {jobStatus.pages_discovered || 0}
            </div>
            <div className="text-sm text-slate-600">Pages Discovered</div>
          </Card>
          
          <Card className="text-center">
            <FileText className="w-8 h-8 text-green-600 mx-auto mb-2" />
            <div className="text-2xl font-bold text-slate-900">
              {jobStatus.pages_processed || 0}
            </div>
            <div className="text-sm text-slate-600">Pages Processed</div>
          </Card>
          
          <Card className="text-center">
            <Brain className="w-8 h-8 text-purple-600 mx-auto mb-2" />
            <div className="text-2xl font-bold text-slate-900">
              {jobStatus.chunks_created || 0}
            </div>
            <div className="text-sm text-slate-600">Knowledge Chunks</div>
          </Card>
        </div>

        {/* Error Details */}
        {jobStatus.errors_count > 0 && jobStatus.error_details && (
          <Card className="mb-8 border-amber-200 bg-amber-50">
            <div className="flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-amber-600 mt-0.5" />
              <div>
                <h3 className="font-medium text-amber-900 mb-2">
                  {jobStatus.errors_count} Error{jobStatus.errors_count > 1 ? "s" : ""} Encountered
                </h3>
                <div className="space-y-1">
                  {jobStatus.error_details.slice(0, 3).map((error, index) => (
                    <p key={index} className="text-sm text-amber-700">
                      {error.error}
                    </p>
                  ))}
                  {jobStatus.error_details.length > 3 && (
                    <p className="text-sm text-amber-600">
                      ...and {jobStatus.error_details.length - 3} more
                    </p>
                  )}
                </div>
              </div>
            </div>
          </Card>
        )}

        {/* Actions */}
        <div className="text-center">
          {jobStatus.status === "completed" && (
            <Button onClick={() => {
              // Pass discovered content to parent
              const discoveredContent = {
                totalPages: jobStatus.pages_discovered || 0,
                contentTypes: [
                  { type: "Website Content", count: jobStatus.pages_discovered || 0 }
                ],
                intents: [
                  { intent: "general", confidence: 0.8, pageCount: jobStatus.pages_discovered || 0 }
                ]
              };
              onComplete(discoveredContent);
            }} size="lg">
              Continue
              <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          )}
          
          {jobStatus.status === "failed" && (
            <div className="space-x-4">
              <Button onClick={handleRetry} variant="outline">
                <RefreshCw className="w-4 h-4 mr-2" />
                Retry Ingestion
              </Button>
              <Button onClick={() => onComplete()}>
                Continue Anyway
              </Button>
            </div>
          )}
          
          {!["completed", "failed", "cancelled"].includes(jobStatus.status) && (
            <p className="text-sm text-slate-500">
              This process may take several minutes depending on your website size.
            </p>
          )}
        </div>

        {/* Job Details */}
        <Card className="mt-8 bg-slate-50">
          <h3 className="font-medium text-slate-900 mb-3">Job Details</h3>
          <dl className="grid gap-2 md:grid-cols-2 text-sm">
            <div>
              <dt className="text-slate-500">Job ID</dt>
              <dd className="text-slate-900 font-mono">{jobStatus.job_id}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Assistant ID</dt>
              <dd className="text-slate-900 font-mono">{jobStatus.assistant_id}</dd>
            </div>
            {jobStatus.started_at && (
              <div>
                <dt className="text-slate-500">Started</dt>
                <dd className="text-slate-900">
                  {new Date(jobStatus.started_at).toLocaleString()}
                </dd>
              </div>
            )}
            {jobStatus.completed_at && (
              <div>
                <dt className="text-slate-500">Completed</dt>
                <dd className="text-slate-900">
                  {new Date(jobStatus.completed_at).toLocaleString()}
                </dd>
              </div>
            )}
          </dl>
        </Card>
      </main>
    </div>
  );
}