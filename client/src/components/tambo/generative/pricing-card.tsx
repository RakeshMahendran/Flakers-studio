"use client";

import { motion } from "framer-motion";
import { Check, Sparkles, Building2, Users, Zap } from "lucide-react";

/**
 * PricingCard - Generative UI Component
 * 
 * Rendered dynamically by AI when user asks about pricing.
 * Shows pricing tiers with features in an interactive card layout.
 */

interface PricingTier {
  name: string;
  price: string;
  billingPeriod?: string;
  promo?: string;
  description: string;
  features: string[];
  highlighted?: boolean;
  cta?: string;
}

interface PricingCardProps {
  tiers: PricingTier[];
  companyName?: string;
  sourceUrl?: string;
}

export function PricingCard({ tiers, companyName = "Service", sourceUrl }: PricingCardProps) {
  const getIcon = (tierName: string) => {
    const name = tierName.toLowerCase();
    if (name.includes("lite") || name.includes("starter")) return <Zap className="w-5 h-5" />;
    if (name.includes("pro")) return <Sparkles className="w-5 h-5" />;
    if (name.includes("enterprise")) return <Building2 className="w-5 h-5" />;
    if (name.includes("agency")) return <Users className="w-5 h-5" />;
    return <Sparkles className="w-5 h-5" />;
  };

  return (
    <div className="w-full max-w-6xl">
      {/* Header */}
      <div className="mb-6">
        <h3 className="text-2xl font-bold text-slate-900 mb-2">
          {companyName} Pricing Plans
        </h3>
        {sourceUrl && (
          <a 
            href={sourceUrl} 
            target="_blank" 
            rel="noopener noreferrer"
            className="text-sm text-blue-600 hover:underline"
          >
            View full pricing details →
          </a>
        )}
      </div>

      {/* Pricing Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {tiers.map((tier, index) => (
          <motion.div
            key={tier.name}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.1 }}
            className={`
              relative rounded-2xl p-6 border-2 transition-all hover:shadow-xl
              ${tier.highlighted 
                ? 'bg-gradient-to-br from-blue-50 to-indigo-50 border-blue-400 shadow-lg scale-105' 
                : 'bg-white border-slate-200 hover:border-blue-300'
              }
            `}
          >
            {/* Promo Badge */}
            {tier.promo && (
              <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                <span className="bg-gradient-to-r from-orange-500 to-pink-500 text-white text-xs font-bold px-3 py-1 rounded-full shadow-md">
                  {tier.promo}
                </span>
              </div>
            )}

            {/* Icon & Name */}
            <div className="flex items-center gap-3 mb-4">
              <div className={`p-2 rounded-lg ${tier.highlighted ? 'bg-blue-500 text-white' : 'bg-slate-100 text-slate-600'}`}>
                {getIcon(tier.name)}
              </div>
              <h4 className="text-xl font-bold text-slate-900">{tier.name}</h4>
            </div>

            {/* Price */}
            <div className="mb-4">
              <div className="flex items-baseline gap-1">
                <span className="text-4xl font-bold text-slate-900">{tier.price}</span>
                {tier.billingPeriod && (
                  <span className="text-slate-500 text-sm">/{tier.billingPeriod}</span>
                )}
              </div>
            </div>

            {/* Description */}
            <p className="text-sm text-slate-600 mb-6">{tier.description}</p>

            {/* Features */}
            <ul className="space-y-3 mb-6">
              {tier.features.map((feature, i) => (
                <li key={i} className="flex items-start gap-2 text-sm">
                  <Check className="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" />
                  <span className="text-slate-700">{feature}</span>
                </li>
              ))}
            </ul>

            {/* CTA Button */}
            {tier.cta && (
              <button
                className={`
                  w-full py-3 px-4 rounded-lg font-semibold text-sm transition-all
                  ${tier.highlighted
                    ? 'bg-blue-600 text-white hover:bg-blue-700 shadow-md'
                    : 'bg-slate-100 text-slate-900 hover:bg-slate-200'
                  }
                `}
              >
                {tier.cta}
              </button>
            )}
          </motion.div>
        ))}
      </div>

      {/* Footer Note */}
      <div className="mt-6 text-center">
        <p className="text-xs text-slate-500">
          All prices are subject to change. Contact sales for custom enterprise solutions.
        </p>
      </div>
    </div>
  );
}
