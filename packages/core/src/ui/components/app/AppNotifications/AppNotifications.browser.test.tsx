import { useState } from "react";
import { render as renderBrowserReact } from "vitest-browser-react";
import { afterEach, describe, expect, it } from "vite-plus/test";
import { userEvent } from "vite-plus/test/browser/context";

import { AppThemeProvider } from "@/theme/app/AppThemeProvider";
import "@/styles/globals.css";

import { AppNotificationsProvider, useAppNotifications } from "./AppNotifications";

const mountedRoots: Array<{ unmount: () => Promise<void> }> = [];

afterEach(async () => {
  for (const root of mountedRoots.splice(0)) await root.unmount();
  document.body.replaceChildren();
});

describe("App notifications in a browser", () => {
  it("isolates notifications between mounted App roots", async () => {
    const rendered = await renderBrowserReact(
      <div>
        <NotificationRoot appearance="light" label="First" />
        <NotificationRoot appearance="dark" label="Second" />
      </div>,
    );
    mountedRoots.push(rendered);

    await userEvent.click(document.querySelector<HTMLButtonElement>('[data-trigger="First"]')!);
    await userEvent.click(document.querySelector<HTMLButtonElement>('[data-trigger="Second"]')!);

    const firstRoot = document.querySelector<HTMLElement>('[data-notification-root="First"]')!;
    const secondRoot = document.querySelector<HTMLElement>('[data-notification-root="Second"]')!;
    await waitForText(firstRoot, "First notification");
    await waitForText(secondRoot, "Second notification");

    expect(firstRoot).toHaveTextContent("First notification");
    expect(firstRoot).not.toHaveTextContent("Second notification");
    expect(secondRoot).toHaveTextContent("Second notification");
    expect(secondRoot).not.toHaveTextContent("First notification");

    const firstNotificationId = firstRoot.querySelector("output")!.textContent;
    const secondNotificationId = secondRoot.querySelector("output")!.textContent;
    expect(firstNotificationId).toMatch(/^sc-app-notification-/);
    expect(secondNotificationId).toMatch(/^sc-app-notification-/);
    expect(firstNotificationId).not.toBe(secondNotificationId);
  });

  it("keeps the App viewport above overlays with App-owned light and dark presentation", async () => {
    const rendered = await renderBrowserReact(
      <div>
        <NotificationRoot appearance="light" label="Light" />
        <NotificationRoot appearance="dark" label="Dark" />
      </div>,
    );
    mountedRoots.push(rendered);

    await userEvent.click(document.querySelector<HTMLButtonElement>('[data-trigger="Light"]')!);
    await userEvent.click(document.querySelector<HTMLButtonElement>('[data-trigger="Dark"]')!);

    const lightRoot = document.querySelector<HTMLElement>('[data-notification-root="Light"]')!;
    const darkRoot = document.querySelector<HTMLElement>('[data-notification-root="Dark"]')!;
    await waitForText(lightRoot, "Light notification");
    await waitForText(darkRoot, "Dark notification");

    const lightToaster = lightRoot.querySelector<HTMLElement>("[data-sonner-toaster]")!;
    const overlay = lightRoot.querySelector<HTMLElement>("[data-test-overlay]")!;
    const lightCard = lightRoot.querySelector<HTMLElement>(".sc-app-notification")!;
    const darkCard = darkRoot.querySelector<HTMLElement>(".sc-app-notification")!;
    const lightToast = lightCard.closest<HTMLElement>("[data-sonner-toast]")!;
    const lightApp = lightCard.closest<HTMLElement>(".sc-app")!;
    const dismiss = lightCard.querySelector<HTMLElement>(".sc-app-notification__dismiss")!;
    const icon = lightCard.querySelector<HTMLElement>(".sc-app-notification__icon")!;
    const copy = lightCard.querySelector<HTMLElement>(".sc-app-notification__copy")!;

    expect(Number.parseInt(getComputedStyle(lightToaster).zIndex, 10)).toBeGreaterThan(
      Number.parseInt(getComputedStyle(overlay).zIndex, 10),
    );
    expect(getComputedStyle(lightCard).backgroundColor).toBe("rgb(255, 255, 255)");
    expect(getComputedStyle(darkCard).backgroundColor).toBe("rgb(24, 24, 27)");
    expect(lightCard.closest(".sc-course")).toBeNull();

    lightApp.style.setProperty("--sc-app-shadow-notification", "rgb(255, 0, 0) 0px 1px 2px 0px");
    expect(getComputedStyle(lightCard).boxShadow).toContain("rgb(255, 0, 0)");
    expect(lightToast.getBoundingClientRect().width).toBeLessThanOrEqual(352);
    expect(dismiss.getBoundingClientRect().width).toBeGreaterThanOrEqual(44);
    expect(dismiss.getBoundingClientRect().height).toBeGreaterThanOrEqual(44);
    expect(maxTransitionDurationMs(lightToast)).toBeLessThanOrEqual(220);
    expect(Math.abs(verticalCenter(icon) - verticalCenter(copy))).toBeLessThanOrEqual(1);
    expect(Math.abs(verticalCenter(dismiss) - verticalCenter(lightCard))).toBeLessThanOrEqual(1);
  });
});

function NotificationRoot({
  appearance,
  label,
}: {
  readonly appearance: "light" | "dark";
  readonly label: string;
}) {
  return (
    <AppThemeProvider appearance={appearance}>
      <div data-notification-root={label}>
        <AppNotificationsProvider appearance={appearance}>
          <NotificationTrigger label={label} />
          <div data-test-overlay style={{ position: "fixed", zIndex: "var(--z-modal)" }} />
        </AppNotificationsProvider>
      </div>
    </AppThemeProvider>
  );
}

function NotificationTrigger({ label }: { readonly label: string }) {
  const notifications = useAppNotifications();
  const [notificationId, setNotificationId] = useState<string | null>(null);
  return (
    <>
      <button
        data-trigger={label}
        onClick={() =>
          setNotificationId(
            notifications.notify("success", `${label} notification`, {
              description: "This version is now live for learners.",
            }),
          )
        }
        type="button"
      >
        Notify {label}
      </button>
      <output>{notificationId}</output>
    </>
  );
}

async function waitForText(root: HTMLElement, text: string): Promise<void> {
  const deadline = performance.now() + 2_000;
  while (!root.textContent?.includes(text)) {
    if (performance.now() > deadline) throw new Error(`Timed out waiting for ${text}`);
    await new Promise((resolve) => window.setTimeout(resolve, 16));
  }
}

function maxTransitionDurationMs(element: HTMLElement): number {
  return Math.max(
    ...getComputedStyle(element)
      .transitionDuration.split(",")
      .map(
        (duration) => Number.parseFloat(duration) * (duration.trim().endsWith("ms") ? 1 : 1_000),
      ),
  );
}

function verticalCenter(element: HTMLElement): number {
  const rect = element.getBoundingClientRect();
  return rect.top + rect.height / 2;
}
