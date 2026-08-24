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
import { ContentLayoutProjectionExtension } from "@/editor/content-layout/prosemirror/content-layout-projection-extension";
import { StudentGuard } from "@/runtime/guards/student-guard";
import {
  RuntimeSurfaceVisibility,
  setRuntimeVisibleSurfaceId,
} from "@/runtime/renderer/runtime-surface-visibility";
import "@/editor/rich-text/view/text-alignment.css";

import type { ScaffoldRuntimeComposition } from "./scaffold-runtime-composition";

const runtimeSemanticTargetInteractionPluginKey =
  new PluginKey<RuntimeSemanticTargetInteractionController>("runtimeSemanticTargetInteraction");

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
    createRuntimeSemanticTargetInteractionExtension(composition.documentSemantics),
    ContentLayoutProjectionExtension,
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

interface RuntimeSemanticSnapshotSource {
  readonly semantics: SemanticDocumentSnapshot;
  readonly courseStructure: ProjectedCourseStructure;
}

class RuntimeSemanticTargetInteractionController {
  readonly environment: SemanticTargetInteractionEnvironment;
  readonly #environmentOwner: SemanticTargetInteractionEnvironmentOwner;
  readonly #definitions: SemanticDefinitionLookup;
  #revision = 0;
  #snapshot: RuntimeSemanticSnapshotSource | null = null;
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

  applyTransaction(transaction: Transaction, state: EditorState): void {
    if (!transaction.docChanged) return;
    this.#state = state;
    this.#revision += 1;
    this.#snapshot = null;
  }

  destroy(): void {
    this.#environmentOwner.dispose();
  }

  #getSnapshot(): RuntimeSemanticSnapshotSource {
    this.#snapshot ??= projectRuntimeSemanticSnapshot(
      this.#state,
      this.#definitions,
      this.#revision,
    );
    return this.#snapshot;
  }
}

function createRuntimeSemanticTargetInteractionExtension(definitions: SemanticDefinitionLookup) {
  return Extension.create({
    name: "runtimeSemanticTargetInteraction",

    addExtensions() {
      return [
        createSemanticTargetInteractionEnvironmentStorageExtension({
          getEnvironment: (editor) => requireRuntimeInteractionController(editor).environment,
        }),
      ];
    },

    onDestroy() {
      runtimeSemanticTargetInteractionPluginKey.getState(this.editor.state)?.destroy();
    },

    addProseMirrorPlugins() {
      const editor = this.editor;
      return [
        new Plugin<RuntimeSemanticTargetInteractionController>({
          key: runtimeSemanticTargetInteractionPluginKey,
          state: {
            init: (_configuration, state) =>
              new RuntimeSemanticTargetInteractionController({ definitions, editor, state }),
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

function requireRuntimeInteractionController(
  editor: Editor,
): RuntimeSemanticTargetInteractionController {
  const controller = runtimeSemanticTargetInteractionPluginKey.getState(editor.state);
  if (!controller) {
    throw new Error(
      "Runtime Semantic Target Interaction extension is not installed for this editor",
    );
  }
  return controller;
}

function projectRuntimeSemanticSnapshot(
  state: EditorState,
  definitions: SemanticDefinitionLookup,
  revision: number,
): RuntimeSemanticSnapshotSource {
  const courseStructure = projectCourseStructure(state.doc.toJSON());
  if (!courseStructure) {
    throw new Error("Cannot project runtime semantics from invalid Course Structure");
  }
  return {
    semantics: projectSemanticDocument({
      doc: state.doc,
      courseStructure,
      definitions,
      revision,
    }),
    courseStructure,
  };
}
