// @vitest-environment happy-dom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useEffect } from "react";
import { FormProvider, useForm, useWatch, type FieldValues } from "react-hook-form";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import type { SettingsSheetFieldDescriptor } from "@/editor/configuration/settings-sheet";
import { ScaffoldServicesProvider } from "@/host/providers/ScaffoldServicesProvider";
import type { MediaPort } from "@/host/ports/media";

const pickerMock = vi.hoisted(() => ({
  result: {
    source: "url" as const,
    mediaType: "image" as const,
    url: "https://example.com/image.jpg",
    alt: "Picked image",
  } as Record<string, unknown>,
}));

vi.mock("@/editor/media/authoring/picker/LazyFilePickerModal", () => ({
  FilePickerModal: ({
    open,
    onOpenChange,
    onResolved,
  }: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onResolved: (result: Record<string, unknown>) => void;
  }) =>
    open ? (
      <button
        type="button"
        onClick={() => {
          onResolved(pickerMock.result);
          onOpenChange(false);
        }}
      >
        Resolve image
      </button>
    ) : null,
}));

import { FieldRenderer } from "./FieldRenderer";

afterEach(() => {
  cleanup();
  pickerMock.result = {
    source: "url",
    mediaType: "image",
    url: "https://example.com/image.jpg",
    alt: "Picked image",
  };
});

function FieldRendererHarness({
  defaultValues,
  descriptor,
  errors,
  onFormChange = vi.fn(),
}: {
  defaultValues: FieldValues;
  descriptor: SettingsSheetFieldDescriptor;
  errors?: Record<string, string>;
  onFormChange?: (next: FieldValues) => void;
}) {
  const form = useForm<FieldValues>({ defaultValues });
  const values = useWatch({ control: form.control });

  useEffect(() => {
    onFormChange(values);
  }, [onFormChange, values]);

  useEffect(() => {
    if (!errors) return;
    for (const [name, message] of Object.entries(errors)) {
      form.setError(name, { type: "test", message });
    }
  }, [errors, form]);

  return (
    <FormProvider {...form}>
      <FieldRenderer descriptor={descriptor} />
    </FormProvider>
  );
}

