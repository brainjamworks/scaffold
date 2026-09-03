import { Extension, type Editor, type Extensions } from "@tiptap/core";
import { Plugin, PluginKey, type EditorState, type Transaction } from "@tiptap/pm/state";
import { Result } from "better-result";

import { CellRuntimeNode, GridRuntimeNode } from "@/editor/arrangements/grid/runtime/grid-nodes";
import { createLayoutRuntimeNodes } from "@/editor/arrangements/layout/runtime/layout-nodes";
import { AssessmentActionsGroupRuntimeNode } from "@/editor/blocks/assessment/shared/nodes/assessment-actions-group-runtime";
import { AssessmentChoicesGroupRuntimeNode } from "@/editor/blocks/assessment/shared/nodes/assessment-choices-group-runtime";
import { AssessmentHintRuntimeNode } from "@/editor/blocks/assessment/shared/nodes/assessment-hint-runtime";
import { AssessmentHintsGroupRuntimeNode } from "@/editor/blocks/assessment/shared/nodes/assessment-hints-group-runtime";
import { AssessmentSummaryFeedbackRuntimeNode } from "@/editor/blocks/assessment/shared/nodes/assessment-summary-feedback-runtime";
import { SelectableChoiceRuntimeNode } from "@/editor/blocks/assessment/shared/nodes/selectable-choice-runtime";
import { InlineIconRuntimeNode } from "@/editor/rich-text/inline-icon/runtime/InlineIconRuntimeNode";
import { MathInlineRuntimeNode } from "@/editor/rich-text/math/runtime/MathInlineRuntime";
import { VocabularyTermRuntimeNode } from "@/editor/rich-text/vocabulary-term/runtime/VocabularyTermRuntimeNode";
import { createScaffoldCapabilitiesStorageExtension } from "@/composition/extensions/scaffold-capabilities-storage";
import { createCourseDocumentBaseExtensions } from "@/composition/model/create-document-composition";
import { createCourseSectionNode } from "@/document/model/nodes";
import {
  createControlBindingRegistry,
  createControlBindingRegistryStorageExtension,
  createControlCapabilityCatalogue,
  createControlCapabilityCatalogueStorageExtension,
  type ControlBindingRegistry,
  type ControlBindingRegistryPort,
  type ControlCapabilityCatalogue,
} from "@/document/control-binding";
import {
  projectCourseStructure,
  type ProjectedCourseStructure,
} from "@/document/model/course-structure";
import {
  projectSemanticDocument,
  type SemanticDefinitionLookup,
  type SemanticDocumentSnapshot,
} from "@/document/model/semantic-document";
import {
  createSemanticTargetInteractionEnvironment,
  createSemanticTargetInteractionEnvironmentStorageExtension,
  type SemanticTargetInteractionEnvironment,
  type SemanticTargetInteractionEnvironmentOwner,
} from "@/document/semantic-target-interaction";
import { createSurfaceRuntimeNode } from "@/editor/surfaces/runtime/nodes/surface-runtime-node";
import { SurfaceCategoriseQuestionNode } from "@/editor/surfaces/model/assessment/surface-categorise-question-node";
import { SurfaceDropdownQuestionNode } from "@/editor/surfaces/model/assessment/surface-dropdown-question-node";
import { SurfaceDragDropQuestionNode } from "@/editor/surfaces/model/assessment/surface-drag-drop-question-node";
import { SurfaceFillBlanksQuestionNode } from "@/editor/surfaces/model/assessment/surface-fill-blanks-question-node";
import { SurfaceMatchingQuestionNode } from "@/editor/surfaces/model/assessment/surface-matching-question-node";
import { SurfaceImageHotspotQuestionNode } from "@/editor/surfaces/model/assessment/surface-image-hotspot-question-node";
import { SurfaceMultipleChoiceQuestionNode } from "@/editor/surfaces/model/assessment/surface-multiple-choice-question-node";
import { SurfaceMultiselectQuestionNode } from "@/editor/surfaces/model/assessment/surface-multiselect-question-node";
import { SurfaceQuizNode } from "@/editor/surfaces/model/assessment/surface-quiz-node";
import { SurfaceSequencingQuestionNode } from "@/editor/surfaces/model/assessment/surface-sequencing-question-node";
import {
  ContentLayoutProjectionExtension,
  clearContentLayoutProjectionMeta,
  readContentLayoutProjectionDiagnostics,
  setContentLayoutProjectionBatchMeta,
} from "@/editor/content-layout/prosemirror/content-layout-projection-extension";
import type {
  PresentationContentLayoutError,
  PresentationContentLayoutPort,
  PresentationContentLayoutRequest,
} from "@/runtime/presentation/visual/presentation-content-layout-port";
import { createPresentationContentLayoutPortStorageExtension } from "@/runtime/presentation/visual/presentation-content-layout-port";
import { StudentGuard } from "@/runtime/guards/student-guard";
import {
  RuntimeSurfaceVisibility,
  setRuntimeVisibleSurfaceId,
} from "@/runtime/renderer/runtime-surface-visibility";
import "@/editor/rich-text/view/text-alignment.css";

