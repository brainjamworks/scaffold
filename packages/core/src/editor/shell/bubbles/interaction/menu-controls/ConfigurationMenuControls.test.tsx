// @vitest-environment happy-dom

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Editor, Node } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { z } from "zod";

import type { ConfigurationRead } from "@/editor/configuration/configuration-access";
import type { SettingsSheetApply } from "@/editor/configuration/settings-sheet";

import { ConfigurationMenuControls } from "./ConfigurationMenuControls";

const TARGET_ID = "quickmenu001";
const PersistedSchema = z.object({ persisted: z.boolean() });
const LogicalSchema = z.object({
  question: z.object({ enabled: z.boolean(), label: z.string() }),
});
const controls = [
  {
    kind: "boolean" as const,
    name: "question.enabled",
    label: "Enabled",
    presentation: "icon-toggle" as const,
  },
];

const TestConfigurationMenuNode = Node.create({
  name: "test_configuration_menu_block",
  group: "block",
  atom: true,
  addAttributes() {
    return {
      id: { default: null },
      settings: { default: { persisted: false } },
    };
  },
  renderHTML({ HTMLAttributes }) {
    return ["div", HTMLAttributes];
  },
});

const editors: Editor[] = [];

afterEach(() => {
  for (const editor of editors.splice(0)) editor.destroy();
  cleanup();
});

describe("ConfigurationMenuControls", () => {
  it("reads and applies the owner attribute directly when no hooks are registered", async () => {
    const editor = createEditor();
    const dispatch = vi.spyOn(editor.view, "dispatch");

    render(
      <ConfigurationMenuControls
        editor={editor}
        nodeType="test_configuration_menu_block"
        pos={0}
        targetId={TARGET_ID}
        attr="settings"
        schema={PersistedSchema}
        controls={[
          {
            kind: "boolean",
            name: "persisted",
            label: "Persisted",
            presentation: "icon-toggle",
          },
        ]}
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: "Persisted (off)" }));

    await waitFor(() => {
      expect(editor.state.doc.nodeAt(0)?.attrs["settings"]).toEqual({ persisted: true });
    });
    expect(dispatch).toHaveBeenCalledTimes(1);
  });

  it("renders from an owner-relative logical draft", () => {
    const editor = createEditor();
    const read = vi.fn<ConfigurationRead>(() => ({
      question: { enabled: true, label: "Rendered draft" },
    }));

    renderControls({ editor, read, apply: successfulApply() });

    expect(screen.getByRole("button", { name: "Enabled (on)" })).toBeInTheDocument();
    expect(read).toHaveBeenCalledWith(
      expect.objectContaining({
        attr: "settings",
        schema: PersistedSchema,
        editSchema: LogicalSchema,
        target: expect.objectContaining({ pos: 0 }),
      }),
    );
  });

  it("re-reads the latest logical draft before custom apply and dispatches once", async () => {
    const editor = createEditor();
    let logicalDraft = {
      question: { enabled: false, label: "Rendered draft" },
    };
    const read = vi.fn<ConfigurationRead>(() => logicalDraft);
    const apply = successfulApply();

    renderControls({ editor, read, apply });
    logicalDraft = {
      question: { enabled: false, label: "Latest draft" },
    };
    const dispatch = vi.spyOn(editor.view, "dispatch");

    await userEvent.click(screen.getByRole("button", { name: "Enabled (off)" }));

    await waitFor(() => expect(apply).toHaveBeenCalledTimes(1));
    expect(read.mock.calls.length).toBeGreaterThanOrEqual(2);
    expect(apply).toHaveBeenCalledWith(
      expect.objectContaining({
        value: {
          question: { enabled: true, label: "Latest draft" },
        },
      }),
    );
    expect(dispatch).toHaveBeenCalledTimes(1);
  });

  it("does not dispatch when custom apply returns a checked refusal", async () => {
    const editor = createEditor();
    const read: ConfigurationRead = () => ({
      question: { enabled: false, label: "Current draft" },
    });
    const apply = vi.fn<SettingsSheetApply>(() => ({
      ok: false as const,
      issue: { code: "fixture_refusal", message: "Fixture refused the update." },
    }));

    renderControls({ editor, read, apply });
    const dispatch = vi.spyOn(editor.view, "dispatch");

    await userEvent.click(screen.getByRole("button", { name: "Enabled (off)" }));

    expect(apply).toHaveBeenCalledTimes(1);
    expect(dispatch).not.toHaveBeenCalled();
  });
});

function createEditor() {
  const editor = new Editor({
    extensions: [StarterKit, TestConfigurationMenuNode],
    content: {
      type: "doc",
      content: [
        {
          type: "test_configuration_menu_block",
          attrs: { id: TARGET_ID, settings: { persisted: false } },
        },
      ],
    },
  });
  editors.push(editor);
  return editor;
}

function successfulApply() {
  return vi.fn<SettingsSheetApply>(({ tr, target, value }) => ({
    ok: true as const,
    tr: tr.setNodeMarkup(target.pos, undefined, {
      ...target.node.attrs,
      settings: value,
    }),
  }));
}

function renderControls({
  editor,
  read,
  apply,
}: {
  editor: Editor;
  read: ConfigurationRead;
  apply: SettingsSheetApply;
}) {
  render(
    <ConfigurationMenuControls
      editor={editor}
      nodeType="test_configuration_menu_block"
      pos={0}
      targetId={TARGET_ID}
      attr="settings"
      schema={PersistedSchema}
      editSchema={LogicalSchema}
      read={read}
      apply={apply}
      controls={controls}
    />,
  );
}
