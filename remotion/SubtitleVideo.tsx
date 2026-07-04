import React from 'react';
import { useCurrentFrame, useVideoConfig, spring } from 'remotion';

export interface SubtitleProps extends Record<string, unknown> {
  scenes: { content: string; durationSeconds: number }[];
  totalDurationSeconds: number;
  highlightColor: string;
  highlightScale: number;
  fontSize: number;
  position: 'bottom' | 'center';
}

export const SubtitleVideo: React.FC<SubtitleProps> = ({
  scenes,
  totalDurationSeconds,
  highlightColor,
  highlightScale,
  fontSize,
  position,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Combine all scene texts into array of words
  const allWords = scenes
    .flatMap((scene) => scene.content.split(/\s+/).filter((w) => w.length > 0))
    .map((word) => word.trim());

  const totalWords = allWords.length;
  const currentTimeSeconds = frame / fps;

  // Calculate which word is currently being spoken
  const currentWordIndex = Math.floor(
    (currentTimeSeconds / totalDurationSeconds) * totalWords
  );

  // Show sliding window of 8 words at a time
  const windowSize = 8;
  const windowStart = Math.max(0, currentWordIndex - Math.floor(windowSize / 2));
  const windowEnd = Math.min(totalWords, windowStart + windowSize);
  const displayWords = allWords.slice(windowStart, windowEnd);

  // Spring animation for pop effect on current word
  const scaleSpring = spring({
    frame: frame - windowStart,
    fps,
    config: {
      damping: 10,
      mass: 0.5,
      overshootClamping: false,
    },
  });

  const containerTop = position === 'bottom' ? 'auto' : '50%';
  const containerBottom = position === 'bottom' ? '40px' : 'auto';
  const containerTransform = position === 'center' ? 'translateY(-50%)' : 'none';

  return (
    <div
      style={{
        position: 'absolute',
        top: containerTop,
        bottom: containerBottom,
        left: '50%',
        transform: `translateX(-50%) ${containerTransform}`,
        backgroundColor: 'rgba(0, 0, 0, 0.7)',
        padding: '16px 24px',
        borderRadius: '8px',
        maxWidth: '90%',
        textAlign: 'center',
      }}
    >
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: '8px',
          justifyContent: 'center',
          alignItems: 'center',
          fontFamily: 'Arial, sans-serif',
          fontSize: `${fontSize}px`,
          fontWeight: 'bold',
          lineHeight: '1.4',
        }}
      >
        {displayWords.map((word, idx) => {
          const isCurrentWord = windowStart + idx === currentWordIndex;
          const wordScale = isCurrentWord
            ? (highlightScale / 100) * scaleSpring
            : 1;

          return (
            <span
              key={`${windowStart}-${idx}`}
              style={{
                color: isCurrentWord ? highlightColor : 'white',
                transform: `scale(${wordScale})`,
                transition: isCurrentWord ? 'none' : 'color 0.1s ease-out',
                transformOrigin: 'center',
              }}
            >
              {word}
            </span>
          );
        })}
      </div>
    </div>
  );
};
