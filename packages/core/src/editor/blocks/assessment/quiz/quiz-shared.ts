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
