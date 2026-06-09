"use client";

/**
 * AppShell — top-level chrome for the (dashboard) route group.
 * --------------------------------------------------------------------
 * Layout:
 *   ┌──────────────────────────────────────────────────────────────┐
 *   │ Sidebar (240/64) │ Top bar                                    │
 *   │                  ├────────────────────────────────────────────┤
 *   │                  │ <main> (max-w-7xl, generous padding)       │
 *   └──────────────────────────────────────────────────────────────┘
 * Mobile (<768px): sidebar collapses into a Radix Dialog Sheet.
 *
 * State:
 *   - Collapsed/expanded persisted in localStorage under "fs:sidebar".
 *   - Theme persisted in localStorage under "fs:theme".
 * --------------------------------------------------------------------
 */
import * as React from "react";
import * as Dialog from "@radix-ui/react-dialog";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Bot,
  ChevronLeft,
  ChevronRight,
  Compass,
  FileText,
  LayoutDashboard,
  LogOut,
  Menu,
  Moon,
  Search,
  Settings,
  Sun,
  Sparkles,
  TrendingUp,
  X,
} from "lucide-react";

import { cn } from "@/lib/design-system";
import { useAuth } from "@/contexts/auth-context";
import {
  CommandPalette,
  useCommandPalette,
  type PaletteAssistant,
} from "./command-palette";
import { NotificationsBell } from "./notifications-bell";

/* ------------------------------------------------------------------ */
/* Sidebar config                                                      */
/* ------------------------------------------------------------------ */

interface NavItem {
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  /** Match prefixes — e.g. /assistant matches /assistant/abc/review. */
  matchPrefix?: boolean;
}

const NAV_ITEMS: NavItem[] = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { label: "Assistants", href: "/assistant", icon: Bot, matchPrefix: true },
  { label: "Content", href: "/content", icon: FileText, matchPrefix: true },
  { label: "Analytics", href: "/analytics", icon: TrendingUp, matchPrefix: true },
  { label: "Settings", href: "/settings", icon: Settings, matchPrefix: true },
];

/* ------------------------------------------------------------------ */
/* Hooks                                                                */
/* ------------------------------------------------------------------ */

const SIDEBAR_KEY = "fs:sidebar";
const THEME_KEY = "fs:theme";

/** Read + persist sidebar collapsed state in localStorage. */
function useSidebarCollapsed(): [boolean, (v: boolean) => void] {
  const [collapsed, setCollapsed] = React.useState(false);

  // Hydrate from storage on mount.
  React.useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(SIDEBAR_KEY);
      if (raw === "1") setCollapsed(true);
    } catch {
      /* swallow */
    }
  }, []);

  const update = React.useCallback((v: boolean) => {
    setCollapsed(v);
    try {
      window.localStorage.setItem(SIDEBAR_KEY, v ? "1" : "0");
    } catch {
      /* swallow */
    }
  }, []);

  return [collapsed, update];
}

type Theme = "light" | "dark";

function useTheme(): [Theme, (t: Theme) => void] {
  const [theme, setTheme] = React.useState<Theme>("light");

  // Hydrate after mount.
  React.useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const stored = window.localStorage.getItem(THEME_KEY) as Theme | null;
      const initial: Theme =
        stored ?? (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
      setTheme(initial);
      document.documentElement.classList.toggle("dark", initial === "dark");
    } catch {
      /* swallow */
    }
  }, []);

  const update = React.useCallback((t: Theme) => {
    setTheme(t);
    try {
      window.localStorage.setItem(THEME_KEY, t);
      document.documentElement.classList.toggle("dark", t === "dark");
    } catch {
      /* swallow */
    }
  }, []);

  return [theme, update];
}

/* ------------------------------------------------------------------ */
/* Brand mark — gradient logo                                           */
/* ------------------------------------------------------------------ */

