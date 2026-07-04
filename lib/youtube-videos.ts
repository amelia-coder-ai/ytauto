import { YouTubeChannelError, getApiKey } from "./youtube-channel";

export interface YouTubeVideoInfo {
  videoId: string;
  title: string;
  publishedAt: string;
  thumbnailUrl: string;
  views: number;
  likes: number;
  comments: number;
  durationSeconds: number;
}

interface CacheEntry {
  data: YouTubeVideoInfo[];
  timestamp: number;
}

const videoCache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 60 * 60 * 1000;

function getCached(key: string): YouTubeVideoInfo[] | null {
  const entry = videoCache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.timestamp >= CACHE_TTL_MS) {
    videoCache.delete(key);
    return null;
  }
  return entry.data;
}

function setCache(key: string, data: YouTubeVideoInfo[]): void {
  videoCache.set(key, { data, timestamp: Date.now() });
}

function parseISODuration(iso: string): number {
  const match = iso.match(
    /^P(?:(\d+)D)?T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/
  );
  if (!match) return 0;
  const [, days, hours, minutes, seconds] = match;
  return (
    (parseInt(days ?? "0", 10) * 86400) +
    (parseInt(hours ?? "0", 10) * 3600) +
    (parseInt(minutes ?? "0", 10) * 60) +
    parseInt(seconds ?? "0", 10)
  );
}

async function fetchPlaylistItemsPage(
  playlistId: string,
  apiKey: string,
  pageToken?: string
): Promise<{ videoIds: string[]; nextPageToken?: string }> {
  const params = new URLSearchParams({
    part: "snippet",
    maxResults: "50",
    playlistId,
    key: apiKey,
  });
  if (pageToken) params.set("pageToken", pageToken);

  const response = await fetch(
    `https://www.googleapis.com/youtube/v3/playlistItems?${params}`
  );
  const data = await response.json();

  if (!response.ok) {
    const reason = data?.error?.errors?.[0]?.reason ?? response.statusText;
    if (response.status === 403 && reason === "quotaExceeded") {
      throw new YouTubeChannelError(
        "Daily quota exceeded, try again tomorrow"
      );
    }
    throw new YouTubeChannelError(
      `YouTube API error: ${data?.error?.message ?? response.statusText}`
    );
  }

  const videoIds: string[] = [];
  for (const item of data.items ?? []) {
    const videoId = item.snippet?.resourceId?.videoId;
    if (videoId) videoIds.push(videoId);
  }

  return {
    videoIds,
    nextPageToken: data.nextPageToken as string | undefined,
  };
}

async function fetchAllPlaylistVideoIds(
  playlistId: string,
  apiKey: string,
  maxResults: number
): Promise<string[]> {
  const allIds: string[] = [];
  let pageToken: string | undefined;

  do {
    const remaining = maxResults - allIds.length;
    if (remaining <= 0) break;

    const { videoIds, nextPageToken } = await fetchPlaylistItemsPage(
      playlistId,
      apiKey,
      pageToken
    );

    allIds.push(...videoIds.slice(0, remaining));
    pageToken = nextPageToken;
  } while (pageToken);

  return allIds;
}

async function fetchVideoDetailsBatch(
  videoIds: string[],
  apiKey: string
): Promise<YouTubeVideoInfo[]> {
  const results: YouTubeVideoInfo[] = [];

  for (let i = 0; i < videoIds.length; i += 50) {
    const batch = videoIds.slice(i, i + 50);

    const params = new URLSearchParams({
      part: "snippet,statistics,contentDetails",
      id: batch.join(","),
      key: apiKey,
    });

    const response = await fetch(
      `https://www.googleapis.com/youtube/v3/videos?${params}`
    );
    const data = await response.json();

    if (!response.ok) {
      const reason =
        data?.error?.errors?.[0]?.reason ?? response.statusText;
      if (response.status === 403 && reason === "quotaExceeded") {
        throw new YouTubeChannelError(
          "Daily quota exceeded, try again tomorrow"
        );
      }
      throw new YouTubeChannelError(
        `YouTube API error: ${data?.error?.message ?? response.statusText}`
      );
    }

    for (const item of data.items ?? []) {
      const snippet = item.snippet;
      const stats = item.statistics;
      const content = item.contentDetails;

      results.push({
        videoId: item.id as string,
        title: snippet?.title as string,
        publishedAt: snippet?.publishedAt as string,
        thumbnailUrl:
          snippet?.thumbnails?.high?.url ??
          snippet?.thumbnails?.medium?.url ??
          snippet?.thumbnails?.default?.url ??
          "",
        views: parseInt(stats?.viewCount ?? "0", 10),
        likes: parseInt(stats?.likeCount ?? "0", 10),
        comments: parseInt(stats?.commentCount ?? "0", 10),
        durationSeconds: parseISODuration(content?.duration ?? "PT0S"),
      });
    }
  }

  return results;
}

export interface GetYouTubeVideosOptions {
  maxResults?: number;
}

export async function getYouTubeVideos(
  uploadsPlaylistId: string,
  options?: GetYouTubeVideosOptions
): Promise<YouTubeVideoInfo[]> {
  const maxResults = options?.maxResults ?? 100;

  const cached = getCached(uploadsPlaylistId);
  if (cached) return cached;

  const apiKey = getApiKey();
  const videoIds = await fetchAllPlaylistVideoIds(
    uploadsPlaylistId,
    apiKey,
    maxResults
  );
  const videos = await fetchVideoDetailsBatch(videoIds, apiKey);

  setCache(uploadsPlaylistId, videos);
  return videos;
}
