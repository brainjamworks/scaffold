import { Suspense, lazy } from "react";

import type { FilePickerModalProps } from "./file-picker-modal";

const LazyFilePickerModal = lazy(async () => {
  const mod = await import("./file-picker-modal");
  return { default: mod.FilePickerModal };
});

export type { FilePickerResult } from "./file-picker-modal";

export function FilePickerModal(props: FilePickerModalProps) {
  if (!props.open) return null;

  return (
    <Suspense fallback={null}>
      <LazyFilePickerModal {...props} />
    </Suspense>
  );
}
