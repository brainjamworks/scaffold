import {
  Extension,
  type AnyExtension,
  type Extensions,
  type Node as TiptapNode,
} from "@tiptap/core";
import UniqueID from "@tiptap/extension-unique-id";
import Highlight from "@tiptap/extension-highlight";
import Link from "@tiptap/extension-link";
import { InlineMath } from "@tiptap/extension-mathematics";
import Subscript from "@tiptap/extension-subscript";
import Superscript from "@tiptap/extension-superscript";
import { Color, FontSize, TextStyle } from "@tiptap/extension-text-style";
import Underline from "@tiptap/extension-underline";
import StarterKit from "@tiptap/starter-kit";

import { createEmbeddedNodeId } from "@/document/model/identity/stable-ids";
import { CELL_NODE_TYPE, GRID_NODE_TYPE } from "@/editor/arrangements/grid/model/grid-nodes";
import {
  LAYOUT_NODE_TYPE,
  SECTION_NODE_TYPE,
} from "@/editor/arrangements/layout/model/layout-nodes";
import {
  AccordionSectionPanelNode,
  AccordionSectionTitleNode,
} from "@/editor/arrangements/layout/accordion/accordion-section-nodes";
import { AssessmentInstructionsNode } from "@/editor/blocks/assessment/shared/nodes/assessment-instructions";
import { AssessmentPromptNode } from "@/editor/blocks/assessment/shared/nodes/assessment-prompt";
import { AssessmentTitleNode } from "@/editor/blocks/assessment/shared/nodes/assessment-title";
import { SelectableChoiceBodyNode } from "@/editor/blocks/assessment/shared/nodes/selectable-choice";
import { CourseDocumentNode, DocumentNode } from "@/document/model/nodes";
import {
  SurfaceFooterNode,
  SurfaceHeaderNode,
  SurfaceHeaderFooterSlotNode,
} from "@/editor/surfaces/model/nodes/header-footer-slots";
import { REGION_NODE_TYPE, RegionNode } from "@/editor/surfaces/model/nodes/region-node";
import { SURFACE_NODE_TYPE } from "@/editor/surfaces/model/nodes/surface-node";
import { SlideCoverSubtitleNode } from "@/editor/surfaces/model/nodes/slide-cover-subtitle";
import { SlideTitleNode } from "@/editor/surfaces/model/nodes/slide-title";
import { ExtendedParagraph } from "@/editor/rich-text/model/paragraph";
import {
  ExtendedBlockquote,
  ExtendedBulletList,
  ExtendedCodeBlock,
  ExtendedHeading,
  ExtendedHorizontalRule,
  ExtendedListItem,
  ExtendedOrderedList,
} from "@/editor/rich-text/model/rich-text-blocks";
import { isSafeRichTextLinkUri } from "@/editor/rich-text/model/link-safety";
import { MathBlockNode } from "@/editor/rich-text/math/model/MathBlock";
import { InlineIconNode } from "@/editor/rich-text/inline-icon/model/InlineIconNode";
import { KATEX_OPTIONS } from "@/editor/rich-text/math/model/katex-options";
import { VocabularyTermStaticNode } from "@/editor/rich-text/vocabulary-term/static/VocabularyTermStaticNode";
import { createRuntimeBlockFrameAttributesExtension } from "@/editor/frame/model/frame-attributes-extension";
import { createScaffoldTextAlignExtension } from "@/editor/rich-text/model/text-alignment";

export const CORE_STRUCTURAL_SEMANTIC_NODE_TYPES = Object.freeze([
  SURFACE_NODE_TYPE,
  REGION_NODE_TYPE,
  LAYOUT_NODE_TYPE,
  SECTION_NODE_TYPE,
  GRID_NODE_TYPE,
  CELL_NODE_TYPE,
] as const);

const SEMANTIC_NODE_SCHEMA_VALIDATION_EXTENSION = "scaffoldSemanticNodeSchemaValidation";

export function createCourseDocumentInlineContentExtensions({
  inlineIconNode = InlineIconNode,
  mathInlineNode = InlineMath,
  vocabularyTermNode = VocabularyTermStaticNode,
}: {
  inlineIconNode?: TiptapNode;
  mathInlineNode?: TiptapNode;
  vocabularyTermNode?: TiptapNode;
} = {}): Extensions {
  return [
    TextStyle,
    Color.configure({
      types: [TextStyle.name],
    }),
    FontSize.configure({
      types: [TextStyle.name],
    }),
    Highlight.configure({
      multicolor: true,
    }),
    Link.configure({
      isAllowedUri: isSafeRichTextLinkUri,
      openOnClick: false,
    }),
    Underline,
    Subscript,
    Superscript,
    mathInlineNode.configure({ katexOptions: KATEX_OPTIONS }),
    inlineIconNode,
    vocabularyTermNode,
  ];
}

