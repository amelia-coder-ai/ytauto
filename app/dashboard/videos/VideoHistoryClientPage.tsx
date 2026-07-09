"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ExternalLink, Loader2, Play } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type VideoJob = {
  id: string;
  status: string;
  completedScenes: number;
  totalScenes: number;
  outputVideoUrl: string | null;
  errorMessage: string | null;
  createdAt: string;
  scriptId: string;
  scriptTitle: string;
};

function statusBadge(status: string) {
  if (status === "ready") {
    return { label: "ready", variant: "secondary" as const };
  }
  if (status === "generating" || status === "pending" || status === "rendering") {
    return { label: status, variant: "outline" as const };
  }
  return { label: "failed", variant: "destructive" as const };
}

function statusIcon(status: string) {
  switch (status) {
    case "ready": return "✅";
    case "generating":
    case "rendering": return "⏳";
    case "failed": return "❌";
    default: return "⏳";
  }
}

export default function VideoHistoryClientPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [jobs, setJobs] = useState<VideoJob[]>([]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        setLoading(true);
        setError("");
        const res = await fetch("/api/video/list");
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Failed to fetch videos");
        if (!cancelled) setJobs((data.jobs ?? []) as VideoJob[]);
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

  return (
    <main className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Video History</h1>
        <p className="text-muted-foreground">
          All generated videos · {jobs.length} total
        </p>
      </div>

      {loading && (
        <Card>
          <CardContent className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading videos…
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

      {!loading && !error && jobs.length === 0 && (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            No videos yet. Generate your first video to see it here.
          </CardContent>
        </Card>
      )}

      {!loading && !error && jobs.length > 0 && (
        <div className="space-y-4">
          {jobs.map((job) => {
            const badge = statusBadge(job.status);

            return (
              <Card key={job.id}>
                <CardHeader className="pb-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="space-y-2">
                      <CardTitle className="text-base leading-snug">
                        {job.scriptTitle}
                      </CardTitle>
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant={badge.variant}>{badge.label}</Badge>
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {new Date(job.createdAt).toLocaleString()}
                    </p>
                  </div>
                </CardHeader>
                <CardContent className="flex flex-wrap items-center justify-between gap-3">
                  <p className="text-sm text-muted-foreground">
                    {statusIcon(job.status)}
                    {job.status === "generating" || job.status === "rendering"
                      ? ` ${job.completedScenes} / ${job.totalScenes} scenes`
                      : job.status === "ready"
                        ? " Complete"
                        : job.status === "failed"
                          ? ` Failed${job.errorMessage ? `: ${job.errorMessage}` : ""}`
                          : ""}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <Link href={`/video/${job.id}/status`}>
                      <Button size="sm" variant="outline" className="gap-1.5">
                        <ExternalLink className="h-3.5 w-3.5" />
                        View Status
                      </Button>
                    </Link>
                    {job.status === "ready" && job.outputVideoUrl && (
                      <a
                        href={job.outputVideoUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        <Button size="sm" className="gap-1.5 bg-blue-600 hover:bg-blue-700">
                          <Play className="h-3.5 w-3.5" />
                          Preview
                        </Button>
                      </a>
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
