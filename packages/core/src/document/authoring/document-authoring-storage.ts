import { PluginKey } from "@tiptap/pm/state";

import type { DocumentAuthoringLifecycle } from "./document-authoring-lifecycle";

export const documentAuthoringPluginKey = new PluginKey<DocumentAuthoringLifecycle>(
  "documentAuthoringLifecycle",
);
