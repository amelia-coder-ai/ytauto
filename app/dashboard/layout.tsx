import Link from "next/link";

import { SidebarNav } from "@/components/dashboard/SidebarNav";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen">
      <div className="mx-auto grid max-w-6xl grid-cols-1 gap-6 px-4 py-6 md:grid-cols-[240px_1fr]">
        <aside className="md:sticky md:top-6 md:h-[calc(100vh-3rem)]">
          <div className="rounded-lg border bg-background p-4">
            <div className="mb-4">
              <Link href="/" className="text-sm font-semibold tracking-tight">
                GLM Demo
              </Link>
              <p className="mt-1 text-xs text-muted-foreground">Dashboard</p>
            </div>

            <SidebarNav />
          </div>
        </aside>

        <div className="min-w-0">{children}</div>
      </div>
    </div>
  );
}

