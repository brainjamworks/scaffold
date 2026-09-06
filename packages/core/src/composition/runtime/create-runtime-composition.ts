import { Extension, type Editor, type Extensions } from "@tiptap/core";
import { Plugin, PluginKey, type EditorState, type Transaction } from "@tiptap/pm/state";

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
  buildDocumentTree,
  type DocumentTreeDefinitionLookup,
  type DocumentTreeSnapshot,
} from "@/document/model/document-tree";
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
    createRuntimeSemanticDocumentExtension(composition.documentTree),
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
  readonly semantics: DocumentTreeSnapshot;
  readonly courseStructure: ProjectedCourseStructure;
}

class RuntimeSemanticDocumentController {
  readonly controlBindings: ControlBindingRegistryPort;
  readonly environment: SemanticTargetInteractionEnvironment;
  readonly #controlBindingRegistry: ControlBindingRegistry;
  #controlCapabilityCatalogue: ControlCapabilityCatalogue | null = null;
  #controlCapabilityCatalogueSnapshot: DocumentTreeSnapshot | null = null;
  readonly #environmentOwner: SemanticTargetInteractionEnvironmentOwner;
  readonly #definitions: DocumentTreeDefinitionLookup;
  #revision = 0;
  #snapshot: RuntimeSemanticDocumentSource | null = null;
  #state: EditorState;

  constructor({
    definitions,
    editor,
    state,
  }: {
    readonly definitions: DocumentTreeDefinitionLookup;
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

function createRuntimeSemanticDocumentExtension(definitions: DocumentTreeDefinitionLookup) {
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

function projectRuntimeSemanticSnapshot(
  state: EditorState,
  definitions: DocumentTreeDefinitionLookup,
  revision: number,
): RuntimeSemanticDocumentSource {
  const courseStructure = projectCourseStructure(state.doc.toJSON());
  if (!courseStructure) {
    throw new Error("Cannot project runtime semantics from invalid Course Structure");
  }
  return Object.freeze({
    semantics: buildDocumentTree({
      doc: state.doc,
      courseStructure,
      definitions,
      revision,
    }),
    courseStructure,
  });
}
