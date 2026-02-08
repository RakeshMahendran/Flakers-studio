"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Button, Card, Badge, Input } from "@/components/ui/enhanced-ui";
import { Bot, Shield, Brain, Zap } from "lucide-react";
import { useAuth } from "@/contexts/auth-context";

export function LoginScreen() {
  const { login } = useAuth();
  const [email, setEmail] = useState("demo@flakers.studio");
  const [password, setPassword] = useState("demo123");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError("");

    try {
      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // For demo purposes, accept any credentials
      // Generate IDs on client side only to avoid hydration mismatch
      if (typeof window !== 'undefined') {
        login({
          id: crypto.randomUUID(),
          email,
          tenantId: crypto.randomUUID(),
          accessToken: "demo-token-" + Date.now(),
        });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-6xl w-full">
        <div className="grid lg:grid-cols-2 gap-12 items-center">
          
          {/* Left Side - Branding & Features */}
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.6 }}
            className="space-y-8"
          >
            <div>
              <div className="flex items-center gap-3 mb-6">
                <div className="w-12 h-12 bg-blue-600 rounded-xl flex items-center justify-center">
                  <span className="text-white font-bold text-lg">FS</span>
                </div>
                <div>
                  <h1 className="text-3xl font-serif font-bold text-slate-900">FlakersStudio</h1>
                  <div className="flex items-center gap-2 mt-1">
                    <Badge color="green">Tambo AI Powered</Badge>
                    <Badge color="blue">Enterprise Ready</Badge>
                  </div>
                </div>
              </div>
              
              <h2 className="text-4xl lg:text-5xl font-serif font-bold text-slate-900 leading-tight mb-4">
                Governance-first <span className="text-blue-600">AI Assistants</span>
              </h2>
              
              <p className="text-xl text-slate-600 leading-relaxed">
                Create production-ready AI chatbots from your website or WordPress content with 
                advanced governance, explainability, and Tambo AI's dynamic components.
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                  <Shield className="w-5 h-5 text-blue-600" />
                </div>
                <div>
                  <h3 className="font-medium text-slate-900">Governed AI</h3>
                  <p className="text-sm text-slate-600">Server-side governance with transparent rule enforcement</p>
                </div>
              </div>
              
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
                  <Brain className="w-5 h-5 text-green-600" />
                </div>
                <div>
                  <h3 className="font-medium text-slate-900">Tambo AI</h3>
                  <p className="text-sm text-slate-600">Dynamic components with reasoning transparency</p>
                </div>
              </div>
              
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center">
                  <Bot className="w-5 h-5 text-purple-600" />
                </div>
                <div>
                  <h3 className="font-medium text-slate-900">Grounded Responses</h3>
                  <p className="text-sm text-slate-600">All answers derived from your trusted content</p>
                </div>
              </div>
              
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 bg-amber-100 rounded-lg flex items-center justify-center">
                  <Zap className="w-5 h-5 text-amber-600" />
                </div>
                <div>
                  <h3 className="font-medium text-slate-900">Enterprise Ready</h3>
                  <p className="text-sm text-slate-600">Production-grade reliability and compliance</p>
                </div>
              </div>
            </div>

            <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-xl p-6">
              <div className="flex items-start gap-3">
                <Brain className="w-6 h-6 text-blue-600 mt-1" />
                <div>
                  <h4 className="font-medium text-blue-900 mb-2">Enhanced with Tambo AI</h4>
                  <p className="text-sm text-blue-700 mb-3">
                    Experience next-generation AI interfaces with dynamic component rendering, 
                    tool call visualization, and transparent reasoning processes.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <Badge color="blue">Dynamic UI</Badge>
                    <Badge color="blue">Tool Visualization</Badge>
                    <Badge color="blue">Reasoning Display</Badge>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>

          {/* Right Side - Login Form */}
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="max-w-md mx-auto w-full"
          >
            <Card>
              <div className="text-center mb-8">
                <h3 className="text-2xl font-serif font-bold text-slate-900 mb-2">
                  Welcome Back
                </h3>
                <p className="text-slate-600">
                  Sign in to your FlakersStudio account
                </p>
              </div>

              <form onSubmit={handleSubmit} className="space-y-6" suppressHydrationWarning>
                <Input
                  label="Email Address"
                  type="email"
                  value={email}
                  onChange={(e) => {
                    console.log('Email input changed:', e.target.value);
                    setEmail(e.target.value);
                  }}
                  placeholder="Enter your email"
                  required
                  error={error && error.includes('email') ? error : undefined}
                  style={{ backgroundColor: 'white', color: 'black' }}
                  suppressHydrationWarning
                />

                <Input
                  label="Password"
                  type="password"
                  value={password}
                  onChange={(e) => {
                    console.log('Password input changed:', e.target.value);
                    setPassword(e.target.value);
                  }}
                  placeholder="Enter your password"
                  required
                  error={error && !error.includes('email') ? error : undefined}
                  style={{ backgroundColor: 'white', color: 'black' }}
                  suppressHydrationWarning
                />

                {error && (
                  <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                    <p className="text-sm text-red-700">{error}</p>
                  </div>
                )}

                <Button
                  type="submit"
                  className="w-full"
                  size="lg"
                  isLoading={isLoading}
                  disabled={isLoading}
                >
                  {isLoading ? "Signing in..." : "Sign In"}
                </Button>

                <div className="bg-slate-50 border border-slate-200 rounded-lg p-4">
                  <h4 className="text-sm font-medium text-slate-700 mb-2">Demo Credentials</h4>
                  <div className="space-y-1 text-xs text-slate-600">
                    <div><strong>Email:</strong> demo@flakers.studio</div>
                    <div><strong>Password:</strong> demo123</div>
                  </div>
                </div>
              </form>
            </Card>

            <div className="mt-8 text-center">
              <p className="text-sm text-slate-500">
                Don't have an account?{" "}
                <a href="#" className="text-blue-600 hover:text-blue-700 font-medium">
                  Contact Sales
                </a>
              </p>
            </div>
          </motion.div>
        </div>
      </div>
    </div>
  );
}