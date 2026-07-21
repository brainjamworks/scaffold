import { TimelineDataSchema, type TimelineData } from "@scaffold/contracts";
import type { JSONContent } from "@tiptap/core";

import { createStableId } from "@/document/model/identity/stable-ids";

export const TIMELINE_NODE = "timeline";
export const TIMELINE_ITEM_NODE = "timeline_item";

const DEFAULT_EVENTS: readonly { date: string; title: string; body: string }[] = [
  {
    date: "1969",
    title: "First lunar landing",
    body: "Apollo 11 touches down at the Sea of Tranquility.",
  },
  {
    date: "1989",
    title: "World Wide Web proposed",
    body: 'Tim Berners-Lee submits "Information Management: A Proposal" at CERN.',
  },
  {
    date: "2010",
    title: "First synthetic genome",
    body: "JCVI assembles and boots a fully synthetic bacterial genome.",
  },
];

export function emptyTimelineData(overrides: Partial<TimelineData> = {}): TimelineData {
  return TimelineDataSchema.parse(overrides);
}

export function createTimelineContent(options?: Partial<TimelineData>): JSONContent {
  return {
    type: TIMELINE_NODE,
    attrs: {
      id: createStableId(),
      data: emptyTimelineData(options),
    },
    content: DEFAULT_EVENTS.map((event, index) => createTimelineItem(index, event)),
  };
}

export function createTimelineItem(
  _index: number,
  seed?: { date: string; title: string; body: string },
): JSONContent {
  const date = seed?.date ?? "";
  const title = seed?.title ?? "";
  const body = seed?.body ?? "";

  return {
    type: TIMELINE_ITEM_NODE,
    attrs: { id: createStableId() },
    content: [
      {
        type: "paragraph",
        ...(date ? { content: [{ type: "text", text: date }] } : {}),
      },
      {
        type: "paragraph",
        ...(title ? { content: [{ type: "text", text: title }] } : {}),
      },
      {
        type: "paragraph",
        ...(body ? { content: [{ type: "text", text: body }] } : {}),
      },
    ],
  };
}