import type { ScaffoldRuntimeComposition } from "./scaffold-runtime-composition";

const runtimeSemanticDocumentPluginKey = new PluginKey<RuntimeSemanticDocumentController>(
  "runtimeSemanticDocument",
);

export function createCourseDocumentRuntimeExtensions({
  composition,
}: {
  composition: ScaffoldRuntimeComposition;
}): Extensions {
  const blockRegistry = composition.capabilities.blocks.registry;
  const surfaceRegistry = composition.capabilities.surfaces.registry;
  const { layoutNode, sectionNode } = createLayoutRuntimeNodes({
    registry: composition.capabilities.layouts.registry,
    runtimeViews: composition.layouts.views,
  });
  const surfaceNode = createSurfaceRuntimeNode({
    registry: surfaceRegistry,
    views: composition.surfaces.views,
  });

  return [
    createScaffoldCapabilitiesStorageExtension(composition.capabilities),
    RuntimeSurfaceVisibility,
    createRuntimeSemanticDocumentExtension(composition.documentSemantics),
    createPresentationContentLayoutPortStorageExtension({
      getPort: createPresentationContentLayoutPortForEditor,
    }),
    ContentLayoutProjectionExtension,
    SurfaceCategoriseQuestionNode,
    SurfaceSequencingQuestionNode,
    SurfaceMatchingQuestionNode,
    SurfaceImageHotspotQuestionNode,
    SurfaceMultipleChoiceQuestionNode,
    SurfaceMultiselectQuestionNode,
    SurfaceDropdownQuestionNode,
    SurfaceDragDropQuestionNode,
    SurfaceFillBlanksQuestionNode,
    SurfaceQuizNode,
    ...createCourseDocumentBaseExtensions({
      assessmentActionsGroupNode: AssessmentActionsGroupRuntimeNode,
      assessmentChoicesGroupNode: AssessmentChoicesGroupRuntimeNode,
      assessmentHintNode: AssessmentHintRuntimeNode,
      assessmentHintsGroupNode: AssessmentHintsGroupRuntimeNode,
      assessmentSummaryFeedbackNode: AssessmentSummaryFeedbackRuntimeNode,
      cellNode: CellRuntimeNode,
      courseSectionNode: createCourseSectionNode(),
      gridNode: GridRuntimeNode,
      inlineIconNode: InlineIconRuntimeNode,
      layoutNode,
      mathInlineNode: MathInlineRuntimeNode,
      selectableChoiceNode: SelectableChoiceRuntimeNode,
      resizableBlockNodeTypes: blockRegistry.resizableNodeTypes,
      sectionNode,
      surfaceNode,
      studentGuardExtension: StudentGuard,
      updateDocumentIds: false,
      vocabularyTermNode: VocabularyTermRuntimeNode,
    }),
    ...composition.blocks.extensions,
  ];
}

export interface RuntimeSemanticDocumentSource {
  readonly semantics: SemanticDocumentSnapshot;
  readonly courseStructure: ProjectedCourseStructure;
}

class RuntimeSemanticDocumentController {
  readonly controlBindings: ControlBindingRegistryPort;
  readonly environment: SemanticTargetInteractionEnvironment;
  readonly #controlBindingRegistry: ControlBindingRegistry;
  #controlCapabilityCatalogue: ControlCapabilityCatalogue | null = null;
  #controlCapabilityCatalogueSnapshot: SemanticDocumentSnapshot | null = null;
  readonly #environmentOwner: SemanticTargetInteractionEnvironmentOwner;
  readonly #definitions: SemanticDefinitionLookup;
  #revision = 0;
  #snapshot: RuntimeSemanticDocumentSource | null = null;
  #state: EditorState;

