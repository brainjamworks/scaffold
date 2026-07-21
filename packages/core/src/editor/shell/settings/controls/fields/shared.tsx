import type { ReactNode } from "react";

import { FieldError, HelpText } from "@/ui/components/Input/Input";

import { settingsFieldA11yIds, settingsFieldControlId } from "../a11y";

export function settingsFieldMeta({
  description,
  disabledHint,
  disabledReason,
  error,
  name,
}: {
  description?: ReactNode | undefined;
  disabledHint?: ReactNode | undefined;
  disabledReason?: ReactNode | undefined;
  error?: string | undefined;
  name: string;
}) {
  return settingsFieldA11yIds(settingsFieldControlId(name), {
    hasError: Boolean(error),
    hasHelp: Boolean(description || disabledReason || disabledHint),
  });
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
