import { ChapterEpigraphDataSchema, type ChapterEpigraphData } from "@scaffold/contracts";

export function emptyChapterEpigraphData(
  overrides: Partial<ChapterEpigraphData> = {},
): ChapterEpigraphData {
  return ChapterEpigraphDataSchema.parse(overrides);
}
