"use client";

import { useMemo, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  Button,
  Card,
  Badge,
  Input,
  cn,
} from "@/components/ui/primitives";
import {
  ChevronLeft,
  ChevronRight,
  Globe,
  Edit3,
  Bot,
  FileText,
  CheckCircle,
  Loader2,
  Search,
  Brain,
} from "lucide-react";
import { useAuth } from "@/contexts/auth-context";

type Step = "source" | "template" | "details" | "scraping" | "ingestion";

type SourceType = "website" | "wordpress";
type Template = "support" | "customer" | "sales" | "ecommerce";

interface FormData {
  sourceType: SourceType | "";
  template: Template | "";
  name: string;
  description: string;
  siteUrl: string;
}

interface DiscoveredContent {
  totalPages: number;
  contentTypes: Array<{
    type: string;
    count: number;
    examples: string[];
  }>;
  intents: Array<{
    intent: string;
    confidence: number;
    pageCount: number;
  }>;
}

interface AssistantCreationFlowProps {
  onComplete?: () => void;
  onCancel?: () => void;
}

export function AssistantCreationFlow({
  onComplete,
  onCancel,
}: AssistantCreationFlowProps) {
  const { user } = useAuth();
  const router = useRouter();
  const [currentStep, setCurrentStep] = useState<Step>("source");
  const [createdAssistantId, setCreatedAssistantId] = useState<string | null>(null);
  const [createdJobId, setCreatedJobId] = useState<string | null>(null);

  // Use ref to prevent duplicate ingestion calls
  const ingestionStartedRef = useRef(false);

  const [formData, setFormData] = useState<FormData>({
    sourceType: "",
    template: "",
    name: "",
    description: "",
    siteUrl: "",
  });
  const [formErrors, setFormErrors] = useState<{ name?: string; siteUrl?: string }>({});
  const [discoveredContent, setDiscoveredContent] = useState<DiscoveredContent | null>(null);
  const [isDiscovering, setIsDiscovering] = useState(false);
  const [scrapedUrls, setScrapedUrls] = useState<string[]>([]);

  const uniqueScrapedUrls = useMemo(() => Array.from(new Set(scrapedUrls)), [scrapedUrls]);

  // Ingestion state
  const [isIngesting, setIsIngesting] = useState(false);
  const [ingestionProgress, setIngestionProgress] = useState({
    stage: "",
    chunksCreated: 0,
    chunksUploaded: 0,
    totalChunks: 0,
    progressPercentage: 0,
  });

  const [expandedUrl, setExpandedUrl] = useState<string | null>(null);
  const [urlContentCache, setUrlContentCache] = useState<Record<string, string>>({});
  const [urlContentLoading, setUrlContentLoading] = useState<Record<string, boolean>>({});
  const [scrapeError, setScrapeError] = useState<string | null>(null);
  const [discoveryProgress, setDiscoveryProgress] = useState<{
    discoveredUrls: string[];
    completedUrls: string[];
    pendingCount: number;
    totalDiscovered: number;
    completedCount: number;
  }>({
    discoveredUrls: [],
    completedUrls: [],
    pendingCount: 0,
    totalDiscovered: 0,
    completedCount: 0,
  });

  const steps = [
    { id: "source", name: "Source", icon: Globe },
    { id: "template", name: "Template", icon: Bot },
    { id: "details", name: "Project", icon: FileText },
    { id: "scraping", name: "Scraping", icon: Search },
    { id: "ingestion", name: "Ingestion", icon: Brain },
  ];

  const templates = [
    {
      id: "support",
      name: "Support Assistant",
      description: "Help customers with support questions and documentation",
      intents: ["support", "documentation", "faq", "policy"],
      icon: "",
      features: ["Tool Calls", "Reasoning", "Dynamic UI", "Citations"],
    },
    {
      id: "customer",
      name: "Customer Service",
      description: "General customer service and information",
      intents: ["support", "faq", "policy", "product_info"],
      icon: "",
      features: ["Governance", "Analytics", "Tool Calls"],
    },
    {
      id: "sales",
      name: "Sales Assistant",
      description: "Help with product information and sales inquiries",
      intents: ["product_info", "pricing", "marketing", "faq"],
      icon: "",
      features: ["Rich Components", "CRM Integration", "Tool Calls"],
    },
    {
      id: "ecommerce",
      name: "E-commerce Helper",
      description: "Product information and shopping assistance",
      intents: ["product_info", "pricing", "support", "faq"],
      icon: "",
      features: ["Product Catalog", "Dynamic UI", "Tool Calls"],
    },
  ];

  const validateDetails = () => {
    const errs: { name?: string; siteUrl?: string } = {};
    if (!formData.name.trim()) errs.name = "Assistant name is required";
    const raw = formData.siteUrl.trim();
    if (!raw) {
      errs.siteUrl = "Website URL is required";
    } else {
      try {
        const u = new URL(raw);
        if (u.protocol !== "http:" && u.protocol !== "https:") {
          errs.siteUrl = "URL must start with http:// or https://";
        }
      } catch {
        errs.siteUrl = "Enter a valid URL (e.g. https://example.com)";
      }
    }
    setFormErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleNext = () => {
    const stepIndex = steps.findIndex(s => s.id === currentStep);
    if (stepIndex < steps.length - 1) {
      const nextStep = steps[stepIndex + 1].id as Step;

      // Run field-level validation before leaving the details step.
      if (currentStep === "details" && !validateDetails()) {
        return;
      }

      if (nextStep === "scraping") {
        handleContentDiscovery();
      } else if (nextStep === "ingestion") {
        // Only start ingestion if not already ingesting
        if (!isIngesting) {
          handleIngestion();
        }
      } else {
        setCurrentStep(nextStep);
      }
    } else if (currentStep === "ingestion") {
      // Ingestion complete, navigate to review page
      if (!createdAssistantId || !createdJobId) return;
      if (isIngesting) return;

      router.push(`/assistant/${createdAssistantId}/review`);
    }
  };

  const handleBack = () => {
    const stepIndex = steps.findIndex(s => s.id === currentStep);
    if (stepIndex > 0) {
      setCurrentStep(steps[stepIndex - 1].id as Step);
    }
  };

  const handleContentDiscovery = async () => {
    setCurrentStep("scraping");
    setIsDiscovering(true);
    setCreatedAssistantId(null);
    setCreatedJobId(null);

    setScrapedUrls([]);
    setExpandedUrl(null);
    setUrlContentCache({});
    setUrlContentLoading({});
    setScrapeError(null);

    // Reset progress
    setDiscoveryProgress({
      discoveredUrls: [],
      completedUrls: [],
      pendingCount: 0,
      totalDiscovered: 0,
      completedCount: 0,
    });

    try {
      if (!user) {
        setScrapeError("User not authenticated");
        return;
      }

      // Use the master scraping endpoint for real-time progress
      const response = await fetch("/api/projects/website/scrape", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${user.accessToken}`,
        },
        body: JSON.stringify({
          tenant_id: user.tenantId,
          user_name: user.email,
          name: formData.name,
          description: formData.description,
          template: formData.template,
          site_url: formData.siteUrl,
          max_pages: 100,
          max_depth: 3,
          delay_between_requests: 1.0,
          timeout: 30,
          follow_external_links: false,
          excluded_patterns: [
            ".*\\.pdf$",
            ".*\\.doc$",
            ".*\\.zip$",
            "/admin/.*",
            "/wp-admin/.*",
          ],
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to discover content");
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let receivedComplete = false;
      let localAssistantId: string | null = null;
      let localJobId: string | null = null;

      if (!reader) {
        throw new Error("No response body");
      }

      const processLine = (line: string) => {
        if (!line.startsWith("data: ")) return;
        const payload = line.slice(6);
        if (!payload) return;

        const data = JSON.parse(payload);

        if (data.event_type === "init") {
          localAssistantId = data.assistant_id || null;
          localJobId = data.job_id || null;
          setCreatedAssistantId(localAssistantId);
          setCreatedJobId(localJobId);
          return;
        }

        if (data.event_type === "url_discovered") {
          setDiscoveryProgress(prev => ({
            ...prev,
            discoveredUrls: [...prev.discoveredUrls, data.url],
            totalDiscovered: data.total_discovered,
            pendingCount: data.pending,
          }));
        } else if (data.event_type === "url_completed") {
          setDiscoveryProgress(prev => ({
            ...prev,
            completedUrls: [...prev.completedUrls, data.url],
            completedCount: data.completed,
            pendingCount: data.pending,
          }));
        } else if (data.event_type === "complete") {
          receivedComplete = true;
          const result = data.result;

          localAssistantId = result.assistant_id || null;
          localJobId = result.job_id || null;

          setCreatedAssistantId(localAssistantId);
          setCreatedJobId(localJobId);

          const urls = Array.isArray(result.urls) ? result.urls : [];
          setScrapedUrls(urls);

          const nextDiscoveredContent: DiscoveredContent = {
            totalPages: result.pages_scraped || urls.length || 0,
            contentTypes: [
              { type: "Scraped URLs", count: urls.length, examples: urls.slice(0, 3) }
            ],
            intents: []
          };

          setDiscoveredContent(nextDiscoveredContent);
          setIsDiscovering(false);
        } else if (data.event_type === "error") {
          const errorMessage = data.error || "Unknown error occurred during scraping";
          console.error("Scraping error:", errorMessage);
          throw new Error(errorMessage);
        }
      };

      while (true) {
        const { done, value } = await reader.read();

        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          try {
            processLine(line);
          } catch (e) {
            console.error("Error parsing SSE data:", e);
          }
        }
      }

      // Process any remaining buffered line (common place where the final SSE event gets stuck)
      if (buffer.trim().length > 0) {
        try {
          processLine(buffer.trim());
        } catch (e) {
          console.error("Error parsing trailing SSE buffer:", e);
        }
      }

      if (!receivedComplete) {
        const currentJobId = localJobId;
        if (!currentJobId) {
          setScrapeError("Scrape finished but the completion event was not received. Please retry.");
          return;
        }

        // Recovery path: fetch stored URLs from DB using job_id
        try {
          const urlsRes = await fetch(`/api/projects/website/scrape/${currentJobId}/urls`, {
            headers: {
              ...(user?.accessToken && { Authorization: `Bearer ${user.accessToken}` }),
            },
          });
          if (!urlsRes.ok) {
            throw new Error("Failed to recover scraped URLs");
          }
          const urlsData = await urlsRes.json();
          const urls: string[] = Array.isArray(urlsData.urls)
            ? urlsData.urls.map((u: any) => u?.url).filter(Boolean)
            : [];

          if (urls.length === 0) {
            throw new Error("No scraped URLs stored for this job");
          }

          setScrapedUrls(urls);
          setDiscoveredContent({
            totalPages: urls.length,
            contentTypes: [{ type: "Scraped URLs", count: urls.length, examples: urls.slice(0, 3) }],
            intents: [],
          });
          setScrapeError(null);
        } catch (e) {
          setScrapeError("Scrape finished but the completion event was not received. Please retry.");
        }
      }
    } catch (error) {
      console.error("Discovery error:", error);
      const errorMessage = error instanceof Error ? error.message : "Scrape failed";

      // Provide more helpful error messages
      let userFriendlyMessage = errorMessage;
      if (errorMessage.includes("timeout") || errorMessage.includes("slow to load")) {
        userFriendlyMessage = "The website took too long to load. This could be due to slow server response, heavy JavaScript, or network issues. Please try again or contact support if the issue persists.";
      } else if (errorMessage.includes("blocking automated access")) {
        userFriendlyMessage = "The website appears to be blocking automated access. Please verify the URL is correct and accessible.";
      } else if (errorMessage.includes("No pages were successfully scraped")) {
        userFriendlyMessage = "Unable to scrape any content from the website. The site may be blocking automated access, experiencing issues, or require authentication.";
      }

      setScrapeError(userFriendlyMessage);
      // Fallback to basic content structure
      const fallbackContent: DiscoveredContent = {
        totalPages: 1,
        contentTypes: [
          { type: "Website Content", count: 1, examples: ["Homepage"] }
        ],
        intents: [
          { intent: "general", confidence: 0.8, pageCount: 1 }
        ]
      };
      setDiscoveredContent(fallbackContent);
    } finally {
      setIsDiscovering(false);
    }
  };

  const handleIngestion = async () => {
    // Guard: Prevent duplicate calls
    if (ingestionStartedRef.current || isIngesting) {
      console.log("Ingestion already in progress, skipping duplicate call");
      return;
    }

    if (!createdAssistantId || !createdJobId) {
      console.error("Missing assistant ID or job ID for ingestion");
      return;
    }

    // Mark ingestion as started
    ingestionStartedRef.current = true;

    setCurrentStep("ingestion");
    setIsIngesting(true);
    setIngestionProgress({
      stage: "starting",
      chunksCreated: 0,
      chunksUploaded: 0,
      totalChunks: 0,
      progressPercentage: 0,
    });

    try {
      // Start ingestion with SSE
      const response = await fetch(`/api/projects/website/ingest?assistant_id=${createdAssistantId}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(user?.accessToken && { Authorization: `Bearer ${user.accessToken}` }),
        },
      });

      if (!response.ok) {
        throw new Error("Failed to start ingestion");
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
              setIngestionProgress({
                stage: data.stage || "processing",
                chunksCreated: data.chunks_created || 0,
                chunksUploaded: data.chunks_uploaded || 0,
                totalChunks: data.chunks_created || 0,
                progressPercentage: data.progress_percentage || 0,
              });
            } else if (data.event_type === "complete") {
              setIngestionProgress({
                stage: "completed",
                chunksCreated: data.chunks_created || 0,
                chunksUploaded: data.chunks_uploaded || 0,
                totalChunks: data.chunks_created || 0,
                progressPercentage: 100,
              });
              setIsIngesting(false);

              // Auto-advance after brief delay
              setTimeout(() => {
                handleNext();
              }, 1000);
            } else if (data.event_type === "error") {
              console.error("Ingestion error:", data.error);
              setIsIngesting(false);
              ingestionStartedRef.current = false; // Reset on error
            }
          } catch (e) {
            console.error("Error parsing SSE data:", e);
          }
        }
      }
    } catch (error) {
      console.error("Ingestion error:", error);
      setIsIngesting(false);
      ingestionStartedRef.current = false; // Reset on error
    }
  };

  const canProceed = () => {
    switch (currentStep) {
      case "source":
        return formData.sourceType !== "";
      case "template":
        return formData.template !== "";
      case "details":
        return formData.name && formData.siteUrl;
      case "scraping": {
        const canProceedScraping = !isDiscovering && uniqueScrapedUrls.length > 0 && Boolean(createdAssistantId && createdJobId);
        console.log("Scraping canProceed check:", {
          isDiscovering,
          scrapedUrlsCount: uniqueScrapedUrls.length,
          createdAssistantId,
          createdJobId,
          canProceed: canProceedScraping
        });
        return canProceedScraping;
      }
      case "ingestion":
        return !isIngesting && ingestionProgress.progressPercentage === 100;
      default:
        return false;
    }
  };

  const toggleUrl = async (url: string) => {
    const next = expandedUrl === url ? null : url;
    setExpandedUrl(next);
    if (!next) return;
    if (urlContentCache[url]) return;
    if (!createdJobId) return;

    setUrlContentLoading((prev) => ({ ...prev, [url]: true }));
    try {
      const res = await fetch(
        `/api/projects/website/scrape/${createdJobId}/content?url=${encodeURIComponent(url)}`,
        {
          headers: {
            ...(user?.accessToken && { Authorization: `Bearer ${user.accessToken}` }),
          },
        }
      );
      if (!res.ok) {
        throw new Error("Failed to fetch scraped content");
      }
      const data = await res.json();
      const raw = typeof data.raw_content === "string" ? data.raw_content : "";
      setUrlContentCache((prev) => ({ ...prev, [url]: raw }));
    } catch (e) {
      setUrlContentCache((prev) => ({ ...prev, [url]: "Failed to load content." }));
    } finally {
      setUrlContentLoading((prev) => ({ ...prev, [url]: false }));
    }
  };

  const getCurrentStepIndex = () => steps.findIndex(s => s.id === currentStep);

  return (
    <div className="min-h-screen bg-[var(--color-background)] text-[var(--color-text-primary)]">
      {/* Header */}
      <nav className="border-b border-[var(--color-border-subtle)] bg-[var(--color-surface)] px-6 py-4">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-[var(--color-brand)] text-[var(--color-brand-foreground)]">
              <span className="font-semibold text-sm">FS</span>
            </div>
            <span className="font-semibold tracking-tight text-[var(--color-text-primary)] text-lg">
              Create AI Assistant
            </span>
          </div>
          <Button variant="ghost" onClick={() => router.push('/dashboard')}>
            Cancel
          </Button>
        </div>
      </nav>

      {/* Progress Bar */}
      <div className="border-b border-[var(--color-border-subtle)] bg-[var(--color-surface)]">
        <div className="max-w-4xl mx-auto px-6 py-6">
          <div className="flex items-center justify-between">
            {steps.map((step, index) => {
              const isActive = step.id === currentStep;
              const isCompleted = index < getCurrentStepIndex();
              const Icon = step.icon;

              return (
                <div key={step.id} className="flex items-center">
                  <div className="flex flex-col items-center">
                    <div
                      className={cn(
                        "w-10 h-10 rounded-full flex items-center justify-center transition-all duration-200",
                        isActive
                          ? "bg-[var(--color-brand)] text-[var(--color-brand-foreground)] shadow-[var(--elevation-glow-brand)]"
                          : isCompleted
                          ? "bg-[var(--color-trust)] text-[var(--color-trust-foreground)]"
                          : "bg-[var(--color-surface-sunken)] text-[var(--color-text-muted)]"
                      )}
                    >
                      <Icon className="w-5 h-5" />
                    </div>
                    <span
                      className={cn(
                        "text-xs mt-2 font-medium",
                        isActive
                          ? "text-[var(--color-brand)]"
                          : isCompleted
                          ? "text-[var(--color-trust-strong)]"
                          : "text-[var(--color-text-muted)]"
                      )}
                    >
                      {step.name}
                    </span>
                  </div>
                  {index < steps.length - 1 && (
                    <div className="flex-1 h-px bg-[var(--color-border-subtle)] mx-4 mt-[-20px]">
                      <div
                        className={cn(
                          "h-full bg-[var(--color-brand)] transition-all duration-300",
                          index < getCurrentStepIndex() ? "w-full" : "w-0"
                        )}
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Main Content */}
      <main className="max-w-4xl mx-auto px-6 py-12">
        <AnimatePresence mode="wait">
          <motion.div
            key={currentStep}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.3 }}
          >
            {/* Source Selection */}
            {currentStep === "source" && (
              <div className="space-y-8">
                <div className="text-center">
                  <h2 className="text-3xl font-semibold tracking-tight text-[var(--color-text-primary)] mb-4">
                    Choose Content Source
                  </h2>
                  <p className="text-lg text-[var(--color-text-secondary)] max-w-2xl mx-auto">
                    Select where your AI assistant will learn from. FlakersStudio will crawl and analyze your content to create a knowledge base.
                  </p>
                </div>

                <div className="grid gap-6 md:grid-cols-2 max-w-4xl mx-auto">
                  <Card
                    interactive
                    className={cn(
                      "transition-all duration-200",
                      formData.sourceType === "website"
                        ? "ring-1 ring-[var(--color-brand)] border-[var(--color-brand-border)]"
                        : ""
                    )}
                    onClick={() => setFormData({ ...formData, sourceType: "website" })}
                  >
                    <div className="text-center">
                      <div className="w-16 h-16 rounded-xl flex items-center justify-center mx-auto mb-4 bg-[var(--color-brand-soft)] border border-[var(--color-brand-border)]">
                        <Globe className="w-8 h-8 text-[var(--color-brand)]" />
                      </div>
                      <h3 className="text-xl font-semibold tracking-tight text-[var(--color-text-primary)] mb-2">Website</h3>
                      <p className="text-[var(--color-text-secondary)] mb-4">
                        Crawl and learn from any website's public pages with intelligent content extraction
                      </p>
                      <div className="flex flex-wrap gap-2 justify-center">
                        <Badge variant="brand">Auto-crawling</Badge>
                        <Badge variant="brand">Content Classification</Badge>
                      </div>
                    </div>
                  </Card>

                  <Card className="opacity-50 cursor-not-allowed">
                    <div className="text-center">
                      <div className="w-16 h-16 rounded-xl flex items-center justify-center mx-auto mb-4 bg-[var(--color-brand-soft)] border border-[var(--color-brand-border)]">
                        <Edit3 className="w-8 h-8 text-[var(--color-brand)]" />
                      </div>
                      <h3 className="text-xl font-semibold tracking-tight text-[var(--color-text-primary)] mb-2">WordPress</h3>
                      <p className="text-[var(--color-text-secondary)] mb-4">
                        Connect to WordPress via REST API for posts, pages, and custom content types
                      </p>
                      <div className="flex flex-wrap gap-2 justify-center">
                        <Badge variant="caution">Coming soon</Badge>
                        <Badge variant="brand">REST API</Badge>
                        <Badge variant="brand">Real-time Sync</Badge>
                      </div>
                    </div>
                  </Card>
                </div>
              </div>
            )}

            {/* Template Selection */}
            {currentStep === "template" && (
              <div className="space-y-8">
                <div className="text-center">
                  <h2 className="text-3xl font-semibold tracking-tight text-[var(--color-text-primary)] mb-4">
                    Select Assistant Template
                  </h2>
                  <p className="text-lg text-[var(--color-text-secondary)] max-w-2xl mx-auto">
                    Choose a template that matches your use case. Each template comes with pre-configured governance rules and assistant features.
                  </p>
                </div>

                <div className="grid gap-6 md:grid-cols-2 max-w-5xl mx-auto">
                  {templates.map((template) => (
                    <Card
                      key={template.id}
                      interactive
                      className={cn(
                        "transition-all duration-200",
                        formData.template === template.id
                          ? "ring-1 ring-[var(--color-brand)] border-[var(--color-brand-border)]"
                          : ""
                      )}
                      onClick={() => setFormData({ ...formData, template: template.id as any })}
                    >
                      <div className="flex items-start gap-4">
                        <div className="text-4xl">{template.icon}</div>
                        <div className="flex-1">
                          <h3 className="text-xl font-semibold tracking-tight text-[var(--color-text-primary)] mb-2">
                            {template.name}
                          </h3>
                          <p className="text-[var(--color-text-secondary)] mb-4">
                            {template.description}
                          </p>

                          <div className="space-y-3">
                            <div>
                              <span className="text-sm font-medium text-[var(--color-text-secondary)]">Allowed Intents:</span>
                              <div className="flex flex-wrap gap-1 mt-1">
                                {template.intents.map((intent) => (
                                  <Badge key={intent} variant="neutral" className="text-xs">
                                    {intent}
                                  </Badge>
                                ))}
                              </div>
                            </div>

                            <div>
                              <span className="text-sm font-medium text-[var(--color-text-secondary)]">Capabilities:</span>
                              <div className="flex flex-wrap gap-1 mt-1">
                                {template.features.map((feature) => (
                                  <Badge key={feature} variant="brand" className="text-xs">
                                    {feature}
                                  </Badge>
                                ))}
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </Card>
                  ))}
                </div>
              </div>
            )}

            {/* Details */}
            {currentStep === "details" && (
              <div className="space-y-8">
                <div className="text-center">
                  <h2 className="text-3xl font-semibold tracking-tight text-[var(--color-text-primary)] mb-4">
                    Assistant Configuration
                  </h2>
                  <p className="text-lg text-[var(--color-text-secondary)] max-w-2xl mx-auto">
                    Configure your assistant's basic information and connection details.
                  </p>
                </div>

                <Card className="max-w-2xl mx-auto">
                  <div className="space-y-6">
                    <Input
                      label="Assistant Name"
                      value={formData.name}
                      onChange={(e) => {
                        setFormData({ ...formData, name: e.target.value });
                        if (formErrors.name) setFormErrors((p) => ({ ...p, name: undefined }));
                      }}
                      placeholder="e.g., Support Assistant"
                      error={formErrors.name}
                      aria-required="true"
                    />

                    <div className="flex flex-col gap-1.5">
                      <label
                        htmlFor="assistant-description"
                        className="text-sm font-medium text-[var(--color-text-secondary)]"
                      >
                        Description (Optional)
                      </label>
                      <textarea
                        id="assistant-description"
                        value={formData.description}
                        onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                        placeholder="Describe what this assistant will help with..."
                        rows={3}
                        className={cn(
                          "w-full rounded-md px-3 py-2 text-sm",
                          "bg-[var(--input-bg)] text-[var(--input-fg)]",
                          "border border-[var(--input-border)]",
                          "placeholder:text-[var(--input-placeholder)]",
                          "transition-[border-color,box-shadow,background] duration-[var(--duration-fast)] ease-[var(--ease-out)]",
                          "hover:border-[var(--input-border-hover)]",
                          "focus:outline-none focus:border-[var(--input-border-focus)] focus:ring-2 focus:ring-[var(--color-focus-ring)] focus:ring-offset-1 focus:ring-offset-[var(--color-background)]",
                          "resize-y"
                        )}
                      />
                    </div>

                    <Input
                      label="Website URL"
                      type="url"
                      value={formData.siteUrl}
                      onChange={(e) => {
                        setFormData({ ...formData, siteUrl: e.target.value });
                        if (formErrors.siteUrl) setFormErrors((p) => ({ ...p, siteUrl: undefined }));
                      }}
                      placeholder="https://example.com"
                      error={formErrors.siteUrl}
                      aria-required="true"
                    />

                    <div className="rounded-lg p-4 bg-[var(--color-brand-soft)] border border-[var(--color-brand-border)]">
                      <div className="flex items-start gap-3">
                        <Brain className="w-5 h-5 text-[var(--color-brand)] mt-0.5" />
                        <div>
                          <h4 className="font-medium text-[var(--color-text-primary)] mb-1">What happens next</h4>
                          <p className="text-sm text-[var(--color-text-secondary)]">
                            Your assistant will be enhanced with dynamic components, tool call visualization, and reasoning transparency.
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                </Card>
              </div>
            )}

            {/* Scraping */}
            {currentStep === "scraping" && (
              <div className="space-y-8">
                <div className="text-center">
                  <h2 className="text-3xl font-semibold tracking-tight text-[var(--color-text-primary)] mb-4">
                    Website Scraping
                  </h2>
                  <p className="text-lg text-[var(--color-text-secondary)] max-w-2xl mx-auto">
                    {isDiscovering
                      ? "Analyzing your content and classifying by intent..."
                      : "Content analysis complete. Review the discovered content below."
                    }
                  </p>
                </div>

                {isDiscovering ? (
                  <Card className="max-w-4xl mx-auto" padding="lg">
                    <div>
                      <div className="text-center mb-6">
                        <Loader2 className="w-12 h-12 animate-spin mx-auto mb-4 text-[var(--color-brand)]" />
                        <h3 className="text-lg font-semibold tracking-tight text-[var(--color-text-primary)] mb-2">
                          Discovering Content
                        </h3>
                        <p className="text-[var(--color-text-secondary)] mb-4">
                          Crawling pages, extracting content, and classifying by intent...
                        </p>

                        {/* Progress Stats */}
                        {discoveryProgress.totalDiscovered > 0 && (
                          <div className="grid grid-cols-3 gap-4 mb-6">
                            <div className="rounded-lg p-4 bg-[var(--color-brand-soft)] border border-[var(--color-brand-border)]">
                              <div className="text-2xl font-semibold text-[var(--color-brand)]">
                                {discoveryProgress.totalDiscovered}
                              </div>
                              <div className="text-sm text-[var(--color-text-secondary)]">URLs Discovered</div>
                            </div>
                            <div className="rounded-lg p-4 bg-[var(--color-trust-soft)] border border-[var(--color-trust-border)]">
                              <div className="text-2xl font-semibold text-[var(--color-trust-strong)]">
                                {discoveryProgress.completedCount}
                              </div>
                              <div className="text-sm text-[var(--color-text-secondary)]">Completed</div>
                            </div>
                            <div className="rounded-lg p-4 bg-[var(--color-caution-soft)] border border-[var(--color-caution-border)]">
                              <div className="text-2xl font-semibold text-[var(--color-caution-strong)]">
                                {discoveryProgress.pendingCount}
                              </div>
                              <div className="text-sm text-[var(--color-text-secondary)]">Pending</div>
                            </div>
                          </div>
                        )}

                        {/* Progress Bar */}
                        {discoveryProgress.totalDiscovered > 0 && (
                          <div className="mb-6">
                            <div className="w-full bg-[var(--color-surface-sunken)] rounded-full h-3">
                              <div
                                className="bg-[var(--color-brand)] h-3 rounded-full transition-all duration-300"
                                style={{
                                  width: `${(discoveryProgress.completedCount / discoveryProgress.totalDiscovered) * 100}%`
                                }}
                              />
                            </div>
                            <div className="text-sm text-[var(--color-text-secondary)] mt-2 text-center">
                              {discoveryProgress.completedCount} of {discoveryProgress.totalDiscovered} URLs processed
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Discovered URLs List */}
                      {discoveryProgress.discoveredUrls.length > 0 && (
                        <div className="border-t border-[var(--color-border-subtle)] pt-6">
                          <h4 className="text-sm font-medium text-[var(--color-text-secondary)] mb-3">
                            Discovered URLs ({discoveryProgress.discoveredUrls.length})
                          </h4>
                          <div className="space-y-2 max-h-64 overflow-y-auto">
                            {discoveryProgress.discoveredUrls.map((url, index) => {
                              const isCompleted = discoveryProgress.completedUrls.includes(url);
                              return (
                                <div
                                  key={index}
                                  className={cn(
                                    "flex items-center gap-2 p-2 rounded text-sm border",
                                    isCompleted
                                      ? "bg-[var(--color-trust-soft)] border-[var(--color-trust-border)] text-[var(--color-trust-strong)]"
                                      : "bg-[var(--color-surface-sunken)] border-[var(--color-border-subtle)] text-[var(--color-text-secondary)]"
                                  )}
                                >
                                  {isCompleted ? (
                                    <CheckCircle className="w-4 h-4 text-[var(--color-trust)] shrink-0" />
                                  ) : (
                                    <Loader2 className="w-4 h-4 animate-spin text-[var(--color-brand)] shrink-0" />
                                  )}
                                  <span className="text-sm text-[var(--color-text-primary)] break-all flex-1">{url}</span>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  </Card>
                ) : (
                  <div className="space-y-6 max-w-5xl mx-auto">
                    {scrapeError && (
                      <Card>
                        <h3 className="text-lg font-semibold tracking-tight text-[var(--color-text-primary)] mb-2">Scrape issue</h3>
                        <p className="text-sm text-[var(--color-text-secondary)]">{scrapeError}</p>
                        <div className="mt-4">
                          <Button
                            variant="outline"
                            onClick={() => handleContentDiscovery()}
                            disabled={isDiscovering}
                          >
                            Retry scrape
                          </Button>
                        </div>
                      </Card>
                    )}

                    {!scrapeError && uniqueScrapedUrls.length === 0 && (
                      <Card>
                        <h3 className="text-lg font-semibold tracking-tight text-[var(--color-text-primary)] mb-2">No scraped URLs yet</h3>
                        <p className="text-sm text-[var(--color-text-secondary)] mb-4">
                          We didn&apos;t receive the final scrape results. If you still see discovered URLs above, wait a moment or retry.
                        </p>
                        <Button
                          variant="outline"
                          onClick={() => handleContentDiscovery()}
                          disabled={isDiscovering}
                        >
                          Retry scrape
                        </Button>
                      </Card>
                    )}

                    {discoveredContent && (
                      <div className="grid gap-6 md:grid-cols-2">
                        <Card>
                          <h3 className="text-lg font-semibold tracking-tight text-[var(--color-text-primary)] mb-4">Content Overview</h3>
                          <div className="space-y-4">
                            <div className="flex justify-between items-center">
                              <span className="text-[var(--color-text-secondary)]">Total Pages</span>
                              <span className="font-semibold text-[var(--color-text-primary)]">{discoveredContent.totalPages}</span>
                            </div>

                            <div>
                              <span className="text-[var(--color-text-secondary)] block mb-2">Content Types</span>
                              <div className="space-y-2">
                                {discoveredContent.contentTypes.map((type) => (
                                  <div key={type.type} className="flex justify-between items-center">
                                    <span className="text-sm text-[var(--color-text-primary)]">{type.type}</span>
                                    <Badge variant="brand">{type.count} pages</Badge>
                                  </div>
                                ))}
                              </div>
                            </div>
                          </div>
                        </Card>

                        <Card>
                          <h3 className="text-lg font-semibold tracking-tight text-[var(--color-text-primary)] mb-4">Intent Classification</h3>
                          <div className="space-y-3">
                            {discoveredContent.intents.map((intent) => (
                              <div key={intent.intent} className="space-y-2">
                                <div className="flex justify-between items-center">
                                  <span className="text-sm font-medium text-[var(--color-text-primary)] capitalize">
                                    {intent.intent}
                                  </span>
                                  <div className="flex items-center gap-2">
                                    <span className="text-xs text-[var(--color-text-muted)]">{intent.pageCount} pages</span>
                                    <Badge variant="trust">{Math.round(intent.confidence * 100)}%</Badge>
                                  </div>
                                </div>
                                <div className="w-full bg-[var(--color-surface-sunken)] rounded-full h-2">
                                  <div
                                    className="bg-[var(--color-trust)] h-2 rounded-full transition-all duration-500"
                                    style={{ width: `${intent.confidence * 100}%` }}
                                  />
                                </div>
                              </div>
                            ))}
                          </div>
                        </Card>
                      </div>
                    )}

                    {uniqueScrapedUrls.length > 0 && (
                      <Card>
                        <h3 className="text-lg font-semibold tracking-tight text-[var(--color-text-primary)] mb-4">
                          Scraped URLs ({uniqueScrapedUrls.length})
                        </h3>
                        <div className="space-y-2 max-h-96 overflow-y-auto">
                          {uniqueScrapedUrls.map((url) => {
                            const isOpen = expandedUrl === url;
                            const loading = Boolean(urlContentLoading[url]);
                            const content = urlContentCache[url];

                            return (
                              <div key={url} className="border border-[var(--color-border-subtle)] rounded-lg overflow-hidden">
                                <button
                                  type="button"
                                  className="w-full text-left px-4 py-3 bg-[var(--color-surface)] hover:bg-[var(--color-surface-sunken)] flex items-center justify-between gap-4 transition-colors"
                                  onClick={() => toggleUrl(url)}
                                >
                                  <span className="text-sm text-[var(--color-text-primary)] break-all flex-1">{url}</span>
                                  <span className="text-xs text-[var(--color-text-muted)] shrink-0">
                                    {isOpen ? "Hide" : "View"}
                                  </span>
                                </button>

                                {isOpen && (
                                  <div className="px-4 py-3 bg-[var(--color-surface-sunken)] border-t border-[var(--color-border-subtle)]">
                                    {loading ? (
                                      <div className="flex items-center gap-2 text-sm text-[var(--color-text-secondary)]">
                                        <Loader2 className="w-4 h-4 animate-spin" />
                                        Loading content...
                                      </div>
                                    ) : (
                                      <pre className="whitespace-pre-wrap text-xs text-[var(--color-text-secondary)] max-h-80 overflow-y-auto">
                                        {content || "No content."}
                                      </pre>
                                    )}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </Card>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Ingestion */}
            {currentStep === "ingestion" && (
              <div className="space-y-8">
                <div className="text-center">
                  <Brain className="w-16 h-16 mx-auto mb-4 text-[var(--color-brand)]" />
                  <h2 className="text-2xl font-semibold tracking-tight text-[var(--color-text-primary)] mb-2">
                    Processing Content
                  </h2>
                  <p className="text-[var(--color-text-secondary)]">
                    Chunking content, generating embeddings, and uploading to vector database
                  </p>
                </div>

                <Card>
                  <div className="space-y-6">
                    {/* Progress Bar */}
                    <div>
                      <div className="flex justify-between items-center mb-2">
                        <span className="text-sm font-medium text-[var(--color-text-primary)]">
                          {ingestionProgress.stage === "processing" && "Processing content into chunks..."}
                          {ingestionProgress.stage === "embedding" && "Generating embeddings..."}
                          {ingestionProgress.stage === "ingestion" && "Uploading to vector database..."}
                          {ingestionProgress.stage === "storing" && "Storing metadata..."}
                          {ingestionProgress.stage === "completed" && "Ingestion complete!"}
                          {!ingestionProgress.stage && "Starting ingestion..."}
                        </span>
                        <span className="text-sm font-semibold text-[var(--color-brand)]">
                          {ingestionProgress.progressPercentage}%
                        </span>
                      </div>
                      <div className="w-full bg-[var(--color-surface-sunken)] rounded-full h-3 overflow-hidden">
                        <div
                          className="bg-[var(--color-brand)] h-full transition-all duration-500 ease-out"
                          style={{ width: `${ingestionProgress.progressPercentage}%` }}
                        />
                      </div>
                    </div>

                    {/* Stats */}
                    <div className="grid grid-cols-2 gap-4">
                      <div className="bg-[var(--color-surface-sunken)] border border-[var(--color-border-subtle)] rounded-lg p-4">
                        <div className="text-sm text-[var(--color-text-secondary)] mb-1">Chunks Created</div>
                        <div className="text-2xl font-semibold text-[var(--color-text-primary)]">
                          {ingestionProgress.chunksCreated}
                        </div>
                      </div>
                      <div className="bg-[var(--color-surface-sunken)] border border-[var(--color-border-subtle)] rounded-lg p-4">
                        <div className="text-sm text-[var(--color-text-secondary)] mb-1">Chunks Uploaded</div>
                        <div className="text-2xl font-semibold text-[var(--color-brand)]">
                          {ingestionProgress.chunksUploaded}
                        </div>
                      </div>
                    </div>

                    {/* Status Message */}
                    {isIngesting && (
                      <div className="flex items-center justify-center gap-2 text-[var(--color-text-secondary)]">
                        <Loader2 className="w-5 h-5 animate-spin" />
                        <span>Processing... This may take a few moments</span>
                      </div>
                    )}

                    {!isIngesting && ingestionProgress.progressPercentage === 100 && (
                      <div className="flex items-center justify-center gap-2 text-[var(--color-trust-strong)]">
                        <CheckCircle className="w-5 h-5" />
                        <span className="font-medium">Content successfully ingested!</span>
                      </div>
                    )}
                  </div>
                </Card>
              </div>
            )}
          </motion.div>
        </AnimatePresence>

        {/* Navigation */}
        <div className="flex justify-between pt-8">
          <Button
            variant="ghost"
            onClick={handleBack}
            disabled={currentStep === "source"}
          >
            <ChevronLeft className="w-4 h-4 mr-2" />
            Back
          </Button>
          <Button
            onClick={handleNext}
            disabled={!canProceed()}
          >
            {currentStep === "scraping" && "Start Ingestion"}
            {currentStep === "ingestion" && "Complete Setup"}
            {currentStep !== "scraping" && currentStep !== "ingestion" && "Next"}
            <ChevronRight className="w-4 h-4 ml-2" />
          </Button>
        </div>
      </main>
    </div>
  );
}
