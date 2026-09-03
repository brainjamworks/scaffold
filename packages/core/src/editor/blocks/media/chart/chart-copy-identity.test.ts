import type { JSONContent } from "@tiptap/core";
import { EmbeddedDataIdSchema } from "@scaffold/contracts";
import { describe, expect, it } from "vite-plus/test";

import { createScaffoldApplication } from "@/composition/application/create-scaffold-application";
import { rewriteChartCopiedContent } from "./chart-copy-identity";
import { chartBlockDefinition } from "./chart-definition";

describe("Chart copy identity", () => {
  it("is explicitly registered by the mounted Chart capability", () => {
    const identityRewrites = createScaffoldApplication().capabilities.contentIdentity.rewrites;

    expect(identityRewrites.getByNodeType(chartBlockDefinition.nodeType)).toBe(
      rewriteChartCopiedContent,
    );
    expect(chartBlockDefinition).not.toHaveProperty("rewriteCopiedContent");
  });

  it("regenerates row and column owners plus every internal column reference", () => {
    const previousColumnIds = [
      EmbeddedDataIdSchema.parse("columnold001"),
      EmbeddedDataIdSchema.parse("columnold002"),
    ] as const;
    const previousRowId = EmbeddedDataIdSchema.parse("chartrowold1");
    const nextColumnIds = [
      EmbeddedDataIdSchema.parse("columnnew001"),
      EmbeddedDataIdSchema.parse("columnnew002"),
    ] as const;
    const nextRowId = EmbeddedDataIdSchema.parse("chartrownew1");
    const content: JSONContent = {
      type: "chart_block",
      attrs: {
        id: "chartnew0001",
        data: {
          kind: "chart",
          version: 1,
          chartType: "combo",
          caption: "Votes",
          data: {
            kind: "inlineTable",
            columns: [
              { id: previousColumnIds[0], label: "Fruit", valueType: "category" },
              { id: previousColumnIds[1], label: "Votes", valueType: "number" },
            ],
            rows: [
              {
                id: previousRowId,
                cells: {
                  [previousColumnIds[0]]: "Apples",
                  [previousColumnIds[1]]: 12,
                },
              },
            ],
          },
          encoding: {
            chartType: "combo",
            x: { columnId: previousColumnIds[0] },
            bars: [{ columnId: previousColumnIds[1] }],
            lines: [{ columnId: previousColumnIds[1] }],
          },
        },
      },
    };
    const snapshot = structuredClone(content);
    const allocatedIds = [...nextColumnIds, nextRowId];

    const rewritten = rewriteChartCopiedContent({
      content,
      nodeIdChanges: new Map(),
      generators: {
        createDataId: () => {
          const id = allocatedIds.shift();
          if (!id) throw new Error("unexpected Chart Data identity allocation");
          return id;
        },
      },
    });
    const data = rewritten.attrs?.["data"] as {
      data: {
        columns: Array<{ id: string }>;
        rows: Array<{ id: string; cells: Record<string, unknown> }>;
      };
      encoding: {
        x: { columnId: string };
        bars: Array<{ columnId: string }>;
        lines: Array<{ columnId: string }>;
      };
    };

    expect(data.data.columns.map(({ id }) => id)).toEqual(nextColumnIds);
    expect(data.data.rows).toEqual([
      {
        id: nextRowId,
        cells: {
          [nextColumnIds[0]]: "Apples",
          [nextColumnIds[1]]: 12,
        },
      },
    ]);
    expect(data.encoding).toMatchObject({
      x: { columnId: nextColumnIds[0] },
      bars: [{ columnId: nextColumnIds[1] }],
      lines: [{ columnId: nextColumnIds[1] }],
    });
    expect(content).toEqual(snapshot);
  });
});
