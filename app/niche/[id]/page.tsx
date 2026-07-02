"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Loader2, ArrowLeft, ExternalLink } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

type Niche = {
  id: string;
  name: string;
  description: string | null;
  status: string | null;
  created_at: string;
};

type NicheProfile = {
  tone: string | null;
  style: string | null;
  common_topics: string[] | null;
  hooks: string[] | null;
  keywords: string[] | null;
  audience_type: string | null;
  content_structure_pattern: string | null;
  created_at: string | null;
};

type NicheVideo = {
  id: string;
  youtube_url: string;
  title: string | null;
  created_at: string;
};

export default function NicheDetailPage() {
  const params = useParams<{ id: string }>();
  const nicheId = params?.id;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [niche, setNiche] = useState<Niche | null>(null);
  const [profile, setProfile] = useState<NicheProfile | null>(null);
  const [videos, setVideos] = useState<NicheVideo[]>([]);

  useEffect(() => {
    if (!nicheId) return;
    let cancelled = false;

    (async () => {
      try {
        setLoading(true);
        setError("");
        const res = await fetch(`/api/niches/${nicheId}`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Failed to fetch niche");
        if (cancelled) return;
        setNiche(data.niche ?? null);
        setProfile(data.profile ?? null);
        setVideos((data.videos ?? []) as NicheVideo[]);
      } catch (e) {
        if (!cancelled)
          setError(e instanceof Error ? e.message : "Unknown error");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [nicheId]);

  return (
    <main className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <Link
            href="/niches"
            className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to niches
          </Link>
          <h1 className="text-2xl font-bold tracking-tight">
            {niche?.name ?? "Niche"}
          </h1>
        </div>

        <Link href="/niche/new">
          <Button variant="outline">Train another</Button>
        </Link>
      </div>

      {loading && (
        <Card>
          <CardContent className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading niche…
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

      {!loading && niche && (
        <>
          <Card>
            <CardHeader>
              <div className="flex items-start justify-between gap-3">
                <CardTitle className="text-base">Overview</CardTitle>
                <Badge
                  variant={niche.status === "ready" ? "secondary" : "outline"}
                >
                  {niche.status ?? "unknown"}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-2">
              <p className="text-sm text-muted-foreground">
                Created: {new Date(niche.created_at).toLocaleString()}
              </p>
              <p className="break-all font-mono text-xs text-muted-foreground">
                ID: {niche.id}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Trained profile</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {!profile && (
                <p className="text-sm text-muted-foreground">
                  No profile saved yet for this niche.
                </p>
              )}

              {profile && (
                <div className="space-y-4">
                  {(profile.audience_type || profile.content_structure_pattern) && (
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div>
                        <p className="text-sm font-semibold">Audience type</p>
                        <p className="text-sm text-muted-foreground">
                          {profile.audience_type ?? "—"}
                        </p>
                      </div>
                      <div>
                        <p className="text-sm font-semibold">Content structure</p>
                        <p className="text-sm text-muted-foreground">
                          {profile.content_structure_pattern ?? "—"}
                        </p>
                      </div>
                    </div>
                  )}

                  <div className="grid gap-4 sm:grid-cols-3">
                    <TagList title="Topics" items={profile.common_topics ?? []} />
                    <TagList title="Keywords" items={profile.keywords ?? []} />
                    <TagList title="Hooks" items={profile.hooks ?? []} />
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Training videos</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {videos.length === 0 && (
                <p className="text-sm text-muted-foreground">No videos recorded.</p>
              )}

              {videos.length > 0 && (
                <ul className="space-y-2">
                  {videos.map((v) => (
                    <li
                      key={v.id}
                      className="flex items-center justify-between gap-3 rounded-md border bg-background p-3"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">
                          {v.title ?? v.youtube_url}
                        </p>
                        <p className="truncate text-xs text-muted-foreground">
                          {new Date(v.created_at).toLocaleString()}
                        </p>
                      </div>

                      <a
                        href={v.youtube_url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex"
                      >
                        <Button size="sm" variant="outline" className="gap-2">
                          Open <ExternalLink className="h-4 w-4" />
                        </Button>
                      </a>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </main>
  );
}

function TagList({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="space-y-2">
      <p className="text-sm font-semibold">{title}</p>
      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">—</p>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {items.slice(0, 12).map((item, i) => (
            <Badge key={`${title}-${i}`} variant="outline">
              {item}
            </Badge>
          ))}
          {items.length > 12 && (
            <Badge variant="secondary">+{items.length - 12} more</Badge>
          )}
        </div>
      )}
    </div>
  );
}

