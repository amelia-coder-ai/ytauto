"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Copy, Loader2, RefreshCw, Sparkles, Video } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Select } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { estimateWordCount } from "@/lib/script-structure";
import { cn } from "@/lib/utils";

const TOPIC_MAX_LENGTH = 200;
const DURATION_PRESETS = [10, 20, 30] as const;
type DurationPreset = (typeof DURATION_PRESETS)[number] | "custom";

type NicheRow = {
  id: string;
  name: string;
  status: string | null;
  created_at: string;
};

type ScriptStatus = "idle" | "generating" | "ready" | "failed";

type StatusScene = {
  scene_number: number;
  scene_type: string;
  title: string;
  content: string | null;
  duration_seconds: number;
  status: "pending" | "ready" | "failed";
};

type ScriptStatusResponse = {
  scriptId: string;
  status: "pending" | "generating" | "ready" | "failed";
  scenes: StatusScene[];
  completedScenes: number;
  totalScenes: number;
  percentComplete: number;
};

function isPollingComplete(data: ScriptStatusResponse): boolean {
  if (data.status === "ready" || data.status === "failed") return true;
  if (data.totalScenes === 0) return false;
  return data.scenes.every(
    (scene) => scene.status === "ready" || scene.status === "failed"
  );
}

function resolveClientScriptStatus(
  data: ScriptStatusResponse
): "ready" | "failed" | "generating" {
  if (data.status === "ready" || data.status === "failed") return data.status;
  if (isPollingComplete(data)) {
    return data.scenes.some((scene) => scene.status === "ready")
      ? "ready"
      : "failed";
  }
  return "generating";
}

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

function nicheStatusBadge(status: string | null) {
  if (status === "ready") return { label: "ready", variant: "secondary" as const };
  if (status === "training" || status === "pending") {
    return { label: status ?? "training", variant: "outline" as const };
  }
  return { label: status ?? "unknown", variant: "outline" as const };
}

export default function NewScriptClientPage() {
  return <NewScriptPageContent />;
}

