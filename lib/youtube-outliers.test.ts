import { describe, it, expect } from "vitest";
import { calculateOutlierScores, type VideoInput } from "./youtube-outliers";

const mockVideos: VideoInput[] = [
  {
    videoId: "v1",
    title: "Underperformer",
    publishedAt: "2026-06-20T00:00:00Z",
    thumbnailUrl: "",
    views: 500,
    likes: 25,
    comments: 10,
    durationSeconds: 300,
  },
  {
    videoId: "v2",
    title: "Median performer",
    publishedAt: "2026-06-20T00:00:00Z",
    thumbnailUrl: "",
    views: 2000,
    likes: 100,
    comments: 50,
    durationSeconds: 300,
  },
  {
    videoId: "v3",
    title: "Above median",
    publishedAt: "2026-06-20T00:00:00Z",
    thumbnailUrl: "",
    views: 3000,
    likes: 150,
    comments: 75,
    durationSeconds: 300,
  },
  {
    videoId: "v4",
    title: "Outlier — 5x median views",
    publishedAt: "2026-06-20T00:00:00Z",
    thumbnailUrl: "",
    views: 10000,
    likes: 500,
    comments: 200,
    durationSeconds: 300,
  },
  {
    videoId: "v5",
    title: "Below median",
    publishedAt: "2026-06-20T00:00:00Z",
    thumbnailUrl: "",
    views: 1200,
    likes: 60,
    comments: 30,
    durationSeconds: 300,
  },
];

const refDate = new Date("2026-07-04T12:00:00Z");

describe("calculateOutlierScores", () => {
  it("assigns outlierScore ≈ 1 for the median video", () => {
    const result = calculateOutlierScores(mockVideos, {
      referenceDate: refDate,
    });
    // v2 (index 1) has 2000 views → median of [500,1200,2000,3000,10000] → score = 2000/2000 = 1
    expect(result[1].outlierScore).toBeCloseTo(1, 1);
  });

  it("assigns outlierScore ≈ 5 for a video with 5x median viewsPerDay", () => {
    const result = calculateOutlierScores(mockVideos, {
      referenceDate: refDate,
    });
    // v4 has 10000 views → 10000/2000 = 5
    expect(result[3].outlierScore).toBeCloseTo(5, 0);
  });

  it("assigns outlierScore < 1 for underperforming videos", () => {
    const result = calculateOutlierScores(mockVideos, {
      referenceDate: refDate,
    });
    expect(result[0].outlierScore).toBeLessThan(1);
    expect(result[4].outlierScore).toBeLessThan(1);
  });

  it("calculates engagementRate as (likes + comments) / views", () => {
    const result = calculateOutlierScores(mockVideos, {
      referenceDate: refDate,
    });
    expect(result[0].engagementRate).toBe((25 + 10) / 500);
    expect(result[3].engagementRate).toBe((500 + 200) / 10000);
  });

  it("returns empty array for empty input", () => {
    expect(calculateOutlierScores([], { referenceDate: refDate })).toEqual([]);
  });

  it("applies log normalization when logNormalize is true", () => {
    const raw = calculateOutlierScores(mockVideos, {
      referenceDate: refDate,
    });
    const log = calculateOutlierScores(mockVideos, {
      referenceDate: refDate,
      logNormalize: true,
    });
    expect(raw[3].outlierScore).toBeGreaterThan(log[3].outlierScore);
    expect(log[3].outlierScore).toBeCloseTo(
      Math.log10(raw[3].outlierScore + 1),
      4
    );
  });

  it("ensures daysSincePublish is at least 1 day", () => {
    const now = new Date();
    const sameDayVideo: VideoInput = {
      videoId: "now",
      title: "Just uploaded",
      publishedAt: now.toISOString(),
      thumbnailUrl: "",
      views: 100,
      likes: 10,
      comments: 5,
      durationSeconds: 60,
    };
    const result = calculateOutlierScores([sameDayVideo], {
      referenceDate: now,
    });
    expect(result[0].daysSincePublish).toBe(1);
  });

  it("produces correct ratio when videos have different publish dates", () => {
    const videos: VideoInput[] = [
      {
        videoId: "old",
        title: "Old video — 200 views/day",
        publishedAt: "2026-01-01T00:00:00Z",
        thumbnailUrl: "",
        views: 36000,
        likes: 100,
        comments: 50,
        durationSeconds: 300,
      },
      {
        videoId: "new",
        title: "New video — 2000 views/day",
        publishedAt: "2026-07-01T00:00:00Z",
        thumbnailUrl: "",
        views: 6000,
        likes: 300,
        comments: 150,
        durationSeconds: 300,
      },
    ];
    const ref = new Date("2026-07-04T12:00:00Z");
    const result = calculateOutlierScores(videos, { referenceDate: ref });
    // Old: 36000 / 185 days ≈ 194.6 vpd
    // New: 6000 / 4 days = 1500 vpd
    // Median: (194.6 + 1500) / 2 = 847.3
    // New outlier: 1500 / 847.3 ≈ 1.77
    expect(result[1].outlierScore).toBeGreaterThan(1);
    expect(result[0].outlierScore).toBeLessThan(1);
  });
});
