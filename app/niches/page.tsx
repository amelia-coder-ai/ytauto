"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Loader2, PlusCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

type NicheRow = {
  id: string;
  name: string;
  description: string | null;
  status: string | null;
  created_at: string;
};

export default function NichesPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [niches, setNiches] = useState<NicheRow[]>([]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        setLoading(true);
        setError("");
        const res = await fetch("/api/niches/list");
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Failed to fetch niches");
        if (!cancelled) setNiches((data.niches ?? []) as NicheRow[]);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Unknown error");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const readyCount = useMemo(
    () => niches.filter((n) => n.status === "ready").length,
    [niches]
  );

  return (
    <main className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Trained niches</h1>
          <p className="text-muted-foreground">
            {readyCount} ready · {niches.length} total
          </p>
        </div>

        <Link href="/niche/new">
          <Button className="gap-2">
            <PlusCircle className="h-4 w-4" />
            New niche
          </Button>
        </Link>
      </div>

      {loading && (
        <Card>
          <CardContent className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading niches…
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

      {!loading && !error && niches.length === 0 && (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            No niches yet. Train your first niche to see it here.
          </CardContent>
        </Card>
      )}

      {!loading && !error && niches.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2">
          {niches.map((niche) => (
            <Card key={niche.id} className="overflow-hidden">
              <CardHeader>
                <div className="flex items-start justify-between gap-3">
                  <CardTitle className="text-base">{niche.name}</CardTitle>
                  <Badge
                    variant={niche.status === "ready" ? "secondary" : "outline"}
                  >
                    {niche.status ?? "unknown"}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {niche.description && (
                  <p className="text-sm text-muted-foreground">
                    {niche.description}
                  </p>
                )}
                <div className="flex items-center justify-between gap-3">
                  <p className="text-xs text-muted-foreground">
                    {new Date(niche.created_at).toLocaleString()}
                  </p>
                  <Link href={`/niche/${niche.id}`}>
                    <Button size="sm" variant="outline">
                      View
                    </Button>
                  </Link>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </main>
  );
}

