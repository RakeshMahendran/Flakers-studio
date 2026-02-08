"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { Button, Card, Badge } from "@/components/ui/enhanced-ui";
import { Plus, MessageSquare, ArrowRight, Settings, BarChart2, MoreHorizontal, FileText, Bot, Brain, LogOut, Trash2 } from "lucide-react";
import { useAuth } from "@/contexts/auth-context";
import { apiGet, apiDelete } from "@/lib/api-client";

export interface Assistant {
  id: string;
  name: string;
  description?: string;
  sourceType: "website" | "wordpress";
  siteUrl: string;
  template: "support" | "customer" | "sales" | "ecommerce";
  status: "creating" | "ingesting" | "ready" | "error";
  statusMessage?: string;
  totalPagesCrawled: string;
  totalChunksIndexed: string;
  allowedIntents?: string[];  // Made optional to handle undefined/null
  createdAt: string;
}

export function DashboardScreen() {
  const { user, logout } = useAuth();
  const router = useRouter();
  const [assistants, setAssistants] = useState<Assistant[]>([]);
  const [loading, setLoading] = useState(true);
  const fetchingRef = useRef(false);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchAssistants();
    
    // Poll for status updates every 10 seconds if there are ingesting assistants
    const interval = setInterval(() => {
      // Check current state without adding to dependencies
      setAssistants(current => {
        if (current.some(a => a.status === 'ingesting' || a.status === 'creating')) {
          fetchAssistants();
        }
        return current;
      });
    }, 10000);
    
    return () => clearInterval(interval);
  }, []); // Empty dependency array - only run once on mount

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setOpenMenuId(null);
      }
    };

    if (openMenuId) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [openMenuId]);

  const fetchAssistants = async () => {
    // Prevent duplicate fetches
    if (fetchingRef.current || !user) return;
    
    fetchingRef.current = true;
    try {
      const response = await apiGet("/api/assistants", user.accessToken);
      
      if (response.ok) {
        const data = await response.json();
        setAssistants(data.assistants || []);
      } else {
        // Mock data for development
        setAssistants([
          {
            id: "1",
            name: "Support Assistant",
            description: "Helps customers with support questions",
            sourceType: "website",
            siteUrl: "https://example.com",
            template: "support",
            status: "ready",
            totalPagesCrawled: "25",
            totalChunksIndexed: "150",
            allowedIntents: ["support", "documentation", "faq"],
            createdAt: new Date().toISOString(),
          },
        ]);
      }
    } catch (error) {
      console.error("Failed to fetch assistants:", error);
      // Mock data for development
      setAssistants([
        {
          id: "1",
          name: "Support Assistant",
          description: "Helps customers with support questions",
          sourceType: "website",
          siteUrl: "https://example.com",
          template: "support",
          status: "ready",
          totalPagesCrawled: "25",
          totalChunksIndexed: "150",
          allowedIntents: ["support", "documentation", "faq"],
          createdAt: new Date().toISOString(),
        },
      ]);
    } finally {
      setLoading(false);
      fetchingRef.current = false;
    }
  };

  const stats = [
    { 
      label: 'Total Conversations', 
      value: assistants.reduce((sum, a) => sum + (a.status === 'ready' ? 100 : 0), 0).toString(), 
      change: '+12%', 
      icon: MessageSquare 
    },
    { 
      label: 'Knowledge Base', 
      value: `${assistants.reduce((sum, a) => sum + parseInt(a.totalPagesCrawled || '0'), 0)} Pages`, 
      change: '+5 New', 
      icon: FileText 
    },
    { 
      label: 'Active Assistants', 
      value: `${assistants.filter(a => a.status === 'ready').length}/${assistants.length}`, 
      change: 'All Systems Go', 
      icon: Bot 
    },
    { 
      label: 'AI Features', 
      value: '100%', 
      change: 'Fully Integrated', 
      icon: Brain 
    },
  ];

  const getAssistantIcon = (template: string) => {
    switch (template) {
      case 'support': return '📚';
      case 'sales': return '💼';
      case 'customer': return '🤝';
      case 'ecommerce': return '🛒';
      default: return '🤖';
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'ready': return 'green';
      case 'creating': case 'ingesting': return 'amber';
      case 'error': return 'red';
      default: return 'slate';
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'ready': return 'Live';
      case 'creating': return 'Creating';
      case 'ingesting': return 'Learning';
      case 'error': return 'Error';
      default: return 'Draft';
    }
  };

  const getTamboFeatures = (template: string) => {
    const baseFeatures = ['Tool Calls', 'Reasoning'];
    switch (template) {
      case 'support':
        return [...baseFeatures, 'Dynamic UI', 'Citations'];
      case 'sales':
        return [...baseFeatures, 'Rich Components', 'CRM Integration'];
      case 'customer':
        return [...baseFeatures, 'Governance', 'Analytics'];
      default:
        return baseFeatures;
    }
  };

  const handleDeleteAssistant = async (assistantId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm('Are you sure you want to delete this assistant? This action cannot be undone.')) {
      return;
    }

    try {
      const response = await apiDelete(`/api/assistant/${assistantId}`, user?.accessToken);

      if (response.ok) {
        setAssistants(assistants.filter(a => a.id !== assistantId));
        setOpenMenuId(null);
      } else {
        alert('Failed to delete assistant');
      }
    } catch (error) {
      console.error('Failed to delete assistant:', error);
      alert('Failed to delete assistant');
    }
  };

  const handleSettingsClick = (assistantId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setOpenMenuId(null);
    // TODO: Implement settings modal
    alert(`Settings for assistant ${assistantId} - Coming soon!`);
  };

  const toggleMenu = (assistantId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setOpenMenuId(openMenuId === assistantId ? null : assistantId);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-slate-600">Loading your assistants...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Enhanced Header */}
      <nav className="bg-white border-b border-slate-200 px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
              <span className="text-white font-bold text-sm">FS</span>
            </div>
            <span className="font-serif font-bold text-slate-900 text-lg">FlakersStudio</span>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-sm text-slate-600">Welcome, {user?.email}</span>
            <Button variant="ghost" size="sm" onClick={logout}>
              <LogOut className="w-4 h-4 mr-2" />
              Logout
            </Button>
          </div>
        </div>
      </nav>

      <div className="w-full max-w-6xl mx-auto px-6 pt-28 pb-12">
        
        {/* Hero / Header Section */}
        <div className="flex flex-col md:flex-row md:items-end justify-between mb-12 gap-6">
          <div>
            <motion.div 
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex items-center gap-2 mb-4"
            >
              <Badge color="blue">v2.4.0</Badge>
              <span className="text-slate-400 text-sm">Enterprise Edition</span>
            </motion.div>
            <motion.h1 
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="text-4xl md:text-5xl font-serif text-slate-900 tracking-tight leading-tight mb-2"
            >
              Manage your <span className="text-blue-600">AI Agents</span>
            </motion.h1>
            <motion.p 
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="text-lg text-slate-500 max-w-xl"
            >
              Orchestrate, monitor, and deploy your governed AI workforce with dynamic components and advanced reasoning capabilities.
            </motion.p>
          </div>

          <motion.div 
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.3 }}
          >
            <Button onClick={() => router.push('/assistant/create')} size="lg" className="shadow-xl shadow-blue-500/20">
              <Plus className="w-5 h-5 mr-2" />
              Create New Agent
            </Button>
          </motion.div>
        </div>

        {/* Feature Highlight */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="mb-12"
        >
          <Card className="bg-linear-to-r from-blue-50 to-indigo-50 border-blue-200">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-blue-100 rounded-xl">
                <Brain className="w-8 h-8 text-blue-600" />
              </div>
              <div className="flex-1">
                <h3 className="text-xl font-bold text-blue-900 mb-1">Enhanced AI Capabilities</h3>
                <p className="text-blue-700 mb-3">
                  Advanced AI components with dynamic rendering, tool call visualization, and reasoning transparency
                </p>
                <div className="flex flex-wrap gap-2">
                  <Badge color="blue">Dynamic Components</Badge>
                  <Badge color="blue">Tool Visualization</Badge>
                  <Badge color="blue">Reasoning Display</Badge>
                  <Badge color="blue">Rich Interactions</Badge>
                </div>
              </div>
            </div>
          </Card>
        </motion.div>

        {/* Stats Overview */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-12">
          {stats.map((stat, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4 + (i * 0.1) }}
            >
              <Card className="hover:shadow-lg transition-shadow duration-300">
                <div className="flex items-start justify-between mb-4">
                  <div className="p-2 bg-slate-50 rounded-lg text-slate-500">
                    <stat.icon className="w-5 h-5" />
                  </div>
                  {stat.change.includes('+') ? (
                    <span className="text-xs font-medium text-emerald-600 bg-emerald-50 px-2 py-1 rounded-full">{stat.change}</span>
                  ) : (
                    <span className="text-xs font-medium text-slate-500 bg-slate-50 px-2 py-1 rounded-full">{stat.change}</span>
                  )}
                </div>
                <div className="text-3xl font-bold text-slate-900 mb-1 font-serif">{stat.value}</div>
                <div className="text-sm text-slate-500 font-medium">{stat.label}</div>
              </Card>
            </motion.div>
          ))}
        </div>

        {/* Assistants Grid */}
        <div className="mb-6 flex items-center justify-between">
          <h2 className="text-xl font-bold text-slate-900 font-serif">Your Assistants</h2>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" className="text-slate-500">Recents</Button>
            <Button variant="ghost" size="sm" className="text-slate-500">All</Button>
          </div>
        </div>

        {assistants.length === 0 ? (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-center py-12"
          >
            <Bot className="w-16 h-16 text-slate-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-slate-900 mb-2">No assistants yet</h3>
            <p className="text-slate-600 mb-6">
              Create your first AI assistant to get started
            </p>
            <Button onClick={() => router.push('/assistant/create')} size="lg">
              <Plus className="w-5 h-5 mr-2" />
              Create Your First Assistant
            </Button>
          </motion.div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {assistants.map((assistant, i) => (
              <motion.div
                key={assistant.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.6 + (i * 0.1) }}
                onClick={() => {
                  console.log('Assistant clicked:', assistant);
                  console.log('Status:', assistant.status);
                  console.log('Is ready?', assistant.status === 'ready');
                  if (assistant.status === 'ready') {
                    router.push(`/assistant/${assistant.id}`);
                  } else {
                    console.log('Assistant not ready, status is:', assistant.status);
                  }
                }}
                className={`group ${assistant.status === 'ready' ? 'cursor-pointer' : 'cursor-default'}`}
              >
                <Card className={`h-full transition-all duration-300 relative overflow-hidden ${
                  assistant.status === 'ready' 
                    ? 'hover:border-blue-200 hover:ring-4 hover:ring-blue-50' 
                    : 'opacity-75'
                }`}>
                  <div className="flex justify-between items-start mb-6">
                    <div className={`w-12 h-12 rounded-xl bg-slate-50 flex items-center justify-center text-2xl transition-all duration-300 ${
                      assistant.status === 'ready' ? 'group-hover:bg-blue-50 group-hover:scale-110' : ''
                    }`}>
                      {getAssistantIcon(assistant.template)}
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge color={getStatusColor(assistant.status)}>
                        {getStatusLabel(assistant.status)}
                      </Badge>
                      <div className="relative" ref={openMenuId === assistant.id ? menuRef : null}>
                        <button 
                          onClick={(e) => toggleMenu(assistant.id, e)}
                          className="p-1 text-slate-400 hover:text-slate-600 rounded hover:bg-slate-50 transition-colors"
                        >
                          <MoreHorizontal className="w-4 h-4" />
                        </button>
                        
                        <AnimatePresence>
                          {openMenuId === assistant.id && (
                            <motion.div
                              initial={{ opacity: 0, scale: 0.95, y: -10 }}
                              animate={{ opacity: 1, scale: 1, y: 0 }}
                              exit={{ opacity: 0, scale: 0.95, y: -10 }}
                              transition={{ duration: 0.15 }}
                              className="absolute right-0 mt-2 w-48 bg-white rounded-lg shadow-lg border border-slate-200 py-1 z-50"
                            >
                              <button
                                onClick={(e) => handleSettingsClick(assistant.id, e)}
                                className="w-full px-4 py-2 text-left text-sm text-slate-700 hover:bg-slate-50 flex items-center gap-2 transition-colors"
                              >
                                <Settings className="w-4 h-4" />
                                Settings
                              </button>
                              <div className="border-t border-slate-100 my-1" />
                              <button
                                onClick={(e) => handleDeleteAssistant(assistant.id, e)}
                                className="w-full px-4 py-2 text-left text-sm text-red-600 hover:bg-red-50 flex items-center gap-2 transition-colors"
                              >
                                <Trash2 className="w-4 h-4" />
                                Delete
                              </button>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    </div>
                  </div>

                  <h3 className={`text-xl font-bold text-slate-900 mb-2 font-serif transition-colors ${
                    assistant.status === 'ready' ? 'group-hover:text-blue-600' : ''
                  }`}>
                    {assistant.name}
                  </h3>
                  <p className="text-sm text-slate-500 mb-4 line-clamp-2">
                    {assistant.description || `Governed assistant trained on ${assistant.sourceType} content sources.`}
                  </p>

                  {/* AI Features */}
                  <div className="flex flex-wrap gap-1 mb-4">
                    {getTamboFeatures(assistant.template).map((feature) => (
                      <Badge key={feature} color="blue" className="text-xs">{feature}</Badge>
                    ))}
                  </div>

                  <div className="flex items-center justify-between pt-4 border-t border-slate-50 text-xs font-medium text-slate-400">
                    <div className="flex items-center gap-4">
                      <span className="flex items-center gap-1">
                        <FileText className="w-3 h-3" /> {assistant.totalPagesCrawled || '0'} pages
                      </span>
                      {assistant.status === 'ready' && (
                        <span className="flex items-center gap-1">
                          <MessageSquare className="w-3 h-3" /> Active
                        </span>
                      )}
                    </div>
                    {assistant.status === 'ready' && (
                      <span className="group-hover:translate-x-1 transition-transform text-blue-600 opacity-0 group-hover:opacity-100 flex items-center gap-1">
                        Chat <ArrowRight className="w-3 h-3" />
                      </span>
                    )}
                  </div>

                  {assistant.statusMessage && assistant.status !== 'ready' && (
                    <div className="mt-2 text-xs text-slate-500 bg-slate-50 p-2 rounded">
                      {assistant.statusMessage}
                    </div>
                  )}
                </Card>
              </motion.div>
            ))}

            {/* New Assistant Card Placeholder */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.9 }}
              onClick={() => router.push('/assistant/create')}
              className="group cursor-pointer h-full min-h-[240px]"
            >
              <div className="h-full border-2 border-dashed border-slate-200 rounded-2xl flex flex-col items-center justify-center p-6 text-slate-400 hover:border-blue-300 hover:bg-blue-50/30 transition-all duration-300">
                <div className="w-12 h-12 rounded-full bg-slate-50 flex items-center justify-center mb-4 group-hover:bg-blue-100 group-hover:text-blue-600 transition-colors">
                  <Plus className="w-6 h-6" />
                </div>
                <span className="font-semibold text-slate-600 group-hover:text-blue-700">Create New Agent</span>
              </div>
            </motion.div>
          </div>
        )}

        {/* Quick Actions */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 1.0 }}
          className="mt-12"
        >
          <Card>
            <h3 className="text-lg font-bold text-slate-900 mb-4">Quick Actions</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Button variant="outline" className="justify-start h-auto p-4" onClick={() => router.push('/assistant/create')}>
                <div className="flex items-center gap-3">
                  <Plus className="w-5 h-5" />
                  <div className="text-left">
                    <div className="font-medium">Create Assistant</div>
                    <div className="text-sm text-slate-500">Build a new AI assistant</div>
                  </div>
                </div>
              </Button>
              <Button variant="outline" className="justify-start h-auto p-4">
                <div className="flex items-center gap-3">
                  <Settings className="w-5 h-5" />
                  <div className="text-left">
                    <div className="font-medium">Manage Settings</div>
                    <div className="text-sm text-slate-500">Configure AI options</div>
                  </div>
                </div>
              </Button>
              <Button variant="outline" className="justify-start h-auto p-4">
                <div className="flex items-center gap-3">
                  <BarChart2 className="w-5 h-5" />
                  <div className="text-left">
                    <div className="font-medium">View Analytics</div>
                    <div className="text-sm text-slate-500">Monitor performance metrics</div>
                  </div>
                </div>
              </Button>
            </div>
          </Card>
        </motion.div>
      </div>
    </div>
  );
}