  constructor({
    definitions,
    editor,
    state,
  }: {
    readonly definitions: SemanticDefinitionLookup;
    readonly editor: Editor;
    readonly state: EditorState;
  }) {
    this.#definitions = definitions;
    this.#state = state;
    this.#controlBindingRegistry = createControlBindingRegistry({
      requireOwnerControlDefinition: (ownerId) =>
        this.getControlCapabilityCatalogue().requireOwnerControlDefinition(ownerId),
      requireOwnedTargetCapabilities: (ownerId, targetId) =>
        this.getControlCapabilityCatalogue().requireOwnedTargetCapabilities(ownerId, targetId),
    });
    this.controlBindings = Object.freeze({
      register: (binding) => this.#controlBindingRegistry.register(binding),
      get: (ownerId) => this.#controlBindingRegistry.get(ownerId),
      notifyWhenOwnersMounted: (ownerIds, listener) =>
        this.#controlBindingRegistry.notifyWhenOwnersMounted(ownerIds, listener),
    });
    this.#environmentOwner = createSemanticTargetInteractionEnvironment({
      getSemantics: () => this.#getSnapshot().semantics,
      getCourseStructure: () => this.#getSnapshot().courseStructure,
      surfacePresentation: {
        presentSurface: async (surfaceId, signal) => {
          if (signal.aborted) return;
          setRuntimeVisibleSurfaceId(editor, surfaceId);
        },
      },
    });
    this.environment = this.#environmentOwner.environment;
  }

  readonly getControlCapabilityCatalogue = (): ControlCapabilityCatalogue => {
    const snapshot = this.#getSnapshot().semantics;
    if (this.#controlCapabilityCatalogueSnapshot !== snapshot) {
      this.#controlCapabilityCatalogue = createControlCapabilityCatalogue({
        snapshot,
        definitions: this.#definitions,
      });
      this.#controlCapabilityCatalogueSnapshot = snapshot;
    }
    if (!this.#controlCapabilityCatalogue) {
      throw new Error("Runtime Control Capability Catalogue was not created");
    }
    return this.#controlCapabilityCatalogue;
  };

  readonly getSnapshotSource = (): RuntimeSemanticDocumentSource => this.#getSnapshot();

  applyTransaction(transaction: Transaction, state: EditorState): void {
    if (!transaction.docChanged) return;
    this.#state = state;
    this.#revision += 1;
    this.#snapshot = null;
  }

  destroy(): void {
    this.#controlBindingRegistry.dispose();
    this.#environmentOwner.dispose();
  }

  #getSnapshot(): RuntimeSemanticDocumentSource {
    this.#snapshot ??= projectRuntimeSemanticSnapshot(
      this.#state,
      this.#definitions,
      this.#revision,
    );
    return this.#snapshot;
  }
}

function createRuntimeSemanticDocumentExtension(definitions: SemanticDefinitionLookup) {
  return Extension.create({
    name: "runtimeSemanticDocument",

    addExtensions() {
      return [
        createControlCapabilityCatalogueStorageExtension({
          getCatalogue: (editor) =>
            requireRuntimeSemanticDocumentController(editor).getControlCapabilityCatalogue(),
        }),
        createControlBindingRegistryStorageExtension({
          getRegistry: (editor) => requireRuntimeSemanticDocumentController(editor).controlBindings,
        }),
        createSemanticTargetInteractionEnvironmentStorageExtension({
          getEnvironment: (editor) => requireRuntimeSemanticDocumentController(editor).environment,
        }),
      ];
    },

    onDestroy() {
      runtimeSemanticDocumentPluginKey.getState(this.editor.state)?.destroy();
    },

    addProseMirrorPlugins() {
      const editor = this.editor;
      return [
        new Plugin<RuntimeSemanticDocumentController>({
          key: runtimeSemanticDocumentPluginKey,
          state: {
            init: (_configuration, state) =>
              new RuntimeSemanticDocumentController({ definitions, editor, state }),
            apply: (transaction, controller, _oldState, newState) => {
              controller.applyTransaction(transaction, newState);
              return controller;
            },
          },
        }),
      ];
    },
  });
}

function requireRuntimeSemanticDocumentController(
  editor: Editor,
): RuntimeSemanticDocumentController {
  const controller = runtimeSemanticDocumentPluginKey.getState(editor.state);
  if (!controller) {
    throw new Error("Runtime Semantic Document extension is not installed for this editor");
  }
  return controller;
}

export function getRuntimeSemanticDocumentSourceForEditor(
  editor: Editor,
): RuntimeSemanticDocumentSource {
  return requireRuntimeSemanticDocumentController(editor).getSnapshotSource();
}

