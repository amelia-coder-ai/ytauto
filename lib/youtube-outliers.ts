export interface VideoInput {
  videoId: string;
  title: string;
  publishedAt: string;
  thumbnailUrl: string;
  views: number;
  likes: number;
  comments: number;
  durationSeconds: number;
}

export interface VideoWithOutlierScore extends VideoInput {
  daysSincePublish: number;
  viewsPerDay: number;
  engagementRate: number;
  outlierScore: number;
}

export interface OutlierScoreOptions {
  logNormalize?: boolean;
  referenceDate?: Date;
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2;
}

export function calculateOutlierScores(
  videos: VideoInput[],
  options?: OutlierScoreOptions
): VideoWithOutlierScore[] {
  const now = options?.referenceDate ?? new Date();
  const msPerDay = 1000 * 60 * 60 * 24;

  const enriched = videos.map((v) => {
    const published = new Date(v.publishedAt).getTime();
    const daysSincePublish = Math.max(
      1,
      Math.round((now.getTime() - published) / msPerDay)
    );
    const viewsPerDay = v.views / daysSincePublish;
    const engagementRate = v.views > 0 ? (v.likes + v.comments) / v.views : 0;

    return { ...v, daysSincePublish, viewsPerDay, engagementRate };
  });

  if (enriched.length === 0) return enriched as VideoWithOutlierScore[];

  const viewsPerDayValues = enriched.map((v) => v.viewsPerDay);
  const channelMedian = median(viewsPerDayValues);

  const logNormalize = options?.logNormalize ?? false;

  return enriched.map((v) => {
    let rawScore = channelMedian > 0 ? v.viewsPerDay / channelMedian : 1;

    if (logNormalize) {
      rawScore = Math.log10(rawScore + 1);
    }

    return { ...v, outlierScore: rawScore };
  });
}
