import {
  EmbeddedDataIdSchema,
  EmbeddedNodeIdSchema,
  LearnerInteractionConfigurationV1Schema,
  ScaffoldDocumentContentSchema,
  type EmbeddedNodeId,
  type LearnerInteractionConfigurationV1,
  type LearnerInteractionRuleV1,
} from "@scaffold/contracts";
import type { JSONContent } from "@tiptap/core";
import { Result } from "better-result";

import type {
  ControlCapabilityCatalogue,
  ResolvedControlTarget,
} from "@/document/control-binding/control-capability-catalogue";
import type { ControlCapabilitySetDefinition } from "@/document/control-binding/control-definition";
import { projectCourseStructure } from "@/document/model/course-structure/course-structure-projection";
import type {
  DocumentTreeSnapshot,
  DocumentTreeItem,
  DocumentItemLocation,
} from "@/document/model/document-tree";
import type { ProjectedSlideshowCourseStructure } from "@/document/model/course-structure";
import { createEmbeddedNodeId } from "@/document/model/identity/stable-ids";
import { createTabsContent } from "@/editor/arrangements/layout/tabs/tabs-content";
import { tabsLayoutDefinition } from "@/editor/arrangements/layout/tabs/tabs-definition";
import { slideContentSurfaceDefinition } from "@/editor/surfaces/model/templates/slide-content";
import { slideCoverSurfaceDefinition } from "@/editor/surfaces/model/templates/slide-cover";
import { getCourseDocumentDefaultsForMode } from "@/document/model/course-document-defaults";
import {
  SCAFFOLD_DOCUMENT_FORMAT_VERSION,
  CourseDocumentAttrsSchema,
} from "@/schemas/course-document";

import {
  projectLearnerInteractionAuthoring,
  type LearnerInteractionAuthoringProjection,
} from "../model/learner-interaction-authoring-projection";

/**
 * RIZ-328 §14(a) fixture: a slideshow with one Cover slide, one Content
 * slide holding a Tabs block, and one saved learner-interactions rule on
 * the Content slide. Built from the real surface definitions, the real
 * Tabs content builder and schema-parsed ids — no hand-typed JSON that
 * could drift from the schema. The playground seeds this under
 * INTERACTIONS_FIXTURE_ARTIFACT_ID for `?fixture=interactions`.
 */
export const INTERACTIONS_FIXTURE_ARTIFACT_ID = "scaffold-interactions-fixture";

export const INTERACTIONS_FIXTURE_IDS = Object.freeze({
  section: EmbeddedNodeIdSchema.parse("section00001"),
  coverSurface: EmbeddedNodeIdSchema.parse("surface00001"),
  contentSurface: EmbeddedNodeIdSchema.parse("surface00002"),
  tabsLayout: EmbeddedNodeIdSchema.parse("tabs00000001"),
  tabOne: EmbeddedNodeIdSchema.parse("tabsection01"),
  tabTwo: EmbeddedNodeIdSchema.parse("tabsection02"),
  rule: EmbeddedDataIdSchema.parse("rule00000001"),
});

export type InteractionsFixtureIds = typeof INTERACTIONS_FIXTURE_IDS;

const TAB_SECTION_CAPABILITIES: ControlCapabilitySetDefinition =
  tabsLayoutDefinition.control.semanticChildren.section;

function fixtureRule(): LearnerInteractionRuleV1 {
  return {
    id: INTERACTIONS_FIXTURE_IDS.rule,
    isEnabled: true,
    when: { targetId: INTERACTIONS_FIXTURE_IDS.tabOne, type: "selected" },
    conditions: [],
    commands: [
      {
        kind: "target-command",
        command: { targetId: INTERACTIONS_FIXTURE_IDS.tabTwo, type: "select" },
      },
    ],
  };
}

function fixtureConfiguration(): LearnerInteractionConfigurationV1 {
  return LearnerInteractionConfigurationV1Schema.parse({
    schemaVersion: 1,
    surfaces: [
      {
        surfaceId: INTERACTIONS_FIXTURE_IDS.contentSurface,
        rules: [fixtureRule()],
      },
    ],
  });
}

function withFixtureNodeIds(tabs: JSONContent): JSONContent {
  const layout = { ...tabs, attrs: { ...tabs.attrs, id: INTERACTIONS_FIXTURE_IDS.tabsLayout } };
  const sections = (layout.content ?? []).slice(0, 2);
  const ids = [INTERACTIONS_FIXTURE_IDS.tabOne, INTERACTIONS_FIXTURE_IDS.tabTwo];
  layout.content = sections.map((section, index) => ({
    ...section,
    attrs: { ...section?.attrs, id: ids[index] },
  }));
  return layout;
}

