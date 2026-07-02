"use client";

import * as React from "react";

/** Canonical provider identifiers used everywhere. */
export type AIProvider = "gemini" | "openai" | "claude" | "ollama";

/** Display-friendly metadata for each provider. */
interface ProviderOption {
  value: AIProvider;
  label: string;
  badge: string;
  /** Tailwind classes for the badge colour. */
  badgeClass: string;
  /** Short description shown in the dropdown. */
  description: string;
}

const PROVIDERS: ProviderOption[] = [
  {
    value: "gemini",
    label: "Gemini",
    badge: "Free",
    badgeClass: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
    description: "Google Gemini 2.5 Flash — fast, free tier",
  },
  {
    value: "openai",
    label: "GPT-4.1-mini",
    badge: "Cheap",
    badgeClass: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
    description: "OpenAI GPT-4.1-mini — affordable, high-quality",
  },
  {
    value: "claude",
    label: "Claude Sonnet",
    badge: "Best Quality",
    badgeClass: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400",
    description: "Anthropic Claude Sonnet — top-tier reasoning",
  },
  {
    value: "ollama",
    label: "Ollama (Local)",
    badge: "Local",
    badgeClass: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400",
    description: "Local model via Ollama — fully private, no API costs",
  },
];

const STORAGE_KEY = "preferred_ai_provider";

function getStoredProvider(): AIProvider | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw && PROVIDERS.some((p) => p.value === raw)) {
      return raw as AIProvider;
    }
  } catch {
    // localStorage may be unavailable (e.g. private browsing).
  }
  return null;
}

function setStoredProvider(provider: AIProvider): void {
  try {
    localStorage.setItem(STORAGE_KEY, provider);
  } catch {
    // Silently ignore.
  }
}

// ---------------------------------------------------------------------------
// Context so the entire app can read / write the selected provider without
// prop-drilling.
// ---------------------------------------------------------------------------

interface ProviderContextValue {
  provider: AIProvider;
  setProvider: (p: AIProvider) => void;
}

const ProviderContext = React.createContext<ProviderContextValue | null>(null);

/**
 * Hook to read and update the user's preferred AI provider.
 *
 * Usage:
 * ```
 * const { provider, setProvider } = useAIProvider();
 * fetch("/api/niche/analyze", {
 *   headers: { "x-ai-provider": provider },
 *   body: JSON.stringify({ ... }),
 * });
 * ```
 */
export function useAIProvider(): ProviderContextValue {
  const ctx = React.useContext(ProviderContext);
  if (!ctx) {
    throw new Error("useAIProvider must be used inside <ModelSelectorProvider>");
  }
  return ctx;
}

// ---------------------------------------------------------------------------
// Provider wrapper (put this in your root layout or page).
// ---------------------------------------------------------------------------

export function ModelSelectorProvider({ children }: { children: React.ReactNode }) {
  const [provider, setProviderState] = React.useState<AIProvider>(() => {
    return getStoredProvider() ?? "gemini";
  });

  const setProvider = React.useCallback((p: AIProvider) => {
    setStoredProvider(p);
    setProviderState(p);
  }, []);

  const value = React.useMemo<ProviderContextValue>(
    () => ({ provider, setProvider }),
    [provider, setProvider],
  );

  return (
    <ProviderContext.Provider value={value}>
      {children}
    </ProviderContext.Provider>
  );
}

// ---------------------------------------------------------------------------
// The dropdown component.
// ---------------------------------------------------------------------------

interface ModelSelectorProps {
  /** Additional classes for the outer wrapper. */
  className?: string;
}

export function ModelSelector({ className }: ModelSelectorProps) {
  const { provider, setProvider } = useAIProvider();
  const [open, setOpen] = React.useState(false);
  const containerRef = React.useRef<HTMLDivElement>(null);

  // Close on outside click
  React.useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const current = PROVIDERS.find((p) => p.value === provider) ?? PROVIDERS[0];

  return (
    <div ref={containerRef} className={`relative inline-block text-left${className ? ` ${className}` : ""}`}>
      {/* Trigger button */}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="inline-flex items-center gap-2 rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      >
        <span className="text-xs uppercase tracking-wide text-muted-foreground">AI</span>
        <span className="font-medium">{current.label}</span>
        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${current.badgeClass}`}>
          {current.badge}
        </span>
        <svg
          className={`h-4 w-4 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`}
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          viewBox="0 0 24 24"
          aria-hidden
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="m6 9 6 6 6-6" />
        </svg>
      </button>

      {/* Dropdown menu */}
      {open && (
        <div className="absolute right-0 z-50 mt-2 w-72 origin-top-right rounded-md border bg-popover shadow-lg focus:outline-none">
          <div className="px-3 py-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Select AI Provider
          </div>
          <div className="border-t" />
          {PROVIDERS.map((opt) => {
            const isActive = opt.value === provider;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => {
                  setProvider(opt.value);
                  setOpen(false);
                }}
                className={`flex w-full items-center gap-3 px-3 py-2.5 text-left text-sm transition-colors hover:bg-accent ${
                  isActive ? "bg-accent/50" : ""
                }`}
              >
                {/* Radio indicator */}
                <span
                  className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${
                    isActive
                      ? "border-primary bg-primary"
                      : "border-muted-foreground/30"
                  }`}
                >
                  {isActive && (
                    <span className="h-1.5 w-1.5 rounded-full bg-primary-foreground" />
                  )}
                </span>

                <div className="flex flex-1 items-center justify-between gap-2">
                  <span className="font-medium">{opt.label}</span>
                  <span
                    className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${opt.badgeClass}`}
                  >
                    {opt.badge}
                  </span>
                </div>
              </button>
            );
          })}
          {/* Description for the hovered item (static showing current) */}
          <div className="border-t px-3 py-2 text-xs text-muted-foreground">
            {current.description}
          </div>
        </div>
      )}
    </div>
  );
}
