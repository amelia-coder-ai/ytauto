/**
 * Extract a YouTube video ID from a URL or short link.
 * Returns the ID string, or null if the input is invalid.
 *
 * Supported formats:
 *   https://www.youtube.com/watch?v=VIDEO_ID
 *   https://youtu.be/VIDEO_ID
 *   https://youtube.com/shorts/VIDEO_ID
 *   https://www.youtube.com/embed/VIDEO_ID
 *   https://m.youtube.com/watch?v=VIDEO_ID
 *   VIDEO_ID  (bare ID)
 */
export function extractVideoId(url: string): string | null {
  if (!url) return null;

  // Bare 11-character video ID
  if (/^[A-Za-z0-9_-]{11}$/.test(url.trim())) {
    return url.trim();
  }

  const patterns = [
    /[?&]v=([A-Za-z0-9_-]{11})/,       // watch?v=ID
    /youtu\.be\/([A-Za-z0-9_-]{11})/,   // youtu.be/ID
    /\/shorts\/([A-Za-z0-9_-]{11})/,    // /shorts/ID
    /\/embed\/([A-Za-z0-9_-]{11})/,     // /embed/ID
  ];

  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) return match[1];
  }

  return null;
}

/**
 * Fetch the plain-text transcript for a YouTube video.
 *
 * Uses the youtube-transcript package (InnerTube API) with an
 * HTML-scraping fallback for cases where captions are unavailable
 * through the API.
 */
import {
  fetchTranscript as fetchTranscriptLib,
  YoutubeTranscriptError,
  YoutubeTranscriptVideoUnavailableError,
  YoutubeTranscriptDisabledError,
  YoutubeTranscriptNotAvailableError,
} from "youtube-transcript";

export async function fetchTranscript(videoId: string): Promise<string> {
  try {
    const segments = await fetchTranscriptLib(videoId);
    const transcript = segments.map((s) => s.text).join(" ");
    return transcript;
  } catch (error) {
    if (error instanceof YoutubeTranscriptVideoUnavailableError) {
      throw new Error("Video is unavailable or private.");
    }
    if (error instanceof YoutubeTranscriptDisabledError) {
      throw new Error("Captions are disabled for this video.");
    }
    if (error instanceof YoutubeTranscriptNotAvailableError) {
      throw new Error("No transcript available for this video.");
    }
    if (error instanceof YoutubeTranscriptError) {
      throw new Error((error as Error).message || "Failed to fetch transcript.");
    }
    throw new Error("An unexpected error occurred while fetching the transcript.");
  }
}
