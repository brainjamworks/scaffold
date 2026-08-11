// @vitest-environment happy-dom

import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

import {
  AppNotificationsProvider,
  useAppNotifications,
  type AppNotificationId,
  type AppNotifications,
} from "./AppNotifications";

interface MockToastOptions {
  containerAriaLabel?: string;
  duration?: number;
  id?: string | number;
  toasterId?: string;
}

type MockToastRenderer = (id: string | number) => ReactNode;

const sonner = vi.hoisted(() => ({
  custom: vi.fn(),
  dismiss: vi.fn(),
}));

vi.mock("sonner", () => ({
  Toaster: ({
    containerAriaLabel,
    id,
    mobileOffset,
    theme,
  }: {
    containerAriaLabel?: string;
    id?: string;
    mobileOffset?: { top?: number };
    theme?: string;
  }) => (
    <div
      data-testid="sonner-toaster"
      data-theme={theme}
      data-toaster-id={id}
      data-mobile-top={mobileOffset?.top}
      aria-label={containerAriaLabel}
    />
  ),
  toast: {
    custom: sonner.custom,
    dismiss: sonner.dismiss,
  },
}));

let notifications: AppNotifications | null = null;

function NotificationHarness() {
  notifications = useAppNotifications();
  return null;
}

function requireNotifications(): AppNotifications {
  if (!notifications) throw new Error("Expected the notification API to be available");
  return notifications;
}

function latestToastCall(): [MockToastRenderer, MockToastOptions] {
  const call = sonner.custom.mock.calls.at(-1) as [MockToastRenderer, MockToastOptions] | undefined;
  if (!call) throw new Error("Expected a Sonner custom toast call");
  return call;
}

describe("AppNotifications", () => {
  beforeEach(() => {
    notifications = null;
    sonner.custom.mockReset();
    sonner.custom.mockImplementation(
      (_renderToast: MockToastRenderer, options: MockToastOptions) =>
        options.id ?? "sonner-generated-id",
    );
    sonner.dismiss.mockReset();
  });

  it("targets one dark App notification viewport", () => {
    render(
      <AppNotificationsProvider appearance="dark">
        <NotificationHarness />
      </AppNotificationsProvider>,
    );

    const toaster = screen.getByTestId("sonner-toaster");
    expect(toaster).toHaveAttribute("data-theme", "dark");
    expect(toaster).toHaveAttribute("aria-label", "Authoring notifications");
    expect(toaster).toHaveAttribute("data-mobile-top", "72");

    act(() => {
      requireNotifications().notify("info", "Document ready");
    });

    const [, options] = latestToastCall();
    expect(options.toasterId).toBe(toaster.getAttribute("data-toaster-id"));
    expect(options.id).toMatch(/^sc-app-notification-/);
  });

  it.each([
    ["info", "status", "polite", 4_000],
    ["success", "status", "polite", 4_000],
    ["warning", "status", "polite", 6_000],
    ["error", "alert", "assertive", 8_000],
    ["progress", "status", "polite", Infinity],
  ] as const)(
    "renders %s with its App live-region and duration policy",
    (intent, role, live, duration) => {
      render(
        <AppNotificationsProvider appearance="light">
          <NotificationHarness />
        </AppNotificationsProvider>,
      );

      let notificationId = "";
      act(() => {
        notificationId = requireNotifications().notify(intent, `${intent} message`);
      });

      const [renderToast, options] = latestToastCall();
      render(renderToast(notificationId));

      expect(options.duration).toBe(duration);
      expect(screen.getByRole(role)).toHaveAttribute("aria-live", live);
      expect(screen.getByRole(role)).toHaveAttribute("data-intent", intent);
      expect(screen.getByText(`${intent} message`)).toBeVisible();
    },
  );

  it("updates and dismisses one stable notification within its scope", () => {
    render(
      <AppNotificationsProvider appearance="light">
        <NotificationHarness />
      </AppNotificationsProvider>,
    );

    let notificationId!: AppNotificationId;
    act(() => {
      notificationId = requireNotifications().notify("progress", "Publishing");
      requireNotifications().update(notificationId, "success", "Published");
      requireNotifications().dismiss(notificationId);
    });

    const firstOptions = sonner.custom.mock.calls[0]?.[1] as MockToastOptions;
    const secondOptions = sonner.custom.mock.calls[1]?.[1] as MockToastOptions;
    expect(secondOptions.id).toBe(notificationId);
    expect(secondOptions.toasterId).toBe(firstOptions.toasterId);
    expect(secondOptions.duration).toBe(4_000);
    expect(sonner.dismiss).toHaveBeenCalledWith(notificationId);
  });

  it.each(["{Enter}", " "])("dismisses from the keyboard with %s", async (key) => {
    const user = userEvent.setup();
    render(
      <AppNotificationsProvider appearance="light">
        <NotificationHarness />
      </AppNotificationsProvider>,
    );

    let notificationId = "";
    act(() => {
      notificationId = requireNotifications().notify("warning", "Check this document");
    });
    const [renderToast] = latestToastCall();
    render(renderToast(notificationId));

    const dismiss = screen.getByRole("button", { name: "Dismiss notification" });
    dismiss.focus();
    await user.keyboard(key);

    expect(sonner.dismiss).toHaveBeenCalledWith(notificationId);
  });
});
