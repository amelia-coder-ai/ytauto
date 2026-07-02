"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, Check, Copy, Loader2, RefreshCw } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { copyToClipboard, formatScriptForCopy } from "@/lib/clipboard";
import {
  estimateWordCount,
  getSceneStructure,
  type SceneTemplate,
} from "@/lib/script-structure";
import type { ScriptSceneRow } from "@/lib/supabase";

type ScriptStatus = "pending" | "generating" | "ready" | "failed";

type ScriptDetail = {
  scriptId: string;
  status: ScriptStatus;
  title: string;
  durationMinutes: number;
  nicheId: string | null;
  nicheName: string;
  createdAt: string;
  scenes: ScriptSceneRow[];
  totalWords: number;
  estimatedDuration: string;
};

function countWords(text: string): number {
  const trimmed = text.trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/).length;
}

function formatSceneDuration(seconds: number): string {
  if (seconds < 60) return `~${seconds} seconds`;
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  if (remainder === 0) return `~${minutes} min`;
  return `~${minutes} min ${remainder} sec`;
}

function sceneTypeLabel(type: string): string {
  if (type === "hook") return "Hook";
  if (type === "intro") return "Intro";
  if (type === "outro") return "Outro";
  if (type === "transition") return "Transition";
  return "Section";
}

export default function ScriptDetailClientPage({
  scriptId,
}: {
  scriptId: string;
}) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [detail, setDetail] = useState<ScriptDetail | null>(null);
  const [copiedSceneId, setCopiedSceneId] = useState<string | null>(null);
  const [copiedFull, setCopiedFull] = useState(false);
  const [regeneratingSceneId, setRegeneratingSceneId] = useState<string | null>(
    null
  );

  const fetchDetail = useCallback(async () => {
    const res = await fetch("/api/scripts/list");
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Failed to fetch script");

    const script = (data.scripts ?? []).find(
      (s: { id: string }) => s.id === scriptId
    );
    if (!script) throw new Error("Script not found");

    const scenes = (script.scenes ?? []) as ScriptSceneRow[];
    const totalWords = scenes.reduce(
      (sum, scene) => sum + countWords(scene.content),
      0
    );
    const totalDurationSeconds = scenes.reduce(
      (sum, scene) => sum + scene.duration_seconds,
      0
    );
    const minutes = Math.floor(totalDurationSeconds / 60);
    const seconds = totalDurationSeconds % 60;
    const estimatedDuration =
      seconds === 0 ? `${minutes} min` : `${minutes} min ${seconds} sec`;

    setDetail({
      scriptId: script.id,
      status: script.status,
      title: script.title ?? "Untitled script",
      durationMinutes: script.durationMinutes ?? 0,
      nicheId: script.nicheId ?? null,
      nicheName: script.nicheName ?? "Unknown niche",
      createdAt: script.createdAt ?? "",
      scenes,
      totalWords,
      estimatedDuration,
    });
  }, [scriptId]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        setLoading(true);
        setError("");
        await fetchDetail();
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Failed to load script");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [fetchDetail]);

  useEffect(() => {
    if (!detail || detail.status !== "generating") return;

    const intervalId = setInterval(() => {
      void fetchDetail().catch(() => undefined);
    }, 2000);

    return () => clearInterval(intervalId);
  }, [detail, fetchDetail]);

  const expectedScenes = useMemo(
    () =>
      detail ? getSceneStructure(detail.durationMinutes) : ([] as SceneTemplate[]),
    [detail]
  );

  const sceneByNumber = useMemo(() => {
    const map = new Map<number, ScriptSceneRow>();
    for (const scene of detail?.scenes ?? []) {
      map.set(scene.scene_number, scene);
    }
    return map;
  }, [detail?.scenes]);

  const sceneCards = useMemo(() => {
    if (!detail) return [];

    if (detail.status === "generating") {
      return expectedScenes.map((template, index) => ({
        sceneNumber: index + 1,
        template,
        scene: sceneByNumber.get(index + 1),
      }));
    }

    if (detail.scenes.length > 0) {
      return [...detail.scenes]
        .sort((a, b) => a.scene_number - b.scene_number)
        .map((scene) => {
          const template = expectedScenes[scene.scene_number - 1];
          return {
            sceneNumber: scene.scene_number,
            template:
              template ??
              ({
                scene_type: scene.scene_type,
                title: scene.title,
                duration_seconds: scene.duration_seconds,
                notes: scene.notes ?? "",
              } satisfies SceneTemplate),
            scene,
          };
        });
    }

    return expectedScenes.map((template, index) => ({
      sceneNumber: index + 1,
      template,
      scene: sceneByNumber.get(index + 1),
    }));
  }, [detail, expectedScenes, sceneByNumber]);

  const copyScene = async (scene: ScriptSceneRow) => {
    if (!scene.content) return;
    const ok = await copyToClipboard(scene.content);
    if (!ok) return;
    setCopiedSceneId(scene.id);
    setTimeout(() => setCopiedSceneId(null), 2000);
  };

  const copyFullScript = async () => {
    if (!detail) return;
    const formatted = formatScriptForCopy(detail.scenes);
    if (!formatted) return;

    const ok = await copyToClipboard(formatted);
    if (!ok) return;
    setCopiedFull(true);
    setTimeout(() => setCopiedFull(false), 2000);
  };

  const regenerateScene = async (scene: ScriptSceneRow) => {
    setRegeneratingSceneId(scene.id);
    setError("");

    try {
      const res = await fetch("/api/script/regenerate-scene", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sceneId: scene.id }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to regenerate scene");
      }

      const updated = data.scene as ScriptSceneRow;
      setDetail((prev) => {
        if (!prev) return prev;
        const scenes = prev.scenes.map((s) =>
          s.id === updated.id ? updated : s
        );
        const totalWords = scenes.reduce(
          (sum, s) => sum + countWords(s.content),
          0
        );
        return { ...prev, scenes, totalWords };
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to regenerate scene");
    } finally {
      setRegeneratingSceneId(null);
    }
  };

  if (loading) {
    return (
      <main className="space-y-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-24 w-full" />
        <div className="space-y-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-40 w-full" />
          ))}
        </div>
      </main>
    );
  }

  if (error && !detail) {
    return (
      <main className="space-y-6">
        <Link
          href="/scripts"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Script History
        </Link>
        <Card className="border-destructive/30 bg-destructive/5">
          <CardContent className="py-6 text-sm text-destructive">
            {error}
          </CardContent>
        </Card>
      </main>
    );
  }

  if (!detail) return null;

  const canCopyFull =
    detail.status === "ready" && detail.scenes.some((s) => s.content?.trim());

  return (
    <main className="space-y-6">
      <div className="space-y-4">
        <Link
          href="/scripts"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Script History
        </Link>

        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-2">
            <h1 className="text-2xl font-bold tracking-tight">{detail.title}</h1>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline">{detail.nicheName}</Badge>
              <Badge
                variant={
                  detail.status === "ready"
                    ? "secondary"
                    : detail.status === "failed"
                      ? "destructive"
                      : "outline"
                }
              >
                {detail.status}
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground">
              {detail.durationMinutes} min · Created{" "}
              {detail.createdAt
                ? new Date(detail.createdAt).toLocaleString()
                : "—"}
            </p>
          </div>

          <Button
            size="sm"
            variant="outline"
            className="gap-2"
            disabled={!canCopyFull}
            onClick={() => void copyFullScript()}
          >
            {copiedFull ? (
              <>
                <Check className="h-4 w-4" />
                Copied
              </>
            ) : (
              <>
                <Copy className="h-4 w-4" />
                Copy Full Script
              </>
            )}
          </Button>
        </div>
      </div>

      {error && (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      )}

      <Card>
        <CardContent className="flex flex-wrap items-center gap-3 py-4 text-sm">
          <span>
            <strong>{detail.scenes.length}</strong> /{" "}
            {Math.max(expectedScenes.length, detail.scenes.length)} scenes
          </span>
          <Separator orientation="vertical" className="hidden h-4 sm:block" />
          <span>
            <strong>{detail.totalWords}</strong> words
          </span>
          <Separator orientation="vertical" className="hidden h-4 sm:block" />
          <span>{detail.estimatedDuration || "—"}</span>
        </CardContent>
      </Card>

      <div className="space-y-4">
        {sceneCards.map(({ sceneNumber, template, scene }) => {
          const isLoading =
            detail.status === "generating" && (!scene || !scene.content);
          const isFailed =
            scene?.notes?.startsWith("GENERATION_FAILED:") ?? false;
          const isRegenerating = scene
            ? regeneratingSceneId === scene.id
            : false;

          return (
            <SceneCard
              key={scene?.id ?? `${sceneNumber}-${template.title}`}
              sceneNumber={sceneNumber}
              template={template}
              scene={scene}
              isLoading={isLoading}
              isFailed={isFailed}
              isRegenerating={isRegenerating}
              copied={copiedSceneId === scene?.id}
              onCopy={() => scene && void copyScene(scene)}
              onRegenerate={() => scene && void regenerateScene(scene)}
            />
          );
        })}
      </div>
    </main>
  );
}

