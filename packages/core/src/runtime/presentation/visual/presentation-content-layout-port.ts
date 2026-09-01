import type { Result as ResultType } from "better-result";
import { Extension, type Editor } from "@tiptap/core";
import type {
  EmbeddedNodeId,
  PresentationContentLayout,
} from "@scaffold/contracts";

import type {
  ContentLayoutProjectionInput,
  ContentLayoutProjectionIssue,
} from "@/editor/content-layout/model/content-layout-projection";

export interface PresentationContentLayoutRequest {
  readonly surfaceId: EmbeddedNodeId;
  readonly containers: readonly ContentLayoutProjectionInput[];
}

export type PresentationContentLayoutError =
  | {
      readonly reason: "surface-not-current";
      readonly surfaceId: EmbeddedNodeId;
      readonly currentSurfaceIds: readonly EmbeddedNodeId[];
    }
  | {
      readonly reason: "container-not-current";
      readonly surfaceId: EmbeddedNodeId;
      readonly containerId: EmbeddedNodeId;
      readonly currentSurfaceId: EmbeddedNodeId | null;
    }
  | {
      readonly reason: "content-layout-changed";
      readonly surfaceId: EmbeddedNodeId;
      readonly containerId: EmbeddedNodeId;
      readonly expectedContentLayout: PresentationContentLayout;
      readonly currentContentLayout: PresentationContentLayout;
    }
  | {
      readonly reason: "direct-children-changed";
      readonly surfaceId: EmbeddedNodeId;
      readonly containerId: EmbeddedNodeId;
      readonly expectedDirectChildIds: readonly EmbeddedNodeId[];
      readonly currentDirectChildIds: readonly EmbeddedNodeId[];
    }
  | {
      readonly reason: "projection-refused";
      readonly surfaceId: EmbeddedNodeId;
      readonly containerId: EmbeddedNodeId;
      readonly issue: ContentLayoutProjectionIssue;
    };

export type PresentationContentLayoutResult = ResultType<void, PresentationContentLayoutError>;

export interface PresentationContentLayoutPort {
  apply(request: PresentationContentLayoutRequest): PresentationContentLayoutResult;
  clear(): void;
}

const PRESENTATION_CONTENT_LAYOUT_PORT_STORAGE = "presentationContentLayoutPort";

interface PresentationContentLayoutPortStorage {
  getPort(): PresentationContentLayoutPort;
}

export function createPresentationContentLayoutPortStorageExtension({
  getPort,
}: {
  readonly getPort: (editor: Editor) => PresentationContentLayoutPort;
}) {
  return Extension.create<Record<string, never>, PresentationContentLayoutPortStorage>({
    name: PRESENTATION_CONTENT_LAYOUT_PORT_STORAGE,

    addStorage() {
      return {
        getPort() {
          throw new Error("Presentation content-layout port storage is not initialized");
        },
      };
    },

    onBeforeCreate() {
      this.storage.getPort = () => getPort(this.editor);
      Object.freeze(this.storage);
    },
  });
}

export function getPresentationContentLayoutPortForEditor(
  editor: Editor,
): PresentationContentLayoutPort {
  const editorStorage = editor.storage as unknown as Record<string, unknown>;
  const storage = editorStorage[PRESENTATION_CONTENT_LAYOUT_PORT_STORAGE] as
    | Partial<PresentationContentLayoutPortStorage>
    | undefined;
  if (!storage?.getPort) {
    throw new Error("Presentation content-layout port extension is not installed for this editor");
  }
  return storage.getPort();
}
