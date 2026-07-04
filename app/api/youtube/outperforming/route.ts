import { NextRequest, NextResponse } from "next/server";
import { getTopOutperformingVideos } from "@/lib/youtube-outperforming";

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => null)) as {
      channelUrl?: string;
      count?: number;
      sortBy?: "outlierScore" | "views";
    } | null;

    if (!body?.channelUrl || typeof body.channelUrl !== "string") {
      return NextResponse.json(
        { error: "Missing or invalid 'channelUrl' in request body." },
        { status: 400 }
      );
    }

    const result = await getTopOutperformingVideos(
      body.channelUrl,
      body.count ?? 10,
      body.sortBy ?? "outlierScore"
    );

    return NextResponse.json(result);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "An unexpected error occurred.";

    if (
      message.includes("quota exceeded") ||
      message.includes("Daily quota exceeded")
    ) {
      return NextResponse.json(
        { error: "YouTube API quota exceeded. Please try again tomorrow." },
        { status: 429 }
      );
    }

    if (message.includes("not found")) {
      return NextResponse.json({ error: message }, { status: 404 });
    }

    if (
      message.includes("Invalid channel") ||
      message.includes("not configured")
    ) {
      return NextResponse.json({ error: message }, { status: 400 });
    }

    console.error("Outperforming videos API error:", error);
    return NextResponse.json(
      { error: "An unexpected error occurred." },
      { status: 500 }
    );
  }
}