function SceneCard({
  sceneNumber,
  template,
  scene,
  isLoading,
  isFailed,
  isRegenerating,
  copied,
  onCopy,
  onRegenerate,
}: {
  sceneNumber: number;
  template: SceneTemplate;
  scene?: ScriptSceneRow;
  isLoading: boolean;
  isFailed: boolean;
  isRegenerating: boolean;
  copied: boolean;
  onCopy: () => void;
  onRegenerate: () => void;
}) {
  const wordCount = scene?.content
    ? countWords(scene.content)
    : estimateWordCount(template.duration_seconds);

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-medium text-muted-foreground">
                Scene {sceneNumber}
              </span>
              <Badge variant="outline">{sceneTypeLabel(template.scene_type)}</Badge>
              {isFailed && <Badge variant="destructive">Failed</Badge>}
            </div>
            <CardTitle className="text-base">{template.title}</CardTitle>
          </div>
          <div className="flex flex-wrap gap-1">
            {scene && (
              <Button
                size="sm"
                variant="ghost"
                className="gap-1.5"
                disabled={isRegenerating}
                onClick={onRegenerate}
              >
                {isRegenerating ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Regenerating…
                  </>
                ) : (
                  <>
                    <RefreshCw className="h-3.5 w-3.5" />
                    Regenerate Scene
                  </>
                )}
              </Button>
            )}
            {scene?.content && (
              <Button size="sm" variant="ghost" className="gap-1.5" onClick={onCopy}>
                {copied ? (
                  <>
                    <Check className="h-3.5 w-3.5" />
                    Copied
                  </>
                ) : (
                  <>
                    <Copy className="h-3.5 w-3.5" />
                    Copy Scene
                  </>
                )}
              </Button>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {isLoading || isRegenerating ? (
          <div className="space-y-2">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-[92%]" />
            <Skeleton className="h-4 w-[85%]" />
            <Skeleton className="h-4 w-[70%]" />
          </div>
        ) : isFailed ? (
          <p className="text-sm text-destructive">
            This scene failed to generate. Try regenerating it.
          </p>
        ) : (
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground/90">
            {scene?.content}
          </p>
        )}
        <p className="text-xs text-muted-foreground">
          {formatSceneDuration(template.duration_seconds)} · ~{wordCount} words
        </p>
      </CardContent>
    </Card>
  );
}
