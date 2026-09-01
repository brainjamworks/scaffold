import { z } from "zod";

export const PRESENTATION_SVG_COORDINATE_MIN = -1024;
export const PRESENTATION_SVG_COORDINATE_MAX = 1024;

export interface PresentationSvgPoint {
  readonly x: number;
  readonly y: number;
}

export interface ParsedPresentationSvgPathData {
  readonly start: PresentationSvgPoint;
  readonly end: PresentationSvgPoint;
}

const NUMBER_TOKEN = String.raw`[-+]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][-+]?\d+)?`;
const PATH_TOKEN = new RegExp(`[MLC]|${NUMBER_TOKEN}`, "g");
const PATH_SEPARATOR = /^[\s,]*$/;

export function parsePresentationSvgPathData(pathData: string): ParsedPresentationSvgPathData {
  const tokens = pathData.match(PATH_TOKEN) ?? [];
  const remainder = pathData.replace(PATH_TOKEN, "");
  if (!PATH_SEPARATOR.test(remainder) || tokens[0] !== "M") {
    throw new Error("Presentation path data must use only absolute M, L and C commands.");
  }

  let cursor = 0;
  let start: PresentationSvgPoint | undefined;
  let end: PresentationSvgPoint | undefined;
  let segmentCount = 0;

  while (cursor < tokens.length) {
    const command = tokens[cursor++];
    const coordinateCount = command === "M" || command === "L" ? 2 : command === "C" ? 6 : 0;
    if (coordinateCount === 0 || (command === "M" && start !== undefined)) {
      throw new Error("Presentation path data has an invalid command sequence.");
    }
    if (cursor + coordinateCount > tokens.length) {
      throw new Error("Presentation path data has an incomplete command.");
    }

    const coordinates = tokens.slice(cursor, cursor + coordinateCount).map(Number);
    if (
      coordinates.some(
        (coordinate) =>
          !Number.isFinite(coordinate) ||
          coordinate < PRESENTATION_SVG_COORDINATE_MIN ||
          coordinate > PRESENTATION_SVG_COORDINATE_MAX,
      )
    ) {
      throw new Error("Presentation path coordinates must be finite and within canvas bounds.");
    }
    cursor += coordinateCount;

    const point = {
      x: coordinates[coordinateCount - 2]!,
      y: coordinates[coordinateCount - 1]!,
    };
    if (command === "M") start = point;
    else segmentCount += 1;
    end = point;

    if (cursor < tokens.length && !["L", "C"].includes(tokens[cursor]!)) {
      throw new Error("Presentation path coordinates require an explicit command.");
    }
  }

  if (start === undefined || end === undefined || segmentCount === 0) {
    throw new Error("Presentation path data must contain a drawn segment.");
  }
  return Object.freeze({ start: Object.freeze(start), end: Object.freeze(end) });
}

export const PresentationSvgPathDataSchema = z
  .string()
  .min(1)
  .superRefine((pathData, context) => {
    try {
      parsePresentationSvgPathData(pathData);
    } catch (error) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: error instanceof Error ? error.message : "Invalid Presentation path data.",
      });
    }
  });
export type PresentationSvgPathData = z.infer<typeof PresentationSvgPathDataSchema>;
