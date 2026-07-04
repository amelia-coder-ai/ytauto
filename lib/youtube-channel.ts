export interface YouTubeChannelInfo {
  channelId: string;
  title: string;
  subscriberCount: number;
  videoCount: number;
  uploadsPlaylistId: string;
}

export class YouTubeChannelError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "YouTubeChannelError";
  }
}

export function getApiKey(): string {
  const key = process.env.YOUTUBE_API_KEY;
  if (!key) {
    throw new YouTubeChannelError(
      "YOUTUBE_API_KEY is not configured. Add it to your .env.local file."
    );
  }
  return key;
}

type ParsedInput =
  | { type: "channelId"; channelId: string }
  | { type: "handle"; handle: string };

function parseChannelInput(input: string): ParsedInput {
  if (!input || typeof input !== "string") {
    throw new YouTubeChannelError("Invalid channel input.");
  }

  const trimmed = input.trim();

  if (/^UC[\w-]{22}$/.test(trimmed)) {
    return { type: "channelId", channelId: trimmed };
  }

  const channelUrlMatch = trimmed.match(
    /youtube\.com\/channel\/(UC[\w-]+)/
  );
  if (channelUrlMatch) {
    return { type: "channelId", channelId: channelUrlMatch[1] };
  }

  const handleMatch = trimmed.match(
    /(?:https?:\/\/(?:www\.)?youtube\.com\/)?@([\w.-]+)/
  );
  if (handleMatch) {
    return { type: "handle", handle: `@${handleMatch[1]}` };
  }

  throw new YouTubeChannelError(
    "Invalid channel URL or ID. Expected a YouTube channel URL, @handle, or channel ID."
  );
}

async function resolveHandle(
  handle: string,
  apiKey: string
): Promise<string> {
  const url = `https://www.googleapis.com/youtube/v3/channels?part=id&forHandle=${encodeURIComponent(handle)}&key=${apiKey}`;

  const response = await fetch(url);
  const data = await response.json();

  if (!response.ok) {
    const reason =
      data?.error?.errors?.[0]?.reason ?? response.statusText;
    if (response.status === 403 && reason === "quotaExceeded") {
      throw new YouTubeChannelError(
        "YouTube API quota exceeded. Please try again later."
      );
    }
    if (response.status === 403 && reason === "accessNotConfigured") {
      throw new YouTubeChannelError(
        "YouTube Data API v3 is not enabled for this project. Enable it in the Google Cloud Console."
      );
    }
    throw new YouTubeChannelError(
      `YouTube API error: ${data?.error?.message ?? response.statusText}`
    );
  }

  if (!data.items || data.items.length === 0) {
    throw new YouTubeChannelError(
      `Channel not found for handle: ${handle}`
    );
  }

  return data.items[0].id as string;
}

async function fetchChannelInfo(
  channelId: string,
  apiKey: string
): Promise<YouTubeChannelInfo> {
  const url = `https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics,contentDetails&id=${channelId}&key=${apiKey}`;

  const response = await fetch(url);
  const data = await response.json();

  if (!response.ok) {
    const reason =
      data?.error?.errors?.[0]?.reason ?? response.statusText;
    if (response.status === 403 && reason === "quotaExceeded") {
      throw new YouTubeChannelError(
        "YouTube API quota exceeded. Please try again later."
      );
    }
    throw new YouTubeChannelError(
      `YouTube API error: ${data?.error?.message ?? response.statusText}`
    );
  }

  if (!data.items || data.items.length === 0) {
    throw new YouTubeChannelError(
      `Channel not found: ${channelId}`
    );
  }

  const channel = data.items[0];
  const snippet = channel.snippet;
  const statistics = channel.statistics;
  const contentDetails = channel.contentDetails;

  return {
    channelId: channel.id as string,
    title: snippet.title as string,
    subscriberCount: parseInt(statistics.subscriberCount, 10) || 0,
    videoCount: parseInt(statistics.videoCount, 10) || 0,
    uploadsPlaylistId:
      contentDetails.relatedPlaylists.uploads as string,
  };
}

export async function getYouTubeChannelInfo(
  input: string
): Promise<YouTubeChannelInfo> {
  const apiKey = getApiKey();
  const parsed = parseChannelInput(input);

  const channelId =
    parsed.type === "handle"
      ? await resolveHandle(parsed.handle, apiKey)
      : parsed.channelId;

  return fetchChannelInfo(channelId, apiKey);
}
