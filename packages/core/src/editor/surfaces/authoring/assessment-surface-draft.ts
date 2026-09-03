import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import type { Transaction } from "@tiptap/pm/state";
import { z } from "zod";

import type { CheckedMutationResult } from "@/document/model/commands/checked-transactions";
import {
  resolveStableNode,
  type ResolvedStableNode,
} from "@/document/model/identity/resolve-stable-node";
import {
  applyConfigurationDraft,
  readConfigurationDraft,
} from "@/editor/configuration/configuration-access";
import type {
  ConfigurationControlDescriptor,
  ConfigurationDefinition,
} from "@/editor/configuration/definition";
import { SurfaceSettingsSchema } from "@/schemas/course-document";

import {
  matchFixedSurfaceChildren,
  snapshotSurfaceStructureChildrenFromProseMirror,
} from "../model/policies/surface-fixed-structure";
import type {
  FixedSurfaceChild,
  RegisteredSurfaceVariantDefinition,
} from "../model/surface-variant-definition";
import { applySurfaceSettings } from "./commands/surface-settings-command";

export const SURFACE_REGIONS_SECTION_ID = "surface-regions";

export const ASSESSMENT_SURFACE_REGION_CONTROLS = [
  {
    kind: "boolean",
    name: "surface.header.enabled",
    label: "Show header",
    description: "Adds a small editable region at the top of the surface.",
    presentation: "switch",
    placement: {
      sheet: { section: SURFACE_REGIONS_SECTION_ID, order: 10 },
    },
  },
  {
    kind: "boolean",
    name: "surface.footer.enabled",
    label: "Show footer",
    description: "Adds a small editable region at the bottom of the surface.",
    presentation: "switch",
    placement: {
      sheet: { section: SURFACE_REGIONS_SECTION_ID, order: 20 },
    },
  },
] as const satisfies readonly ConfigurationControlDescriptor[];

export function readAssessmentSurfaceDraft({
  surfaceDefinition,
  questionConfiguration,
  expectedQuestion,
  target,
}: {
  surfaceDefinition: RegisteredSurfaceVariantDefinition;
  questionConfiguration: ConfigurationDefinition;
  expectedQuestion: FixedSurfaceChild;
  target: ResolvedStableNode;
}) {
  const questionTarget = resolveFixedQuestionTarget({
    surfaceDefinition,
    expectedQuestion,
    target,
  });
  const surfaceSettings = SurfaceSettingsSchema.parse(target.node.attrs["settings"] ?? {});

  return {
    question: readConfigurationDraft({
      definition: questionConfiguration,
      target: questionTarget,
    }),
    surface: {
      header: surfaceSettings.header ?? { enabled: false },
      footer: surfaceSettings.footer ?? { enabled: false },
    },
  };
}

export function applyAssessmentSurfaceDraft({
  surfaceDefinition,
  questionConfiguration,
  expectedQuestion,
  editSchema,
  tr,
  target,
  value,
}: {
  surfaceDefinition: RegisteredSurfaceVariantDefinition;
  questionConfiguration: ConfigurationDefinition;
  expectedQuestion: FixedSurfaceChild;
  editSchema: z.ZodTypeAny;
  tr: Transaction;
  target: ResolvedStableNode;
  value: unknown;
}): CheckedMutationResult<Transaction> {
  const parsed = editSchema.safeParse(value);
  if (!parsed.success) {
    return {
      ok: false,
      issue: {
        code: "invalid_assessment_surface_configuration",
        message: parsed.error.message,
      },
    };
  }

  const currentSurface = resolveCurrentSurface(tr, target);
  if (!currentSurface.ok) return currentSurface.result;
  const questionTarget = resolveFixedQuestionTarget({
    surfaceDefinition,
    expectedQuestion,
    target: currentSurface.target,
  });
  const questionResult = applyConfigurationDraft({
    definition: questionConfiguration,
    tr,
    target: questionTarget,
    value: parsed.data.question,
  });
  if (!questionResult.ok) return questionResult;

  const surfaceAfterQuestion = resolveCurrentSurface(questionResult.tr, currentSurface.target);
  if (!surfaceAfterQuestion.ok) return surfaceAfterQuestion.result;
  assertExpectedSurfaceOwner(surfaceDefinition, surfaceAfterQuestion.target.node);
  const currentSettings = SurfaceSettingsSchema.parse(
    surfaceAfterQuestion.target.node.attrs["settings"] ?? {},
  );
  const nextSettings = {
    ...currentSettings,
    header: parsed.data.surface.header,
    footer: parsed.data.surface.footer,
  };

  return applySurfaceSettings({
    tr: questionResult.tr,
    target: surfaceAfterQuestion.target,
    attr: "settings",
    schema: surfaceDefinition.settingsSchema,
    value: nextSettings,
  });
}

