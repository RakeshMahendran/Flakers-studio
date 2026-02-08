/**
 * Tambo Generative UI Component Registry
 * 
 * Register all custom components that can be dynamically rendered by the AI.
 * The backend can specify which component to render along with its props.
 */

import { z } from 'zod';
import { AssistantCard } from './assistant-card';
import { GovernanceDecisionTree } from './governance-decision-tree';
import { PricingCard } from './pricing-card';

// Re-export individual components
export { AssistantCard, GovernanceDecisionTree, PricingCard };

// Zod schemas for component props
const assistantCardSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().optional(),
  status: z.enum(['ready', 'creating', 'error']),
  siteUrl: z.string(),
  template: z.string(),
  totalQueries: z.number().optional(),
  satisfactionRate: z.number().optional(),
});

const decisionStepSchema = z.object({
  label: z.string(),
  status: z.enum(['pass', 'fail', 'warning']),
  description: z.string(),
});

const governanceDecisionTreeSchema = z.object({
  decision: z.enum(['ANSWER', 'REFUSE']),
  reason: z.string().optional(),
  steps: z.array(decisionStepSchema),
  suggestedAlternatives: z.array(z.string()).optional(),
});

const pricingTierSchema = z.object({
  name: z.string(),
  price: z.string(),
  billingPeriod: z.string().optional(),
  promo: z.string().optional(),
  description: z.string(),
  features: z.array(z.string()),
  highlighted: z.boolean().optional(),
  cta: z.string().optional(),
});

const pricingCardSchema = z.object({
  tiers: z.array(pricingTierSchema),
  companyName: z.string().optional(),
  sourceUrl: z.string().optional(),
});

// Component registry for dynamic rendering (as array for TamboProvider)
export const generativeComponents = [
  { 
    name: 'AssistantCard', 
    component: AssistantCard,
    propsSchema: assistantCardSchema,
  },
  { 
    name: 'GovernanceDecisionTree', 
    component: GovernanceDecisionTree,
    propsSchema: governanceDecisionTreeSchema,
  },
  { 
    name: 'PricingCard', 
    component: PricingCard,
    propsSchema: pricingCardSchema,
  },
];
