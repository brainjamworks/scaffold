import { Extension } from "@tiptap/core";
import { Plugin, PluginKey, type EditorState, type Transaction } from "@tiptap/pm/state";
import type { DocumentTreeSnapshot } from "@/document/model/document-tree/document-tree-snapshot";
import { getDocumentTreeForState } from "@/document/authoring/document-tree";
import {
  getEditorNavigationForState,
  type EditorSelectionSnapshot,
} from "@/document/authoring/editor-navigation";
import {
  deriveContentLayoutAuthoringState,
  type ContentLayoutAuthoringState,
} from "../model/content-layout-authoring-state";
import {
  readContentLayoutProjectionDiagnostics,
  setContentLayoutProjectionBatchMeta,
  type ContentLayoutProjectionBatch,
} from "./content-layout-projection-extension";

interface ContentLayoutAuthoringIdentity {
  readonly documentTree: DocumentTreeSnapshot;
  readonly selectedId: EditorSelectionSnapshot["selectedId"];
}

interface ContentLayoutAuthoringPluginState {
  readonly authoringState: ContentLayoutAuthoringState;
  readonly publishedIdentity: ContentLayoutAuthoringIdentity | null;
}

interface ContentLayoutAuthoringPublicationMeta {
  readonly type: "publish";
  readonly state: ContentLayoutAuthoringState;
  readonly identity: ContentLayoutAuthoringIdentity;
}

const CONTENT_LAYOUT_AUTHORING_PLUGIN_KEY = new PluginKey<ContentLayoutAuthoringPluginState>(
  "contentLayoutAuthoring",
);

export const ContentLayoutAuthoringExtension = Extension.create({
  name: "contentLayoutAuthoring",
  priority: 90,

  addProseMirrorPlugins() {
    return [
      new Plugin<ContentLayoutAuthoringPluginState>({
        key: CONTENT_LAYOUT_AUTHORING_PLUGIN_KEY,
        state: {
          init: (_configuration, state) => initializePluginState(state),
          apply(transaction, value) {
            const meta = readPublicationMeta(transaction);
            if (meta === null) return value;
            return Object.freeze({
              authoringState: meta.state,
              publishedIdentity: meta.identity,
            });
          },
        },
        appendTransaction(transactions, _oldState, newState) {
          if (isOwnPublicationTransaction(transactions)) return null;
          return createPublicationTransactionIfNeeded(
            newState,
            transactions.some((transaction) => transaction.selectionSet),
          );
        },
        view(view) {
          let destroyed = false;
          let publicationScheduled = false;
          const schedulePublication = (): void => {
            if (destroyed || publicationScheduled) return;
            publicationScheduled = true;
            queueMicrotask(() => {
              publicationScheduled = false;
              if (destroyed) return;

              const transaction = createPublicationTransactionIfNeeded(view.state);
              if (transaction !== null) view.dispatch(transaction);
            });
          };
          const tree = getDocumentTreeForState(view.state);
          const navigation = getEditorNavigationForState(view.state);
          const unsubscribeTree = tree.subscribe(schedulePublication);
          const unsubscribeSelection = navigation.subscribeSelection(schedulePublication);
          schedulePublication();

          return {
            destroy() {
              destroyed = true;
              unsubscribeTree();
              unsubscribeSelection();
            },
          };
        },
      }),
    ];
  },
});

export function readContentLayoutAuthoringState(state: EditorState): ContentLayoutAuthoringState {
  return readPluginState(state).authoringState;
}

function initializePluginState(state: EditorState): ContentLayoutAuthoringPluginState {
  const tree = getDocumentTreeForState(state);
  const navigation = getEditorNavigationForState(state);
  void readContentLayoutProjectionDiagnostics(state);
  const snapshot = tree.getSnapshot();
  const selection = navigation.getSelectionSnapshot();
  const authoringState = deriveContentLayoutAuthoringState({
    snapshot,
    selectedId: selection.selectedId,
    previousState: null,
  });
  return Object.freeze({ authoringState, publishedIdentity: null });
}

