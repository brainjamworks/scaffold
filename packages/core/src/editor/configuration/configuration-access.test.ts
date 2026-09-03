import { Schema } from "@tiptap/pm/model";
import { EditorState } from "@tiptap/pm/state";
import { describe, expect, it, vi } from "vite-plus/test";
import { z } from "zod";

import type { ResolvedStableNode } from "@/document/model/identity/resolve-stable-node";

import {
  applyConfigurationDraft,
  readConfigurationDraft,
  type ConfigurationReadInput,
} from "./configuration-access";
import type { SettingsSheetApplyInput } from "./settings-sheet";

const PersistedSettingsSchema = z.object({ points: z.number().int().nonnegative() });
const EditSettingsSchema = z.object({ pointsLabel: z.string() });

describe("configuration draft access", () => {
  it("reads and validates the owner attribute directly by default", () => {
    const { target } = createFixture();

    expect(
      readConfigurationDraft({
        definition: {
          attr: "settings",
          schema: PersistedSettingsSchema,
        },
        target,
      }),
    ).toEqual({ points: 1 });
  });

  it("uses the edit schema for a transformed direct draft", () => {
    const { target } = createFixture();

    expect(
      readConfigurationDraft({
        definition: {
          attr: "settings",
          schema: PersistedSettingsSchema,
          editSchema: EditSettingsSchema,
          toDraft: (raw) => ({
            pointsLabel: `${PersistedSettingsSchema.parse(raw).points} points`,
          }),
        },
        target,
      }),
    ).toEqual({ pointsLabel: "1 points" });
  });

  it("creates a missing direct draft through the shared read operation", () => {
    const { target } = createFixture(null);
    const createInitialDraft = vi.fn(() => ({ points: 2 }));

    expect(
      readConfigurationDraft({
        definition: {
          attr: "settings",
          schema: PersistedSettingsSchema,
          createInitialDraft,
        },
        target,
      }),
    ).toEqual({ points: 2 });
    expect(createInitialDraft).toHaveBeenCalledTimes(1);
  });

  it("does not replace malformed persisted state with an initial draft", () => {
    const { target } = createFixture({ points: "invalid" });
    const createInitialDraft = vi.fn(() => ({ points: 2 }));

    expect(() =>
      readConfigurationDraft({
        definition: {
          attr: "settings",
          schema: PersistedSettingsSchema,
          createInitialDraft,
        },
        target,
      }),
    ).toThrow();
    expect(createInitialDraft).not.toHaveBeenCalled();
  });

  it("delegates owner-relative reads with the persisted and edit schemas", () => {
    const { target } = createFixture();
    const read = vi.fn((_input: ConfigurationReadInput) => ({ pointsLabel: "Child settings" }));

    const draft = readConfigurationDraft({
      definition: {
        attr: "settings",
        schema: PersistedSettingsSchema,
        editSchema: EditSettingsSchema,
        read,
      },
      target,
    });

    expect(draft).toEqual({ pointsLabel: "Child settings" });
    expect(read).toHaveBeenCalledWith({
      target,
      attr: "settings",
      schema: PersistedSettingsSchema,
      editSchema: EditSettingsSchema,
    });
  });

  it("applies directly through the existing checked settings mutation by default", () => {
    const { state, target } = createFixture();

    const result = applyConfigurationDraft({
      definition: {
        attr: "settings",
        schema: PersistedSettingsSchema,
      },
      tr: state.tr,
      target,
      value: { points: 3 },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("Expected the checked settings update to succeed.");
    expect(result.tr.doc.nodeAt(0)?.attrs["settings"]).toEqual({ points: 3 });

    expect(
      applyConfigurationDraft({
        definition: {
          attr: "settings",
          schema: PersistedSettingsSchema,
        },
        tr: state.tr,
        target,
        value: { points: -1 },
      }),
    ).toEqual({
      ok: false,
      issue: expect.objectContaining({ code: "invalid_settings_value" }),
    });
  });

  it("returns the checked missing-target-id refusal for a direct apply", () => {
    const { state, target } = createFixture({ points: 1 }, null);

    expect(
      applyConfigurationDraft({
        definition: {
          attr: "settings",
          schema: PersistedSettingsSchema,
        },
        tr: state.tr,
        target,
        value: { points: 3 },
      }),
    ).toEqual({
      ok: false,
      issue: {
        code: "missing_settings_target_id",
        message: "The settings target has no id.",
      },
    });
  });

  it("returns a custom apply hook's checked mutation result unchanged", () => {
    const { state, target } = createFixture();
    const refusal = {
      ok: false as const,
      issue: { code: "fixture_refusal", message: "Fixture refused the update." },
    };
    const apply = vi.fn((_input: SettingsSheetApplyInput) => refusal);

    const result = applyConfigurationDraft({
      definition: {
        attr: "settings",
        schema: PersistedSettingsSchema,
        editSchema: EditSettingsSchema,
        apply,
      },
      tr: state.tr,
      target,
      value: { pointsLabel: "Three points" },
    });

    expect(result).toBe(refusal);
    expect(apply).toHaveBeenCalledWith({
      tr: expect.anything(),
      target,
      attr: "settings",
      schema: PersistedSettingsSchema,
      editSchema: EditSettingsSchema,
      value: { pointsLabel: "Three points" },
    });
  });

  it("lets hook defects escape unchanged", () => {
    const { target } = createFixture();
    const defect = new Error("broken configuration read invariant");

    expect(() =>
      readConfigurationDraft({
        definition: {
          attr: "settings",
          schema: PersistedSettingsSchema,
          read: () => {
            throw defect;
          },
        },
        target,
      }),
    ).toThrow(defect);
  });
});

function createFixture(settings: unknown = { points: 1 }, nodeId: unknown = "fixture-a") {
  const schema = new Schema({
    nodes: {
      doc: { content: "fixture" },
      fixture: {
        attrs: {
          id: { default: null },
          settings: { default: null },
        },
      },
      text: {},
    },
  });
  const node = schema.node("fixture", {
    id: nodeId,
    settings,
  });
  const doc = schema.node("doc", undefined, [node]);
  const state = EditorState.create({ schema, doc });
  const target = { status: "ready", node, pos: 0 } satisfies ResolvedStableNode;

  return { state, target };
}