export function createPresentationContentLayoutPortForEditor(
  editor: Editor,
): PresentationContentLayoutPort {
  const controller = requireRuntimeSemanticDocumentController(editor);
  return Object.freeze({
    apply(request: PresentationContentLayoutRequest) {
      const source = controller.getSnapshotSource();
      const refusal = validatePresentationContentLayoutRequest(request, source);
      if (refusal) return Result.err(refusal);

      const priorDoc = editor.state.doc;
      const transaction = setContentLayoutProjectionBatchMeta(editor.state.tr, {
        snapshot: source.semantics,
        containers: request.containers,
      });
      if (transaction.docChanged) {
        throw new Error("Presentation content-layout projection attempted to mutate the document.");
      }
      editor.view.dispatch(transaction);
      if (editor.state.doc !== priorDoc) {
        throw new Error("Presentation content-layout projection mutated the document.");
      }
      const diagnostics = readContentLayoutProjectionDiagnostics(editor.state);
      const unexpected = diagnostics.find(({ kind }) => kind !== "projection-unavailable");
      if (unexpected) {
        throw new Error(
          `Presentation content-layout projection invariant failed: ${diagnosticLabel(unexpected)}.`,
        );
      }
      const projectionUnavailable = diagnostics.find(
        (diagnostic) => diagnostic.kind === "projection-unavailable",
      );
      if (projectionUnavailable?.kind === "projection-unavailable") {
        return Result.err(
          Object.freeze({
            reason: "projection-refused" as const,
            surfaceId: request.surfaceId,
            containerId: projectionUnavailable.containerId,
            issue: projectionUnavailable.issue,
          }),
        );
      }
      return Result.ok();
    },
    clear() {
      const priorDoc = editor.state.doc;
      const transaction = clearContentLayoutProjectionMeta(editor.state.tr);
      if (transaction.docChanged) {
        throw new Error(
          "Clearing Presentation content-layout projection attempted to mutate the document.",
        );
      }
      editor.view.dispatch(transaction);
      if (editor.state.doc !== priorDoc) {
        throw new Error("Clearing Presentation content-layout projection mutated the document.");
      }
    },
  });
}

function validatePresentationContentLayoutRequest(
  request: PresentationContentLayoutRequest,
  source: RuntimeSemanticDocumentSource,
): PresentationContentLayoutError | null {
  if (!source.courseStructure.surfaceIds.includes(request.surfaceId)) {
    return Object.freeze({
      reason: "surface-not-current" as const,
      surfaceId: request.surfaceId,
      currentSurfaceIds: Object.freeze([...source.courseStructure.surfaceIds]),
    });
  }
  for (const input of request.containers) {
    const item = source.semantics.itemById.get(input.containerId);
    const location = source.semantics.locationById.get(input.containerId);
    if (!item?.presentationContainer || location?.surfaceId !== request.surfaceId) {
      return Object.freeze({
        reason: "container-not-current" as const,
        surfaceId: request.surfaceId,
        containerId: input.containerId,
        currentSurfaceId: location?.surfaceId ?? null,
      });
    }
    if (item.presentationContainer.contentLayout !== input.contentLayout) {
      return Object.freeze({
        reason: "content-layout-changed" as const,
        surfaceId: request.surfaceId,
        containerId: input.containerId,
        expectedContentLayout: input.contentLayout,
        currentContentLayout: item.presentationContainer.contentLayout,
      });
    }
    const currentDirectChildIds = item.children.map(({ id }) => id);
    if (!sameIds(input.directChildIds, currentDirectChildIds)) {
      return Object.freeze({
        reason: "direct-children-changed" as const,
        surfaceId: request.surfaceId,
        containerId: input.containerId,
        expectedDirectChildIds: Object.freeze([...input.directChildIds]),
        currentDirectChildIds: Object.freeze(currentDirectChildIds),
      });
    }
  }
  return null;
}

function sameIds(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((id, index) => id === right[index]);
}

function diagnosticLabel(diagnostic: { readonly kind: string; readonly reason?: string }): string {
  return diagnostic.reason ? `${diagnostic.kind}/${diagnostic.reason}` : diagnostic.kind;
}

function projectRuntimeSemanticSnapshot(
  state: EditorState,
  definitions: SemanticDefinitionLookup,
  revision: number,
): RuntimeSemanticDocumentSource {
  const courseStructure = projectCourseStructure(state.doc.toJSON());
  if (!courseStructure) {
    throw new Error("Cannot project runtime semantics from invalid Course Structure");
  }
  return Object.freeze({
    semantics: projectSemanticDocument({
      doc: state.doc,
      courseStructure,
      definitions,
      revision,
    }),
    courseStructure,
  });
}
