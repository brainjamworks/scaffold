import {
  CheckCircleIcon as CheckCircle,
  CircleNotchIcon as CircleNotch,
  InfoIcon as Info,
  WarningCircleIcon as WarningCircle,
  XCircleIcon as XCircle,
  XIcon as X,
} from "@phosphor-icons/react";
import {
  createContext,
  useCallback,
  useContext,
  useId,
  useMemo,
  useRef,
  type ReactNode,
} from "react";
import { Toaster, toast } from "sonner";

import type { ScaffoldColorMode } from "@/theme/state/color-mode";
import { iconSm } from "@/ui/tokens/icon-sizes";

import "./AppNotifications.css";

export type AppNotificationIntent = "info" | "success" | "warning" | "error" | "progress";

declare const appNotificationIdBrand: unique symbol;
export type AppNotificationId = string & {
  readonly [appNotificationIdBrand]: true;
};

export interface AppNotificationOptions {
  readonly description?: ReactNode;
  readonly durationMs?: number;
}

export interface AppNotifications {
  notify: (
    intent: AppNotificationIntent,
    message: ReactNode,
    options?: AppNotificationOptions,
  ) => AppNotificationId;
  update: (
    id: AppNotificationId,
    intent: AppNotificationIntent,
    message: ReactNode,
    options?: AppNotificationOptions,
  ) => void;
  dismiss: (id: AppNotificationId) => void;
}

export interface AppNotificationsProviderProps {
  readonly appearance: ScaffoldColorMode;
  readonly children: ReactNode;
}

const AppNotificationsContext = createContext<AppNotifications | null>(null);

const notificationDurations: Readonly<Record<AppNotificationIntent, number>> = {
  info: 4_000,
  success: 4_000,
  warning: 6_000,
  error: 8_000,
  progress: Infinity,
};

export function AppNotificationsProvider({ appearance, children }: AppNotificationsProviderProps) {
  const reactId = useId();
  const scopeId = useMemo(() => reactId.replaceAll(":", ""), [reactId]);
  const toasterId = `sc-app-notifications-${scopeId}`;
  const nextNotificationNumber = useRef(0);

  const show = useCallback(
    (
      id: AppNotificationId,
      intent: AppNotificationIntent,
      message: ReactNode,
      options?: AppNotificationOptions,
    ) => {
      toast.custom(
        () => (
          <AppNotificationCard
            description={options?.description}
            id={id}
            intent={intent}
            message={message}
          />
        ),
        {
          duration: options?.durationMs ?? notificationDurations[intent],
          id,
          toasterId,
          unstyled: true,
        },
      );
    },
    [toasterId],
  );

  const notifications = useMemo<AppNotifications>(
    () => ({
      notify(intent, message, options) {
        nextNotificationNumber.current += 1;
        const id =
          `sc-app-notification-${scopeId}-${nextNotificationNumber.current}` as AppNotificationId;
        show(id, intent, message, options);
        return id;
      },
      update(id, intent, message, options) {
        show(id, intent, message, options);
      },
      dismiss(id) {
        toast.dismiss(id);
      },
    }),
    [scopeId, show],
  );

  return (
    <AppNotificationsContext.Provider value={notifications}>
      {children}
      <Toaster
        className="sc-app-notification-viewport"
        containerAriaLabel="Authoring notifications"
        gap={8}
        id={toasterId}
        mobileOffset={{ right: 12, top: 80 }}
        offset={{ right: 16, top: 72 }}
        position="top-right"
        theme={appearance}
        visibleToasts={3}
      />
    </AppNotificationsContext.Provider>
  );
}

export function useAppNotifications(): AppNotifications {
  const notifications = useContext(AppNotificationsContext);
  if (!notifications) {
    throw new Error("useAppNotifications must be used within AppNotificationsProvider");
  }
  return notifications;
}

interface AppNotificationCardProps {
  readonly description?: ReactNode;
  readonly id: AppNotificationId;
  readonly intent: AppNotificationIntent;
  readonly message: ReactNode;
}

function AppNotificationCard({ description, id, intent, message }: AppNotificationCardProps) {
  const isError = intent === "error";
  return (
    <section
      aria-atomic="true"
      aria-live={isError ? "assertive" : "polite"}
      className="sc-app-notification"
      data-intent={intent}
      role={isError ? "alert" : "status"}
    >
      <span aria-hidden className="sc-app-notification__icon">
        <AppNotificationIcon intent={intent} />
      </span>
      <span className="sc-app-notification__copy">
        <span className="sc-app-notification__message">{message}</span>
        {description ? (
          <span className="sc-app-notification__description">{description}</span>
        ) : null}
      </span>
      <button
        aria-label="Dismiss notification"
        className="sc-app-notification__dismiss"
        onClick={() => toast.dismiss(id)}
        type="button"
      >
        <X aria-hidden size={iconSm} weight="bold" />
      </button>
    </section>
  );
}

function AppNotificationIcon({ intent }: { readonly intent: AppNotificationIntent }) {
  switch (intent) {
    case "info":
      return <Info size={20} weight="fill" />;
    case "success":
      return <CheckCircle size={20} weight="fill" />;
    case "warning":
      return <WarningCircle size={20} weight="fill" />;
    case "error":
      return <XCircle size={20} weight="fill" />;
    case "progress":
      return <CircleNotch className="sc-app-notification__spinner" size={20} weight="bold" />;
  }
}
