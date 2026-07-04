"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Loader2,
  TrendingUp,
  Eye,
  Calendar,
  ArrowUpDown,
  AlertCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface VideoResult {
  videoId: string;
  title: string;
  thumbnailUrl: string;
  views: number;
  publishedAt: string;
  outlierScore: number;
  viewsPerDay: number;
  engagementRate: number;
}

interface ChannelInfo {
  channelId: string;
  channelTitle: string;
  subscriberCount: number;
  totalVideos: number;
  videosFetched: number;
}

type SortMode = "outlierScore" | "views";
type Phase = "input" | "loading" | "results" | "error";

export default function OutperformingPage() {
  const router = useRouter();
  const [channelUrl, setChannelUrl] = useState("");
  const [phase, setPhase] = useState<Phase>("input");
  const [sortBy, setSortBy] = useState<SortMode>("outlierScore");
  const [error, setError] = useState("");
  const [channelInfo, setChannelInfo] = useState<ChannelInfo | null>(null);
  const [videos, setVideos] = useState<VideoResult[]>([]);

  const fetchResults = useCallback(
    async (currentSort: SortMode) => {
      const trimmed = channelUrl.trim();
      if (!trimmed) return;

      setPhase("loading");
      setError("");

      try {
        const res = await fetch("/api/youtube/outperforming", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            channelUrl: trimmed,
            count: 10,
            sortBy: currentSort,
          }),
        });

        const data = await res.json();

        if (!res.ok) {
          throw new Error(data.error ?? "Failed to fetch videos.");
        }

        setChannelInfo({
          channelId: data.channelId,
          channelTitle: data.channelTitle,
          subscriberCount: data.subscriberCount,
          totalVideos: data.totalVideos,
          videosFetched: data.videosFetched,
        });
        setVideos(data.videos as VideoResult[]);
        setPhase("results");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unknown error");
        setPhase("error");
      }
    },
    [channelUrl]
  );

  const handleFetch = useCallback(() => {
    setSortBy("outlierScore");
    fetchResults("outlierScore");
  }, [fetchResults]);

  const handleSortChange = useCallback(
    (newSort: SortMode) => {
      setSortBy(newSort);
      if (phase === "results" && channelUrl.trim()) {
        fetchResults(newSort);
      }
    },
    [phase, channelUrl, fetchResults]
  );

  const formatNumber = (n: number) => {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
    return n.toLocaleString();
  };

  const formatDate = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  const getScoreBadgeVariant = (score: number) => {
    if (score >= 5) return "destructive" as const;
    if (score >= 2) return "default" as const;
    return "secondary" as const;
  };

  const getEngagementColor = (rate: number) => {
    if (rate >= 0.1) return "text-green-600";
    if (rate >= 0.05) return "text-amber-600";
    return "text-muted-foreground";
  };

  return (
    <main className="mx-auto max-w-3xl space-y-8 px-4 py-10">
      <div className="space-y-1">
        <h1 className="text-3xl font-bold tracking-tight">
          Channel Outperforming Videos
        </h1>
        <p className="text-muted-foreground">
          Find which videos in a channel outperform the rest.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Channel URL</CardTitle>
          <CardDescription>
            Paste a YouTube channel URL, @handle, or channel ID.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-3">
            <Input
              placeholder="https://www.youtube.com/@MrBeast"
              value={channelUrl}
              onChange={(e) => setChannelUrl(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleFetch();
              }}
              disabled={phase === "loading"}
              className="flex-1"
            />
            <Button
              onClick={handleFetch}
              disabled={phase === "loading" || !channelUrl.trim()}
            >
              {phase === "loading" ? (
                <Loader2 className="animate-spin" />
              ) : (
                <TrendingUp />
              )}
              Analyze
            </Button>
          </div>
        </CardContent>
      </Card>

      {phase === "loading" && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Loader2 className="animate-spin" />
              Fetching channel videos...
            </CardTitle>
            <CardDescription>
              Resolving channel, fetching video stats, and calculating scores.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <div
                  key={i}
                  className="flex animate-pulse items-center gap-3 rounded-lg border bg-background p-3"
                >
                  <div className="h-16 w-28 shrink-0 rounded-md bg-muted" />
                  <div className="flex-1 space-y-2">
                    <div className="h-4 w-3/4 rounded bg-muted" />
                    <div className="h-3 w-1/2 rounded bg-muted" />
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {phase === "error" && (
        <Card className="border-destructive/30 bg-destructive/5">
          <CardHeader>
            <div className="flex items-center gap-2">
              <AlertCircle className="text-destructive" />
              <CardTitle className="text-destructive">Error</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-md border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              {error}
            </div>
            <Button variant="outline" onClick={() => setPhase("input")}>
              Try Again
            </Button>
          </CardContent>
        </Card>
      )}

      {phase === "results" && channelInfo && (
        <>
          <Card className="border-green-200 bg-green-50/30">
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <span className="text-green-600">Channel:</span>
                <CardTitle className="text-lg">
                  {channelInfo.channelTitle}
                </CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
                <span>
                  {formatNumber(channelInfo.subscriberCount)} subscribers
                </span>
                <span>
                  {channelInfo.totalVideos} total videos
                </span>
                <span>
                  {channelInfo.videosFetched} analyzed
                </span>
                <span>
                  {videos.length} in this list
                </span>
              </div>
            </CardContent>
          </Card>

          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Top Videos</h2>
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Sort by:</span>
              <div className="flex overflow-hidden rounded-md border">
                <button
                  onClick={() => handleSortChange("outlierScore")}
                  className={cn(
                    "px-3 py-1.5 text-xs font-medium transition-colors",
                    sortBy === "outlierScore"
                      ? "bg-primary text-primary-foreground"
                      : "bg-background text-muted-foreground hover:bg-muted"
                  )}
                >
                  Outlier Score
                </button>
                <button
                  onClick={() => handleSortChange("views")}
                  className={cn(
                    "px-3 py-1.5 text-xs font-medium transition-colors",
                    sortBy === "views"
                      ? "bg-primary text-primary-foreground"
                      : "bg-background text-muted-foreground hover:bg-muted"
                  )}
                >
                  Raw Views
                </button>
              </div>
            </div>
          </div>

          <div className="space-y-3">
            {videos.length === 0 && (
              <Card>
                <CardContent className="py-10 text-center text-sm text-muted-foreground">
                  No videos found for this channel.
                </CardContent>
              </Card>
            )}

            {videos.map((video, index) => (
              <Card key={video.videoId}>
                <CardContent className="flex items-center gap-4 p-4">
                  <span className="w-6 shrink-0 text-center text-sm font-bold text-muted-foreground">
                    #{index + 1}
                  </span>

                  <div className="relative h-20 w-36 shrink-0 overflow-hidden rounded-md bg-muted">
                    {video.thumbnailUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={video.thumbnailUrl}
                        alt={video.title}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-xs text-muted-foreground">
                        No thumbnail
                      </div>
                    )}
                  </div>

                  <div className="min-w-0 flex-1 space-y-1.5">
                    <p className="truncate text-sm font-medium">
                      {video.title}
                    </p>
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Eye className="h-3 w-3" />
                        {formatNumber(video.views)} views
                      </span>
                      <span className="flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        {formatDate(video.publishedAt)}
                      </span>
                      <span className="flex items-center gap-1">
                        <ArrowUpDown className="h-3 w-3" />
                        {video.viewsPerDay}/day
                      </span>
                      <span
                        className={cn(
                          "flex items-center gap-1",
                          getEngagementColor(video.engagementRate)
                        )}
                      >
                        {(video.engagementRate * 100).toFixed(1)}% engaged
                      </span>
                    </div>
                  </div>

                  <Badge
                    variant={getScoreBadgeVariant(video.outlierScore)}
                    className="shrink-0 text-sm"
                  >
                    {video.outlierScore}x avg
                  </Badge>
                </CardContent>
              </Card>
            ))}
          </div>

          {channelInfo.videosFetched < 10 && (
            <Card className="border-amber-200 bg-amber-50/30">
              <CardContent className="py-4 text-sm text-amber-800">
                This channel only has {channelInfo.videosFetched} video
                {channelInfo.videosFetched !== 1 ? "s" : ""} available. Scores
                may not be statistically significant with so few data points.
              </CardContent>
            </Card>
          )}

          {channelInfo.videosFetched > videos.length && (
            <p className="text-center text-xs text-muted-foreground">
              Showing top {videos.length} of {channelInfo.videosFetched} videos
              analyzed.
            </p>
          )}

          <div className="flex justify-center pt-2">
            <Button
              size="lg"
              onClick={() => {
                const videoIds = videos.map((v) => v.videoId).join(",");
                router.push(`/niche/new?videos=${videoIds}`);
              }}
            >
              Train Niche with Top Videos
            </Button>
          </div>
        </>
      )}
    </main>
  );
}
