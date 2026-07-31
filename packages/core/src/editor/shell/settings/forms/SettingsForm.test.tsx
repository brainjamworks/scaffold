// @vitest-environment happy-dom

import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useEffect } from "react";
import { useForm, type FieldValues } from "react-hook-form";
import { describe, expect, it, vi } from "vite-plus/test";
import { z } from "zod";

import type {
  SettingsFormActionEvent,
  SettingsFormDefinition,
} from "@/editor/configuration/settings-sheet";

import { SettingsForm, SettingsFormActions } from "./SettingsForm";

interface TypedSettingsValues {
  title: string;
}

function SettingsFormHarness({
  definition,
  onAction,
}: {
  definition: SettingsFormDefinition;
  onAction?: (event: SettingsFormActionEvent) => void;
}) {
  const form = useForm<FieldValues>({
    defaultValues: {
      mode: "basic",
      title: "Existing title",
      notes: "Existing notes",
    },
  });

  return <SettingsForm definition={definition} form={form} {...(onAction ? { onAction } : {})} />;
}

function TypedSettingsFormHarness() {
  const form = useForm<TypedSettingsValues>({
    defaultValues: { title: "Typed title" },
  });

  return (
    <SettingsForm
      definition={{
        sections: [
          {
            id: "content",
            title: "Content",
            items: [{ kind: "text", name: "title", label: "Typed title" }],
          },
        ],
      }}
      form={form}
    />
  );
}

function TypedActionSettingsFormHarness({
  onAction,
}: {
  onAction: (event: SettingsFormActionEvent<"duplicate" | "restore">) => void;
}) {
  const form = useForm<TypedSettingsValues>({
    defaultValues: { title: "Typed title" },
  });
  const definition: SettingsFormDefinition<"duplicate" | "restore"> = {
    sections: [
      {
        id: "content",
        title: "Content",
        items: [{ kind: "text", name: "title", label: "Typed title" }],
        actions: [{ id: "duplicate", label: "Duplicate section" }],
      },
    ],
    footerActions: [{ id: "restore", label: "Restore defaults", variant: "danger" }],
  };

  return (
    <>
      <SettingsForm definition={definition} form={form} onAction={onAction} />
      <SettingsFormActions
        actions={definition.footerActions}
        location="footer"
        onAction={onAction}
      />
    </>
  );
}

function DuplicateSettingsFormsHarness() {
  const firstForm = useForm<TypedSettingsValues>({
    defaultValues: { title: "First title" },
  });
  const secondForm = useForm<TypedSettingsValues>({
    defaultValues: { title: "Second title" },
  });
  const definition: SettingsFormDefinition = {
    sections: [
      {
        id: "content",
        title: "Content",
        description: "Section guidance",
        items: [
          {
            kind: "text",
            name: "title",
            label: "Title",
            description: "Field guidance",
          },
        ],
      },
    ],
  };

  useEffect(() => {
    firstForm.setError("title", { type: "test", message: "First title error" });
    secondForm.setError("title", { type: "test", message: "Second title error" });
  }, [firstForm, secondForm]);

  return (
    <>
      <div data-testid="first-settings-form">
        <SettingsForm definition={definition} form={firstForm} />
      </div>
      <div data-testid="second-settings-form">
        <SettingsForm definition={definition} form={secondForm} />
      </div>
    </>
  );
}

