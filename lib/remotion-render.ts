import { bundle } from '@remotion/bundler';
import { renderMedia, selectComposition } from '@remotion/renderer';
import path from 'path';
import type { SubtitleProps } from '@/remotion/SubtitleVideo';

export async function renderSubtitles(
  props: SubtitleProps,
  outputPath: string,
  durationSeconds: number
): Promise<string> {
  try {
    // Step 1: Bundle the Remotion composition
    const bundled = await bundle(
      path.join(process.cwd(), 'remotion/Root.tsx')
    );

    // Step 2: Select the composition with input props
    const composition = await selectComposition({
      serveUrl: bundled,
      id: 'Subtitles',
      inputProps: props as unknown as Record<string, unknown>,
    });

    // Step 3: Render the media
    await renderMedia({
      composition: {
        ...composition,
        durationInFrames: Math.ceil(durationSeconds * 30),
      },
      serveUrl: bundled,
      codec: 'h264',
      outputLocation: outputPath,
      inputProps: props as unknown as Record<string, unknown>,
      chromiumOptions: {
        enableMultiProcessOnLinux: true,
      },
    });

    // Step 4: Return output path
    return outputPath;
  } catch (error) {
    throw new Error(
      `Failed to render subtitles: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}
