import ffmpeg from 'fluent-ffmpeg';
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';
import ffprobeInstaller from '@ffprobe-installer/ffprobe';
import { unlink } from 'fs/promises';

ffmpeg.setFfmpegPath(ffmpegInstaller.path);
ffmpeg.setFfprobePath(ffprobeInstaller.path);

export function getVideoDuration(videoPath: string): Promise<number> {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(videoPath, (err, metadata) => {
      if (err) {
        reject(err);
        return;
      }

      const duration = metadata.format.duration;
      if (typeof duration !== 'number') {
        reject(new Error('Could not determine video duration'));
        return;
      }

      resolve(duration);
    });
  });
}

export function overlaySubtitles(
  mainVideoPath: string,
  subtitleVideoPath: string,
  outputPath: string
): Promise<string> {
  return new Promise((resolve, reject) => {
    ffmpeg(mainVideoPath)
      .input(subtitleVideoPath)
      .complexFilter('[1:v][0:v]scale2ref[sub_scaled][main];[sub_scaled]colorkey=0x000000:0.1:0.0[clean];[main][clean]overlay=0:0:shortest=1[out]')
      .outputOption('-map [out]')
      .outputOption('-map 0:a?')
      .audioCodec('copy')
      .output(outputPath)
      .on('error', (err) => {
        reject(new Error(`FFmpeg overlay error: ${err.message}`));
      })
      .on('end', () => {
        resolve(outputPath);
      })
      .run();
  });
}

export function addWatermark(
  inputPath: string,
  watermarkPath: string,
  outputPath: string
): Promise<string> {
  return new Promise((resolve, reject) => {
    ffmpeg(inputPath)
      .input(watermarkPath)
      .complexFilter(
        `[1:v]scale=200:-1,format=rgba,colorchannelmixer=aa=0.5[wm];[0:v][wm]overlay=W-w-20:H-h-20:enable='between(t,0,10)'[out]`
      )
      .outputOption('-map [out]')
      .outputOption('-map 0:a?')
      .audioCodec('copy')
      .output(outputPath)
      .on('error', (err) => {
        reject(new Error(`FFmpeg watermark error: ${err.message}`));
      })
      .on('end', () => {
        resolve(outputPath);
      })
      .run();
  });
}

export async function assembleFinalVideo(job: {
  videoJobId: string;
  modalVideoPath: string;
  subtitleVideoPath: string;
  watermarkPath?: string;
  outputPath: string;
}): Promise<string> {
  const { modalVideoPath, subtitleVideoPath, watermarkPath, outputPath } = job;

  // Generate a temporary file path for the subtitled video
  const tempPath = outputPath.replace(/\.mp4$/, '_temp.mp4');

  try {
    // Step 1: Overlay subtitles onto main video
    await overlaySubtitles(modalVideoPath, subtitleVideoPath, tempPath);

    // Step 2: Add watermark if provided, otherwise copy temp to output
    if (watermarkPath) {
      await addWatermark(tempPath, watermarkPath, outputPath);
    } else {
      // Copy temp file to output
      const { copyFile } = await import('fs/promises');
      await copyFile(tempPath, outputPath);
    }

    // Step 3: Delete temporary files
    await unlink(tempPath).catch(() => {});

    // Step 4: Return output path
    return outputPath;
  } catch (error) {
    // Cleanup temp file on error
    await unlink(tempPath).catch(() => {});
    throw error;
  }
}
