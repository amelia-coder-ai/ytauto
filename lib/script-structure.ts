export type SceneType = "hook" | "intro" | "section" | "transition" | "outro";

export interface SceneTemplate {
  scene_type: SceneType;
  title: string;
  duration_seconds: number;
  notes: string;
}

const WORDS_PER_MINUTE = 130;

/** Average speaking pace = 130 words per minute. */
export function estimateWordCount(durationSeconds: number): number {
  return Math.round((durationSeconds / 60) * WORDS_PER_MINUTE);
}

export function getSceneStructure(durationMinutes: number): SceneTemplate[] {
  if (durationMinutes === 10) return structure10Min();
  if (durationMinutes === 20) return structure20Min();
  if (durationMinutes === 30) return structure30Min();
  return structureCustom(durationMinutes);
}

function structure10Min(): SceneTemplate[] {
  return [
    {
      scene_type: "hook",
      title: "Hook",
      duration_seconds: 30,
      notes: "Open with a bold question or surprising stat to stop the scroll.",
    },
    {
      scene_type: "intro",
      title: "Intro",
      duration_seconds: 60,
      notes: "State the video promise and why it matters to the viewer.",
    },
    {
      scene_type: "section",
      title: "Section 1",
      duration_seconds: 120,
      notes: "Introduce the first core idea with a concrete example.",
    },
    {
      scene_type: "section",
      title: "Section 2",
      duration_seconds: 120,
      notes: "Build on Section 1 and add depth or a contrasting angle.",
    },
    {
      scene_type: "section",
      title: "Section 3",
      duration_seconds: 120,
      notes: "Deliver the payoff — solution, insight, or actionable takeaway.",
    },
    {
      scene_type: "outro",
      title: "Outro",
      duration_seconds: 90,
      notes: "Recap the key takeaway and give a clear call to action.",
    },
  ];
}

function structure20Min(): SceneTemplate[] {
  return [
    {
      scene_type: "hook",
      title: "Hook",
      duration_seconds: 45,
      notes: "Open with a bold question or surprising stat to stop the scroll.",
    },
    {
      scene_type: "intro",
      title: "Intro",
      duration_seconds: 90,
      notes: "State the video promise, audience benefit, and roadmap.",
    },
    {
      scene_type: "section",
      title: "Section 1",
      duration_seconds: 180,
      notes: "Lay the foundation — context, problem framing, or first key concept.",
    },
    {
      scene_type: "section",
      title: "Section 2",
      duration_seconds: 180,
      notes: "Expand with evidence, examples, or a step-by-step breakdown.",
    },
    {
      scene_type: "section",
      title: "Section 3",
      duration_seconds: 180,
      notes: "Deepen the argument with nuance, data, or a mini case study.",
    },
    {
      scene_type: "section",
      title: "Section 4",
      duration_seconds: 180,
      notes: "Introduce a twist, common mistake, or advanced insight.",
    },
    {
      scene_type: "transition",
      title: "Midpoint Recap",
      duration_seconds: 60,
      notes: "Summarize progress so far and tease what comes next.",
    },
    {
      scene_type: "section",
      title: "Section 5",
      duration_seconds: 180,
      notes: "Deliver the climax — full solution, framework, or master tip.",
    },
    {
      scene_type: "outro",
      title: "Outro",
      duration_seconds: 120,
      notes: "Recap key points and end with a strong call to action.",
    },
  ];
}

function structure30Min(): SceneTemplate[] {
  return [
    {
      scene_type: "hook",
      title: "Hook",
      duration_seconds: 60,
      notes: "Open with a bold question or surprising stat to stop the scroll.",
    },
    {
      scene_type: "intro",
      title: "Intro",
      duration_seconds: 120,
      notes: "State the video promise, who it's for, and what they'll learn.",
    },
    {
      scene_type: "section",
      title: "Problem Setup",
      duration_seconds: 180,
      notes: "Define the problem clearly — pain points, stakes, and why now.",
    },
    {
      scene_type: "section",
      title: "Section 1",
      duration_seconds: 240,
      notes: "First major pillar — concept, framework, or step.",
    },
    {
      scene_type: "section",
      title: "Section 2",
      duration_seconds: 240,
      notes: "Second pillar — build depth with examples or demonstrations.",
    },
    {
      scene_type: "section",
      title: "Section 3",
      duration_seconds: 240,
      notes: "Third pillar — address objections or common pitfalls.",
    },
    {
      scene_type: "section",
      title: "Section 4",
      duration_seconds: 240,
      notes: "Fourth pillar — advanced tactics or real-world application.",
    },
    {
      scene_type: "section",
      title: "Section 5",
      duration_seconds: 240,
      notes: "Fifth pillar — tie concepts together into a cohesive system.",
    },
    {
      scene_type: "transition",
      title: "Midpoint Recap",
      duration_seconds: 90,
      notes: "Summarize the journey so far and pivot to practical application.",
    },
    {
      scene_type: "section",
      title: "Case Study",
      duration_seconds: 180,
      notes: "Walk through a real example showing the framework in action.",
    },
    {
      scene_type: "section",
      title: "Action Steps",
      duration_seconds: 180,
      notes: "Give the viewer a clear, numbered plan they can follow today.",
    },
    {
      scene_type: "outro",
      title: "Outro",
      duration_seconds: 120,
      notes: "Recap the transformation and end with a memorable call to action.",
    },
  ];
}

/**
 * Custom durations: ~1 scene per 3 minutes, always Hook → numbered Sections → Outro.
 * Hook and outro durations scale from the 10-minute template; middle time splits evenly.
 */
function structureCustom(durationMinutes: number): SceneTemplate[] {
  const safeMinutes = Math.max(1, durationMinutes);
  const totalSeconds = safeMinutes * 60;
  const totalScenes = Math.max(3, Math.round(safeMinutes / 3));
  const middleCount = Math.max(1, totalScenes - 2);

  const hookSeconds = Math.round(totalSeconds * (30 / 540));
  const outroSeconds = Math.round(totalSeconds * (90 / 540));
  const middleTotal = totalSeconds - hookSeconds - outroSeconds;
  const baseSectionSeconds = Math.floor(middleTotal / middleCount);
  const remainder = middleTotal - baseSectionSeconds * middleCount;

  const scenes: SceneTemplate[] = [
    {
      scene_type: "hook",
      title: "Hook",
      duration_seconds: hookSeconds,
      notes: "Open with a bold question or surprising stat to stop the scroll.",
    },
  ];

  for (let i = 1; i <= middleCount; i++) {
    const extra = i <= remainder ? 1 : 0;
    scenes.push({
      scene_type: "section",
      title: `Section ${i}`,
      duration_seconds: baseSectionSeconds + extra,
      notes: `Deliver key point ${i} with examples and clear transitions.`,
    });
  }

  scenes.push({
    scene_type: "outro",
    title: "Outro",
    duration_seconds: outroSeconds,
    notes: "Recap the key takeaway and give a clear call to action.",
  });

  return scenes;
}
