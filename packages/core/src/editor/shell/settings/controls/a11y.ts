export interface SettingsFieldA11yIds {
  id: string;
  statusId?: string;
  helpId?: string;
  errorId?: string;
  describedBy?: string;
}

export function settingsFieldDomId(id: string): string {
  return id.replace(/[^a-zA-Z0-9_-]/g, "-") || "settings-field";
}

export function settingsFieldControlId(name: string, idPrefix?: string): string {
  return settingsFieldDomId(`${idPrefix ? `${idPrefix}-` : ""}block-config-${name}`);
}

export function settingsFieldA11yIds(
  id: string,
  {
    hasError = false,
    hasHelp = false,
    hasStatus = false,
  }: {
    hasError?: boolean;
    hasHelp?: boolean;
    hasStatus?: boolean;
  } = {},
): SettingsFieldA11yIds {
  const controlId = settingsFieldDomId(id);
  const statusId = hasStatus ? `${controlId}-status` : undefined;
  const helpId = hasHelp ? `${controlId}-help` : undefined;
  const errorId = hasError ? `${controlId}-error` : undefined;
  const describedBy = [statusId, helpId, errorId].filter(Boolean).join(" ") || undefined;

  return {
    id: controlId,
    ...(statusId ? { statusId } : {}),
    ...(helpId ? { helpId } : {}),
    ...(errorId ? { errorId } : {}),
    ...(describedBy ? { describedBy } : {}),
  };
}
