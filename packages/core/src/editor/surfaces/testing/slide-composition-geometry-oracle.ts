import type { SlideCompositionKind } from "../model/slide-composition-definition";

export type CompositionGridLevel = "surface" | "content";

export type CompositionParticipantKey =
  | "surface"
  | "content-host"
  | "title"
  | "region:main"
  | "region:primary"
  | "region:secondary"
  | "region:tertiary"
  | "image:primary"
  | "image:secondary"
  | "image:tertiary";

type RelationshipBase = {
  readonly participants: readonly CompositionParticipantKey[];
};

export type CompositionGeometryRelationship =
  | (RelationshipBase & {
      readonly kind: "presence";
      readonly absentWhenTitleHidden: readonly CompositionParticipantKey[];
    })
  | (RelationshipBase & {
      readonly kind: "topology";
      readonly level: CompositionGridLevel;
      readonly topology: "single" | "rows" | "columns" | "overlay";
    })
  | (RelationshipBase & {
      readonly kind: "order";
      readonly level: CompositionGridLevel;
      readonly default: readonly CompositionParticipantKey[];
      readonly reversed?: readonly CompositionParticipantKey[];
    })
  | (RelationshipBase & {
      readonly kind: "spanning";
      readonly level: CompositionGridLevel;
      readonly participant: CompositionParticipantKey;
      readonly across: readonly CompositionParticipantKey[];
    })
  | (RelationshipBase & {
      readonly kind: "track-weights";
      readonly level: CompositionGridLevel;
      readonly weights: "equal" | "proportion" | "dominant-supporting" | "fixed-title-rail";
      readonly travelsWithRoles: boolean;
    })
  | (RelationshipBase & {
      readonly kind: "spacing";
      readonly level: CompositionGridLevel;
      readonly inset: 0 | 32;
      readonly gap: 0 | 16;
    })
  | (RelationshipBase & {
      readonly kind: "reclamation";
      readonly level: CompositionGridLevel;
      readonly when: "title-hidden";
    })
  | (RelationshipBase & {
      readonly kind: "centring";
      readonly level: CompositionGridLevel;
      readonly participant: CompositionParticipantKey;
      readonly axis: "inline";
      readonly bounded: true;
    })
  | (RelationshipBase & {
      readonly kind: "containment";
      readonly container: CompositionParticipantKey;
    });