function assignMissingNodeIds(root: JSONContent): void {
  const stack = [root];
  while (stack.length > 0) {
    const node = stack.pop()!;
    if (node.type !== "doc" && node.type !== "text") {
      node.attrs = { ...node.attrs, id: node.attrs?.["id"] ?? createEmbeddedNodeId() };
    }
    for (const child of node.content ?? []) stack.push(child);
  }
}

export function createInteractionsFixtureContent(): JSONContent {
  const cover = slideCoverSurfaceDefinition.createSurface({
    surfaceId: INTERACTIONS_FIXTURE_IDS.coverSurface,
  });
  const content = slideContentSurfaceDefinition.createSurface({
    surfaceId: INTERACTIONS_FIXTURE_IDS.contentSurface,
  });
  const region = content.content?.find((child) => child.type === "region");
  if (!region) throw new Error("Expected a main region in the content slide template.");
  region.content = [
    ...(region.content ?? []),
    withFixtureNodeIds(createTabsContent({ tabs: 2 })),
  ];
  assignMissingNodeIds(cover);
  assignMissingNodeIds(content);

  const defaults = getCourseDocumentDefaultsForMode("slideshow");
  const attrs = CourseDocumentAttrsSchema.parse({
    schemaVersion: SCAFFOLD_DOCUMENT_FORMAT_VERSION,
    requiresScaffoldPlus: false,
    mode: defaults.mode,
    surfaceSize: defaults.surfaceSize,
    overflowMode: defaults.overflowMode,
    theme: defaults.theme,
    learnerInteractions: fixtureConfiguration(),
  });

  return {
    type: "doc",
    content: [
      {
        type: "courseDocument",
        // CourseDocumentAttrsSchema validates document settings, not mounted node identity.
        attrs: { ...attrs, id: createEmbeddedNodeId() },
        content: [
          {
            type: "courseSection",
            attrs: {
              id: INTERACTIONS_FIXTURE_IDS.section,
              title: "Interactions",
            },
          },
          cover,
          content,
        ],
      },
    ],
  };
}

export interface InteractionsFixtureArtifact {
  readonly id: string;
  readonly title: string;
  readonly mode: "slideshow";
  readonly content: JSONContent;
}

export function createInteractionsFixtureArtifact(): InteractionsFixtureArtifact {
  return {
    id: INTERACTIONS_FIXTURE_ARTIFACT_ID,
    title: "Interactions fixture",
    mode: "slideshow",
    content: createInteractionsFixtureContent(),
  };
}

interface FixtureSemanticNode {
  readonly id: EmbeddedNodeId;
  readonly kind: DocumentTreeItem["kind"];
  readonly nodeType: string;
  readonly label: string;
  readonly surfaceId: EmbeddedNodeId;
  readonly parentId: EmbeddedNodeId | null;
}

function collectFixtureSemanticNodes(content: JSONContent): FixtureSemanticNode[] {
  const courseDocument = content.content?.[0];
  const surfaces = (courseDocument?.content ?? []).filter((child) => child.type === "surface");
  const nodes: FixtureSemanticNode[] = [];
  for (const surface of surfaces) {
    const surfaceId = EmbeddedNodeIdSchema.parse(surface.attrs?.["id"]);
    nodes.push({
      id: surfaceId,
      kind: "surface",
      nodeType: "surface",
      label: String(surface.attrs?.["variant"] ?? "surface"),
      surfaceId,
      parentId: null,
    });
    const stack: Array<{ node: JSONContent; parentId: EmbeddedNodeId }> = (
      surface.content ?? []
    ).map((node) => ({ node, parentId: surfaceId }));
    while (stack.length > 0) {
      const { node, parentId: nodeParentId } = stack.pop()!;
      let parentId = nodeParentId;
      if (node.type === "layout" || node.type === "section") {
        const id = EmbeddedNodeIdSchema.parse(node.attrs?.["id"]);
        nodes.push({
          id,
          kind: node.type === "layout" ? "layout" : "layout-section",
          nodeType: node.type,
          label: String(node.attrs?.["label"] ?? node.attrs?.["variant"] ?? node.type),
          surfaceId,
          parentId,
        });
        parentId = id;
      }
      for (const child of node.content ?? []) stack.push({ node: child, parentId });
    }
  }
  return nodes;
}

function toDocumentTreeItem(node: FixtureSemanticNode): DocumentTreeItem {
  return Object.freeze({
    id: node.id,
    kind: node.kind,
    nodeType: node.nodeType,
    definitionId: null,
    label: node.label,
    summary: null,
    presentation: Object.freeze({ actionIds: Object.freeze([]), disabledReason: null }),
    presentationContainer: null,
    children: Object.freeze([]),
  });
}

