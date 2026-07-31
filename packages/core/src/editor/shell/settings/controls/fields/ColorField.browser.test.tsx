import { render as renderBrowserReact } from "vitest-browser-react";
import { FormProvider, useForm, type FieldValues } from "react-hook-form";
import { describe, expect, it } from "vite-plus/test";
import { page, userEvent } from "vite-plus/test/browser/context";

import { FieldRenderer } from "@/editor/shell/settings/controls/FieldRenderer";
import "@/styles/globals.css";

describe("settings colour field browser presentation", () => {
  it("uses a compact circular trigger for the shared full picker", async () => {
    await page.viewport(700, 600);
    const rendered = await renderBrowserReact(<ColourFieldHarness />);

    try {
      const trigger = requiredElement<HTMLButtonElement>(
        document,
        'button[aria-label="Edit Accent colour, current value #161d77"]',
      );
      const currentSwatch = requiredElement<HTMLElement>(
        trigger,
        ".sc-settings-color-field__current",
      );
      const label = requiredElement<HTMLElement>(document, ".sc-settings-color-field__label");
      const status = requiredElement<HTMLElement>(document, ".sc-settings-field-status");

      expect(document.querySelectorAll(".sc-color-picker-control-stack")).toHaveLength(0);
      expect(trigger.getBoundingClientRect().width).toBeGreaterThanOrEqual(40);
      expect(trigger.getBoundingClientRect().height).toBeGreaterThanOrEqual(40);
      expect(currentSwatch.getBoundingClientRect().width).toBeGreaterThanOrEqual(24);
      expect(currentSwatch.getBoundingClientRect().width).toBeLessThanOrEqual(28);
      expect(getComputedStyle(currentSwatch).borderRadius).toBe("9999px");
      expect(getComputedStyle(currentSwatch).borderStyle).toBe("solid");
      expect(getComputedStyle(currentSwatch).borderWidth).toBe("1px");
      expect(verticalCenter(status)).toBeCloseTo(verticalCenter(label), 0);

      trigger.click();
      await waitForCondition(
        () => document.querySelectorAll(".sc-settings-color-field__popover").length === 1,
      );

      const popover = requiredElement<HTMLElement>(document, ".sc-settings-color-field__popover");
      expect(popover.querySelectorAll(".sc-color-picker-control-stack")).toHaveLength(1);
      expect(popover.getBoundingClientRect().width).toBeLessThanOrEqual(280);
      expect(popover.getBoundingClientRect().left).toBeGreaterThanOrEqual(0);
      expect(popover.getBoundingClientRect().right).toBeLessThanOrEqual(window.innerWidth);
      expect(
        getComputedStyle(requiredElement(popover, ".sc-color-picker-swatch")).borderRadius,
      ).toBe("9999px");
    } finally {
      await rendered.unmount();
    }
  });

  it("moves keyboard focus into the picker and returns it to the trigger on Escape", async () => {
    await page.viewport(700, 600);
    const rendered = await renderBrowserReact(<ColourFieldHarness />);

    try {
      const trigger = requiredElement<HTMLButtonElement>(
        document,
        'button[aria-label="Edit Accent colour, current value #161d77"]',
      );
      trigger.focus();
      await userEvent.keyboard("{Enter}");
      await waitForCondition(
        () => document.querySelectorAll(".sc-settings-color-field__popover").length === 1,
      );

      const popover = requiredElement<HTMLElement>(document, ".sc-settings-color-field__popover");
      const current = requiredElement<HTMLButtonElement>(popover, 'button[aria-pressed="true"]');
      const next = requiredElement<HTMLButtonElement>(popover, 'button[aria-label="Coral"]');
      await waitForCondition(() => document.activeElement === current);

      await userEvent.keyboard("{ArrowRight}");
      expect(document.activeElement).toBe(next);

      await userEvent.keyboard("{Escape}");
      await waitForCondition(
        () => document.querySelector(".sc-settings-color-field__popover") === null,
      );
      expect(document.activeElement).toBe(trigger);
    } finally {
      await rendered.unmount();
    }
  });
});

function ColourFieldHarness() {
  const form = useForm<FieldValues>({ defaultValues: { accentColor: "#161d77" } });

  return (
    <FormProvider {...form}>
      <div style={{ width: 572 }}>
        <FieldRenderer
          descriptor={{
            kind: "color",
            name: "accentColor",
            label: "Accent colour",
            palette: [
              { value: "#161d77", label: "Navy" },
              { value: "#f43a57", label: "Coral" },
            ],
            fallbackColor: "#ffffff",
            resetLabel: "Use inherited",
            resetAriaLabel: "Use inherited accent colour",
            status: { label: "Automatic" },
          }}
        />
      </div>
    </FormProvider>
  );
}

function verticalCenter(element: Element): number {
  const rect = element.getBoundingClientRect();
  return rect.top + rect.height / 2;
}

function requiredElement<T extends Element = HTMLElement>(root: ParentNode, selector: string): T {
  const element = root.querySelector<T>(selector);
  if (!element) throw new Error(`Expected element matching ${selector}`);
  return element;
}

async function waitForCondition(condition: () => unknown, timeout = 2_000): Promise<void> {
  const started = performance.now();
  while (!condition() && performance.now() - started < timeout) {
    await new Promise((resolve) => requestAnimationFrame(resolve));
  }
  if (!condition()) throw new Error("Timed out waiting for condition");
}