export const COMPOSITION_GEOMETRY_ORACLE = {
  content: [
    {
      kind: "presence",
      participants: ["surface", "content-host", "title", "region:main"],
      absentWhenTitleHidden: ["title"],
    },
    { kind: "topology", level: "surface", topology: "single", participants: ["content-host"] },
    {
      kind: "topology",
      level: "content",
      topology: "rows",
      participants: ["title", "region:main"],
    },
    { kind: "spacing", level: "surface", inset: 32, gap: 0, participants: ["content-host"] },
    {
      kind: "spacing",
      level: "content",
      inset: 0,
      gap: 16,
      participants: ["title", "region:main"],
    },
    {
      kind: "order",
      level: "content",
      default: ["title", "region:main"],
      participants: ["title", "region:main"],
    },
    {
      kind: "reclamation",
      level: "content",
      when: "title-hidden",
      participants: ["region:main"],
    },
    {
      kind: "containment",
      container: "surface",
      participants: ["content-host"],
    },
    {
      kind: "containment",
      container: "content-host",
      participants: ["title", "region:main"],
    },
  ],
  "two-columns": [
    {
      kind: "presence",
      participants: ["surface", "content-host", "title", "region:primary", "region:secondary"],
      absentWhenTitleHidden: ["title"],
    },
    { kind: "topology", level: "surface", topology: "single", participants: ["content-host"] },
    {
      kind: "topology",
      level: "content",
      topology: "columns",
      participants: ["title", "region:primary", "region:secondary"],
    },
    {
      kind: "order",
      level: "content",
      default: ["region:primary", "region:secondary"],
      reversed: ["region:secondary", "region:primary"],
      participants: ["region:primary", "region:secondary"],
    },
    {
      kind: "spanning",
      level: "content",
      participant: "title",
      across: ["region:primary", "region:secondary"],
      participants: ["title", "region:primary", "region:secondary"],
    },
    {
      kind: "track-weights",
      level: "content",
      participants: ["region:primary", "region:secondary"],
      weights: "proportion",
      travelsWithRoles: true,
    },
    {
      kind: "spacing",
      level: "surface",
      inset: 32,
      gap: 16,
      participants: ["content-host", "title", "region:primary", "region:secondary"],
    },
    {
      kind: "reclamation",
      level: "content",
      when: "title-hidden",
      participants: ["region:primary", "region:secondary"],
    },
    {
      kind: "containment",
      container: "surface",
      participants: ["content-host"],
    },
    {
      kind: "containment",
      container: "content-host",
      participants: ["title", "region:primary", "region:secondary"],
    },
  ],
  "three-columns": [
    {
      kind: "presence",
      participants: [
        "surface",
        "content-host",
        "title",
        "region:primary",
        "region:secondary",
        "region:tertiary",
      ],
      absentWhenTitleHidden: ["title"],
    },
    { kind: "topology", level: "surface", topology: "single", participants: ["content-host"] },
    {
      kind: "topology",
      level: "content",
      topology: "columns",
      participants: ["title", "region:primary", "region:secondary", "region:tertiary"],
    },
    {
      kind: "spanning",
      level: "content",
      participant: "title",
      across: ["region:primary", "region:secondary", "region:tertiary"],
      participants: ["title", "region:primary", "region:secondary", "region:tertiary"],
    },
    {
      kind: "track-weights",
      level: "content",
      participants: ["region:primary", "region:secondary", "region:tertiary"],
      weights: "equal",
      travelsWithRoles: false,
    },
    {
      kind: "spacing",
      level: "surface",
      inset: 32,
      gap: 16,
      participants: [
        "content-host",
        "title",
        "region:primary",
        "region:secondary",
        "region:tertiary",
      ],
    },
    {
      kind: "reclamation",
      level: "content",
      when: "title-hidden",
      participants: ["region:primary", "region:secondary", "region:tertiary"],
    },
    { kind: "containment", container: "surface", participants: ["content-host"] },
    {
      kind: "containment",
      container: "content-host",
      participants: ["title", "region:primary", "region:secondary", "region:tertiary"],
    },
  ],
  "two-stacked": [
    {
      kind: "presence",
      participants: ["surface", "content-host", "title", "region:primary", "region:secondary"],
      absentWhenTitleHidden: ["title"],
    },
    { kind: "topology", level: "surface", topology: "single", participants: ["content-host"] },
    {
      kind: "topology",
      level: "content",
      topology: "rows",
      participants: ["title", "region:primary", "region:secondary"],
    },
    {
      kind: "order",
      level: "content",
      default: ["region:primary", "region:secondary"],
      reversed: ["region:secondary", "region:primary"],
      participants: ["region:primary", "region:secondary"],
    },
    {
      kind: "track-weights",
      level: "content",
      participants: ["region:primary", "region:secondary"],
      weights: "proportion",
      travelsWithRoles: true,
    },
    {
      kind: "spacing",
      level: "surface",
      inset: 32,
      gap: 16,
      participants: ["content-host", "title", "region:primary", "region:secondary"],
    },
    {
      kind: "reclamation",
      level: "content",
      when: "title-hidden",
      participants: ["region:primary", "region:secondary"],
    },
    { kind: "containment", container: "surface", participants: ["content-host"] },
    {
      kind: "containment",
      container: "content-host",
      participants: ["title", "region:primary", "region:secondary"],
    },
  ],
  "side-title": [
    {
      kind: "presence",
      participants: ["surface", "content-host", "title", "region:main"],
      absentWhenTitleHidden: [],
    },
    { kind: "topology", level: "surface", topology: "single", participants: ["content-host"] },
    {
      kind: "topology",
      level: "content",
      topology: "columns",
      participants: ["title", "region:main"],
    },
    {
      kind: "order",
      level: "content",
      default: ["title", "region:main"],
      reversed: ["region:main", "title"],
      participants: ["title", "region:main"],
    },
    {
      kind: "track-weights",
      level: "content",
      participants: ["title", "region:main"],
      weights: "fixed-title-rail",
      travelsWithRoles: true,
    },
    {
      kind: "spacing",
      level: "surface",
      inset: 32,
      gap: 0,
      participants: ["content-host"],
    },
    { kind: "containment", container: "surface", participants: ["content-host", "title"] },
    { kind: "containment", container: "content-host", participants: ["region:main"] },
  ],
  "centred-stage": [
    {
      kind: "presence",
      participants: ["surface", "content-host", "title", "region:main"],
      absentWhenTitleHidden: ["title"],
    },
    { kind: "topology", level: "surface", topology: "single", participants: ["content-host"] },
    {
      kind: "topology",
      level: "content",
      topology: "rows",
      participants: ["title", "region:main"],
    },
    {
      kind: "centring",
      level: "content",
      participant: "region:main",
      axis: "inline",
      bounded: true,
      participants: ["region:main"],
    },
    {
      kind: "spacing",
      level: "surface",
      inset: 32,
      gap: 16,
      participants: ["content-host", "title", "region:main"],
    },
    {
      kind: "reclamation",
      level: "content",
      when: "title-hidden",
      participants: ["region:main"],
    },
    { kind: "containment", container: "surface", participants: ["content-host"] },
    { kind: "containment", container: "content-host", participants: ["title", "region:main"] },
  ],
  editorial: [
    {
      kind: "presence",
      participants: [
        "surface",
        "content-host",
        "title",
        "region:primary",
        "region:secondary",
        "region:tertiary",
      ],
      absentWhenTitleHidden: ["title"],
    },
    { kind: "topology", level: "surface", topology: "single", participants: ["content-host"] },
    {
      kind: "topology",
      level: "content",
      topology: "columns",
      participants: ["title", "region:primary", "region:secondary", "region:tertiary"],
    },
    {
      kind: "order",
      level: "content",
      default: ["region:primary", "region:secondary", "region:tertiary"],
      reversed: ["region:secondary", "region:tertiary", "region:primary"],
      participants: ["region:primary", "region:secondary", "region:tertiary"],
    },
    {
      kind: "spanning",
      level: "content",
      participant: "title",
      across: ["region:primary", "region:secondary", "region:tertiary"],
      participants: ["title", "region:primary", "region:secondary", "region:tertiary"],
    },
    {
      kind: "spanning",
      level: "content",
      participant: "region:primary",
      across: ["region:secondary", "region:tertiary"],
      participants: ["region:primary", "region:secondary", "region:tertiary"],
    },
    {
      kind: "track-weights",
      level: "content",
      participants: ["region:primary", "region:secondary", "region:tertiary"],
      weights: "dominant-supporting",
      travelsWithRoles: true,
    },
    {
      kind: "spacing",
      level: "surface",
      inset: 32,
      gap: 16,
      participants: [
        "content-host",
        "title",
        "region:primary",
        "region:secondary",
        "region:tertiary",
      ],
    },
    {
      kind: "reclamation",
      level: "content",
      when: "title-hidden",
      participants: ["region:primary", "region:secondary", "region:tertiary"],
    },
    { kind: "containment", container: "surface", participants: ["content-host"] },
    {
      kind: "containment",
      container: "content-host",
      participants: ["title", "region:primary", "region:secondary", "region:tertiary"],
    },
  ],
  "image-content-split": [
    {
      kind: "presence",
      participants: ["surface", "image:primary", "content-host", "title", "region:main"],
      absentWhenTitleHidden: ["title"],
    },
    {
      kind: "topology",
      level: "surface",
      topology: "columns",
      participants: ["image:primary", "content-host"],
    },
    {
      kind: "topology",
      level: "content",
      topology: "rows",
      participants: ["title", "region:main"],
    },
    {
      kind: "order",
      level: "surface",
      default: ["image:primary", "content-host"],
      reversed: ["content-host", "image:primary"],
      participants: ["image:primary", "content-host"],
    },
    {
      kind: "track-weights",
      level: "surface",
      participants: ["image:primary", "content-host"],
      weights: "proportion",
      travelsWithRoles: true,
    },
    {
      kind: "spacing",
      level: "surface",
      inset: 32,
      gap: 16,
      participants: ["image:primary", "content-host"],
    },
    {
      kind: "reclamation",
      level: "content",
      when: "title-hidden",
      participants: ["region:main"],
    },
    {
      kind: "containment",
      container: "surface",
      participants: ["image:primary", "content-host"],
    },
    { kind: "containment", container: "content-host", participants: ["title", "region:main"] },
  ],
  "image-content-stacked": [
    {
      kind: "presence",
      participants: ["surface", "image:primary", "content-host", "title", "region:main"],
      absentWhenTitleHidden: ["title"],
    },
    {
      kind: "topology",
      level: "surface",
      topology: "rows",
      participants: ["image:primary", "content-host"],
    },
    {
      kind: "topology",
      level: "content",
      topology: "rows",
      participants: ["title", "region:main"],
    },
    {
      kind: "order",
      level: "surface",
      default: ["image:primary", "content-host"],
      reversed: ["content-host", "image:primary"],
      participants: ["image:primary", "content-host"],
    },
    {
      kind: "track-weights",
      level: "surface",
      participants: ["image:primary", "content-host"],
      weights: "proportion",
      travelsWithRoles: true,
    },
    {
      kind: "spacing",
      level: "surface",
      inset: 32,
      gap: 16,
      participants: ["image:primary", "content-host"],
    },
    {
      kind: "reclamation",
      level: "content",
      when: "title-hidden",
      participants: ["region:main"],
    },
    {
      kind: "containment",
      container: "surface",
      participants: ["image:primary", "content-host"],
    },
    { kind: "containment", container: "content-host", participants: ["title", "region:main"] },
  ],
  "full-bleed-image": [
    {
      kind: "presence",
      participants: ["surface", "content-host", "title"],
      absentWhenTitleHidden: ["content-host", "title"],
    },
    {
      kind: "topology",
      level: "surface",
      topology: "single",
      participants: ["content-host"],
    },
    { kind: "spacing", level: "content", inset: 32, gap: 0, participants: ["title"] },
    {
      kind: "containment",
      container: "surface",
      participants: ["content-host"],
    },
    { kind: "containment", container: "content-host", participants: ["title"] },
  ],
  "image-backdrop-panel": [
    {
      kind: "presence",
      participants: ["surface", "content-host", "title", "region:main"],
      absentWhenTitleHidden: ["title"],
    },
    {
      kind: "topology",
      level: "surface",
      topology: "single",
      participants: ["content-host"],
    },
    {
      kind: "topology",
      level: "content",
      topology: "rows",
      participants: ["title", "region:main"],
    },
    {
      kind: "track-weights",
      level: "surface",
      participants: ["content-host"],
      weights: "proportion",
      travelsWithRoles: true,
    },
    {
      kind: "spacing",
      level: "content",
      inset: 32,
      gap: 16,
      participants: ["title", "region:main"],
    },
    {
      kind: "reclamation",
      level: "content",
      when: "title-hidden",
      participants: ["region:main"],
    },
    {
      kind: "containment",
      container: "surface",
      participants: ["content-host"],
    },
    { kind: "containment", container: "content-host", participants: ["title", "region:main"] },
  ],
  diptych: [
    {
      kind: "presence",
      participants: ["surface", "content-host", "title", "image:primary", "image:secondary"],
      absentWhenTitleHidden: ["content-host", "title"],
    },
    {
      kind: "topology",
      level: "surface",
      topology: "columns",
      participants: ["content-host", "image:primary", "image:secondary"],
    },
    {
      kind: "spanning",
      level: "surface",
      participant: "content-host",
      across: ["image:primary", "image:secondary"],
      participants: ["content-host", "image:primary", "image:secondary"],
    },
    {
      kind: "track-weights",
      level: "surface",
      participants: ["image:primary", "image:secondary"],
      weights: "equal",
      travelsWithRoles: false,
    },
    {
      kind: "spacing",
      level: "surface",
      inset: 32,
      gap: 16,
      participants: ["content-host", "image:primary", "image:secondary"],
    },
    {
      kind: "reclamation",
      level: "surface",
      when: "title-hidden",
      participants: ["image:primary", "image:secondary"],
    },
    {
      kind: "containment",
      container: "surface",
      participants: ["content-host", "image:primary", "image:secondary"],
    },
    { kind: "containment", container: "content-host", participants: ["title"] },
  ],
  triptych: [
    {
      kind: "presence",
      participants: [
        "surface",
        "content-host",
        "title",
        "image:primary",
        "image:secondary",
        "image:tertiary",
      ],
      absentWhenTitleHidden: ["content-host", "title"],
    },
    {
      kind: "topology",
      level: "surface",
      topology: "columns",
      participants: ["content-host", "image:primary", "image:secondary", "image:tertiary"],
    },
    {
      kind: "spanning",
      level: "surface",
      participant: "content-host",
      across: ["image:primary", "image:secondary", "image:tertiary"],
      participants: ["content-host", "image:primary", "image:secondary", "image:tertiary"],
    },
    {
      kind: "track-weights",
      level: "surface",
      participants: ["image:primary", "image:secondary", "image:tertiary"],
      weights: "equal",
      travelsWithRoles: false,
    },
    {
      kind: "spacing",
      level: "surface",
      inset: 32,
      gap: 16,
      participants: ["content-host", "image:primary", "image:secondary", "image:tertiary"],
    },
    {
      kind: "reclamation",
      level: "surface",
      when: "title-hidden",
      participants: ["image:primary", "image:secondary", "image:tertiary"],
    },
    {
      kind: "containment",
      container: "surface",
      participants: ["content-host", "image:primary", "image:secondary", "image:tertiary"],
    },
    { kind: "containment", container: "content-host", participants: ["title"] },
  ],
} as const satisfies Readonly<
  Record<SlideCompositionKind, readonly CompositionGeometryRelationship[]>
>;
