import type { SettingsSheetFieldDescriptor } from "@/editor/configuration/settings-sheet";

export interface SettingsFieldDocumentTarget {
  editor: import("@tiptap/core").Editor;
  readField: (name: string) => unknown;
  writeField: (name: string, value: unknown) => boolean;
}

export type SettingsFieldDescriptor = SettingsSheetFieldDescriptor;

export type SettingsFieldKind = SettingsFieldDescriptor["kind"];

export type SettingsFieldDescriptorByKind<TKind extends SettingsFieldKind> = Extract<
  SettingsFieldDescriptor,
  { kind: TKind }
>;

export interface SettingsFieldProps<
  TDescriptor extends SettingsFieldDescriptor = SettingsFieldDescriptor,
> {
  descriptor: TDescriptor;
  error?: string;
}