function DuplicatePresentationSettingsFormsHarness() {
  const firstForm = useForm<FieldValues>({
    defaultValues: { mode: "practice", layout: "editorial", accentColor: "#161d77" },
  });
  const secondForm = useForm<FieldValues>({
    defaultValues: { mode: "practice", layout: "editorial", accentColor: "#161d77" },
  });
  const definition: SettingsFormDefinition = {
    sections: [
      {
        id: "appearance",
        title: "Appearance",
        items: [
          {
            kind: "select",
            name: "mode",
            label: "Mode",
            description: "Choose a mode.",
            presentation: "segmented",
            options: [
              { value: "practice", label: "Practice" },
              { value: "graded", label: "Graded" },
            ],
          },
          {
            kind: "select",
            name: "layout",
            label: "Layout",
            description: "Choose a layout.",
            status: { label: "Custom", variant: "info" },
            presentation: "cards",
            options: [
              {
                value: "editorial",
                label: "Editorial",
                description: "Serif headings and spacious content.",
                swatches: ["#ffffff", "#161d77"],
              },
              { value: "compact", label: "Compact", description: "Dense content." },
            ],
          },
          {
            kind: "color",
            name: "accentColor",
            label: "Accent colour",
            description: "Choose an accent.",
            palette: [{ value: "#161d77", label: "Navy" }],
            fallbackColor: "#ffffff",
            resetLabel: "Use inherited",
            resetAriaLabel: "Use inherited accent colour",
            customHint: "Enter an accent hex colour, for example #161d77.",
          },
        ],
      },
    ],
  };

  useEffect(() => {
    firstForm.setError("mode", { type: "test", message: "First mode error" });
    firstForm.setError("layout", { type: "test", message: "First layout error" });
    firstForm.setError("accentColor", { type: "test", message: "First colour error" });
    secondForm.setError("mode", { type: "test", message: "Second mode error" });
    secondForm.setError("layout", { type: "test", message: "Second layout error" });
    secondForm.setError("accentColor", { type: "test", message: "Second colour error" });
  }, [firstForm, secondForm]);

  return (
    <>
      <div data-testid="first-presentation-settings-form">
        <SettingsForm definition={definition} form={firstForm} />
      </div>
      <div data-testid="second-presentation-settings-form">
        <SettingsForm definition={definition} form={secondForm} />
      </div>
    </>
  );
}

