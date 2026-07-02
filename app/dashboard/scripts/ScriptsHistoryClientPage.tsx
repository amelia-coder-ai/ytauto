"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Check, Copy, ExternalLink, Loader2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { copyToClipboard, formatScriptForCopy } from "@/lib/clipboard";
import type { ScriptSceneRow } from "@/lib/supabase";

type ScriptListItem = {
  id: string;
  title: string;
  status: "pending" | "generating" | "ready" | "failed";
  durationMinutes: number;
  createdAt: string;
  nicheId: string | null;
  nicheName: string;
  sceneCount: number;
  scenes: ScriptSceneRow[];
};

function statusBadge(status: ScriptListItem["status"]) {
  if (status === "ready") {
    return { label: "ready", variant: "secondary" as const };
  }
  if (status === "generating" || status === "pending") {
    return { label: status, variant: "outline" as const };
  }
  return { label: "failed", variant: "destructive" as const };
}

export default function ScriptsHistoryClientPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [scripts, setScripts] = useState<ScriptListItem[]>([]);
  const [copiedScriptId, setCopiedScriptId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        setLoading(true);
        setError("");
        const res = await fetch("/api/scripts/list");
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Failed to fetch scripts");
        if (!cancelled) setScripts((data.scripts ?? []) as ScriptListItem[]);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Unknown error");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const handleCopy = async (script: ScriptListItem) => {
    const formatted = formatScriptForCopy(script.scenes);
    if (!formatted) return;

    const ok = await copyToClipboard(formatted);
    if (!ok) return;

    setCopiedScriptId(script.id);
    setTimeout(() => setCopiedScriptId(null), 2000);
  };

  return (
    <main className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Script History</h1>
        <p className="text-muted-foreground">
          All generated scripts · {scripts.length} total
        </p>
      </div>

      {loading && (
        <Card>
          <CardContent className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading scripts…
          </CardContent>
        </Card>
      )}

      {!loading && error && (
        <Card className="border-destructive/30 bg-destructive/5">
          <CardContent className="py-6 text-sm text-destructive">
            {error}
          </CardContent>
        </Card>
      )}

      {!loading && !error && scripts.length === 0 && (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            No scripts yet. Generate your first script to see it here.
          </CardContent>
        </Card>
      )}

      {!loading && !error && scripts.length > 0 && (
        <div className="space-y-4">
          {scripts.map((script) => {
            const badge = statusBadge(script.status);
            const canCopy =
              script.scenes.some((scene) => scene.content?.trim()) &&
              script.status === "ready";
            const copied = copiedScriptId === script.id;

            return (
              <Card key={script.id}>
                <CardHeader className="pb-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="space-y-2">
                      <CardTitle className="text-base leading-snug">
                        {script.title}
                      </CardTitle>
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="outline">{script.nicheName}</Badge>
                        <Badge variant={badge.variant}>{badge.label}</Badge>
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {new Date(script.createdAt).toLocaleString()}
                    </p>
                  </div>
                </CardHeader>
                <CardContent className="flex flex-wrap items-center justify-between gap-3">
                  <p className="text-sm text-muted-foreground">
                    {script.durationMinutes} min · {script.sceneCount} scenes
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <Link href={`/script/${script.id}`}>
                      <Button size="sm" variant="outline" className="gap-1.5">
                        <ExternalLink className="h-3.5 w-3.5" />
                        Open
                      </Button>
                    </Link>
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-1.5"
                      disabled={!canCopy}
                      onClick={() => void handleCopy(script)}
                    >
                      {copied ? (
                        <>
                          <Check className="h-3.5 w-3.5" />
                          Copied
                        </>
                      ) : (
                        <>
                          <Copy className="h-3.5 w-3.5" />
                          Copy Full Script
                        </>
                      )}
                    </Button>
                    {script.status === "ready" && (
                      <Link href={`/video/new?scriptId=${script.id}`}>
                        <Button size="sm" className="gap-1.5 bg-blue-600 hover:bg-blue-700">
                          🎬 Create Video
                        </Button>
                      </Link>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </main>
  );
}
