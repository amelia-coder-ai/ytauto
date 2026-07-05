'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';

interface VideoStatus {
  status: string;
  completedScenes: number;
  totalScenes: number;
  percentComplete: number;
  outputVideoUrl: string | null;
  errorMessage: string | null;
}

const statusSteps = [
  { id: 1, label: 'Generating', description: 'Creating main video with Modal' },
  { id: 2, label: 'Ready', description: 'Video generation complete' },
];

const getStatusStep = (status: string): number => {
  switch (status) {
    case 'pending':
      return 0;
    case 'generating':
      return 1;
    case 'ready':
      return 2;
    case 'failed':
      return -1;
    default:
      return 0;
  }
};

const getStatusColor = (status: string) => {
  switch (status) {
    case 'pending':
    case 'generating':
      return 'bg-blue-100 text-blue-800';
    case 'ready':
      return 'bg-green-100 text-green-800';
    case 'failed':
      return 'bg-red-100 text-red-800';
    default:
      return 'bg-gray-100 text-gray-800';
  }
};

const getStatusIcon = (status: string) => {
  switch (status) {
    case 'pending':
    case 'generating':
      return '⏳';
    case 'ready':
      return '✅';
    case 'failed':
      return '❌';
    default:
      return '❓';
  }
};

export default function VideoStatusPage() {
  const params = useParams();
  const router = useRouter();
  const videoJobId = params.videoJobId as string;

  const [status, setStatus] = useState<VideoStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [autoRefresh, setAutoRefresh] = useState(true);

  useEffect(() => {
    let interval: NodeJS.Timeout | null = null;
    let stopped = false;

    const fetchStatus = async () => {
      try {
        const res = await fetch(`/api/video/status/${videoJobId}`);
        if (!res.ok) {
          throw new Error('Failed to fetch status');
        }
        const data = await res.json();
        if (stopped) return;
        setStatus(data);
        setError('');

        // Stop polling if generation is complete or failed
        if (data.status === 'ready' || data.status === 'failed') {
          setAutoRefresh(false);
          if (interval) {
            clearInterval(interval);
            interval = null;
          }
        }
      } catch (err) {
        if (stopped) return;
        const msg = err instanceof Error ? err.message : 'Unknown error';
        setError(msg);
      } finally {
        if (!stopped) setLoading(false);
      }
    };

    fetchStatus();

    if (autoRefresh) {
      interval = setInterval(fetchStatus, 3000);
    }

    return () => {
      stopped = true;
      if (interval) clearInterval(interval);
    };
  }, [videoJobId, autoRefresh]);

  if (loading && !status) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Video Generation</h1>
          <p className="mt-2 text-muted-foreground">Loading status...</p>
        </div>

        <Card className="p-6">
          <div className="space-y-4">
            <div className="h-4 w-1/3 animate-pulse rounded bg-gray-200"></div>
            <div className="h-2 animate-pulse rounded bg-gray-200"></div>
            <div className="h-4 w-1/4 animate-pulse rounded bg-gray-200"></div>
          </div>
        </Card>
      </div>
    );
  }

  if (!status) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Video Generation</h1>
          <p className="mt-2 text-muted-foreground">Failed to load video status</p>
        </div>

        <Card className="border-red-200 bg-red-50 p-4">
          <p className="text-sm text-red-800">{error || 'Unknown error'}</p>
        </Card>

        <Button onClick={() => router.back()} variant="outline">
          Go Back
        </Button>
      </div>
    );
  }

  const currentStep = getStatusStep(status.status);
  const statusLabel = status.status.charAt(0).toUpperCase() + status.status.slice(1);
  const progressPercentage = Math.max(0, status.percentComplete);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Video Generation</h1>
        <p className="mt-2 text-muted-foreground">Track your video generation progress</p>
      </div>

      {/* Status Badge */}
      <div className="flex items-center gap-3">
        <span className="text-2xl">{getStatusIcon(status.status)}</span>
        <div>
          <span className={`inline-block rounded-full px-3 py-1 text-sm font-medium ${getStatusColor(status.status)}`}>
            {statusLabel}
          </span>
          {status.status === 'generating' && (
            <p className="mt-1 text-xs text-muted-foreground">
              Scenes: {status.completedScenes} / {status.totalScenes}
            </p>
          )}
        </div>
      </div>

      {/* Main Progress Card */}
      <Card className="p-6">
        <div className="space-y-4">
          {/* Status Steps */}
          {status.status !== 'failed' && (
            <>
              <div>
                <h3 className="mb-4 font-medium">Generation Steps</h3>
                <div className="space-y-3">
                  {statusSteps.map((step) => {
                    const isActive = currentStep >= step.id;
                    const isCurrent = currentStep === step.id;

                    return (
                      <div key={step.id} className="flex items-start gap-3">
                        <div
                          className={`mt-0.5 flex h-6 w-6 items-center justify-center rounded-full text-sm font-bold ${
                            isActive
                              ? 'bg-green-600 text-white'
                              : isCurrent
                                ? 'border-2 border-blue-600 bg-blue-50 text-blue-600'
                                : 'border-2 border-gray-300 bg-gray-50 text-gray-400'
                          }`}
                        >
                          {isActive && !isCurrent ? '✓' : step.id}
                        </div>
                        <div>
                          <p className={`font-medium ${isActive ? 'text-gray-900' : 'text-gray-500'}`}>
                            {step.label}
                          </p>
                          <p className="text-xs text-muted-foreground">{step.description}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <Separator />

              {/* Progress Bar */}
              <div>
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-sm font-medium">Overall Progress</span>
                  <span className="text-sm font-bold text-blue-600">{progressPercentage}%</span>
                </div>
                <Progress value={progressPercentage} className="h-3" />
              </div>

              {/* Scenes Progress */}
              {status.totalScenes > 0 && (
                <div className="rounded-lg bg-gray-50 p-3">
                  <p className="text-sm text-gray-700">
                    <span className="font-medium">{status.completedScenes}</span> of{' '}
                    <span className="font-medium">{status.totalScenes}</span> scenes processed
                  </p>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-gray-200">
                    <div
                      className="h-full bg-blue-600 transition-all duration-300"
                      style={{
                        width: `${status.totalScenes > 0 ? (status.completedScenes / status.totalScenes) * 100 : 0}%`,
                      }}
                    ></div>
                  </div>
                </div>
              )}
            </>
          )}

          {/* Error State */}
          {status.status === 'failed' && status.errorMessage && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-4">
              <h3 className="font-medium text-red-900">Generation Failed</h3>
              <p className="mt-1 text-sm text-red-800">{status.errorMessage}</p>
            </div>
          )}

          {/* Success State */}
          {status.status === 'ready' && status.outputVideoUrl && (
            <div className="space-y-3 rounded-lg border border-green-200 bg-green-50 p-4">
              <div>
                <h3 className="font-medium text-green-900">Your Video is Ready!</h3>
                <p className="mt-1 text-sm text-green-800">Your generated video has been saved successfully.</p>
              </div>
              <div className="flex gap-2">
                <a
                  href={status.outputVideoUrl}
                  download
                  className="inline-flex items-center gap-2 rounded-md bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700"
                >
                  📥 Download Video
                </a>
                <a
                  href={status.outputVideoUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 rounded-md border border-green-600 px-4 py-2 text-sm font-medium text-green-600 hover:bg-green-50"
                >
                  🎬 Preview Video
                </a>
              </div>
            </div>
          )}
        </div>
      </Card>

      {/* Info Box */}
      <Card className="border-blue-200 bg-blue-50 p-4">
        <div className="space-y-2 text-sm">
          <p className="font-medium text-blue-900">💡 Tip</p>
          <p className="text-blue-800">
            {status.status === 'generating'
              ? 'Video generation is in progress. This page will update automatically every 3 seconds.'
              : status.status === 'ready'
                ? 'Your video is ready to download and use!'
                : 'Generation failed. You can try again with different settings.'}
          </p>
        </div>
      </Card>

      {/* Action Buttons */}
      <div className="flex gap-2">
        {status.status === 'ready' && (
          <Link href="/dashboard/video/new">
            <Button className="bg-blue-600 hover:bg-blue-700">Create Another Video</Button>
          </Link>
        )}
        {status.status === 'failed' && (
          <Link href="/dashboard/video/new">
            <Button className="bg-blue-600 hover:bg-blue-700">Try Again</Button>
          </Link>
        )}
        <Link href="/dashboard">
          <Button variant="outline">Back to Dashboard</Button>
        </Link>
      </div>

      {/* Auto-refresh toggle */}
      {status.status !== 'ready' && status.status !== 'failed' && (
        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            id="autoRefresh"
            checked={autoRefresh}
            onChange={(e) => setAutoRefresh(e.target.checked)}
            className="h-4 w-4"
          />
          <label htmlFor="autoRefresh" className="text-xs text-muted-foreground cursor-pointer">
            Auto-refresh enabled (every 3 seconds)
          </label>
        </div>
      )}

      {/* Job ID Reference */}
      <div className="text-xs text-muted-foreground">
        Job ID: <span className="font-mono">{videoJobId}</span>
      </div>
    </div>
  );
}