describe("FieldRenderer", () => {
  it("updates a text value through its descriptor name", async () => {
    const onFormChange = vi.fn();

    render(
      <FieldRendererHarness
        defaultValues={{ legend: "Old" }}
        descriptor={{ kind: "text", name: "legend", label: "Legend" }}
        onFormChange={onFormChange}
      />,
    );

    await userEvent.clear(screen.getByLabelText("Legend"));
    await userEvent.type(screen.getByLabelText("Legend"), "New");

    expect(onFormChange).toHaveBeenLastCalledWith({ legend: "New" });
  });

  it("renders controlled select and switch fields through React Hook Form", async () => {
    const onFormChange = vi.fn();

    function Harness() {
      const form = useForm<FieldValues>({
        defaultValues: {
          mode: "practice",
          enabled: false,
        },
      });
      const values = useWatch({ control: form.control });

      useEffect(() => {
        onFormChange(values);
      }, [values]);

      return (
        <FormProvider {...form}>
          <FieldRenderer
            descriptor={{
              kind: "select",
              name: "mode",
              label: "Mode",
              options: [
                { value: "practice", label: "Practice" },
                { value: "graded", label: "Graded" },
              ],
            }}
          />
          <FieldRenderer
            descriptor={{
              kind: "boolean",
              name: "enabled",
              label: "Enabled",
              presentation: "switch",
            }}
          />
        </FormProvider>
      );
    }

    render(<Harness />);

    await userEvent.click(screen.getByLabelText("Mode"));
    await userEvent.click(screen.getByRole("option", { name: "Graded" }));
    await userEvent.click(screen.getByRole("switch", { name: "Enabled" }));

    expect(onFormChange).toHaveBeenLastCalledWith({
      mode: "graded",
      enabled: true,
    });
  });

  it("derives select options from data grid columns", async () => {
    const onFormChange = vi.fn();

    render(
      <FieldRendererHarness
        defaultValues={{
          table: {
            columnIds: ["fruit", "votes"],
            columnTypes: ["text", "number"],
            headers: ["Fruit", "Votes"],
            rows: [["Apples", "12"]],
          },
          mapping: {},
        }}
        descriptor={{
          kind: "select",
          name: "mapping.value",
          label: "Value",
          optionsSource: {
            kind: "dataGridColumns",
            name: "table",
            columnTypes: ["number"],
          },
        }}
        onFormChange={onFormChange}
      />,
    );

    await userEvent.click(screen.getByLabelText("Value"));

    expect(screen.queryByRole("option", { name: "Fruit" })).toBeNull();
    await userEvent.click(screen.getByRole("option", { name: "Votes" }));

    expect(onFormChange).toHaveBeenLastCalledWith({
      table: {
        columnIds: ["fruit", "votes"],
        columnTypes: ["text", "number"],
        headers: ["Fruit", "Votes"],
        rows: [["Apples", "12"]],
      },
      mapping: { value: "votes" },
    });
  });

  it("uses visibleWhen to hide fields by name", () => {
    render(
      <FieldRendererHarness
        defaultValues={{ chartType: "line", stacked: false }}
        descriptor={{
          kind: "boolean",
          name: "stacked",
          label: "Stacked",
          visibleWhen: { name: "chartType", equals: "bar" },
        }}
      />,
    );

    expect(screen.queryByLabelText("Stacked")).toBeNull();
  });

  it("uses visibleWhen oneOf to share fields across several values", () => {
    render(
      <FieldRendererHarness
        defaultValues={{ chartType: "area", mapping: {} }}
        descriptor={{
          kind: "select",
          name: "mapping.category",
          label: "Category",
          options: [{ value: "month", label: "Month" }],
          visibleWhen: { name: "chartType", oneOf: ["bar", "line", "area"] },
        }}
      />,
    );

    expect(screen.getByLabelText("Category")).toBeInTheDocument();
  });

  it("submits untouched boolean fields as false", async () => {
    const onFormChange = vi.fn();

    function Harness() {
      const form = useForm<FieldValues>({
        defaultValues: {},
      });
      const values = useWatch({ control: form.control });

      useEffect(() => {
        onFormChange(values);
      }, [values]);

      return (
        <FormProvider {...form}>
          <FieldRenderer
            descriptor={{
              kind: "boolean",
              name: "header.enabled",
              label: "Show header",
              presentation: "switch",
            }}
          />
          <FieldRenderer
            descriptor={{
              kind: "boolean",
              name: "footer.enabled",
              label: "Show footer",
              presentation: "switch",
            }}
          />
        </FormProvider>
      );
    }

    render(<Harness />);

    await userEvent.click(screen.getByRole("switch", { name: "Show header" }));

    expect(onFormChange).toHaveBeenLastCalledWith({
      header: { enabled: true },
      footer: { enabled: false },
    });
  });

  it("renders validation errors for nested field names", () => {
    render(
      <FieldRendererHarness
        defaultValues={{ timer: { durationSeconds: 0 } }}
        descriptor={{
          kind: "number",
          name: "timer.durationSeconds",
          label: "Duration",
        }}
        errors={{ "timer.durationSeconds": "Duration is required." }}
      />,
    );

    expect(screen.getByRole("alert").textContent).toBe("Duration is required.");
  });

  it("writes multi-select choices as a string array", async () => {
    const onFormChange = vi.fn();

    render(
      <FieldRendererHarness
        defaultValues={{ series: ["actual"] }}
        descriptor={{
          kind: "multiSelect",
          name: "series",
          label: "Series",
          options: [
            { value: "actual", label: "Actual" },
            { value: "target", label: "Target" },
          ],
        }}
        onFormChange={onFormChange}
      />,
    );

    await userEvent.click(screen.getByRole("checkbox", { name: "Target" }));
    await userEvent.click(screen.getByRole("checkbox", { name: "Actual" }));

    expect(onFormChange).toHaveBeenLastCalledWith({
      series: ["target"],
    });
  });

  it("derives multi-select options from data grid columns", async () => {
    const onFormChange = vi.fn();

    render(
      <FieldRendererHarness
        defaultValues={{
          table: {
            columnIds: ["month", "actual", "target"],
            columnTypes: ["text", "number", "number"],
            headers: ["Month", "Actual", "Target"],
            rows: [["Jan", "42", "45"]],
          },
          mapping: { values: ["actual"] },
        }}
        descriptor={{
          kind: "multiSelect",
          name: "mapping.values",
          label: "Value series",
          optionsSource: {
            kind: "dataGridColumns",
            name: "table",
            columnTypes: ["number"],
          },
        }}
        onFormChange={onFormChange}
      />,
    );

    expect(screen.queryByRole("checkbox", { name: "Month" })).toBeNull();
    await userEvent.click(screen.getByRole("checkbox", { name: "Target" }));

    expect(onFormChange).toHaveBeenLastCalledWith({
      table: {
        columnIds: ["month", "actual", "target"],
        columnTypes: ["text", "number", "number"],
        headers: ["Month", "Actual", "Target"],
        rows: [["Jan", "42", "45"]],
      },
      mapping: { values: ["actual", "target"] },
    });
  });

  it("renders a generic data grid field through its descriptor name", async () => {
    render(
      <FieldRendererHarness
        defaultValues={{
          table: {
            headers: ["Fruit", "Votes"],
            rows: [["Apples", "12"]],
          },
        }}
        descriptor={{
          kind: "dataGrid",
          name: "table",
          label: "Table data",
        }}
      />,
    );

    expect(await screen.findByTestId("settings-data-grid-editor")).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Table data" })).toBeInTheDocument();

    const editor = screen.getByTestId("settings-data-grid-editor");
    const labelledBy = editor.getAttribute("aria-labelledby");
    expect(labelledBy).toMatch(/\S/);
    expect(document.getElementById(labelledBy ?? "")?.textContent).toBe("Table data");
    expect(screen.getByTestId("settings-revogrid").getAttribute("aria-labelledby")).toBe(
      labelledBy,
    );
  });

  it("writes image picker results through its descriptor name", async () => {
    const onFormChange = vi.fn();

    render(
      <FieldRendererHarness
        defaultValues={{ background: { color: "#ffffff" } }}
        descriptor={{
          kind: "image",
          name: "background",
          label: "Background image",
          mediaStorage: "url",
          positioning: "crop",
          chooseLabel: "Choose background image",
        }}
        onFormChange={onFormChange}
      />,
    );

    await userEvent.click(
      screen.getByRole("button", {
        name: "Choose background image",
      }),
    );
    await userEvent.click(screen.getByRole("button", { name: "Resolve image" }));

    expect(onFormChange).toHaveBeenLastCalledWith({
      background: {
        color: "#ffffff",
        imageUrl: "https://example.com/image.jpg",
        imageAlt: "Picked image",
      },
    });
  });

  it("preserves canonical managed and external image identity", async () => {
    const onFormChange = vi.fn();
    const { unmount } = render(
      <FieldRendererHarness
        defaultValues={{ image: null }}
        descriptor={{
          kind: "image",
          name: "image",
          label: "Collection image",
          mediaStorage: "canonical",
        }}
        onFormChange={onFormChange}
      />,
    );

    pickerMock.result = {
      source: "upload",
      mediaType: "image",
      upload: { id: "managed-image", url: "blob:managed-preview" },
      alt: "Managed alt",
    };
    await userEvent.click(screen.getByRole("button", { name: "Choose image" }));
    await userEvent.click(screen.getByRole("button", { name: "Resolve image" }));

    expect(onFormChange).toHaveBeenLastCalledWith({
      image: { mode: "managed", mediaId: "managed-image", alt: "Managed alt" },
    });

    unmount();
    pickerMock.result = {
      source: "url",
      mediaType: "image",
      url: "https://example.com/external.jpg",
      alt: "External alt",
    };
    render(
      <FieldRendererHarness
        defaultValues={{ image: null }}
        descriptor={{
          kind: "image",
          name: "image",
          label: "Collection image",
          mediaStorage: "canonical",
        }}
        onFormChange={onFormChange}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: "Choose image" }));
    await userEvent.click(screen.getByRole("button", { name: "Resolve image" }));

    expect(onFormChange).toHaveBeenLastCalledWith({
      image: {
        mode: "external",
        src: "https://example.com/external.jpg",
        alt: "External alt",
      },
    });
  });

  it("announces managed image preview resolution failures", async () => {
    const media: MediaPort = {
      resolve: async () => {
        throw new Error("Managed image preview unavailable");
      },
      upload: vi.fn(),
    };

    render(
      <ScaffoldServicesProvider ports={{ media }}>
        <FieldRendererHarness
          defaultValues={{
            image: { mode: "managed", mediaId: "managed-image", alt: "Managed alt" },
          }}
          descriptor={{
            kind: "image",
            name: "image",
            label: "Collection image",
            mediaStorage: "canonical",
          }}
        />
      </ScaffoldServicesProvider>,
    );

    expect((await screen.findByRole("alert")).textContent).toBe(
      "Managed image preview unavailable",
    );
    expect(screen.queryByText("Loading image preview")).toBeNull();
  });

  it("hides crop positioning unless the descriptor declares that capability", () => {
    render(
      <FieldRendererHarness
        defaultValues={{
          image: { mode: "external", src: "https://example.com/image.jpg", alt: "Image" },
        }}
        descriptor={{
          kind: "image",
          name: "image",
          label: "Contained image",
          mediaStorage: "canonical",
        }}
      />,
    );

    expect(screen.queryByRole("radiogroup", { name: "Contained image position" })).toBeNull();
  });

  it("positions selected images through one accessible preview radio group", async () => {
    const onFormChange = vi.fn();
    const { container } = render(
      <FieldRendererHarness
        defaultValues={{
          background: {
            color: "#ffffff",
            imageUrl: "https://example.com/image.jpg",
            imageAlt: "Picked image",
          },
        }}
        descriptor={{
          kind: "image",
          name: "background",
          label: "Background image",
          mediaStorage: "url",
          positioning: "crop",
        }}
        onFormChange={onFormChange}
      />,
    );

    expect(
      screen.getByRole("radiogroup", { name: "Background image position" }),
    ).toBeInTheDocument();
    expect(screen.getAllByRole("radio")).toHaveLength(9);
    expect(screen.getByRole("radio", { name: "Centre" }).getAttribute("aria-checked")).toBe("true");
    expect(container.querySelector("img")?.style.objectPosition).toBe("center center");

    await userEvent.click(screen.getByRole("radio", { name: "Bottom right" }));

    expect(container.querySelector("img")?.style.objectPosition).toBe("right bottom");
    expect(onFormChange).toHaveBeenLastCalledWith({
      background: {
        color: "#ffffff",
        imageUrl: "https://example.com/image.jpg",
        imageAlt: "Picked image",
        imagePosition: "bottom-right",
      },
    });

    const centreRadio = screen.getByRole("radio", { name: "Centre" });
    await userEvent.click(centreRadio);
    centreRadio.focus();
    fireEvent.keyDown(centreRadio, { key: "ArrowRight" });

    await waitFor(() => {
      expect(screen.getByRole("radio", { name: "Centre right" }).getAttribute("aria-checked")).toBe(
        "true",
      );
    });
    fireEvent.keyUp(document, { key: "ArrowRight" });
    expect(container.querySelector("img")?.style.objectPosition).toBe("right center");
  });

  it("removes redundant centre position state", async () => {
    const onFormChange = vi.fn();

    render(
      <FieldRendererHarness
        defaultValues={{
          image: {
            imageUrl: "https://example.com/image.jpg",
            imagePosition: "top-left",
          },
        }}
        descriptor={{
          kind: "image",
          name: "image",
          label: "Cover image",
          mediaStorage: "url",
          positioning: "crop",
        }}
        onFormChange={onFormChange}
      />,
    );

    await userEvent.click(screen.getByRole("radio", { name: "Centre" }));

    expect(onFormChange).toHaveBeenLastCalledWith({
      image: { imageUrl: "https://example.com/image.jpg" },
    });
  });

  it("resets image position when replacing an image", async () => {
    const onFormChange = vi.fn();

    render(
      <FieldRendererHarness
        defaultValues={{
          background: {
            color: "#ffffff",
            imageUrl: "https://example.com/old.jpg",
            imageAlt: "Old image",
            imagePosition: "top-left",
          },
        }}
        descriptor={{
          kind: "image",
          name: "background",
          label: "Background image",
          mediaStorage: "url",
          positioning: "crop",
        }}
        onFormChange={onFormChange}
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: "Replace image" }));
    await userEvent.click(screen.getByRole("button", { name: "Resolve image" }));

    expect(onFormChange).toHaveBeenLastCalledWith({
      background: {
        color: "#ffffff",
        imageUrl: "https://example.com/image.jpg",
        imageAlt: "Picked image",
      },
    });
  });

  it("disables every image position when the image field is disabled", () => {
    render(
      <FieldRendererHarness
        defaultValues={{
          image: {
            imageUrl: "https://example.com/image.jpg",
          },
        }}
        descriptor={{
          kind: "image",
          name: "image",
          label: "Band image",
          mediaStorage: "url",
          positioning: "crop",
          disabledReason: "Image editing is unavailable.",
        }}
      />,
    );

    expect(screen.getAllByRole("radio").every((radio) => radio.hasAttribute("disabled"))).toBe(
      true,
    );
  });

  it("removes image values without discarding sibling settings", async () => {
    const onFormChange = vi.fn();

    render(
      <FieldRendererHarness
        defaultValues={{
          background: {
            color: "#ffffff",
            imageUrl: "https://example.com/image.jpg",
            imageAlt: "Picked image",
            imagePosition: "bottom-right",
          },
        }}
        descriptor={{
          kind: "image",
          name: "background",
          label: "Background image",
          mediaStorage: "url",
          positioning: "crop",
        }}
        onFormChange={onFormChange}
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: "Remove image" }));

    expect(onFormChange).toHaveBeenLastCalledWith({
      background: { color: "#ffffff" },
    });
  });
});
