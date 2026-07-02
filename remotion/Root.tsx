import React from 'react';
import { Composition } from 'remotion';
import { SubtitleVideo, SubtitleProps } from './SubtitleVideo';

export default function Root() {
  const defaultProps: SubtitleProps = {
    scenes: [],
    totalDurationSeconds: 10,
    highlightColor: '#68C0FF',
    highlightScale: 115,
    fontSize: 48,
    position: 'bottom',
  };

  return (
    <Composition<SubtitleProps>
      id="Subtitles"
      component={SubtitleVideo}
      durationInFrames={300}
      fps={30}
      width={1920}
      height={1080}
      defaultProps={defaultProps}
    />
  );
}
