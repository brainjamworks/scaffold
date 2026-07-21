// @vitest-environment happy-dom

import { render, screen } from "@testing-library/react";
import { FormProvider, useForm, type FieldValues } from "react-hook-form";
import { describe, expect, it, vi } from "vite-plus/test";

import type { SettingsSheetFieldDescriptor } from "@/editor/configuration/settings-sheet";

const mocks = vi.hoisted(() => ({
  dataGridModuleLoads: 0,
}));

vi.mock("./fields/DataGridField", async (importOriginal) => {
  mocks.dataGridModuleLoads += 1;
  return importOriginal<typeof import("./fields/DataGridField")>();
});

import { FieldRenderer } from "./FieldRenderer";

function FieldRendererHarness({
  defaultValues,
  descriptor,
}: {
  defaultValues: FieldValues;
  descriptor: SettingsSheetFieldDescriptor;
}) {
  const form = useForm<FieldValues>({ defaultValues });

  return (
    <FormProvider {...form}>
      <FieldRenderer descriptor={descriptor} />
    </FormProvider>
  );
}

describe("FieldRenderer lazy data grid", () => {
  it("does not load the data grid module for ordinary fields", () => {
    expect(mocks.dataGridModuleLoads).toBe(0);

    render(
      <FieldRendererHarness
        defaultValues={{ legend: "Quarterly results" }}
        descriptor={{ kind: "text", name: "legend", label: "Legend" }}
      />,
    );

    expect(screen.getByLabelText("Legend")).toBeInTheDocument();
    expect(mocks.dataGridModuleLoads).toBe(0);
  });

  it("announces the data grid loading state before rendering the editor", async () => {
    render(
      <FieldRendererHarness
        defaultValues={{
          table: {
            headers: ["Fruit", "Votes"],
            rows: [["Apples", "12"]],
          },
        }}
        descriptor={{ kind: "dataGrid", name: "table", label: "Table data" }}
      />,
    );

    expect(screen.getByRole("status").textContent).toBe("Loading table editor...");
    expect(await screen.findByTestId("settings-data-grid-editor")).toBeInTheDocument();
    expect(mocks.dataGridModuleLoads).toBe(1);
  });
});
