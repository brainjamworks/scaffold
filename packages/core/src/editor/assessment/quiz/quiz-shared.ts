import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { QuizSettingsSchema, type QuizSettings } from "@scaffold/contracts";

export function emptyQuizSettings(overrides: Partial<QuizSettings> = {}): QuizSettings {
  return QuizSettingsSchema.parse(overrides);
}

export function parseQuizSettings(node: ProseMirrorNode): QuizSettings {
  const parsed = QuizSettingsSchema.safeParse(node.attrs["settings"]);
  return parsed.success ? parsed.data : emptyQuizSettings();
}

export function getQuizViewId(node: ProseMirrorNode): string {
  return String(node.attrs["id"] ?? "quiz");
}

export function getQuizChildKeys(node: ProseMirrorNode): string[] {
  const keys: string[] = [];
  for (let index = 0; index < node.childCount; index += 1) {
    const child = node.child(index);
    const id = child.attrs["id"];
    keys.push(typeof id === "string" && id.length > 0 ? id : `index-${index}`);
  }
  return keys;
}

export function getQuizChildTypes(node: ProseMirrorNode): string[] {
  const types: string[] = [];
  for (let index = 0; index < node.childCount; index += 1) {
    types.push(node.child(index).type.name);
  }
  return types;
}

export function getQuizTotalPoints(node: ProseMirrorNode): number {
  let sum = 0;
  for (let index = 0; index < node.childCount; index += 1) {
    const child = node.child(index);
    const settings = child.attrs["settings"];
    const points =
      settings && typeof settings === "object" && "points" in settings
        ? Number((settings as { points: unknown }).points)
        : 0;
    sum += Number.isFinite(points) ? points : 0;
  }
  return sum;
}

export interface QuizSummary {
  childCount: number;
  childKeys: string[];
  childTypes: string[];
  isEmpty: boolean;
  quizViewId: string;
  settings: QuizSettings;
  totalPoints: number;
}

export function getQuizSummary(node: ProseMirrorNode): QuizSummary {
  const childCount = node.childCount;
  return {
    childCount,
    childKeys: getQuizChildKeys(node),
    childTypes: getQuizChildTypes(node),
    isEmpty: childCount === 0,
    quizViewId: getQuizViewId(node),
    settings: parseQuizSettings(node),
    totalPoints: getQuizTotalPoints(node),
  };
}

export interface QuizStartSummary {
  readonly passingRequirement: string | null;
  readonly questionCount: string;
  readonly submissionCadence: string;
  readonly timeLimit: string | null;
  readonly totalPoints: string | null;
}

/** Learner-facing facts that make starting a Quiz an informed commitment. */
export function getQuizStartSummary({
  childCount,
  settings,
  totalPoints,
}: {
  childCount: number;
  settings: QuizSettings;
  totalPoints: number;
}): QuizStartSummary {
  return {
    questionCount: `${childCount} ${childCount === 1 ? "question" : "questions"}`,
    totalPoints: settings.isGraded
      ? `${totalPoints} ${totalPoints === 1 ? "point" : "points"}`
      : null,
    timeLimit: settings.timer.enabled
      ? `${formatQuizDuration(settings.timer.durationSeconds)} time limit`
      : null,
    passingRequirement:
      settings.passingScore === null
        ? null
        : `Pass mark ${Math.round(settings.passingScore * 100)}%`,
    submissionCadence:
      settings.reviewTiming === "after_each_answer"
        ? "Submit each answer before continuing."
        : "Submit all answers at the end.",
  };
}

function formatQuizDuration(durationSeconds: number): string {
  const minutes = Math.floor(durationSeconds / 60);
  const seconds = durationSeconds % 60;
  const minuteLabel = `${minutes}-minute`;
  const secondLabel = `${seconds}-second`;
  if (minutes === 0) return secondLabel;
  if (seconds === 0) return minuteLabel;
  return `${minuteLabel} ${secondLabel}`;
}