function createPublicationTransactionIfNeeded(
  state: EditorState,
  selectionReconciliationRequested = false,
): Transaction | null {
  const pluginState = readPluginState(state);
  const tree = getDocumentTreeForState(state);
  const navigation = getEditorNavigationForState(state);
  const snapshot = tree.getSnapshot();
  const selection = navigation.getSelectionSnapshot();
  const identity = createIdentity(snapshot, selection);
  const sourceIdentityUnchanged =
    pluginState.publishedIdentity !== null &&
    identitiesEqual(pluginState.publishedIdentity, identity);
  if (sourceIdentityUnchanged && !selectionReconciliationRequested) {
    return null;
  }

  const authoringState = deriveContentLayoutAuthoringState({
    snapshot,
    selectedId: selection.selectedId,
    previousState: pluginState.publishedIdentity === null ? null : pluginState.authoringState,
  });
  if (sourceIdentityUnchanged && authoringStatesEqual(pluginState.authoringState, authoringState)) {
    return null;
  }
  return createPublicationTransaction(state, authoringState, identity, snapshot);
}

function authoringStatesEqual(
  left: ContentLayoutAuthoringState,
  right: ContentLayoutAuthoringState,
): boolean {
  if (
    left.containers.size !== right.containers.size ||
    left.projectionInputs.length !== right.projectionInputs.length
  ) {
    return false;
  }

  for (const [containerId, leftContainer] of left.containers) {
    const rightContainer = right.containers.get(containerId);
    if (
      rightContainer === undefined ||
      leftContainer.activeChildId !== rightContainer.activeChildId ||
      leftContainer.resolution !== rightContainer.resolution ||
      !orderedValuesEqual(leftContainer.directChildIds, rightContainer.directChildIds)
    ) {
      return false;
    }
  }

  for (const [index, leftInput] of left.projectionInputs.entries()) {
    const rightInput = right.projectionInputs[index];
    if (
      rightInput === undefined ||
      leftInput.containerId !== rightInput.containerId ||
      leftInput.contentLayout !== rightInput.contentLayout ||
      leftInput.activeChildId !== rightInput.activeChildId ||
      !orderedValuesEqual(leftInput.directChildIds, rightInput.directChildIds)
    ) {
      return false;
    }
  }

  return true;
}

function orderedValuesEqual<T>(left: readonly T[], right: readonly T[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function readPluginState(state: EditorState): ContentLayoutAuthoringPluginState {
  const pluginState = CONTENT_LAYOUT_AUTHORING_PLUGIN_KEY.getState(state);
  if (!pluginState) {
    throw new Error("Content Layout Authoring extension is not installed for this editor");
  }
  return pluginState;
}

function createPublicationTransaction(
  state: EditorState,
  authoringState: ContentLayoutAuthoringState,
  identity: ContentLayoutAuthoringIdentity,
  snapshot: DocumentTreeSnapshot,
): Transaction {
  const batch: ContentLayoutProjectionBatch = Object.freeze({
    snapshot,
    containers: authoringState.projectionInputs,
  });
  return setContentLayoutProjectionBatchMeta(state.tr, batch).setMeta(
    CONTENT_LAYOUT_AUTHORING_PLUGIN_KEY,
    Object.freeze({
      type: "publish",
      state: authoringState,
      identity,
    } satisfies ContentLayoutAuthoringPublicationMeta),
  );
}

function createIdentity(
  documentTree: DocumentTreeSnapshot,
  selection: EditorSelectionSnapshot,
): ContentLayoutAuthoringIdentity {
  return Object.freeze({
    documentTree,
    selectedId: selection.selectedId,
  });
}

function identitiesEqual(
  left: ContentLayoutAuthoringIdentity,
  right: ContentLayoutAuthoringIdentity,
): boolean {
  return left.documentTree === right.documentTree && left.selectedId === right.selectedId;
}

function isOwnPublicationTransaction(transactions: readonly Transaction[]): boolean {
  return transactions.some((transaction) => readPublicationMeta(transaction) !== null);
}

function readPublicationMeta(
  transaction: Transaction,
): ContentLayoutAuthoringPublicationMeta | null {
  const rawMeta = transaction.getMeta(CONTENT_LAYOUT_AUTHORING_PLUGIN_KEY);
  if (rawMeta === undefined) return null;
  if (!isPublicationMeta(rawMeta)) {
    throw new Error("Malformed Content Layout Authoring publication metadata");
  }
  return rawMeta;
}

function isPublicationMeta(value: unknown): value is ContentLayoutAuthoringPublicationMeta {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return (
    record["type"] === "publish" &&
    record["state"] !== undefined &&
    record["identity"] !== undefined
  );
}
