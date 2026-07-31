import { createContext, useContext, type ReactNode } from "react";

import type { SettingsSheetFieldStatus } from "@/editor/configuration/settings-sheet";
import { FieldError, HelpText } from "@/ui/components/Input/Input";
import { Pill } from "@/ui/components/Pill/Pill";

import { settingsFieldA11yIds, settingsFieldControlId } from "../a11y";

const SettingsFieldIdPrefixContext = createContext<string | undefined>(undefined);

export function SettingsFieldIdScope({
  children,
  idPrefix,
}: {
  children: ReactNode;
  idPrefix?: string;
}) {
  return (
    <SettingsFieldIdPrefixContext.Provider value={idPrefix}>
      {children}
    </SettingsFieldIdPrefixContext.Provider>
  );
}

export function useSettingsFieldMeta({
  description,
  disabledHint,
  disabledReason,
  error,
  name,
  status,
}: {
  description?: ReactNode | undefined;
  disabledHint?: ReactNode | undefined;
  disabledReason?: ReactNode | undefined;
  error?: string | undefined;
  name: string;
  status?: SettingsSheetFieldStatus | undefined;
}) {
  const idPrefix = useContext(SettingsFieldIdPrefixContext);
  return settingsFieldA11yIds(settingsFieldControlId(name, idPrefix), {
    hasError: Boolean(error),
    hasHelp: Boolean(description || disabledReason || disabledHint),
    hasStatus: Boolean(status),
  });
}

export function SettingsFieldStatus({
  name,
  status,
}: {
  name: string;
  status: SettingsSheetFieldStatus;
}) {
  const meta = useSettingsFieldMeta({ name, status });

  return (
    <Pill
      id={meta.statusId}
      className="sc-settings-field-status"
      size="sm"
      variant={status.variant ?? "neutral"}
    >
      {status.label}
    </Pill>
  );
}

export function SettingsFieldHelp({
  description,
  disabledHint,
  disabledReason,
  id,
}: {
  description?: ReactNode | undefined;
  disabledHint?: ReactNode | undefined;
  disabledReason?: ReactNode | undefined;
  id?: string | undefined;
}) {
  if (!description && !disabledReason && !disabledHint) return null;
  return (
    <HelpText {...(id ? { id } : {})}>
      {description}
      {description && disabledReason ? " " : null}
      {disabledReason ? <span>{disabledReason}</span> : null}
      {(description || disabledReason) && disabledHint ? " " : null}
      {disabledHint ? <span>{disabledHint}</span> : null}
    </HelpText>
  );
}

export function SettingsFieldError({
  error,
  id,
}: {
  error?: string | undefined;
  id?: string | undefined;
}) {
  if (!error) return null;
  return <FieldError {...(id ? { id } : {})}>{error}</FieldError>;
}
