export interface SettingsFieldA11yIds {
  id: string;
  helpId?: string;
  errorId?: string;
  describedBy?: string;
}

export function settingsFieldDomId(id: string): string {
  return id.replace(/[^a-zA-Z0-9_-]/g, "-") || "settings-field";
}

export function settingsFieldControlId(name: string): string {
  return settingsFieldDomId(`block-config-${name}`);
}

export function settingsFieldA11yIds(
  id: string,
  {
    hasError = false,
    hasHelp = false,
  }: {
    hasError?: boolean;
    hasHelp?: boolean;
  } = {},
): SettingsFieldA11yIds {
  const controlId = settingsFieldDomId(id);
  const helpId = hasHelp ? `${controlId}-help` : undefined;
  const errorId = hasError ? `${controlId}-error` : undefined;
  const describedBy = [helpId, errorId].filter(Boolean).join(" ") || undefined;

  return {
    id: controlId,
    ...(helpId ? { helpId } : {}),
    ...(errorId ? { errorId } : {}),
    ...(describedBy ? { describedBy } : {}),
  };
}
