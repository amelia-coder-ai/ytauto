'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import type { CameraEffect, CameraEffectMode, OverlayEffect } from '@/lib/script-chunker';

interface FormData {
  scriptId: string;
  scriptTitle: string;
  nicheName: string;
  imageIntervalSeconds: number;
  resolution: '720p' | '1080p';
  voice: string;
  ttsSpeed: number;
  watermarkUrl?: string;
  cameraEffect: CameraEffect;
  cameraEffectMode: CameraEffectMode;
  overlayEffect: OverlayEffect;
}

const initialFormData: FormData = {
  scriptId: '',
  scriptTitle: '',
  nicheName: '',
  imageIntervalSeconds: 5,
  resolution: '1080p',
  voice: 'af_heart',
  ttsSpeed: 1.0,
  cameraEffect: 'none',
  cameraEffectMode: 'same',
  overlayEffect: 'none',
};

interface Script {
  id: string;
  title: string;
  niche_id: string;
  status: string;
  duration_minutes: number;
  created_at: string;
}

interface Niche {
  id: string;
  name: string;
}

const voices = [
  { id: 'af_heart', name: 'Warm Female', description: 'Friendly & warm', flag: '🇺🇸' },
  { id: 'af_bella', name: 'Professional Female', description: 'Clear & professional', flag: '🇺🇸' },
  { id: 'am_adam', name: 'Deep Male', description: 'Rich & deep', flag: '🇺🇸' },
  { id: 'am_michael', name: 'Casual Male', description: 'Conversational', flag: '🇺🇸' },
  { id: 'bf_emma', name: 'British Female', description: 'Sophisticated', flag: '🇬🇧' },
  { id: 'bm_george', name: 'British Male', description: 'Authoritative', flag: '🇬🇧' },
];

const cameraEffectOptions: { value: CameraEffect; label: string; icon: string }[] = [
  { value: 'none', label: 'None', icon: '⊞' },
  { value: 'zoom-in', label: 'Zoom In', icon: '🔍' },
  { value: 'zoom-out', label: 'Zoom Out', icon: '🔍' },
  { value: 'pan-left', label: 'Pan Left', icon: '←' },
  { value: 'pan-right', label: 'Pan Right', icon: '→' },
  { value: 'pan-up', label: 'Pan Up', icon: '↑' },
  { value: 'pan-down', label: 'Pan Down', icon: '↓' },
];

const overlayEffectOptions: { value: OverlayEffect; label: string; icon: string }[] = [
  { value: 'none', label: 'None', icon: '⊘' },
  { value: 'particles', label: 'Particles', icon: '✦' },
  { value: 'old-film', label: 'Old Film', icon: '🎞️' },
];