function NewScriptPageContent() {
  const router = useRouter();
  const [niches, setNiches] = useState<NicheRow[]>([]);
  const [nichesLoading, setNichesLoading] = useState(true);
  const [selectedNicheId, setSelectedNicheId] = useState("");

  const [topic, setTopic] = useState("");
  const [viralTopics, setViralTopics] = useState<string[]>([]);
  const [topicsLoading, setTopicsLoading] = useState(false);
  const [topicsFetched, setTopicsFetched] = useState(false);
  const [usedTopicCount, setUsedTopicCount] = useState(0);
  const [durationPreset, setDurationPreset] = useState<DurationPreset>(10);
  const [customMinutes, setCustomMinutes] = useState(15);

  const [scriptStatus, setScriptStatus] = useState<ScriptStatus>("idle");
  const [scriptId, setScriptId] = useState<string | null>(null);
  const [scenes, setScenes] = useState<StatusScene[]>([]);
  const [completedScenes, setCompletedScenes] = useState(0);
  const [totalScenes, setTotalScenes] = useState(0);
  const [percentComplete, setPercentComplete] = useState(0);
  const [error, setError] = useState("");
  const [copiedSceneNumber, setCopiedSceneNumber] = useState<number | null>(null);
  const [copiedFull, setCopiedFull] = useState(false);
  const [revealedScenes, setRevealedScenes] = useState<Set<number>>(new Set());
  const runStartedForScriptId = useRef<string | null>(null);
  const revealedScenesRef = useRef<Set<number>>(new Set());
  const pollingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isPollingActiveRef = useRef(false);

  const stopPolling = useCallback(() => {
    isPollingActiveRef.current = false;
    if (pollingIntervalRef.current !== null) {
      clearInterval(pollingIntervalRef.current);
      pollingIntervalRef.current = null;
    }
  }, []);

  const durationMinutes = useMemo(() => {
    if (durationPreset === "custom") {
      return Math.min(120, Math.max(1, customMinutes));
    }
    return durationPreset;
  }, [durationPreset, customMinutes]);

  const readyNiches = useMemo(
    () => niches.filter((n) => n.status === "ready"),
    [niches]
  );

  const totalWords = useMemo(
    () =>
      scenes.reduce((sum, scene) => {
        if (scene.status !== "ready" || !scene.content) return sum;
        return sum + countWords(scene.content);
      }, 0),
    [scenes]
  );

  const estimatedDuration = useMemo(() => {
    const totalSeconds = scenes.reduce(
      (sum, scene) => sum + scene.duration_seconds,
      0
    );
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    if (seconds === 0) return `${minutes} min`;
    return `${minutes} min ${seconds} sec`;
  }, [scenes]);

  const canGenerate =
    selectedNicheId.length > 0 &&
    topic.trim().length > 0 &&
    scriptStatus !== "generating";

  const fetchViralTopics = useCallback(async () => {
    if (!selectedNicheId) return;

    try {
      setTopicsLoading(true);
      const res = await fetch("/api/script/topics", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nicheId: selectedNicheId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load topic ideas");

      setViralTopics((data.topics ?? []) as string[]);
      setUsedTopicCount(data.usedTopicCount ?? 0);
      setTopicsFetched(true);
    } catch (e) {
      setViralTopics([]);
      setTopicsFetched(true);
      setError(e instanceof Error ? e.message : "Failed to load topic ideas");
    } finally {
      setTopicsLoading(false);
    }
  }, [selectedNicheId]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        setNichesLoading(true);
        const res = await fetch("/api/niches/list");
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Failed to load niches");

        const rows = (data.niches ?? []) as NicheRow[];
        if (cancelled) return;

        setNiches(rows);

        const latestReady = rows.find((n) => n.status === "ready");
        if (latestReady) {
          setSelectedNicheId(latestReady.id);
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Failed to load niches");
        }
      } finally {
        if (!cancelled) setNichesLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const applyStatusResponse = useCallback((data: ScriptStatusResponse) => {
    setScenes(data.scenes ?? []);
    setCompletedScenes(data.completedScenes ?? 0);
    setTotalScenes(data.totalScenes ?? 0);
    setPercentComplete(data.percentComplete ?? 0);

    const newlyRevealed: number[] = [];
    for (const scene of data.scenes ?? []) {
      if (
        scene.status === "ready" &&
        scene.content &&
        !revealedScenesRef.current.has(scene.scene_number)
      ) {
        revealedScenesRef.current.add(scene.scene_number);
        newlyRevealed.push(scene.scene_number);
      }
    }

    if (newlyRevealed.length > 0) {
      setRevealedScenes((prev) => {
        const next = new Set(prev);
        for (const n of newlyRevealed) next.add(n);
        return next;
      });
    }
  }, []);

  const pollStatus = useCallback(
    async (id: string) => {
      const res = await fetch(`/api/script/status/${id}`, {
        cache: "no-store",
      });
      const data = (await res.json()) as ScriptStatusResponse & {
        error?: string;
      };
      if (!res.ok) throw new Error(data.error || "Failed to fetch script status");

      applyStatusResponse(data);

      if (isPollingComplete(data)) {
        setScriptStatus(resolveClientScriptStatus(data));
        return true;
      }
      return false;
    },
    [applyStatusResponse]
  );

  useEffect(() => {
    if (!scriptId || scriptStatus !== "generating") return;

    let cancelled = false;
    isPollingActiveRef.current = true;

    const timeoutId = setTimeout(() => {
      if (!cancelled) {
        setError(
          "Script generation is taking longer than expected. Please try again."
        );
        setScriptStatus("failed");
        stopPolling();
      }
    }, 10 * 60 * 1000);

    const tick = async () => {
      if (cancelled || !isPollingActiveRef.current) return;

      try {
        const done = await pollStatus(scriptId);
        if (done) stopPolling();
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Status polling failed");
          setScriptStatus("failed");
          stopPolling();
        }
      }
    };

    void tick();
    pollingIntervalRef.current = setInterval(() => {
      void tick();
    }, 2000);

    return () => {
      cancelled = true;
      clearTimeout(timeoutId);
      stopPolling();
    };
  }, [scriptId, scriptStatus, pollStatus, stopPolling]);

  useEffect(() => {
    if (!scriptId || scriptStatus !== "generating") return;
    if (runStartedForScriptId.current === scriptId) return;
    runStartedForScriptId.current = scriptId;

    (async () => {
      try {
        const runRes = await fetch(`/api/script/run/${scriptId}`, {
          method: "POST",
        });
        const runData = (await runRes.json()) as {
          status?: string;
          error?: string;
        };

        if (!runRes.ok) {
          throw new Error(runData.error || "Script generation failed on the server");
        }

        await pollStatus(scriptId);

        // Generation is finished once /run returns — always stop polling here.
        stopPolling();
        setScriptStatus(
          runData.status === "failed" ? "failed" : "ready"
        );
      } catch (e) {
        setError(e instanceof Error ? e.message : "Script generation failed");
        setScriptStatus("failed");
        stopPolling();
      }
    })();
  }, [scriptId, scriptStatus, pollStatus, stopPolling]);

  const handleGenerate = async () => {
    if (!canGenerate) return;

    setError("");
    setScriptStatus("generating");
    runStartedForScriptId.current = null;
    setScenes([]);
    setCompletedScenes(0);
    setTotalScenes(0);
    setPercentComplete(0);
    setCopiedFull(false);
    setCopiedSceneNumber(null);
    revealedScenesRef.current = new Set();
    setRevealedScenes(new Set());

    try {
      const res = await fetch("/api/script/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nicheId: selectedNicheId,
          topic: topic.trim(),
          durationMinutes,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Script generation failed");

      setScriptId(data.scriptId);
    } catch (e) {
      setScriptStatus("idle");
      setError(e instanceof Error ? e.message : "Script generation failed");
    }
  };

  const copyText = async (text: string, onCopied: () => void) => {
    await navigator.clipboard.writeText(text);
    onCopied();
    setTimeout(() => {
      setCopiedSceneNumber(null);
      setCopiedFull(false);
    }, 2000);
  };

  const copyScene = async (scene: StatusScene) => {
    if (!scene.content) return;
    await copyText(scene.content, () => setCopiedSceneNumber(scene.scene_number));
  };

  const copyFullScript = async () => {
    const full = [...scenes]
      .sort((a, b) => a.scene_number - b.scene_number)
      .map((s) => s.content)
      .filter(Boolean)
      .join("\n\n");
    if (!full) return;
    await copyText(full, () => setCopiedFull(true));
  };

  const showOutput = scriptStatus !== "idle";

  return (
    <main className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Generate Script</h1>
        <p className="text-muted-foreground">
          Create a scene-by-scene YouTube script from a trained niche.
        </p>
      </div>

      <div className="grid gap-8 lg:grid-cols-2">
        {/* LEFT — Form */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Script settings</CardTitle>
              <CardDescription>
                Pick a trained niche, topic, and video length.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Niche selector */}
              <div className="space-y-2">
                <label className="text-sm font-medium">Niche</label>
                {nichesLoading ? (
                  <Skeleton className="h-10 w-full" />
                ) : (
                  <Select
                    value={selectedNicheId}
                    onChange={(e) => {
                      setSelectedNicheId(e.target.value);
                      setTopic("");
                      setViralTopics([]);
                      setUsedTopicCount(0);
                      setTopicsFetched(false);
                    }}
                  >
                    <option value="" disabled>
                      Select a niche…
                    </option>
                    {niches.map((niche) => {
                      const badge = nicheStatusBadge(niche.status);
                      const disabled = niche.status !== "ready";
                      return (
                        <option key={niche.id} value={niche.id} disabled={disabled}>
                          {niche.name} ({badge.label})
                          {disabled ? " — not ready" : ""}
                        </option>
                      );
                    })}
                  </Select>
                )}
                {!nichesLoading && readyNiches.length === 0 && (
                  <p className="text-xs text-muted-foreground">
                    No ready niches yet. Train a niche first.
                  </p>
                )}
              </div>

              {/* Topic */}
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <label className="text-sm font-medium">Video topic</label>
                  <span
                    className={cn(
                      "text-xs",
                      topic.length > TOPIC_MAX_LENGTH
                        ? "text-destructive"
                        : "text-muted-foreground"
                    )}
                  >
                    {topic.length}/{TOPIC_MAX_LENGTH}
                  </span>
                </div>

                {selectedNicheId && (
                  <div className="space-y-2 rounded-lg border bg-muted/30 p-3">
                    {!topicsFetched && !topicsLoading ? (
                      <div className="flex flex-col items-start gap-2">
                        <p className="text-xs text-muted-foreground">
                          Get AI-suggested viral titles for this niche.
                        </p>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="gap-1.5"
                          onClick={() => void fetchViralTopics()}
                        >
                          <Sparkles className="h-3.5 w-3.5" />
                          Generate viral topic ideas
                        </Button>
                      </div>
                    ) : (
                      <>
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-xs font-medium text-muted-foreground">
                            Viral topic ideas
                            {usedTopicCount > 0 && (
                              <span className="ml-1">
                                · {usedTopicCount} already used
                              </span>
                            )}
                          </p>
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            className="h-7 gap-1.5 px-2 text-xs"
                            disabled={topicsLoading}
                            onClick={() => void fetchViralTopics()}
                          >
                            <RefreshCw
                              className={cn(
                                "h-3.5 w-3.5",
                                topicsLoading && "animate-spin"
                              )}
                            />
                            Refresh
                          </Button>
                        </div>

                        {topicsLoading ? (
                          <div className="space-y-2">
                            {Array.from({ length: 5 }).map((_, i) => (
                              <Skeleton key={i} className="h-10 w-full" />
                            ))}
                          </div>
                        ) : viralTopics.length > 0 ? (
                          <div className="space-y-2">
                            {viralTopics.map((idea) => {
                              const isSelected =
                                topic.trim().toLowerCase() ===
                                idea.trim().toLowerCase();
                              return (
                                <button
                                  key={idea}
                                  type="button"
                                  onClick={() => setTopic(idea)}
                                  className={cn(
                                    "w-full rounded-md border bg-background px-3 py-2 text-left text-sm transition-colors hover:bg-accent",
                                    isSelected &&
                                      "border-primary ring-1 ring-primary"
                                  )}
                                >
                                  {idea}
                                </button>
                              );
                            })}
                          </div>
                        ) : (
                          <p className="text-xs text-muted-foreground">
                            No new topic ideas available. Enter a custom topic
                            below.
                          </p>
                        )}
                      </>
                    )}
                  </div>
                )}

                <Input
                  placeholder="e.g. How to save ₹10,000/month as a student"
                  value={topic}
                  maxLength={TOPIC_MAX_LENGTH}
                  onChange={(e) => setTopic(e.target.value)}
                />
              </div>

              {/* Duration */}
              <div className="space-y-2">
                <label className="text-sm font-medium">Video duration</label>
                <div className="flex flex-wrap gap-2">
                  {DURATION_PRESETS.map((mins) => (
                    <Button
                      key={mins}
                      type="button"
                      size="sm"
                      variant={durationPreset === mins ? "default" : "outline"}
                      onClick={() => setDurationPreset(mins)}
                    >
                      {mins} min
                    </Button>
                  ))}
                  <Button
                    type="button"
                    size="sm"
                    variant={durationPreset === "custom" ? "default" : "outline"}
                    onClick={() => setDurationPreset("custom")}
                  >
                    Custom
                  </Button>
                </div>
                {durationPreset === "custom" && (
                  <div className="flex items-center gap-2">
                    <Input
                      type="number"
                      min={1}
                      max={120}
                      value={customMinutes}
                      onChange={(e) =>
                        setCustomMinutes(Number(e.target.value) || 1)
                      }
                      className="w-28"
                    />
                    <span className="text-sm text-muted-foreground">minutes (1–120)</span>
                  </div>
                )}
              </div>

              <Separator />

              <p className="text-xs text-muted-foreground">
                Topic ideas and scripts are generated via OpenRouter (GPT-OSS 20B).
              </p>

              {error && (
                <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  {error}
                </div>
              )}

              <Button
                className="w-full gap-2"
                disabled={!canGenerate}
                onClick={handleGenerate}
              >
                {scriptStatus === "generating" ? (
                  <>
                    <Loader2 className="animate-spin" />
                    Generating…
                  </>
                ) : (
                  <>
                    <Sparkles />
                    Generate Script
                  </>
                )}
              </Button>
            </CardContent>
          </Card>
        </div>

        {/* RIGHT — Output */}
        <div className="space-y-4">
          {!showOutput && (
            <Card className="border-dashed">
              <CardContent className="flex min-h-[320px] flex-col items-center justify-center py-12 text-center">
                <p className="text-sm font-medium">
                  Your scene-by-scene script will appear here
                </p>
                <p className="mt-1 max-w-sm text-sm text-muted-foreground">
                  Select a ready niche, enter a topic, and click Generate Script.
                </p>
              </CardContent>
            </Card>
          )}

          {showOutput && (
            <>
              <Card>
                <CardContent className="space-y-4 py-4">
                  {scriptStatus === "generating" && totalScenes > 0 && (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">
                          Generating scenes…
                        </span>
                        <span className="font-medium">
                          {completedScenes} / {totalScenes}
                        </span>
                      </div>
                      <Progress value={percentComplete} />
                    </div>
                  )}

                  <div className="flex flex-wrap items-center gap-3 text-sm">
                    <span>
                      <strong>{completedScenes}</strong> / {totalScenes || "—"}{" "}
                      scenes
                    </span>
                    <Separator orientation="vertical" className="hidden h-4 sm:block" />
                    <span>
                      <strong>{totalWords}</strong> words
                    </span>
                    <Separator orientation="vertical" className="hidden h-4 sm:block" />
                    <span>{estimatedDuration || "—"}</span>
                    {scriptStatus === "ready" &&
                      scenes.some((s) => s.content) && (
                        <>
                          <Separator
                            orientation="vertical"
                            className="hidden h-4 sm:block"
                          />
                          <Button
                            size="sm"
                            variant="outline"
                            className="gap-2"
                            onClick={copyFullScript}
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
                        </>
                      )}
                  </div>
                </CardContent>
              </Card>

              <div className="space-y-4">
                {scenes.map((scene) => {
                  const isLoading = scene.status === "pending";
                  const isFailed = scene.status === "failed";
                  const shouldAnimate = revealedScenes.has(scene.scene_number);

                  return (
                    <SceneCard
                      key={scene.scene_number}
                      scene={scene}
                      isLoading={isLoading}
                      isFailed={isFailed}
                      shouldAnimate={shouldAnimate}
                      copied={copiedSceneNumber === scene.scene_number}
                      onCopy={() => void copyScene(scene)}
                    />
                  );
                })}
              </div>

              {scriptStatus === "ready" && scriptId && (
                <Card className="border-green-200 bg-green-50/30">
                  <CardContent className="flex items-center justify-between py-4">
                    <div>
                      <p className="text-sm font-medium text-green-800">Script ready</p>
                      <p className="text-xs text-green-700">Create a video from this script.</p>
                    </div>
                    <Button
                      className="gap-2"
                      onClick={() => router.push(`/video/new?scriptId=${scriptId}`)}
                    >
                      <Video className="h-4 w-4" />
                      Create Video
                    </Button>
                  </CardContent>
                </Card>
              )}
            </>
          )}
        </div>
      </div>
    </main>
  );
}

function SceneCard({
  scene,
  isLoading,
  isFailed,
  shouldAnimate,
  copied,
  onCopy,
}: {
  scene: StatusScene;
  isLoading: boolean;
  isFailed: boolean;
  shouldAnimate: boolean;
  copied: boolean;
  onCopy: () => void;
}) {
  const wordCount = scene.content
    ? countWords(scene.content)
    : estimateWordCount(scene.duration_seconds);

  return (
    <Card
      className={cn(
        shouldAnimate && "animate-in fade-in duration-700"
      )}
    >
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-medium text-muted-foreground">
                Scene {scene.scene_number}
              </span>
              <Badge variant="outline">{sceneTypeLabel(scene.scene_type)}</Badge>
              {isFailed && <Badge variant="destructive">Failed</Badge>}
            </div>
            <CardTitle className="text-base">{scene.title}</CardTitle>
          </div>
          {scene.content && scene.status === "ready" && (
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
      </CardHeader>
      <CardContent className="space-y-3">
        {isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-[92%]" />
            <Skeleton className="h-4 w-[85%]" />
            <Skeleton className="h-4 w-[70%]" />
          </div>
        ) : isFailed ? (
          <p className="text-sm text-destructive">
            This scene failed to generate. Try again with a different model.
          </p>
        ) : (
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground/90">
            {scene.content}
          </p>
        )}
        <p className="text-xs text-muted-foreground">
          {formatSceneDuration(scene.duration_seconds)} · ~{wordCount} words
        </p>
      </CardContent>
    </Card>
  );
}