describe("SettingsForm", () => {
  it("dispatches mixed scalar and collection items in order and reports a missing target", () => {
    const definition: SettingsFormDefinition = {
      sections: [
        {
          id: "content",
          title: "Content",
          items: [
            { kind: "text", name: "title", label: "Before collection" },
            {
              kind: "directChildCollection",
              id: "images",
              childNodeType: "fixture_image",
              attr: "data",
              schema: z.object({ caption: z.string() }),
              initialValue: { caption: "" },
              itemLabel: "Image",
              addLabel: "Add image",
              fields: [{ kind: "text", name: "caption", label: "Caption" }],
            },
            { kind: "textarea", name: "notes", label: "After collection" },
          ],
        },
      ],
    };

    render(<SettingsFormHarness definition={definition} />);

    const before = screen.getByLabelText("Before collection");
    const missingTarget = screen.getByRole("alert");
    const after = screen.getByLabelText("After collection");
    expect(missingTarget).toHaveTextContent(
      "Image collection is unavailable because its authoring target is missing.",
    );
    expect(before.compareDocumentPosition(missingTarget) & Node.DOCUMENT_POSITION_FOLLOWING).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
    expect(missingTarget.compareDocumentPosition(after) & Node.DOCUMENT_POSITION_FOLLOWING).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
  });

  it("reports a missing document target for document-backed scalar items", () => {
    render(
      <SettingsFormHarness
        definition={{
          sections: [
            {
              id: "content",
              title: "Content",
              items: [
                {
                  kind: "richText",
                  name: "caption",
                  label: "Shared caption",
                },
              ],
            },
          ],
        }}
      />,
    );

    expect(screen.getByRole("alert")).toHaveTextContent(
      "Shared caption is unavailable because its document target is missing.",
    );
  });

  it("accepts and updates a strongly typed form consumer", async () => {
    render(<TypedSettingsFormHarness />);

    const title = screen.getByLabelText("Typed title");
    expect(title).toHaveValue("Typed title");

    await userEvent.clear(title);
    await userEvent.type(title, "Updated typed title");

    expect(title).toHaveValue("Updated typed title");
  });

  it("renders shared section and footer actions and emits typed action events", async () => {
    const onAction = vi.fn<(event: SettingsFormActionEvent<"duplicate" | "restore">) => void>();

    render(<TypedActionSettingsFormHarness onAction={onAction} />);

    const sectionAction = screen.getByRole("button", { name: "Duplicate section" });
    const footerAction = screen.getByRole("button", { name: "Restore defaults" });

    expect(sectionAction).toHaveClass("sc-button");
    expect(sectionAction).toHaveAttribute("data-size", "sm");
    expect(sectionAction).toHaveAttribute("data-variant", "ghost");
    expect(footerAction).toHaveClass("sc-button");
    expect(footerAction).toHaveAttribute("data-size", "md");
    expect(footerAction).toHaveAttribute("data-variant", "danger");

    await userEvent.click(sectionAction);
    await userEvent.click(footerAction);

    expect(onAction).toHaveBeenNthCalledWith(1, {
      actionId: "duplicate",
      sectionId: "content",
    });
    expect(onAction).toHaveBeenNthCalledWith(2, { actionId: "restore" });
  });

  it("keeps disabled declarative actions inert", async () => {
    const onAction = vi.fn();

    render(
      <SettingsFormHarness
        definition={{
          sections: [
            {
              id: "content",
              title: "Content",
              items: [],
              actions: [{ id: "unavailable", label: "Unavailable action", disabled: true }],
            },
          ],
        }}
        onAction={onAction}
      />,
    );

    const action = screen.getByRole("button", { name: "Unavailable action" });
    expect(action).toBeDisabled();
    await userEvent.click(action);
    expect(onAction).not.toHaveBeenCalled();
  });

  it("scopes section and field accessibility ids to each mounted form", async () => {
    render(<DuplicateSettingsFormsHarness />);

    const formRoots = [
      screen.getByTestId("first-settings-form"),
      screen.getByTestId("second-settings-form"),
    ];
    const ids: string[] = [];

    for (const formRoot of formRoots) {
      const trigger = formRoot.querySelector<HTMLButtonElement>(
        'button[data-state="open"][aria-expanded="true"]',
      );
      const region = formRoot.querySelector<HTMLElement>('[role="region"]');
      const input = formRoot.querySelector<HTMLInputElement>('input[name="title"]');
      const alert = await screen.findByText(
        formRoot.dataset["testid"] === "first-settings-form"
          ? "First title error"
          : "Second title error",
      );

      expect(trigger).not.toBeNull();
      expect(region).not.toBeNull();
      expect(input).not.toBeNull();
      if (!trigger || !region || !input) throw new Error("Expected complete settings form markup");

      const regionLabelledBy = region.getAttribute("aria-labelledby");
      const regionDescribedBy = region.getAttribute("aria-describedby");
      const fieldDescribedBy = input.getAttribute("aria-describedby")?.split(" ") ?? [];

      expect(regionLabelledBy).toBe(trigger.id);
      expect(document.getElementById(regionLabelledBy ?? "")).toBe(trigger);
      expect(document.getElementById(regionDescribedBy ?? "")?.textContent).toBe(
        "Section guidance",
      );
      expect(fieldDescribedBy).toHaveLength(2);
      expect(document.getElementById(fieldDescribedBy[0] ?? "")?.textContent).toBe(
        "Field guidance",
      );
      expect(document.getElementById(fieldDescribedBy[1] ?? "")).toBe(alert);

      ids.push(trigger.id, region.id, regionDescribedBy ?? "", input.id, ...fieldDescribedBy);
    }

    expect(ids.every(Boolean)).toBe(true);
    expect(new Set(ids)).toHaveLength(ids.length);
  });

  it("scopes segmented, card, status, and colour-field ids to each mounted form", async () => {
    render(<DuplicatePresentationSettingsFormsHarness />);

    const formRoots = [
      screen.getByTestId("first-presentation-settings-form"),
      screen.getByTestId("second-presentation-settings-form"),
    ];
    const ids: string[] = [];

    for (const formRoot of formRoots) {
      const mode = within(formRoot).getByRole("radiogroup", { name: "Mode" });
      const layout = within(formRoot).getByRole("radiogroup", { name: "Layout" });
      const accent = within(formRoot).getByRole("group", { name: "Accent colour" });

      for (const group of [mode, layout, accent]) {
        const labelledBy = group.getAttribute("aria-labelledby");
        const describedBy = group.getAttribute("aria-describedby")?.split(" ") ?? [];

        expect(group.id).not.toBe("");
        expect(labelledBy).not.toBeNull();
        expect(document.getElementById(labelledBy ?? "")).not.toBeNull();
        expect(describedBy).toHaveLength(group === layout ? 3 : 2);
        expect(describedBy.every((id) => document.getElementById(id))).toBe(true);

        ids.push(group.id, labelledBy ?? "", ...describedBy);
      }

      for (const option of within(formRoot).getAllByRole("radio", {
        name: /Editorial|Compact/,
      })) {
        const labelledBy = option.getAttribute("aria-labelledby");
        const describedBy = option.getAttribute("aria-describedby");

        expect(document.getElementById(labelledBy ?? "")).not.toBeNull();
        expect(document.getElementById(describedBy ?? "")).not.toBeNull();
        ids.push(labelledBy ?? "", describedBy ?? "");
      }
    }

    expect(ids.every(Boolean)).toBe(true);
    expect(new Set(ids)).toHaveLength(ids.length);
  });

  it("renders fields from the first declared section by default", () => {
    render(
      <SettingsFormHarness
        definition={{
          sections: [
            {
              id: "content",
              title: "Content",
              items: [{ kind: "text", name: "title", label: "Title" }],
            },
            {
              id: "advanced",
              title: "Advanced",
              items: [{ kind: "textarea", name: "notes", label: "Notes" }],
            },
          ],
        }}
      />,
    );

    expect(screen.getByRole("button", { name: "Content" })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
    expect(screen.getByRole("button", { name: "Advanced" })).toHaveAttribute(
      "aria-expanded",
      "false",
    );
    expect(screen.getByLabelText("Title")).toHaveValue("Existing title");
    expect(screen.queryByLabelText("Notes")).toBeNull();
  });

  it("opens the sections selected by the definition", () => {
    render(
      <SettingsFormHarness
        definition={{
          defaultOpenSections: ["advanced"],
          sections: [
            {
              id: "content",
              title: "Content",
              items: [{ kind: "text", name: "title", label: "Title" }],
            },
            {
              id: "advanced",
              title: "Advanced",
              items: [{ kind: "textarea", name: "notes", label: "Notes" }],
            },
          ],
        }}
      />,
    );

    expect(screen.getByRole("button", { name: "Content" })).toHaveAttribute(
      "aria-expanded",
      "false",
    );
    expect(screen.getByRole("button", { name: "Advanced" })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
    expect(screen.queryByLabelText("Title")).toBeNull();
    expect(screen.getByLabelText("Notes")).toHaveValue("Existing notes");
  });

  it("updates conditional field visibility from the shared form state", async () => {
    render(
      <SettingsFormHarness
        definition={{
          sections: [
            {
              id: "content",
              title: "Content",
              items: [
                {
                  kind: "select",
                  name: "mode",
                  label: "Mode",
                  options: [
                    { value: "basic", label: "Basic" },
                    { value: "advanced", label: "Advanced" },
                  ],
                },
                {
                  kind: "textarea",
                  name: "notes",
                  label: "Notes",
                  visibleWhen: { name: "mode", equals: "advanced" },
                },
              ],
            },
          ],
        }}
      />,
    );

    expect(screen.queryByLabelText("Notes")).toBeNull();
    await userEvent.selectOptions(screen.getByLabelText("Mode"), "advanced");
    expect(screen.getByLabelText("Notes")).toHaveValue("Existing notes");
  });

  it("updates colour-field visibility from segmented form state", async () => {
    render(
      <SettingsFormHarness
        definition={{
          sections: [
            {
              id: "appearance",
              title: "Appearance",
              items: [
                {
                  kind: "select",
                  name: "mode",
                  label: "Mode",
                  presentation: "segmented",
                  options: [
                    { value: "basic", label: "Basic" },
                    { value: "advanced", label: "Advanced" },
                  ],
                },
                {
                  kind: "color",
                  name: "accentColor",
                  label: "Accent colour",
                  palette: [{ value: "#161d77", label: "Navy" }],
                  fallbackColor: "#ffffff",
                  resetLabel: "Use inherited",
                  resetAriaLabel: "Use inherited accent colour",
                  customHint: "Enter an accent hex colour, for example #161d77.",
                  visibleWhen: { name: "mode", equals: "advanced" },
                },
              ],
            },
          ],
        }}
      />,
    );

    expect(screen.queryByRole("group", { name: "Accent colour" })).toBeNull();

    await userEvent.click(screen.getByRole("radio", { name: "Advanced" }));

    expect(screen.getByRole("group", { name: "Accent colour" })).toBeInTheDocument();
  });
});