function BrandMark({ collapsed = false }: { collapsed?: boolean }) {
  return (
    <Link
      href="/dashboard"
      className={cn(
        "flex items-center gap-3 rounded-md p-1.5",
        "outline-none transition-opacity hover:opacity-90",
        "focus-visible:ring-2 focus-visible:ring-[var(--color-focus-ring)]"
      )}
      aria-label="FlakersStudio home"
    >
      <span
        className={cn(
          "relative inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md",
          "bg-[image:var(--gradient-brand)] text-white shadow-[var(--elevation-1)]",
          "font-semibold tracking-tight"
        )}
        aria-hidden
      >
        FS
      </span>
      {!collapsed && (
        <span className="flex min-w-0 flex-col leading-tight">
          <span className="truncate text-sm font-semibold tracking-tight text-[var(--color-text-primary)]">
            FlakersStudio
          </span>
          <span className="truncate text-[10px] uppercase tracking-[0.16em] text-[var(--color-text-muted)]">
            Workspace
          </span>
        </span>
      )}
    </Link>
  );
}

/* ------------------------------------------------------------------ */
/* Sidebar inner — used by both desktop sidebar and mobile sheet.      */
/* ------------------------------------------------------------------ */

interface SidebarInnerProps {
  collapsed: boolean;
  onItemClick?: () => void;
}

function SidebarInner({ collapsed, onItemClick }: SidebarInnerProps) {
  const pathname = usePathname();
  const { user, logout } = useAuth();

  const isActive = (item: NavItem) => {
    if (!pathname) return false;
    if (item.matchPrefix) return pathname.startsWith(item.href);
    return pathname === item.href;
  };

  const initials = (user?.email ?? "?").slice(0, 2).toUpperCase();

  return (
    <div className="flex h-full flex-col">
      {/* Brand */}
      <div
        className={cn(
          "flex items-center px-3 pt-4 pb-3",
          collapsed ? "justify-center" : "justify-start"
        )}
      >
        <BrandMark collapsed={collapsed} />
      </div>

      {/* Section heading */}
      {!collapsed && (
        <div className="px-5 pb-2 pt-2">
          <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--color-text-muted)]">
            Navigation
          </span>
        </div>
      )}

      {/* Nav */}
      <nav
        className={cn("flex flex-1 flex-col gap-1 px-3 pt-1", collapsed && "items-center")}
        aria-label="Primary"
      >
        {NAV_ITEMS.map((item) => {
          const active = isActive(item);
          const Icon = item.icon;
          const baseClasses = cn(
            "group relative flex items-center rounded-md text-sm font-medium",
            "transition-[background,color,box-shadow] duration-[var(--duration-fast)] ease-[var(--ease-out)]",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-focus-ring)]"
          );

          if (active) {
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onItemClick}
                aria-current="page"
                className={cn(
                  baseClasses,
                  collapsed ? "h-10 w-10 justify-center" : "h-10 px-3 gap-3",
                  "bg-[image:var(--gradient-brand)] text-white shadow-[var(--elevation-1)]"
                )}
              >
                <Icon className="h-4 w-4 shrink-0" />
                {!collapsed && <span className="min-w-0 truncate">{item.label}</span>}
              </Link>
            );
          }

          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onItemClick}
              className={cn(
                baseClasses,
                collapsed ? "h-10 w-10 justify-center" : "h-10 px-3 gap-3",
                "text-[var(--color-text-secondary)]",
                "hover:bg-[var(--color-surface-sunken)] hover:text-[var(--color-text-primary)]"
              )}
            >
              <Icon className="h-4 w-4 shrink-0" />
              {!collapsed && <span>{item.label}</span>}
            </Link>
          );
        })}
      </nav>

      {/* Bottom user menu */}
      <div className="mt-auto border-t border-[var(--color-border-subtle)] p-3">
        <DropdownMenu.Root>
          <DropdownMenu.Trigger asChild>
            <button
              type="button"
              className={cn(
                "flex w-full items-center rounded-md p-2",
                "text-left transition-colors duration-[var(--duration-fast)]",
                "hover:bg-[var(--color-surface-sunken)]",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-focus-ring)]",
                collapsed ? "justify-center" : "gap-3"
              )}
              aria-label="Account menu"
            >
              <span
                className={cn(
                  "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full",
                  "bg-[image:var(--gradient-brand)] text-xs font-semibold text-white"
                )}
                aria-hidden
              >
                {initials}
              </span>
              {!collapsed && (
                <span className="flex min-w-0 flex-1 flex-col leading-tight">
                  <span
                    className="truncate text-sm font-medium text-[var(--color-text-primary)]"
                    title={user?.email ?? "Guest"}
                  >
                    {user?.email ? (user.email.split("@")[0] || user.email) : "Guest"}
                  </span>
                  <span className="truncate text-xs text-[var(--color-text-muted)]">
                    {user?.tenantName ?? "Tenant"}
                  </span>
                </span>
              )}
            </button>
          </DropdownMenu.Trigger>
          <DropdownMenu.Portal>
            <DropdownMenu.Content
              align="start"
              side="top"
              sideOffset={8}
              className={cn(
                "z-50 min-w-[200px] rounded-md border p-1",
                "border-[var(--color-border-subtle)] bg-[var(--color-surface-elevated)]",
                "shadow-[var(--elevation-3)]"
              )}
            >
              <DropdownMenu.Item
                className={cn(
                  "flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm outline-none",
                  "text-[var(--color-text-secondary)]",
                  "data-[highlighted]:bg-[var(--color-surface-sunken)] data-[highlighted]:text-[var(--color-text-primary)]"
                )}
                onSelect={() => {
                  /* settings placeholder */
                }}
              >
                <Settings className="h-4 w-4" /> Settings
              </DropdownMenu.Item>
              <DropdownMenu.Separator className="my-1 h-px bg-[var(--color-border-subtle)]" />
              <DropdownMenu.Item
                className={cn(
                  "flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm outline-none",
                  "text-[var(--color-refuse)]",
                  "data-[highlighted]:bg-[var(--color-refuse-soft)]"
                )}
                onSelect={logout}
              >
                <LogOut className="h-4 w-4" /> Sign out
              </DropdownMenu.Item>
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Top bar                                                              */
/* ------------------------------------------------------------------ */

