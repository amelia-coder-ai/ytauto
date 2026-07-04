"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { useSearchParams } from "next/navigation";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  CheckCircle,
  Loader2,
  Plus,
  Trash2,
  AlertCircle,
} from "lucide-react";

interface VideoEntry {
  id: string;
  url: string;
  title: string;
  transcript: string;
  wordCount: number;
  status: "fetching" | "done" | "error";
  error?: string;
}

interface NicheProfile {
  tone: string;
  style: string;
  tone_and_style: string;
  top_recurring_topics: string[];
  hook_patterns: string[];
  high_frequency_keywords: string[];
  audience_type: string;
  content_structure_pattern: string;
}

type Phase = "setup" | "training" | "success" | "error";

export default function NewNicheClientPage() {
  const searchParams = useSearchParams();
  const [nicheName, setNicheName] = useState("");
  const [trainedNicheId, setTrainedNicheId] = useState<string | null>(null);

  const [urlInput, setUrlInput] = useState("");
  const [videos, setVideos] = useState<VideoEntry[]>([]);
  const [isAdding, setIsAdding] = useState(false);

  const prefetched = useRef(false);
  const [phase, setPhase] = useState<Phase>("setup");
  const [profile, setProfile] = useState<NicheProfile | null>(null);
  const [trainError, setTrainError] = useState("");

  const doneCount = videos.filter((v) => v.status === "done").length;
  const canTrain = doneCount >= 1 && nicheName.trim().length > 0;

  const addVideoByUrl = useCallback(async (url: string): Promise<string | null> => {
    const trimmed = url.trim();
    if (!trimmed) return null;

    const id = crypto.randomUUID();
    const entry: VideoEntry = {
      id,
      url: trimmed,
      title: "",
      transcript: "",
      wordCount: 0,
      status: "fetching",
    };

    setVideos((prev) => [...prev, entry]);

    try {
      const res = await fetch("/api/youtube/transcript", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: trimmed }),
      });

      const data = await res.json();

      if (!res.ok || data.error) {
        throw new Error(data.error ?? "Failed to fetch transcript");
      }

      setVideos((prev) =>
        prev.map((v) =>
          v.id === id
            ? {
                ...v,
                status: "done",
                title: data.title ?? trimmed,
                transcript: data.transcript ?? "",
                wordCount: data.wordCount ?? 0,
              }
            : v
        )
      );
      return id;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      setVideos((prev) =>
        prev.map((v) => (v.id === id ? { ...v, status: "error", error: message } : v))
      );
      return null;
    }
  }, []);

  useEffect(() => {
    if (prefetched.current) return;
    const videosParam = searchParams.get("videos");
    if (!videosParam) return;

    const videoIds = videosParam.split(",").filter(Boolean);
    if (videoIds.length === 0) return;

    prefetched.current = true;
    videoIds.forEach((videoId) => {
      addVideoByUrl(`https://www.youtube.com/watch?v=${videoId}`);
    });
  }, [searchParams, addVideoByUrl]);

  const handleAddVideo = useCallback(async () => {
    const trimmed = urlInput.trim();
    if (!trimmed || isAdding) return;
    setUrlInput("");
    setIsAdding(true);
    try {
      await addVideoByUrl(trimmed);
    } finally {
      setIsAdding(false);
    }
  }, [urlInput, isAdding, addVideoByUrl]);

  const removeVideo = useCallback((id: string) => {
    setVideos((prev) => prev.filter((v) => v.id !== id));
  }, []);

  const handleTrain = useCallback(async () => {
    if (!canTrain) return;
    setPhase("training");
    setTrainError("");

    const doneVideos = videos.filter((v) => v.status === "done");

    let nicheId: string;
    try {
      const nicheRes = await fetch("/api/niches", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: nicheName.trim(),
          videos: doneVideos.map((v) => ({
            youtube_url: v.url,
            title: v.title,
            transcript: v.transcript,
          })),
        }),
      });

      if (!nicheRes.ok) {
        const err = await nicheRes.json();
        throw new Error(err.error || "Failed to create niche");
      }

      const nicheData = await nicheRes.json();
      nicheId = nicheData.id;
      setTrainedNicheId(nicheId);
    } catch (err) {
      setTrainError(err instanceof Error ? err.message : "Failed to create niche");
      setPhase("error");
      return;
    }

    const transcripts = doneVideos.map((v) => v.transcript);

    try {
      const res = await fetch("/api/niche/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nicheId, transcripts }),
      });

      const data = await res.json();

      if (!res.ok || data.error) {
        throw new Error(data.error || "Analysis failed");
      }

      setProfile(data.profile as NicheProfile);
      setPhase("success");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      setTrainError(message);
      setPhase("error");
    }
  }, [canTrain, nicheName, videos]);

  const handleRetry = useCallback(() => {
    setPhase("setup");
    setTrainError("");
  }, []);

  return (
    <main className="mx-auto max-w-3xl space-y-8 px-4 py-10">
      <div className="space-y-1">
        <h1 className="text-3xl font-bold tracking-tight">Create a New Niche</h1>
        <p className="text-muted-foreground">
          Name your niche and add YouTube videos to train the AI model.
        </p>
      </div>

      {phase === "setup" && (
        <>
          <Card>
            <CardHeader>
              <CardTitle>Niche Name</CardTitle>
              <CardDescription>
                Describe the niche you want to target, e.g. &quot;Finance for Beginners&quot;.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Input
                placeholder="e.g. Finance for Beginners"
                value={nicheName}
                onChange={(e) => setNicheName(e.target.value)}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Add YouTube Videos for Training</CardTitle>
              <CardDescription>
                Paste a YouTube URL and click Add. You need at least 1 verified video to start
                training.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex gap-3">
                <Input
                  placeholder="https://www.youtube.com/watch?v=..."
                  value={urlInput}
                  onChange={(e) => setUrlInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleAddVideo();
                  }}
                  disabled={isAdding}
                  className="flex-1"
                />
                <Button onClick={handleAddVideo} disabled={isAdding || videos.length >= 15}>
                  {isAdding ? <Loader2 className="animate-spin" /> : <Plus />}
                  Add Video
                </Button>
              </div>

              <div className="flex items-center justify-between text-sm text-muted-foreground">
                <span>
                  {doneCount} / {videos.length} videos added
                  {doneCount < 1 && <span className="ml-1">(at least 1 required)</span>}
                </span>
                <span className={videos.length >= 15 ? "text-destructive" : ""}>
                  {videos.length >= 15 && "Max 15 videos"}
                </span>
              </div>

              {videos.length > 0 && (
                <div className="space-y-3">
                  {videos.map((video) => (
                    <VideoCard key={video.id} video={video} onRemove={() => removeVideo(video.id)} />
                  ))}
                </div>
              )}

              {videos.length === 0 && (
                <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-10 text-center text-muted-foreground">
                  <p>No videos added yet.</p>
                  <p className="text-sm">Paste a YouTube URL above to get started.</p>
                </div>
              )}
            </CardContent>
          </Card>

          <div className="flex justify-end">
            <Button size="lg" disabled={!canTrain} onClick={handleTrain}>
              Start Niche Training
            </Button>
          </div>
        </>
      )}

      {phase === "training" && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Loader2 className="animate-spin" />
              Analyzing Transcripts with AI...
            </CardTitle>
            <CardDescription>
              Our AI is examining {doneCount} video transcripts to identify patterns in tone,
              structure, hooks, and topics.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Progress value={undefined} className="[&>div]:animate-pulse" />
            <p className="text-center text-sm text-muted-foreground">
              This may take a minute or two depending on transcript length.
            </p>
          </CardContent>
        </Card>
      )}

      {phase === "success" && profile && (
        <Card className="border-green-200 bg-green-50/30">
          <CardHeader>
            <div className="flex items-center gap-2">
              <CheckCircle className="text-green-600" />
              <CardTitle className="text-green-800">Niche Profile Ready</CardTitle>
            </div>
            <CardDescription>
              AI has successfully analyzed your niche. Here&apos;s what we found:
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="rounded-lg border bg-background p-4">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="text-sm font-semibold">Trained niche</p>
                  <p className="truncate text-sm text-muted-foreground">
                    {nicheName.trim() || "Untitled"}
                  </p>
                  {trainedNicheId && (
                    <p className="mt-1 break-all font-mono text-xs text-muted-foreground">
                      {trainedNicheId}
                    </p>
                  )}
                </div>

                {trainedNicheId && (
                  <a href={`/niche/${trainedNicheId}`}>
                    <Button variant="outline">View trained niche</Button>
                  </a>
                )}
              </div>
            </div>

            <ProfileSection title="Tone &amp; Style">
              <p className="text-sm">{profile.tone_and_style}</p>
            </ProfileSection>

            <ProfileSection title="Audience Type">
              <p className="text-sm">{profile.audience_type}</p>
            </ProfileSection>

            <ProfileSection title="Top Recurring Topics">
              <div className="flex flex-wrap gap-1.5">
                {profile.top_recurring_topics.map((topic, i) => (
                  <Badge key={i} variant="secondary">
                    {topic}
                  </Badge>
                ))}
              </div>
            </ProfileSection>

            <ProfileSection title="High-frequency Keywords">
              <div className="flex flex-wrap gap-1.5">
                {profile.high_frequency_keywords.map((kw, i) => (
                  <Badge key={i} variant="outline">
                    {kw}
                  </Badge>
                ))}
              </div>
            </ProfileSection>

            <ProfileSection title="Hook Patterns">
              <ul className="space-y-1 text-sm">
                {profile.hook_patterns.map((hook, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <span className="mt-1 block h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                    {hook}
                  </li>
                ))}
              </ul>
            </ProfileSection>

            <ProfileSection title="Content Structure Pattern">
              <p className="text-sm">{profile.content_structure_pattern}</p>
            </ProfileSection>

            <div className="flex justify-end pt-2">
              <Button
                variant="outline"
                onClick={() => {
                  setPhase("setup");
                  setProfile(null);
                  setVideos([]);
                  setNicheName("");
                  setTrainedNicheId(null);
                }}
              >
                Create Another Niche
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {phase === "error" && (
        <Card className="border-destructive/30 bg-destructive/5">
          <CardHeader>
            <div className="flex items-center gap-2">
              <AlertCircle className="text-destructive" />
              <CardTitle className="text-destructive">Training Failed</CardTitle>
            </div>
            <CardDescription>
              Something went wrong during analysis. You can try again.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-md border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              {trainError}
            </div>
            <div className="flex gap-3">
              <Button onClick={handleTrain}>Retry Analysis</Button>
              <Button variant="outline" onClick={handleRetry}>
                Back to Setup
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </main>
  );
}

function VideoCard({
  video,
  onRemove,
}: {
  video: VideoEntry;
  onRemove: () => void;
}) {
  const videoId = extractYouTubeId(video.url);
  const thumbnailUrl = videoId ? `https://img.youtube.com/vi/${videoId}/mqdefault.jpg` : null;

  return (
    <div className="flex items-center gap-3 rounded-lg border bg-background p-3 shadow-sm">
      <div className="relative h-16 w-28 shrink-0 overflow-hidden rounded-md bg-muted">
        {thumbnailUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={thumbnailUrl}
            alt={video.title || "Video thumbnail"}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-xs text-muted-foreground">
            No preview
          </div>
        )}

        {video.status === "fetching" && (
          <div className="absolute inset-0 flex items-center justify-center bg-background/60">
            <Loader2 className="animate-spin text-muted-foreground" />
          </div>
        )}
      </div>

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">
          {video.status === "fetching" ? "Fetching transcript..." : video.title || video.url}
        </p>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          {video.status === "done" && (
            <>
              <span>{video.wordCount.toLocaleString()} words</span>
              <CheckCircle className="h-3.5 w-3.5 text-green-600" />
              <span className="text-green-600">Transcript ready</span>
            </>
          )}
          {video.status === "error" && (
            <span className="text-destructive">{video.error || "Failed"}</span>
          )}
          {video.status === "fetching" && <span>Loading...</span>}
        </div>
      </div>

      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
        onClick={onRemove}
      >
        <Trash2 className="h-4 w-4" />
      </Button>
    </div>
  );
}

function ProfileSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h4 className="mb-1.5 text-sm font-semibold">{title}</h4>
      {children}
    </div>
  );
}

function extractYouTubeId(url: string): string | null {
  if (!url) return null;
  if (/^[A-Za-z0-9_-]{11}$/.test(url.trim())) return url.trim();
  const patterns = [
    /[?&]v=([A-Za-z0-9_-]{11})/,
    /youtu\.be\/([A-Za-z0-9_-]{11})/,
    /\/shorts\/([A-Za-z0-9_-]{11})/,
    /\/embed\/([A-Za-z0-9_-]{11})/,
  ];
  for (const p of patterns) {
    const m = url.match(p);
    if (m) return m[1];
  }
  return null;
}

