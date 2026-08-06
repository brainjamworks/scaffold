// @vitest-environment happy-dom

import { Editor } from "@tiptap/core";
import UniqueID from "@tiptap/extension-unique-id";
import type { JSONContent } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { describe, expect, it } from "vite-plus/test";

import { COURSE_BLOCK_CONTENT } from "@/document/model/content-model/content-groups";
import { ExtendedParagraph } from "@/editor/rich-text/model/paragraph";
import { AudioBlockNode } from "./audio-block-node";
import { ImageBlockNode } from "./image-block-node";
import { ChartRuntimeExtension } from "./chart/chart-runtime-extension";
import { AudioBlockAttrsSchema, ImageBlockAttrsSchema } from "@scaffold/contracts";
import { ChartBlockDataSchema } from "@/schemas/shared";

function makeEditor() {
  return new Editor({
    extensions: [
      StarterKit.configure({ undoRedo: false, paragraph: false }),
      UniqueID.configure({ attributeName: "id", types: "all", updateDocument: false }),
      ExtendedParagraph,
      ImageBlockNode,
      AudioBlockNode,
      ChartRuntimeExtension,
    ],
  });
}

describe("media nodes", () => {
  it("marks catalog media blocks as course blocks, not text content", () => {
    const editor = makeEditor();

    expect(editor.schema.nodes["image_block"]?.spec.group).toBe(`block ${COURSE_BLOCK_CONTENT}`);
    expect(editor.schema.nodes["audio_block"]?.spec.group).toBe(`block ${COURSE_BLOCK_CONTENT}`);
    expect(editor.schema.nodes["chart_block"]?.spec.group).toBe(`block ${COURSE_BLOCK_CONTENT}`);

    editor.destroy();
  });

  it("image_block round-trips managed-mode attrs", () => {
    const editor = makeEditor();
    editor.commands.setContent({
      type: "doc",
      content: [
        {
          type: "image_block",
          attrs: {
            id: "imgblk_00001",
            data: { mode: "managed", mediaId: "moodle:file/asset-42", alt: "A picture" },
          },
        },
      ],
    });
    const json = editor.getJSON();
    const top = json.content?.[0] as JSONContent | undefined;
    expect(top?.attrs?.["id"]).toBe("imgblk_00001");
    expect(top?.attrs?.["data"]).toMatchObject({
      mode: "managed",
      mediaId: "moodle:file/asset-42",
      alt: "A picture",
    });
    editor.destroy();
  });

  it("audio_block round-trips external-mode attrs", () => {
    const editor = makeEditor();
    editor.commands.setContent({
      type: "doc",
      content: [
        {
          type: "audio_block",
          attrs: {
            id: "audblk_00001",
            data: {
              mode: "external",
              src: "https://example.com/a.mp3",
              title: "Sample",
            },
          },
        },
      ],
    });
    const json = editor.getJSON();
    const top = json.content?.[0] as JSONContent | undefined;
    expect(top?.attrs?.["id"]).toBe("audblk_00001");
    expect(top?.attrs?.["data"]).toMatchObject({
      mode: "external",
      src: "https://example.com/a.mp3",
    });
    editor.destroy();
  });

  it("rejects unsafe external image and audio URLs at schema boundaries", () => {
    expect(() =>
      ImageBlockAttrsSchema.parse({
        mode: "external",
        src: "javascript:alert(1)",
      }),
    ).toThrow(/URL must use http or https/);
    expect(() =>
      AudioBlockAttrsSchema.parse({
        mode: "external",
        src: "data:audio/mpeg;base64,abc",
      }),
    ).toThrow(/URL must use http or https/);
  });

  it("chart_block round-trips structured chart data", () => {
    const editor = makeEditor();
    const data = {
      kind: "chart",
      version: 1,
      chartType: "bar",
      caption: "Votes",
      showLegend: false,
      data: {
        kind: "inlineTable",
        columns: [
          { id: "column_00001", label: "Fruit", valueType: "category" },
          { id: "column_00002", label: "Votes", valueType: "number" },
        ],
        rows: [
          {
            id: "rowdata_0001",
            cells: { column_00001: "Apples", column_00002: 12 },
          },
        ],
      },
      encoding: {
        chartType: "bar",
        orientation: "vertical",
        stacked: false,
        x: { columnId: "column_00001" },
        y: [{ columnId: "column_00002" }],
      },
    };
    editor.commands.setContent({
      type: "doc",
      content: [{ type: "chart_block", attrs: { id: "chartb_00001", data } }],
    });
    const top = editor.getJSON().content?.[0] as JSONContent | undefined;
    expect(top?.attrs?.["id"]).toBe("chartb_00001");
    expect(ChartBlockDataSchema.parse(top?.attrs?.["data"])).toEqual(
      ChartBlockDataSchema.parse(data),
    );
    editor.destroy();
  });

  it("seeds bare chart blocks with sample data", () => {
    const editor = makeEditor();
    editor.commands.setContent({
      type: "doc",
      content: [{ type: "chart_block" }],
    });

    const top = editor.getJSON().content?.[0] as JSONContent | undefined;
    const data = ChartBlockDataSchema.parse(top?.attrs?.["data"]);
    expect(data).toMatchObject({
      kind: "chart",
      chartType: "bar",
      data: {
        columns: [
          { label: "Category", valueType: "category" },
          { label: "Value", valueType: "number" },
        ],
      },
    });
    if (data.encoding.chartType !== "bar") throw new Error("Expected bar encoding");
    expect(data.encoding.x.columnId).toBe(data.data.columns[0]?.id);
    expect(data.encoding.y[0]?.columnId).toBe(data.data.columns[1]?.id);
    editor.destroy();
  });
});