export default function NewVideoPage() {
  const router = useRouter();
  const [currentStep, setCurrentStep] = useState(1);
  const [formData, setFormData] = useState<FormData>(initialFormData);
  const [scripts, setScripts] = useState<Script[]>([]);
  const [niches, setNiches] = useState<Niche[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [customInterval, setCustomInterval] = useState('');
  const [confirmed, setConfirmed] = useState(false);

  useEffect(() => {
    fetchScriptsAndNiches();
  }, []);

  const fetchScriptsAndNiches = async () => {
    try {
      const [scriptsRes, nichesRes] = await Promise.all([
        supabase.from('scripts').select('*').eq('status', 'ready').order('created_at', { ascending: false }),
        supabase.from('niches').select('*'),
      ]);

      if (scriptsRes.data) {
        setScripts(scriptsRes.data as Script[]);
      }
      if (nichesRes.data) {
        setNiches(nichesRes.data as Niche[]);
      }
    } catch (err) {
      console.error('Failed to fetch scripts:', err);
      setError('Failed to load scripts');
    }
  };

  const getNicheName = (nicheId: string) => {
    return niches.find((n) => n.id === nicheId)?.name || 'Unknown';
  };

  const handleScriptSelect = (scriptId: string) => {
    const script = scripts.find((s) => s.id === scriptId);
    if (script) {
      const niche = getNicheName(script.niche_id);
      setFormData({
        ...formData,
        scriptId,
        scriptTitle: script.title,
        nicheName: niche,
      });
    }
  };

  const handleImageInterval = (value: string | number) => {
    if (value === 'custom') {
      setFormData({ ...formData, imageIntervalSeconds: 0 });
      setCustomInterval('');
    } else {
      const num = typeof value === 'number' ? value : parseInt(value);
      setFormData({ ...formData, imageIntervalSeconds: num });
      setCustomInterval('');
    }
  };

  const handleCustomInterval = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseInt(e.target.value) || 0;
    if (value >= 1 && value <= 30) {
      setCustomInterval(e.target.value);
      setFormData({ ...formData, imageIntervalSeconds: value });
    }
  };

  const validateStep1 = () => {
    if (!formData.scriptId) {
      setError('Please select a script');
      return false;
    }
    if (formData.imageIntervalSeconds <= 0) {
      setError('Please set a valid image interval');
      return false;
    }
    setError('');
    return true;
  };

  const validateStep2 = () => {
    if (!formData.voice) {
      setError('Please select a voice');
      return false;
    }
    if (formData.ttsSpeed <= 0 || formData.ttsSpeed > 2) {
      setError('TTS speed must be between 0.5x and 2.0x');
      return false;
    }
    setError('');
    return true;
  };

  const handleContinue = () => {
    if (currentStep === 1 && !validateStep1()) return;
    if (currentStep === 2 && !validateStep2()) return;

    if (currentStep < 3) {
      setCurrentStep(currentStep + 1);
    }
  };

  const handleGenerate = async () => {
    if (!confirmed) {
      setError('Please confirm before generating');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const startRes = await fetch('/api/video/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scriptId: formData.scriptId,
          nicheName: formData.nicheName,
          imageIntervalSeconds: formData.imageIntervalSeconds,
          voice: formData.voice,
          ttsSpeed: formData.ttsSpeed,
          imageWidth: formData.resolution === '1080p' ? 1920 : 1280,
          imageHeight: formData.resolution === '1080p' ? 1080 : 720,
          cameraEffect: formData.cameraEffect,
          cameraEffectMode: formData.cameraEffectMode,
          overlayEffect: formData.overlayEffect,
        }),
      });

      if (!startRes.ok) {
        const data = await startRes.json();
        throw new Error(data.error || 'Failed to start video generation');
      }

      const data = await startRes.json();
      // Redirect to status page
      router.push(`/dashboard/video/${data.videoJobId}/status`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      setError(msg);
      setLoading(false);
    }
  };

  const progressValue = (currentStep / 3) * 100;

  const cameraEffectLabel = cameraEffectOptions.find(o => o.value === formData.cameraEffect)?.label || 'None';
  const overlayEffectLabel = overlayEffectOptions.find(o => o.value === formData.overlayEffect)?.label || 'None';

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Create Video</h1>
        <p className="mt-2 text-muted-foreground">
          Generate an AI video from your script with custom settings
        </p>
      </div>

      <div className="space-y-2">
        <div className="flex justify-between text-sm font-medium">
          <span>Step {currentStep} of 3</span>
          <span>{Math.round(progressValue)}%</span>
        </div>
        <Progress value={progressValue} className="h-2" />
      </div>

      {error && (
        <Card className="border-red-200 bg-red-50 p-4">
          <p className="text-sm text-red-800">{error}</p>
        </Card>
      )}

      <Card className="p-6">
        {/* Step 1: Configure Video */}
        {currentStep === 1 && (
          <div className="space-y-6">
            <div>
              <h2 className="text-2xl font-bold">Configure Video</h2>
              <p className="text-muted-foreground">Choose your script and basic settings</p>
            </div>

            <Separator />

            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium">Script</label>
                <p className="mb-2 text-xs text-muted-foreground">Select a ready script to generate from</p>
                <select
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={formData.scriptId}
                  onChange={(e) => handleScriptSelect(e.target.value)}
                >
                  <option value="">Select a script...</option>
                  {scripts.map((script) => (
                    <option key={script.id} value={script.id}>
                      {script.title} • {getNicheName(script.niche_id)} • {new Date(script.created_at).toLocaleDateString()}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-sm font-medium">Change Image Every...</label>
                <div className="mt-2 flex flex-wrap gap-2">
                  {[3, 5, 8, 10].map((interval) => (
                    <button
                      key={interval}
                      onClick={() => handleImageInterval(interval)}
                      className={`rounded-md px-4 py-2 text-sm font-medium transition-colors ${
                        formData.imageIntervalSeconds === interval
                          ? 'bg-blue-600 text-white'
                          : 'border border-input bg-background hover:bg-accent'
                      }`}
                    >
                      {interval}s
                    </button>
                  ))}
                  <button
                    onClick={() => handleImageInterval('custom')}
                    className={`rounded-md px-4 py-2 text-sm font-medium transition-colors ${
                      formData.imageIntervalSeconds === 0 && !customInterval
                        ? 'bg-blue-600 text-white'
                        : 'border border-input bg-background hover:bg-accent'
                    }`}
                  >
                    Custom
                  </button>
                </div>

                {formData.imageIntervalSeconds === 0 && (
                  <div className="mt-2 flex items-center gap-2">
                    <Input
                      type="number"
                      min="1"
                      max="30"
                      placeholder="1-30 seconds"
                      value={customInterval}
                      onChange={handleCustomInterval}
                      className="w-32"
                    />
                    <span className="text-xs text-muted-foreground">seconds</span>
                  </div>
                )}
              </div>

              <div>
                <label className="text-sm font-medium">Resolution</label>
                <div className="mt-2 flex gap-2">
                  {(['720p', '1080p'] as const).map((res) => (
                    <button
                      key={res}
                      onClick={() => setFormData({ ...formData, resolution: res })}
                      className={`rounded-md px-4 py-2 text-sm font-medium transition-colors ${
                        formData.resolution === res
                          ? 'bg-blue-600 text-white'
                          : 'border border-input bg-background hover:bg-accent'
                      }`}
                    >
                      {res}
                    </button>
                  ))}
                </div>
              </div>

              {/* Camera Effect */}
              <div>
                <label className="text-sm font-medium">Camera Effect</label>
                <p className="mb-2 text-xs text-muted-foreground">Add motion to still images (Ken Burns effect)</p>

                <div className="mt-2 flex gap-2">
                  {[
                    { value: 'none', label: 'No Effect' },
                    { value: 'same', label: 'Same' },
                    { value: 'random', label: 'Random' },
                  ].map((mode) => (
                    <button
                      key={mode.value}
                      onClick={() => {
                        setFormData({
                          ...formData,
                          cameraEffectMode: mode.value as CameraEffectMode,
                          cameraEffect: mode.value === 'none' ? 'none' : formData.cameraEffect === 'none' ? 'zoom-in' : formData.cameraEffect,
                        });
                      }}
                      className={`rounded-md px-4 py-2 text-sm font-medium transition-colors ${
                        (mode.value === 'none' && formData.cameraEffect === 'none') ||
                        (mode.value === 'same' && formData.cameraEffect !== 'none' && formData.cameraEffectMode === 'same') ||
                        (mode.value === 'random' && formData.cameraEffectMode === 'random')
                          ? 'bg-blue-600 text-white'
                          : 'border border-input bg-background hover:bg-accent'
                      }`}
                    >
                      {mode.label}
                    </button>
                  ))}
                </div>

                {formData.cameraEffectMode === 'same' && formData.cameraEffect !== 'none' && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {cameraEffectOptions.filter(o => o.value !== 'none').map((opt) => (
                      <button
                        key={opt.value}
                        onClick={() => setFormData({ ...formData, cameraEffect: opt.value })}
                        className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                          formData.cameraEffect === opt.value
                            ? 'bg-blue-600 text-white'
                            : 'border border-input bg-background hover:bg-accent'
                        }`}
                      >
                        {opt.icon} {opt.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Overlay Effect */}
              <div>
                <label className="text-sm font-medium">Overlay Effect</label>
                <p className="mb-2 text-xs text-muted-foreground">Apply a video overlay on top of the entire video</p>

                <div className="mt-2 flex flex-wrap gap-2">
                  {overlayEffectOptions.map((opt) => (
                    <button
                      key={opt.value}
                      onClick={() => setFormData({ ...formData, overlayEffect: opt.value })}
                      className={`rounded-md px-4 py-2 text-sm font-medium transition-colors ${
                        formData.overlayEffect === opt.value
                          ? 'bg-blue-600 text-white'
                          : 'border border-input bg-background hover:bg-accent'
                      }`}
                    >
                      {opt.icon} {opt.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Step 2: Voice & Style */}
        {currentStep === 2 && (
          <div className="space-y-6">
            <div>
              <h2 className="text-2xl font-bold">Voice & Style</h2>
              <p className="text-muted-foreground">Choose narration voice and speed</p>
            </div>

            <Separator />

            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium">Voice</label>
                <div className="mt-2 grid grid-cols-2 gap-3 md:grid-cols-3">
                  {voices.map((voice) => (
                    <button
                      key={voice.id}
                      onClick={() => setFormData({ ...formData, voice: voice.id })}
                      className={`rounded-lg border-2 p-3 text-left transition-all ${
                        formData.voice === voice.id
                          ? 'border-blue-600 bg-blue-50'
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <p className="font-medium text-sm">{voice.name}</p>
                          <p className="text-xs text-muted-foreground">{voice.description}</p>
                        </div>
                        <span className="text-lg">{voice.flag}</span>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-sm font-medium">TTS Speed</label>
                <div className="mt-2 space-y-3">
                  <input
                    type="range"
                    min="0.5"
                    max="2"
                    step="0.1"
                    value={formData.ttsSpeed}
                    onChange={(e) => setFormData({ ...formData, ttsSpeed: parseFloat(e.target.value) })}
                    className="w-full"
                  />
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">Slow</span>
                    <span className="text-sm font-medium">{formData.ttsSpeed.toFixed(1)}x</span>
                    <span className="text-xs text-muted-foreground">Fast</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Step 3: Confirm & Generate */}
        {currentStep === 3 && (
          <div className="space-y-6">
            <div>
              <h2 className="text-2xl font-bold">Confirm & Generate</h2>
              <p className="text-muted-foreground">Review your settings and start generation</p>
            </div>

            <Separator />

            <Card className="border-blue-200 bg-blue-50 p-4">
              <div className="space-y-2 text-sm">
                <p>📝 Script: <span className="font-medium">{formData.scriptTitle}</span></p>
                <p>🎯 Niche: <span className="font-medium">{formData.nicheName}</span></p>
                <p>🖼️ Images: <span className="font-medium">every {formData.imageIntervalSeconds}s</span></p>
                <p>🎙️ Voice: <span className="font-medium">{voices.find(v => v.id === formData.voice)?.name}</span></p>
                <p>📺 Resolution: <span className="font-medium">{formData.resolution}</span></p>
                <p>🎥 Camera Effect: <span className="font-medium">
                  {formData.cameraEffect === 'none'
                    ? 'None'
                    : `${formData.cameraEffectMode === 'random' ? 'Random' : ''} ${cameraEffectLabel}`}
                </span></p>
                <p>✨ Overlay: <span className="font-medium">{overlayEffectLabel}</span></p>
              </div>
            </Card>

            <div className="flex items-center gap-3 rounded-lg border border-amber-200 bg-amber-50 p-3">
              <span className="text-lg">⏱️</span>
              <div className="text-sm">
                <p className="font-medium">Processing will take a few minutes</p>
                <p className="text-xs text-muted-foreground">You&apos;ll be redirected to track progress</p>
              </div>
            </div>

            <div className="flex items-center gap-2 rounded-lg border p-3">
              <input
                type="checkbox"
                id="confirm"
                checked={confirmed}
                onChange={(e) => setConfirmed(e.target.checked)}
                className="h-4 w-4"
              />
              <label htmlFor="confirm" className="text-sm font-medium">
                I confirm and want to generate this video
              </label>
            </div>
          </div>
        )}
      </Card>

      <div className="flex items-center justify-between">
        <Button
          variant="outline"
          onClick={() => setCurrentStep(Math.max(1, currentStep - 1))}
          disabled={currentStep === 1}
        >
          Back
        </Button>

        {currentStep < 3 ? (
          <Button onClick={handleContinue} className="bg-blue-600 hover:bg-blue-700">
            Continue
          </Button>
        ) : (
          <Button
            onClick={handleGenerate}
            disabled={!confirmed || loading}
            className="bg-green-600 hover:bg-green-700"
          >
            {loading ? 'Generating...' : 'Start Generating'}
          </Button>
        )}
      </div>
    </div>
  );
}
