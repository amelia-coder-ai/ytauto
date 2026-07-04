declare module 'fluent-ffmpeg' {
  import { Stream } from 'stream';

  interface FfmpegCommand {
    input(input: string | Stream): FfmpegCommand;
    output(output: string): FfmpegCommand;
    on(event: string, callback: (...args: any[]) => void): FfmpegCommand;
    run(): void;
    filterComplex(filters: string | any[], map?: any[]): FfmpegCommand;
    audioCodec(codec: string): FfmpegCommand;
    videoCodec(codec: string): FfmpegCommand;
    size(size: string): FfmpegCommand;
    fps(fps: number): FfmpegCommand;
    outputOptions(options: string | string[]): FfmpegCommand;
    inputOptions(options: string | string[]): FfmpegCommand;
    seek(time: string | number): FfmpegCommand;
    duration(time: string | number): FfmpegCommand;
    format(format: string): FfmpegCommand;
    clone(): FfmpegCommand;
    mergeToFile(filename: string, tmpdir: string): FfmpegCommand;
    save(filename: string): FfmpegCommand;
  }

  interface FfprobeData {
    format: {
      duration?: number;
      size?: number;
      bit_rate?: number;
      format_name?: string;
      [key: string]: unknown;
    };
    streams: unknown[];
    [key: string]: unknown;
  }

  interface FfmpegStatic {
    (input?: string | Stream): FfmpegCommand;
    setFfmpegPath(path: string): void;
    setFfprobePath(path: string): void;
    ffprobe(path: string, callback: (err: Error | null, data: FfprobeData) => void): void;
  }

  const ffmpeg: FfmpegStatic;
  export default ffmpeg;
}