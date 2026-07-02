'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { supabaseAdmin } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Select } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';

interface FormData {
  scriptId: string;
  scriptTitle: string;
  nicheName: string;
  imageIntervalSeconds: number;
  resolution: '720p' | '1080p';
  voice: string;
  ttsSpeed: number;
  enableSubtitles: boolean;
  enableWordHighlight: boolean;
  highlightColor: string;
  highlightScale: number;
  fontSize: number;
  subtitlePosition: 'bottom' | 'center';
  watermarkUrl?: string;
}

const initialFormData: FormData = {
  scriptId: '',
  scriptTitle: '',
  nicheName: '',
  imageIntervalSeconds: 5,
  resolution: '1080p',
  voice: 'af_heart',
  ttsSpeed: 1.0,
  enableSubtitles: true,
  enableWordHighlight: true,
  highlightColor: '#68C0FF',
  highlightScale: 115,
  fontSize: 48,
  subtitlePosition: 'bottom',
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

const presetColors = [
  '#68C0FF', // blue
  '#FFD666', // yellow
  '#52C41A', // green
  '#FF85C0', // pink
  '#FFFFFF', // white
];

export default function NewVideoPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const scriptIdFromParams = searchParams.get('scriptId');

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

  useEffect(() => {
    if (scriptIdFromParams && scripts.length > 0) {
      handleScriptSelect(scriptIdFromParams);
    }
  }, [scriptIdFromParams, scripts]);

  const fetchScriptsAndNiches = async () => {
    try {
      const [scriptsRes, nichesRes] = await Promise.all([
        supabaseAdmin.from('scripts').select('*').eq('status', 'ready').order('created_at', { ascending: false }),
        supabaseAdmin.from('niches').select('*'),
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

  const handleColorChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({ ...formData, highlightColor: e.target.value });
  };

  const handleColorPreset = (color: string) => {
    setFormData({ ...formData, highlightColor: color });
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

  const validateStep3 = () => {
    if (formData.enableSubtitles && !formData.highlightColor) {
      setError('Please select a highlight color');
      return false;
    }
    setError('');
    return true;
  };

  const handleContinue = () => {
    if (currentStep === 1 && !validateStep1()) return;
    if (currentStep === 2 && !validateStep2()) return;
    if (currentStep === 3 && !validateStep3()) return;

    if (currentStep < 4) {
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
      // Create video_job in Supabase
      const videoJobId = `vid_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      const { error: createError } = await supabaseAdmin.from('video_jobs').insert({
        id: videoJobId,
        status: 'pending',
        script_id: formData.scriptId,
      });

      if (createError) {
        throw new Error(`Failed to create video job: ${createError.message}`);
      }

      // Call /api/video/start
      const startRes = await fetch('/api/video/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          videoJobId,
          scriptId: formData.scriptId,
          nicheName: formData.nicheName,
          imageIntervalSeconds: formData.imageIntervalSeconds,
          voice: formData.voice,
          ttsSpeed: formData.ttsSpeed,
          imageWidth: formData.resolution === '1080p' ? 1920 : 1280,
          imageHeight: formData.resolution === '1080p' ? 1080 : 720,
          subtitleSettings: {
            highlightColor: formData.highlightColor,
            highlightScale: formData.highlightScale,
            fontSize: formData.fontSize,
            position: formData.subtitlePosition,
          },
        }),
      });

      if (!startRes.ok) {
        const data = await startRes.json();
        throw new Error(data.error || 'Failed to start video generation');
      }

      // Redirect to status page
      router.push(`/video/${videoJobId}/status`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      setError(msg);
      setLoading(false);
    }
  };

  const progressValue = (currentStep / 4) * 100;

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-2xl space-y-6 px-4 py-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Create Video</h1>
          <p className="mt-2 text-muted-foreground">
            Generate an AI video from your script with custom settings
          </p>
        </div>

        <div className="space-y-2">
          <div className="flex justify-between text-sm font-medium">
            <span>Step {currentStep} of 4</span>
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

          {/* Step 3: Subtitle Styling */}
          {currentStep === 3 && (
            <div className="space-y-6">
              <div>
                <h2 className="text-2xl font-bold">Subtitle Styling</h2>
                <p className="text-muted-foreground">Customize subtitle appearance</p>
              </div>

              <Separator />

              <div className="space-y-4">
                <div className="flex items-center justify-between rounded-lg border p-3">
                  <label className="font-medium text-sm">Enable Subtitles</label>
                  <input
                    type="checkbox"
                    checked={formData.enableSubtitles}
                    onChange={(e) => setFormData({ ...formData, enableSubtitles: e.target.checked })}
                    className="h-4 w-4"
                  />
                </div>

                <div className="flex items-center justify-between rounded-lg border p-3">
                  <label className="font-medium text-sm">Word-by-word Highlight</label>
                  <input
                    type="checkbox"
                    checked={formData.enableWordHighlight}
                    onChange={(e) => setFormData({ ...formData, enableWordHighlight: e.target.checked })}
                    className="h-4 w-4"
                    disabled={!formData.enableSubtitles}
                  />
                </div>

                {formData.enableSubtitles && (
                  <>
                    <div>
                      <label className="text-sm font-medium">Highlight Color</label>
                      <div className="mt-2 flex gap-2">
                        {presetColors.map((color) => (
                          <button
                            key={color}
                            onClick={() => handleColorPreset(color)}
                            className={`h-8 w-8 rounded-md border-2 transition-all ${
                              formData.highlightColor === color ? 'border-gray-800' : 'border-gray-300'
                            }`}
                            style={{ backgroundColor: color }}
                            title={color}
                          />
                        ))}
                      </div>
                      <div className="mt-2 flex items-center gap-2">
                        <input
                          type="color"
                          value={formData.highlightColor}
                          onChange={handleColorChange}
                          className="h-8 w-16 rounded"
                        />
                        <input
                          type="text"
                          value={formData.highlightColor}
                          onChange={handleColorChange}
                          placeholder="#68C0FF"
                          className="w-24 rounded-md border border-input px-2 py-1 text-sm font-mono"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="text-sm font-medium">Highlight Scale</label>
                      <div className="mt-2 space-y-3">
                        <input
                          type="range"
                          min="100"
                          max="150"
                          step="1"
                          value={formData.highlightScale}
                          onChange={(e) => setFormData({ ...formData, highlightScale: parseInt(e.target.value) })}
                          className="w-full"
                        />
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-muted-foreground">100%</span>
                          <span className="text-sm font-medium">{formData.highlightScale}%</span>
                          <span className="text-xs text-muted-foreground">150%</span>
                        </div>
                        <p className="text-xs text-muted-foreground">Recommended: 115-120% for YouTube style</p>
                      </div>
                    </div>

                    <div>
                      <label className="text-sm font-medium">Font Size</label>
                      <div className="mt-2 space-y-3">
                        <input
                          type="range"
                          min="32"
                          max="72"
                          step="2"
                          value={formData.fontSize}
                          onChange={(e) => setFormData({ ...formData, fontSize: parseInt(e.target.value) })}
                          className="w-full"
                        />
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-muted-foreground">32px</span>
                          <span className="text-sm font-medium">{formData.fontSize}px</span>
                          <span className="text-xs text-muted-foreground">72px</span>
                        </div>
                      </div>
                    </div>

                    <div>
                      <label className="text-sm font-medium">Position</label>
                      <div className="mt-2 flex gap-2">
                        {(['bottom', 'center'] as const).map((pos) => (
                          <button
                            key={pos}
                            onClick={() => setFormData({ ...formData, subtitlePosition: pos })}
                            className={`rounded-md px-4 py-2 text-sm font-medium transition-colors capitalize ${
                              formData.subtitlePosition === pos
                                ? 'bg-blue-600 text-white'
                                : 'border border-input bg-background hover:bg-accent'
                            }`}
                          >
                            {pos}
                          </button>
                        ))}
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>
          )}

          {/* Step 4: Confirm & Generate */}
          {currentStep === 4 && (
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
                  <p>💬 Subtitles: <span className="font-medium">{formData.enableSubtitles ? 'Enabled' : 'Disabled'}</span></p>
                </div>
              </Card>

              <div className="flex items-center gap-3 rounded-lg border border-amber-200 bg-amber-50 p-3">
                <span className="text-lg">⏱️</span>
                <div className="text-sm">
                  <p className="font-medium">Processing will take a few minutes</p>
                  <p className="text-xs text-muted-foreground">You'll be redirected to track progress</p>
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

          {currentStep < 4 ? (
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
    </div>
  );
}