export function requireFixedQuestionDefinition(
  surfaceDefinition: RegisteredSurfaceVariantDefinition,
): FixedSurfaceChild {
  const fixedChildren = surfaceDefinition.structurePolicy?.fixedChildren;
  if (fixedChildren?.length !== 1) {
    throw new Error(
      `Assessment Surface "${surfaceDefinition.id}" must register exactly one fixed question child.`,
    );
  }
  return fixedChildren[0]!;
}

function resolveFixedQuestionTarget({
  surfaceDefinition,
  expectedQuestion,
  target,
}: {
  surfaceDefinition: RegisteredSurfaceVariantDefinition;
  expectedQuestion: FixedSurfaceChild;
  target: ResolvedStableNode;
}): ResolvedStableNode {
  assertExpectedSurfaceOwner(surfaceDefinition, target.node);

  const match = matchFixedSurfaceChildren(
    snapshotSurfaceStructureChildrenFromProseMirror(target.node),
    [expectedQuestion],
  );
  if (!match.exact) {
    throw new Error(`Assessment Surface "${surfaceDefinition.id}" has malformed fixed content.`);
  }

  let questionTarget: ResolvedStableNode | undefined;
  target.node.forEach((child, offset) => {
    if (child.type.name !== expectedQuestion.type) return;
    if (questionTarget) {
      throw new Error(`Assessment Surface "${surfaceDefinition.id}" has malformed fixed content.`);
    }
    questionTarget = {
      status: "ready",
      node: child,
      pos: target.pos + 1 + offset,
    };
  });
  if (!questionTarget) {
    throw new Error(`Assessment Surface "${surfaceDefinition.id}" has malformed fixed content.`);
  }
  if (typeof questionTarget.node.attrs["id"] !== "string") {
    throw new Error(
      `Assessment Surface "${surfaceDefinition.id}" question is missing its stable id.`,
    );
  }
  return questionTarget;
}

function assertExpectedSurfaceOwner(
  surfaceDefinition: RegisteredSurfaceVariantDefinition,
  node: ProseMirrorNode,
): void {
  if (node.type.name !== "surface") {
    throw new Error(
      `Assessment Surface configuration for "${surfaceDefinition.id}" requires a Surface owner.`,
    );
  }
  const actualVariant = node.attrs["variant"];
  if (actualVariant !== surfaceDefinition.id) {
    throw new Error(
      `Assessment Surface configuration for "${surfaceDefinition.id}" cannot read "${String(actualVariant)}".`,
    );
  }
}

type CurrentSurfaceResolution =
  | { ok: true; target: ResolvedStableNode }
  | { ok: false; result: CheckedMutationResult<Transaction> };

function resolveCurrentSurface(
  tr: Transaction,
  target: ResolvedStableNode,
): CurrentSurfaceResolution {
  const surfaceId = target.node.attrs["id"];
  if (typeof surfaceId !== "string") {
    throw new Error("Assessment Surface configuration owner is missing its stable id.");
  }

  const resolution = resolveStableNode(tr.doc, { id: surfaceId, nodeType: "surface" });
  if (resolution.status === "missing") {
    return {
      ok: false,
      result: {
        ok: false,
        issue: {
          code: "missing_node",
          message: `Assessment Surface "${surfaceId}" was not found.`,
        },
      },
    };
  }
  if (resolution.status === "invalid") {
    if (resolution.reason === "duplicate_id") {
      return {
        ok: false,
        result: {
          ok: false,
          issue: {
            code: "duplicate_node_id",
            message: `Assessment Surface id "${surfaceId}" is duplicated.`,
          },
        },
      };
    }
    return {
      ok: false,
      result: {
        ok: false,
        issue: {
          code: "wrong_node_type",
          message: `Node "${surfaceId}" is not a Surface.`,
        },
      },
    };
  }
  return { ok: true, target: resolution };
}