interface TopBarProps {
  onOpenPalette: () => void;
  onOpenMobileNav: () => void;
  onToggleSidebar: () => void;
  sidebarCollapsed: boolean;
  theme: Theme;
  onToggleTheme: () => void;
}

function TopBar({
  onOpenPalette,
  onOpenMobileNav,
  onToggleSidebar,
  sidebarCollapsed,
  theme,
  onToggleTheme,
}: TopBarProps) {
  const pathname = usePathname() ?? "/dashboard";

  /* Build a simple breadcrumb from the path. */
  const crumbs = React.useMemo(() => {
    const segments = pathname.split("/").filter(Boolean);
    if (segments.length === 0) return [{ label: "Home", href: "/dashboard" }];
    let acc = "";
    return segments.map((s) => {
      acc += `/${s}`;
      const label = s.replace(/-/g, " ").replace(/^./, (c) => c.toUpperCase());
      return { label, href: acc };
    });
  }, [pathname]);

  return (
    <header
      className={cn(
        "sticky top-0 z-30 flex h-14 items-center gap-3 px-4 md:px-6",
        "border-b border-[var(--color-border-subtle)]",
        "bg-[oklch(var(--color-surface)/0.85)] supports-[backdrop-filter]:bg-[oklch(var(--color-surface)/0.65)]",
        "backdrop-blur"
      )}
      style={{ backgroundColor: "color-mix(in oklch, var(--color-surface) 75%, transparent)" }}
    >
      {/* Mobile: open nav sheet */}
      <button
        type="button"
        onClick={onOpenMobileNav}
        className={cn(
          "inline-flex h-9 w-9 min-h-[44px] min-w-[44px] items-center justify-center rounded-md md:hidden",
          "text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-sunken)]",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-focus-ring)]"
        )}
        aria-label="Open navigation menu"
        aria-expanded="false"
      >
        <Menu className="h-4 w-4" />
      </button>

      {/* Desktop: toggle sidebar */}
      <button
        type="button"
        onClick={onToggleSidebar}
        className={cn(
          "hidden h-9 w-9 items-center justify-center rounded-md md:inline-flex",
          "text-[var(--color-text-muted)] hover:bg-[var(--color-surface-sunken)] hover:text-[var(--color-text-primary)]",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-focus-ring)]"
        )}
        aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
        aria-pressed={sidebarCollapsed}
      >
        {sidebarCollapsed ? (
          <ChevronRight className="h-4 w-4" />
        ) : (
          <ChevronLeft className="h-4 w-4" />
        )}
      </button>

      {/* Breadcrumb */}
      <nav aria-label="Breadcrumb" className="hidden min-w-0 items-center gap-1.5 sm:flex">
        {crumbs.map((c, i) => (
          <React.Fragment key={c.href}>
            {i > 0 && (
              <span className="text-[var(--color-text-muted)]" aria-hidden>
                /
              </span>
            )}
            {i === crumbs.length - 1 ? (
              <span className="truncate text-sm font-medium text-[var(--color-text-primary)]">
                {c.label}
              </span>
            ) : (
              <Link
                href={c.href}
                className="truncate text-sm text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"
              >
                {c.label}
              </Link>
            )}
          </React.Fragment>
        ))}
      </nav>

      {/* Search trigger — fills remaining space, opens palette */}
      <button
        type="button"
        onClick={onOpenPalette}
        className={cn(
          "ml-auto flex h-9 w-full max-w-sm items-center gap-2 rounded-md px-3",
          "border border-[var(--color-border-subtle)] bg-[var(--color-surface-sunken)]",
          "text-sm text-[var(--color-text-muted)]",
          "transition-colors duration-[var(--duration-fast)]",
          "hover:border-[var(--color-border-default)] hover:bg-[var(--color-surface)] hover:text-[var(--color-text-secondary)]",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-focus-ring)]"
        )}
        aria-label="Search or press Cmd K"
      >
        <Search className="h-4 w-4 shrink-0" />
        <span className="flex-1 text-left">Search or press</span>
        <kbd
          className={cn(
            "inline-flex items-center rounded border px-1.5 py-0.5",
            "border-[var(--color-border-default)] bg-[var(--color-surface)]",
            "text-[10px] font-medium text-[var(--color-text-secondary)] tracking-wide"
          )}
        >
          ⌘K
        </kbd>
      </button>

      {/* Right cluster */}
      <div className="ml-2 flex items-center gap-1">
        <NotificationsBell />
        <button
          type="button"
          onClick={onToggleTheme}
          aria-label={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
          aria-live="polite"
          className={cn(
            "inline-flex h-9 w-9 min-h-[44px] min-w-[44px] items-center justify-center rounded-md",
            "text-[var(--color-text-muted)] hover:bg-[var(--color-surface-sunken)] hover:text-[var(--color-text-primary)]",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-focus-ring)]"
          )}
        >
          {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </button>
      </div>
    </header>
  );
}

