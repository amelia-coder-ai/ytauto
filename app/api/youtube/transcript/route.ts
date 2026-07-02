import { NextRequest, NextResponse } from "next/server";
import { extractVideoId, fetchTranscript } from "@/lib/youtube";

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => null)) as {
      url?: string;
    } | null;

    if (!body?.url || typeof body.url !== "string") {
      return NextResponse.json(
        { error: "Missing or invalid 'url' in request body." },
        { status: 400 }
      );
    }

    // 1. Extract the video ID
    const videoId = extractVideoId(body.url);
    if (!videoId) {
      return NextResponse.json(
        {
          error: "Could not extract a valid YouTube video ID from the URL.",
          url: body.url,
        },
        { status: 400 }
      );
    }

    // 2. Fetch the transcript
    let transcript: string;
    try {
      transcript = await fetchTranscript(videoId);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to fetch transcript.";

      // Map known error messages to appropriate HTTP status codes
      if (message.includes("unavailable") || message.includes("private")) {
        return NextResponse.json(
          { error: message, videoId },
          { status: 404 }
        );
      }
      if (message.includes("disabled")) {
        return NextResponse.json(
          { error: message, videoId },
          { status: 404 }
        );
      }
      if (
        message.includes("No transcript") ||
        message.includes("not available")
      ) {
        return NextResponse.json(
          { error: message, videoId },
          { status: 404 }
        );
      }

      return NextResponse.json(
        { error: message, videoId },
        { status: 500 }
      );
    }

    if (!transcript) {
      return NextResponse.json(
        { error: "Transcript is empty.", videoId },
        { status: 404 }
      );
    }

    // 3. Build the title (extract from YouTube oEmbed)
    let title = "";
    try {
      const oembedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(
        `https://www.youtube.com/watch?v=${videoId}`
      )}&format=json`;
      const oembedRes = await fetch(oembedUrl);
      if (oembedRes.ok) {
        const oembedData = (await oembedRes.json()) as { title?: string };
        title = oembedData.title ?? "";
      }
    } catch {
      // Title fetch is best-effort; leave empty on failure
    }

    // 4. Compute word count
    const wordCount = transcript
      .split(/\s+/)
      .filter((w) => w.length > 0).length;

    return NextResponse.json({
      videoId,
      title,
      transcript,
      wordCount,
    });
  } catch (error) {
    console.error("Transcript API error:", error);
    return NextResponse.json(
      { error: "Internal server error." },
      { status: 500 }
    );
  }
}