export function createCourseDocumentBaseExtensions({
  cellNode,
  gridNode,
  assessmentActionsGroupNode,
  assessmentChoicesGroupNode,
  assessmentHintNode,
  assessmentHintsGroupNode,
  assessmentSummaryFeedbackNode,
  blockStableIdNodeTypes,
  inlineIconNode,
  layoutNode,
  mathInlineNode,
  selectableChoiceNode,
  sectionNode,
  surfaceNode,
  studentGuardExtension,
  regionNode = RegionNode,
  resizableBlockNodeTypes,
  updateDocumentIds,
  vocabularyTermNode,
}: {
  assessmentActionsGroupNode: TiptapNode;
  assessmentChoicesGroupNode: TiptapNode;
  assessmentHintNode: TiptapNode;
  assessmentHintsGroupNode: TiptapNode;
  assessmentSummaryFeedbackNode: TiptapNode;
  blockStableIdNodeTypes: readonly string[];
  cellNode: TiptapNode;
  gridNode: TiptapNode;
  inlineIconNode: TiptapNode;
  layoutNode: TiptapNode;
  mathInlineNode: TiptapNode;
  selectableChoiceNode: TiptapNode;
  regionNode?: TiptapNode;
  resizableBlockNodeTypes: readonly string[];
  sectionNode: TiptapNode;
  surfaceNode: TiptapNode;
  studentGuardExtension?: AnyExtension;
  updateDocumentIds: boolean;
  vocabularyTermNode: TiptapNode;
}): Extensions {
  const semanticNodeTypes = createSemanticNodeTypes(blockStableIdNodeTypes);

  return [
    DocumentNode,
    StarterKit.configure({
      document: false,
      blockquote: false,
      bulletList: false,
      codeBlock: false,
      heading: false,
      horizontalRule: false,
      link: false,
      listItem: false,
      orderedList: false,
      undoRedo: false,
      paragraph: false,
      underline: false,
    }),
    CourseDocumentNode,
    surfaceNode,
    regionNode,
    SurfaceHeaderNode,
    SurfaceHeaderFooterSlotNode,
    SlideCoverSubtitleNode,
    SlideTitleNode,
    SurfaceFooterNode,
    gridNode,
    cellNode,
    layoutNode,
    sectionNode,
    AccordionSectionTitleNode,
    AccordionSectionPanelNode,
    ExtendedParagraph,
    createRuntimeBlockFrameAttributesExtension(resizableBlockNodeTypes),
    createSemanticNodeSchemaValidationExtension({
      semanticNodeTypes,
      blockSemanticNodeTypes: blockStableIdNodeTypes,
    }),
    UniqueID.configure({
      types: semanticNodeTypes as string[],
      attributeName: "id",
      updateDocument: updateDocumentIds,
      generateID: () => createEmbeddedNodeId(),
    }),
    ExtendedHeading,
    ...createCourseDocumentInlineContentExtensions({
      inlineIconNode,
      mathInlineNode,
      vocabularyTermNode,
    }),
    createScaffoldTextAlignExtension(["paragraph", "heading", "slide_title"]),
    ExtendedBulletList,
    ExtendedOrderedList,
    ExtendedListItem,
    ExtendedBlockquote,
    ExtendedCodeBlock,
    ExtendedHorizontalRule,
    MathBlockNode.configure({ katexOptions: KATEX_OPTIONS }),
    AssessmentTitleNode,
    AssessmentInstructionsNode,
    AssessmentPromptNode,
    assessmentHintNode,
    assessmentChoicesGroupNode,
    assessmentActionsGroupNode,
    assessmentHintsGroupNode,
    assessmentSummaryFeedbackNode,
    SelectableChoiceBodyNode,
    selectableChoiceNode,
    ...(studentGuardExtension ? [studentGuardExtension] : []),
  ];
}

function createSemanticNodeTypes(blockSemanticNodeTypes: readonly string[]): readonly string[] {
  return Object.freeze([
    ...new Set([...CORE_STRUCTURAL_SEMANTIC_NODE_TYPES, ...blockSemanticNodeTypes]),
  ]);
}

function createSemanticNodeSchemaValidationExtension({
  semanticNodeTypes,
  blockSemanticNodeTypes,
}: {
  semanticNodeTypes: readonly string[];
  blockSemanticNodeTypes: readonly string[];
}): Extension {
  const blockNodeTypeSet = new Set(blockSemanticNodeTypes);
  const ownerName = (nodeType: string) =>
    blockNodeTypeSet.has(nodeType) ? "Mounted Block" : "Core structural";

  return Extension.create({
    name: SEMANTIC_NODE_SCHEMA_VALIDATION_EXTENSION,

    addGlobalAttributes() {
      const mountedNodeTypes = new Set(
        this.extensions
          .filter((extension) => extension.type === "node")
          .map((extension) => extension.name),
      );

      for (const nodeType of semanticNodeTypes) {
        if (!mountedNodeTypes.has(nodeType)) {
          throw new Error(
            `${ownerName(nodeType)} semantic node "${nodeType}" is missing from the exact mounted Tiptap schema.`,
          );
        }
      }

      return [];
    },

    onBeforeCreate() {
      for (const nodeType of semanticNodeTypes) {
        if (!this.editor.schema.nodes[nodeType]?.spec.attrs?.["id"]) {
          throw new Error(
            `${ownerName(nodeType)} semantic node "${nodeType}" must declare the shared "id" attribute in the exact mounted Tiptap schema.`,
          );
        }
      }
    },
  });
}
