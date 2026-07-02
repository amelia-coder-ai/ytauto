import Link from "next/link";

export default function Home() {
  return (
    <main className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground">Create and view trained niches.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Link
          href="/niche/new"
          className="rounded-lg border bg-background p-5 hover:bg-muted/30"
        >
          <p className="text-sm font-semibold">Train a new niche</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Add YouTube videos and generate a niche profile.
          </p>
        </Link>

        <Link
          href="/niches"
          className="rounded-lg border bg-background p-5 hover:bg-muted/30"
        >
          <p className="text-sm font-semibold">Browse trained niches</p>
          <p className="mt-1 text-sm text-muted-foreground">
            View niches you’ve already trained.
          </p>
        </Link>
      </div>
    </main>
  );
}