/* ------------------------------------------------------------------ */
/* AppShell                                                             */
/* ------------------------------------------------------------------ */

interface AppShellContextValue {
  /** Open the command palette programmatically. */
  openCommandPalette: () => void;
  /** Register the assistant list shown in the palette. */
  registerAssistants: (list: PaletteAssistant[]) => void;
  /** Register recent chats shown in the palette. */
  registerRecents: (list: PaletteAssistant[]) => void;
}

const AppShellContext = React.createContext<AppShellContextValue | null>(null);

/** Hook for descendants to interact with the AppShell. */
export function useAppShell(): AppShellContextValue {
  const ctx = React.useContext(AppShellContext);
  if (!ctx) {
    // Return a no-op fallback so consumers outside the shell don't crash.
    return {
      openCommandPalette: () => {},
      registerAssistants: () => {},
      registerRecents: () => {},
    };
  }
  return ctx;
}

export interface AppShellProps {
  children: React.ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  const [sidebarCollapsed, setSidebarCollapsed] = useSidebarCollapsed();
  const [mobileNavOpen, setMobileNavOpen] = React.useState(false);
  const [theme, setTheme] = useTheme();
  const { open: paletteOpen, setOpen: setPaletteOpen } = useCommandPalette();
  const [assistants, setAssistants] = React.useState<PaletteAssistant[]>([]);
  const [recents, setRecents] = React.useState<PaletteAssistant[]>([]);

