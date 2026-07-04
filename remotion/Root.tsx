import React from 'react';
import { Composition, registerRoot } from 'remotion';
import type { AnyZodObject } from 'remotion';
import { SubtitleVideo, type SubtitleProps } from './SubtitleVideo';

const Root: React.FC = () => {
  const defaultProps: SubtitleProps = {
    scenes: [],
    totalDurationSeconds: 10,
    highlightColor: '#68C0FF',
    highlightScale: 115,
    fontSize: 48,
    position: 'bottom',
  };

  return (
    <Composition<AnyZodObject, SubtitleProps>
      id="Subtitles"
      component={SubtitleVideo}
      durationInFrames={300}
      fps={30}
      width={1920}
      height={1080}
      defaultProps={defaultProps}
    />
  );
};

registerRoot(Root);
