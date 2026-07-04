import { getYouTubeChannelInfo } from "./youtube-channel";
import { getYouTubeVideos } from "./youtube-videos";
import { calculateOutlierScores } from "./youtube-outliers";

export interface OutperformingVideoResult {
  videoId: string;
  title: string;
  thumbnailUrl: string;
  views: number;
  publishedAt: string;
  outlierScore: number;
  viewsPerDay: number;
  engagementRate: number;
}

export interface OutperformingResult {
  channelId: string;
  channelTitle: string;
  subscriberCount: number;
  totalVideos: number;
  videosFetched: number;
  videos: OutperformingVideoResult[];
}

export async function getTopOutperformingVideos(
  channelUrlOrId: string,
  count = 10,
  sortBy: "outlierScore" | "views" = "outlierScore"
): Promise<OutperformingResult> {
  const channel = await getYouTubeChannelInfo(channelUrlOrId);

  const rawVideos = await getYouTubeVideos(channel.uploadsPlaylistId, {
    maxResults: 100,
  });

  const scored = calculateOutlierScores(rawVideos);

  const sorted = [...scored].sort((a, b) => {
    if (sortBy === "views") return b.views - a.views;
    return b.outlierScore - a.outlierScore;
  });

  const top = sorted.slice(0, count).map((v) => ({
    videoId: v.videoId,
    title: v.title,
    thumbnailUrl: v.thumbnailUrl,
    views: v.views,
    publishedAt: v.publishedAt,
    outlierScore: Math.round(v.outlierScore * 10) / 10,
    viewsPerDay: Math.round(v.viewsPerDay * 10) / 10,
    engagementRate: Math.round(v.engagementRate * 10000) / 10000,
  }));

  return {
    channelId: channel.channelId,
    channelTitle: channel.title,
    subscriberCount: channel.subscriberCount,
    totalVideos: channel.videoCount,
    videosFetched: scored.length,
    videos: top,
  };
}
