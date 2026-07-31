import { useEffect } from "react";
import { FormProvider, useForm, useWatch, type FieldValues } from "react-hook-form";
import { render as renderBrowserReact } from "vitest-browser-react";
import { describe, expect, it } from "vite-plus/test";
import { userEvent } from "vite-plus/test/browser/context";

import { FieldRenderer } from "@/editor/shell/settings/controls/FieldRenderer";
import "@/styles/globals.css";
import "@/editor/shell/authoring/ScaffoldAuthoringApp.css";

describe("card select browser interactions", () => {
  it("presents colour swatches as a substantial preview before the option copy", async () => {
    const rendered = await renderBrowserReact(<CardSelectHarness onChange={() => undefined} />);

    try {
      const card = requiredElement<HTMLElement>(document, '[role="radio"][aria-label="Editorial"]');
      const preview = requiredElement<HTMLElement>(card, ".sc-settings-card-select__swatches");
      const copy = requiredElement<HTMLElement>(card, ".sc-settings-card-select__copy");
      const previewBounds = preview.getBoundingClientRect();
      const copyBounds = copy.getBoundingClientRect();

      expect(previewBounds.left).toBeLessThan(copyBounds.left);
      expect(previewBounds.width).toBeGreaterThanOrEqual(70);
      expect(previewBounds.height).toBeGreaterThanOrEqual(46);
    } finally {
      await rendered.unmount();
    }
  });

  it("moves focus with vertical arrow keys and commits one keyboard selection", async () => {
    const values: FieldValues[] = [];
    const rendered = await renderBrowserReact(
      <CardSelectHarness onChange={(value) => values.push(value)} />,
    );

    try {
      const editorial = requiredElement<HTMLButtonElement>(
        document,
        '[role="radio"][aria-label="Editorial"]',
      );
      const compact = requiredElement<HTMLButtonElement>(
        document,
        '[role="radio"][aria-label="Compact"]',
      );

      await userEvent.tab();
      expect(document.activeElement).toBe(editorial);

      await userEvent.keyboard("{ArrowDown}");
      expect(document.activeElement).toBe(compact);
      expect(compact).toHaveAttribute("aria-checked", "false");

      await userEvent.keyboard(" ");
      expect(compact).toHaveAttribute("aria-checked", "true");
      expect(values.at(-1)).toEqual({ layout: "compact" });
    } finally {
      await rendered.unmount();
    }
  });

  it("uses the application interaction palette for a selected card in dark mode", async () => {
    const rendered = await renderBrowserReact(
      <div
        className="sc-scaffold-authoring-app"
        data-scaffold-color-mode="dark"
        style={{ colorScheme: "dark" }}
      >
        <CardSelectHarness onChange={() => undefined} />
      </div>,
    );

    try {
      const selected = requiredElement<HTMLElement>(
        document,
        '[role="radio"][aria-label="Editorial"]',
      );
      const style = getComputedStyle(selected);

      expect(style.backgroundColor).toBe("rgb(37, 42, 68)");
      expect(style.borderColor).toBe("rgb(165, 180, 252)");
      expect(style.color).toBe("rgb(250, 250, 250)");
    } finally {
      await rendered.unmount();
    }
  });
});

function CardSelectHarness({ onChange }: { onChange: (value: FieldValues) => void }) {
  const form = useForm<FieldValues>({ defaultValues: { layout: "editorial" } });
  const values = useWatch({ control: form.control });

  useEffect(() => {
    onChange(values);
  }, [onChange, values]);

  return (
    <FormProvider {...form}>
      <FieldRenderer
        descriptor={{
          kind: "select",
          name: "layout",
          label: "Layout",
          presentation: "cards",
          options: [
            {
              value: "editorial",
              label: "Editorial",
              ariaLabel: "Editorial",
              swatches: ["#1d2a6d", "#dc5f45", "#4aa896"],
            },
            { value: "compact", label: "Compact", ariaLabel: "Compact" },
          ],
        }}
      />
    </FormProvider>
  );
}

function requiredElement<TElement extends Element>(root: ParentNode, selector: string): TElement {
  const element = root.querySelector<TElement>(selector);
  if (!element) throw new Error(`Expected element matching ${selector}`);
  return element;
}