  const ctx = React.useMemo<AppShellContextValue>(
    () => ({
      openCommandPalette: () => setPaletteOpen(true),
      registerAssistants: (list) => setAssistants(list),
      registerRecents: (list) => setRecents(list),
    }),
    [setPaletteOpen]
  );

  return (
    <AppShellContext.Provider value={ctx}>
      <div className="relative flex min-h-screen w-full bg-[var(--color-background)] text-[var(--color-text-primary)]">
        {/* Desktop sidebar */}
        <aside
          aria-label="Sidebar"
          className={cn(
            "sticky top-0 hidden h-screen shrink-0 overflow-hidden border-r md:flex",
            "border-[var(--color-border-subtle)] bg-[var(--color-surface)]",
            "transition-[width] duration-[var(--duration-base)] ease-[var(--ease-out)]",
            sidebarCollapsed ? "w-16" : "w-60"
          )}
        >
          <SidebarInner collapsed={sidebarCollapsed} />
        </aside>

        {/* Mobile sidebar — Radix Dialog as a left-edge sheet */}
        <Dialog.Root open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
          <Dialog.Portal>
            <Dialog.Overlay
              className={cn(
                "fixed inset-0 z-40 bg-[oklch(0.16_0.012_270/0.5)] backdrop-blur-sm md:hidden",
                "data-[state=open]:animate-cmd-fade-in",
                "data-[state=closed]:animate-cmd-fade-out"
              )}
            />
            <Dialog.Content
              aria-describedby={undefined}
              className={cn(
                "fixed left-0 top-0 z-50 h-full w-72 md:hidden",
                "border-r border-[var(--color-border-subtle)] bg-[var(--color-surface)]",
                "shadow-[var(--elevation-4)]",
                "data-[state=open]:animate-sheet-in",
                "data-[state=closed]:animate-sheet-out"
              )}
            >
              <Dialog.Title className="sr-only">Navigation</Dialog.Title>
              <button
                type="button"
                onClick={() => setMobileNavOpen(false)}
                aria-label="Close navigation"
                className={cn(
                  "absolute right-3 top-3 inline-flex h-8 w-8 items-center justify-center rounded-md",
                  "text-[var(--color-text-muted)] hover:bg-[var(--color-surface-sunken)]"
                )}
              >
                <X className="h-4 w-4" />
              </button>
              <SidebarInner collapsed={false} onItemClick={() => setMobileNavOpen(false)} />
            </Dialog.Content>
          </Dialog.Portal>
        </Dialog.Root>

        {/* Main column */}
        <div className="flex min-w-0 flex-1 flex-col">
          <TopBar
            onOpenPalette={() => setPaletteOpen(true)}
            onOpenMobileNav={() => setMobileNavOpen(true)}
            onToggleSidebar={() => setSidebarCollapsed(!sidebarCollapsed)}
            sidebarCollapsed={sidebarCollapsed}
            theme={theme}
            onToggleTheme={() => setTheme(theme === "dark" ? "light" : "dark")}
          />
          <main
            id="main-content"
            tabIndex={-1}
            className={cn("relative flex-1 px-4 py-6 md:px-8 md:py-8")}
          >
            <div className="mx-auto w-full max-w-7xl">{children}</div>
          </main>
        </div>

        {/* Command palette — global */}
        <CommandPalette
          open={paletteOpen}
          onOpenChange={setPaletteOpen}
          assistants={assistants}
          recents={recents}
        />
      </div>
    </AppShellContext.Provider>
  );
}

/* Re-export for convenience */
export { Compass, Sparkles };
