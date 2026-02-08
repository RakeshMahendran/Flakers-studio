import React from 'react';
import { motion, HTMLMotionProps } from 'framer-motion';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

// Enhanced Button Component
interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'soft';
  size?: 'sm' | 'md' | 'lg';
  isLoading?: boolean;
}

const buttonVariants = cva(
  "inline-flex items-center justify-center rounded-lg font-medium transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-1 disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.98]",
  {
    variants: {
      variant: {
        primary: "bg-blue-600 hover:bg-blue-700 text-white shadow-md hover:shadow-lg shadow-blue-500/20 border border-transparent",
        secondary: "bg-white text-slate-900 hover:bg-slate-50 border border-slate-200 shadow-sm hover:shadow-md",
        outline: "bg-transparent border border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-50",
        ghost: "bg-transparent text-slate-600 hover:bg-slate-100 hover:text-slate-900",
        soft: "bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-100",
      },
      size: {
        sm: "px-3 py-1.5 text-sm",
        md: "px-5 py-2.5 text-sm",
        lg: "px-8 py-4 text-base",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "md",
    },
  }
);

export function Button({ 
  children, 
  variant, 
  size, 
  className, 
  isLoading,
  ...props 
}: ButtonProps & VariantProps<typeof buttonVariants>) {
  return (
    <button 
      className={cn(buttonVariants({ variant, size }), className)}
      disabled={isLoading || props.disabled}
      {...props}
    >
      {isLoading ? (
        <span className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
      ) : null}
      {children}
    </button>
  );
}

// Enhanced Card Component
export function Card({ 
  children, 
  className = '', 
  noPadding = false, 
  ...props 
}: HTMLMotionProps<"div"> & { noPadding?: boolean }) {
  return (
    <motion.div 
      className={cn(
        "bg-white rounded-2xl border border-slate-100 shadow-xl shadow-slate-200/40",
        noPadding ? '' : 'p-6',
        className
      )}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      transition={{ duration: 0.3, ease: "easeOut" }}
      {...props}
    >
      {children}
    </motion.div>
  );
}

// Enhanced Badge Component
const badgeVariants = cva(
  "inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border",
  {
    variants: {
      color: {
        blue: "bg-blue-50 text-blue-700 border-blue-100",
        green: "bg-emerald-50 text-emerald-700 border-emerald-100",
        amber: "bg-amber-50 text-amber-700 border-amber-100",
        slate: "bg-slate-50 text-slate-600 border-slate-100",
        red: "bg-red-50 text-red-700 border-red-100",
      },
    },
    defaultVariants: {
      color: "blue",
    },
  }
);

export function Badge({ 
  children, 
  color, 
  className,
  ...props 
}: React.HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeVariants>) {
  return (
    <span className={cn(badgeVariants({ color }), className)} {...props}>
      {children}
    </span>
  );
}

// Layout Component
export function Layout({ 
  children, 
  showNav = true 
}: { 
  children: React.ReactNode; 
  showNav?: boolean; 
}) {
  return (
    <div className="min-h-screen bg-slate-50">
      {showNav && (
        <nav className="bg-white border-b border-slate-200 px-6 py-4">
          <div className="max-w-7xl mx-auto flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
                <span className="text-white font-bold text-sm">FS</span>
              </div>
              <span className="font-serif font-bold text-slate-900 text-lg">FlakersStudio</span>
              <Badge color="green">Tambo AI Powered</Badge>
            </div>
          </div>
        </nav>
      )}
      <main className="flex-1">
        {children}
      </main>
    </div>
  );
}

// Input Component
export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, label, error, ...props }, ref) => {
    return (
      <div className="space-y-2">
        {label && (
          <label className="text-sm font-medium text-slate-700">
            {label}
          </label>
        )}
        <input
          type={type}
          className={cn(
            "flex h-10 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 ring-offset-white file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-slate-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
            error && "border-red-500 focus-visible:ring-red-500",
            className
          )}
          ref={ref}
          {...props}
        />
        {error && (
          <p className="text-sm text-red-600">{error}</p>
        )}
      </div>
    );
  }
);
Input.displayName = "Input";

// Textarea Component
export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
}

export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, label, error, ...props }, ref) => {
    return (
      <div className="space-y-2">
        {label && (
          <label className="text-sm font-medium text-slate-700">
            {label}
          </label>
        )}
        <textarea
          className={cn(
            "flex min-h-[80px] w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm ring-offset-white placeholder:text-slate-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
            error && "border-red-500 focus-visible:ring-red-500",
            className
          )}
          ref={ref}
          {...props}
        />
        {error && (
          <p className="text-sm text-red-600">{error}</p>
        )}
      </div>
    );
  }
);
Textarea.displayName = "Textarea";

// Select Component
export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
  options: Array<{ value: string; label: string }>;
}

export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, label, error, options, ...props }, ref) => {
    return (
      <div className="space-y-2">
        {label && (
          <label className="text-sm font-medium text-slate-700">
            {label}
          </label>
        )}
        <select
          className={cn(
            "flex h-10 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm ring-offset-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
            error && "border-red-500 focus-visible:ring-red-500",
            className
          )}
          ref={ref}
          {...props}
        >
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        {error && (
          <p className="text-sm text-red-600">{error}</p>
        )}
      </div>
    );
  }
);
Select.displayName = "Select";