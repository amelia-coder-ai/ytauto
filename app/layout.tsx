import type { Metadata } from "next";
import localFont from "next/font/local";
import Link from "next/link";
import "./globals.css";

import { SidebarNav } from "@/components/dashboard/SidebarNav";

const geistSans = localFont({
  src: "./fonts/GeistVF.woff",
  variable: "--font-sans",
  weight: "100 900",
});

const geistMono = localFont({
  src: "./fonts/GeistMonoVF.woff",
  variable: "--font-mono",
  weight: "100 900",
});

export const metadata: Metadata = {
  title: "GLM Demo",
  description: "Next.js 14 app with shadcn/ui and a multi-model AI abstraction",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} font-sans antialiased`}
      >
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
      </body>
    </html>
  );
}