function toDocumentItemLocation(node: FixtureSemanticNode): DocumentItemLocation {
  return Object.freeze({
    id: node.id,
    nodeType: node.nodeType,
    from: 0,
    to: 0,
    selectionTarget: Object.freeze({ kind: "node" as const, pos: 0 }),
    surfaceId: node.surfaceId,
    authoringAnchorId: node.id,
    activationPath: Object.freeze([]),
  });
}

function createFixtureControlCapabilities(sectionIds: ReadonlySet<EmbeddedNodeId>) {
  const resolve = (targetId: EmbeddedNodeId) => {
    if (!sectionIds.has(targetId)) {
      return Result.err(Object.freeze({ reason: "no-declared-capabilities" as const, targetId }));
    }
    const capabilities: ControlCapabilitySetDefinition = TAB_SECTION_CAPABILITIES;
    return Result.ok<ResolvedControlTarget>({
      targetId,
      ownerId: INTERACTIONS_FIXTURE_IDS.tabsLayout,
      capabilities,
    });
  };
  return {
    resolve,
    resolveCommand(targetId: EmbeddedNodeId, type: string) {
      const target = resolve(targetId);
      if (target.isErr()) return Result.err(target.error);
      const command = target.value.capabilities.commands?.find(
        (candidate) => candidate.type === type,
      );
      return command
        ? Result.ok({ targetId, ownerId: target.value.ownerId, command })
        : Result.err(
            Object.freeze({ reason: "command-not-declared" as const, targetId, type }),
          );
    },
    requireOwnedTargetCapabilities(ownerId: EmbeddedNodeId, targetId: EmbeddedNodeId) {
      if (ownerId === INTERACTIONS_FIXTURE_IDS.tabsLayout && sectionIds.has(targetId)) {
        return TAB_SECTION_CAPABILITIES;
      }
      throw new Error("not used by detached projection");
    },
    requireOwnerControlDefinition() {
      throw new Error("not used by detached projection");
    },
  } satisfies ControlCapabilityCatalogue;
}

export interface ProjectedInteractionsFixture {
  readonly content: JSONContent;
  readonly courseStructure: ProjectedSlideshowCourseStructure;
  readonly projection: LearnerInteractionAuthoringProjection;
}

/**
 * Parses the fixture through the document schema, projects the slideshow
 * course structure, then projects learner-interaction authoring for the
 * Content slide against a semantic snapshot and capability catalogue
 * derived from the parsed document (ids and labels read off, declarations
 * from the real Tabs definition).
 */
export function projectInteractionsFixture(content: unknown): ProjectedInteractionsFixture {
  const parsed = ScaffoldDocumentContentSchema.parse(content) as unknown as JSONContent;
  const courseStructure = projectCourseStructure(parsed);
  if (!courseStructure || courseStructure.kind !== "slideshow") {
    throw new Error("Expected the fixture to project a slideshow course structure.");
  }
  const surfaceId = INTERACTIONS_FIXTURE_IDS.contentSurface;
  if (!courseStructure.surfaceById[surfaceId]) {
    throw new Error("Expected the fixture Content slide in the course structure.");
  }

  const nodes = collectFixtureSemanticNodes(parsed);
  const items = nodes.map(toDocumentTreeItem);
  const snapshot: DocumentTreeSnapshot = Object.freeze({
    revision: 1,
    mode: "slideshow" as const,
    roots: Object.freeze(items.filter((item) => item.kind === "surface")),
    itemById: new Map(items.map((item) => [item.id, item])),
    parentById: new Map(nodes.map((node) => [node.id, node.parentId] as const)),
    locationById: new Map(nodes.map((node) => [node.id, toDocumentItemLocation(node)])),
    diagnostics: Object.freeze([]),
  });
  const sectionIds = new Set<EmbeddedNodeId>([
    INTERACTIONS_FIXTURE_IDS.tabOne,
    INTERACTIONS_FIXTURE_IDS.tabTwo,
  ]);
  const configuration = (parsed.content?.[0]?.attrs?.["learnerInteractions"] ?? null) as
    | LearnerInteractionConfigurationV1
    | null;
  const projection = projectLearnerInteractionAuthoring({
    configuration: configuration ?? null,
    surfaceId,
    courseStructure,
    semanticSnapshot: snapshot,
    controlCapabilities: createFixtureControlCapabilities(sectionIds),
  });
  return { content: parsed, courseStructure, projection };
}
