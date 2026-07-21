import type { JSONContent } from "@tiptap/core";
import { z } from "zod";
import { describe, expect, it } from "vite-plus/test";

import { SCAFFOLD_DOCUMENT_FORMAT_VERSION } from "@/schemas/course-document";
import { createSurfaceVariantRegistry } from "@/editor/surfaces/model/surface-variant-registry";

import { validateCourseSurfaceLifecycle } from "./surface-lifecycle-validation";

const registry = createSurfaceVariantRegistry([
  {
    id: "test-page",
    modes: ["page"],
    defaultForModes: ["page"],
    title: "Test page",
    description: "Page validation fixture.",
    settingsSchema: z.object({ tone: z.string().optional() }),
    createSurface: ({ surfaceId }) => surface(surfaceId, "test-page", [{ type: "paragraph" }]),
  },
  {
    id: "test-slide",
    modes: ["slideshow"],
    defaultForModes: ["slideshow"],
    title: "Test slide",
    description: "Slideshow validation fixture.",
    settingsSchema: z.object({ density: z.number().default(1) }),
    structurePolicy: {
      fixedChildren: [
        { type: "heading", attrs: { level: 1 } },
        { type: "region", attrs: { role: "main" } },
      ],
    },
    createSurface: ({ surfaceId }) =>
      surface(
        surfaceId,
        "test-slide",
        [
          { type: "heading", attrs: { level: 1 } },
          { type: "region", attrs: { role: "main" } },
        ],
        { density: 1 },
      ),
  },
  {
    id: "test-slide-transformed-settings",
    modes: ["slideshow"],
    title: "Transformed settings slide",
    description: "Settings exactness fixture.",
    settingsSchema: z.object({ label: z.string().transform((value) => value.trim()) }),
    createSurface: ({ surfaceId }) =>
      surface(surfaceId, "test-slide-transformed-settings", [{ type: "paragraph" }], {
        label: "trimmed",
      }),
  },
]);

const invalidSettingsCases: [unknown, string, readonly (string | number)[]][] = [
  [{ density: "dense" }, "invalid value", ["density"]],
  [{ density: 1, unknown: true }, "stripped unknown value", ["unknown"]],
  [{}, "inserted default value", ["density"]],
];

const invalidModeCases: [
  "page" | "slideshow" | "branching",
  readonly JSONContent[],
  "invalid_surface_cardinality" | "unsupported_surface_mode",
][] = [
  ["page", [], "invalid_surface_cardinality"],
  [
    "page",
    [surface("page-1", "test-page"), surface("page-2", "test-page")],
    "invalid_surface_cardinality",
  ],
  ["slideshow", [], "invalid_surface_cardinality"],
  ["branching", [surface("page-1", "test-page")], "unsupported_surface_mode"],
];

describe("surface lifecycle validation", () => {
  it("returns a frozen ordered page projection without mutating input", () => {
    const content = document("page", [
      surface("page-1", "test-page", [{ type: "paragraph" }], { tone: "quiet" }),
    ]);
    const before = structuredClone(content);

    const result = validateCourseSurfaceLifecycle({ content, registry });

    expect(result).toMatchObject({
      ok: true,
      value: {
        mode: "page",
        surfaces: [{ instanceId: "page-1", variantId: "test-page" }],
      },
    });
    expect(content).toEqual(before);
    expect(Object.isFrozen(result)).toBe(true);
    if (!result.ok) throw new Error("expected valid page projection");
    expect(Object.isFrozen(result.value)).toBe(true);
    expect(Object.isFrozen(result.value.surfaces)).toBe(true);
    expect(Object.isFrozen(result.value.surfaces[0])).toBe(true);
    expect(result.value.surfaces[0].definition).toBe(registry.get("test-page"));
  });

  it("preserves slideshow order and allows one variant with distinct instance IDs", () => {
    const first = surface("slide-2", "test-slide", fixedSlideChildren(), { density: 2 });
    const second = surface("slide-1", "test-slide", fixedSlideChildren(), { density: 3 });

    const result = validateCourseSurfaceLifecycle({
      content: document("slideshow", [first, second]),
      registry,
    });

    expect(result).toMatchObject({
      ok: true,
      value: {
        mode: "slideshow",
        surfaces: [
          { instanceId: "slide-2", variantId: "test-slide" },
          { instanceId: "slide-1", variantId: "test-slide" },
        ],
      },
    });
  });

  it("rejects missing and unknown course attrs without normalizing the input", () => {
    const missingDefaults = document("page", [surface("page-1", "test-page")]);
    const missingAttrs = missingDefaults.content?.[0]?.attrs;
    if (!missingAttrs) throw new Error("missing course attrs fixture");
    delete missingAttrs["overflowMode"];
    const unknownAttrs = document("page", [surface("page-1", "test-page")]);
    unknownAttrs.content![0]!.attrs!["unknown"] = true;
    const absentAttrs = document("page", [surface("page-1", "test-page")]);
    delete absentAttrs.content![0]!.attrs;
    const before = [missingDefaults, unknownAttrs, absentAttrs].map((content) =>
      structuredClone(content),
    );

    const results = [missingDefaults, unknownAttrs, absentAttrs].map((content) =>
      validateCourseSurfaceLifecycle({ content, registry }),
    );

    expect(results[0]).toMatchObject({
      ok: false,
      issues: [
        expect.objectContaining({
          code: "invalid_course_document_attrs",
          path: ["content", 0, "attrs", "overflowMode"],
        }),
      ],
    });
    expect(results[1]).toMatchObject({
      ok: false,
      issues: [
        expect.objectContaining({
          code: "invalid_course_document_attrs",
          path: ["content", 0, "attrs", "unknown"],
        }),
      ],
    });
    expect(results[2]).toMatchObject({
      ok: false,
      issues: [
        expect.objectContaining({
          code: "invalid_course_document_attrs",
          path: ["content", 0, "attrs"],
        }),
      ],
    });
    expect([missingDefaults, unknownAttrs, absentAttrs]).toEqual(before);
  });

  it("reports every failing course and surface attr at its schema path", () => {
    const content = document("page", [
      {
        type: "surface",
        attrs: { id: 42, variant: "test-page", notes: 7 },
        content: [{ type: "paragraph" }],
      },
    ]);
    content.content![0]!.attrs = {
      ...content.content![0]!.attrs,
      mode: "deck",
      surfaceSize: "letterbox",
    };

    const result = validateCourseSurfaceLifecycle({ content, registry });

    expect(result).toMatchObject({
      ok: false,
      issues: expect.arrayContaining([
        expect.objectContaining({
          code: "invalid_course_document_attrs",
          path: ["content", 0, "attrs", "mode"],
        }),
        expect.objectContaining({
          code: "invalid_course_document_attrs",
          path: ["content", 0, "attrs", "surfaceSize"],
        }),
        expect.objectContaining({
          code: "invalid_surface_attrs",
          path: ["content", 0, "content", 0, "attrs", "id"],
        }),
        expect.objectContaining({
          code: "invalid_surface_attrs",
          path: ["content", 0, "content", 0, "attrs", "notes"],
        }),
      ]),
    });
  });

  it("rejects unknown surface attrs at the first differing field without mutation", () => {
    const content = document("page", [surface("page-1", "test-page")]);
    content.content![0]!.content![0]!.attrs!["unknown"] = true;
    const before = structuredClone(content);

    const result = validateCourseSurfaceLifecycle({ content, registry });

    expect(result).toMatchObject({
      ok: false,
      issues: [
        expect.objectContaining({
          code: "invalid_surface_attrs",
          path: ["content", 0, "content", 0, "attrs", "unknown"],
        }),
      ],
    });
    expect(content).toEqual(before);
  });

  it("rejects duplicate instance IDs at the second id path", () => {
    const result = validateCourseSurfaceLifecycle({
      content: document("slideshow", [
        surface("duplicate", "test-slide", fixedSlideChildren(), { density: 1 }),
        surface("duplicate", "test-slide", fixedSlideChildren(), { density: 2 }),
      ]),
      registry,
    });

    expect(result).toMatchObject({
      ok: false,
      issues: [
        expect.objectContaining({
          code: "duplicate_surface_id",
          path: ["content", 0, "content", 1, "attrs", "id"],
        }),
      ],
    });
  });

  it.each([
    [{ id: "", variant: "test-page" }, ["attrs", "id"]],
    [{ id: "page-1", variant: "" }, ["attrs", "variant"]],
  ])("rejects invalid identity attrs with a precise path", (attrs, suffix) => {
    const result = validateCourseSurfaceLifecycle({
      content: document("page", [{ type: "surface", attrs, content: [{ type: "paragraph" }] }]),
      registry,
    });

    expect(result).toMatchObject({
      ok: false,
      issues: [
        expect.objectContaining({
          code: "invalid_surface_attrs",
          path: ["content", 0, "content", 0, ...suffix],
        }),
      ],
    });
  });

  it("rejects unknown and mode-incompatible variants", () => {
    const unknown = validateCourseSurfaceLifecycle({
      content: document("page", [surface("page-1", "missing", [{ type: "paragraph" }])]),
      registry,
    });
    const mismatch = validateCourseSurfaceLifecycle({
      content: document("page", [
        surface("page-1", "test-slide", fixedSlideChildren(), { density: 1 }),
      ]),
      registry,
    });

    expect(unknown).toMatchObject({
      ok: false,
      issues: [expect.objectContaining({ code: "unknown_surface_variant" })],
    });
    expect(mismatch).toMatchObject({
      ok: false,
      issues: [expect.objectContaining({ code: "surface_variant_mode_mismatch" })],
    });
  });

  it.each(invalidSettingsCases)("rejects settings with an %s", (settings, _label, suffix) => {
    const result = validateCourseSurfaceLifecycle({
      content: document("slideshow", [
        surface("slide-1", "test-slide", fixedSlideChildren(), settings),
      ]),
      registry,
    });

    expect(result).toMatchObject({
      ok: false,
      issues: [
        expect.objectContaining({
          code: "invalid_surface_settings",
          path: ["content", 0, "content", 0, "attrs", "settings", ...suffix],
        }),
      ],
    });
  });

  it("rejects settings transformed by the registered schema", () => {
    const result = validateCourseSurfaceLifecycle({
      content: document("slideshow", [
        surface("slide-1", "test-slide-transformed-settings", [{ type: "paragraph" }], {
          label: "  trimmed  ",
        }),
      ]),
      registry,
    });

    expect(result).toMatchObject({
      ok: false,
      issues: [
        expect.objectContaining({
          code: "invalid_surface_settings",
          path: ["content", 0, "content", 0, "attrs", "settings", "label"],
        }),
      ],
    });
  });

  it("rejects fixed child type, order, and required attribute mismatches", () => {
    const result = validateCourseSurfaceLifecycle({
      content: document("slideshow", [
        surface(
          "slide-1",
          "test-slide",
          [
            { type: "region", attrs: { role: "main" } },
            { type: "heading", attrs: { level: 2 } },
          ],
          { density: 1 },
        ),
      ]),
      registry,
    });

    expect(result).toMatchObject({
      ok: false,
      issues: [
        expect.objectContaining({
          code: "fixed_surface_child_type_mismatch",
          path: ["content", 0, "content", 0, "content", 0, "type"],
        }),
      ],
    });
  });

  it("rejects duplicate or malformed header/footer boundaries", () => {
    const result = validateCourseSurfaceLifecycle({
      content: document("slideshow", [
        surface(
          "slide-1",
          "test-slide",
          [
            header("surface_header"),
            header("surface_header"),
            ...fixedSlideChildren(),
            header("surface_footer", ["left", "left", "right"]),
          ],
          { density: 1 },
        ),
      ]),
      registry,
    });

    expect(result).toMatchObject({
      ok: false,
      issues: expect.arrayContaining([
        expect.objectContaining({ code: "duplicate_header_footer" }),
        expect.objectContaining({ code: "invalid_header_footer_slots" }),
      ]),
    });
  });

  it.each(invalidModeCases)("rejects invalid %s cardinality or support", (mode, surfaces, code) => {
    const result = validateCourseSurfaceLifecycle({ content: document(mode, surfaces), registry });

    expect(result).toMatchObject({
      ok: false,
      issues: expect.arrayContaining([expect.objectContaining({ code })]),
    });
  });

  it("freezes invalid results and exposes no repair instruction", () => {
    const result = validateCourseSurfaceLifecycle({
      content: document("page", []),
      registry,
    });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected invalid result");
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.issues)).toBe(true);
    expect(result.issues.every((issue) => Object.isFrozen(issue))).toBe(true);
    expect(result.issues.every((issue) => Object.isFrozen(issue.path))).toBe(true);
    expect(result.issues.every((issue) => !("repair" in issue))).toBe(true);
  });
});

function document(
  mode: "page" | "slideshow" | "branching",
  surfaces: readonly JSONContent[],
): JSONContent {
  return {
    type: "doc",
    content: [
      {
        type: "courseDocument",
        attrs: {
          schemaVersion: SCAFFOLD_DOCUMENT_FORMAT_VERSION,
          mode,
          surfaceSize: mode === "slideshow" ? "16x9" : "fluid",
          overflowMode: "grow",
        },
        content: [...surfaces],
      },
    ],
  };
}

function surface(
  id: string,
  variant: string,
  content: JSONContent[] = [{ type: "paragraph" }],
  settings?: unknown,
): JSONContent {
  return {
    type: "surface",
    attrs: { id, variant, ...(settings === undefined ? {} : { settings }) },
    content,
  };
}

function fixedSlideChildren() {
  return [
    { type: "heading", attrs: { level: 1 } },
    { type: "region", attrs: { role: "main" } },
  ];
}

function header(
  type: "surface_header" | "surface_footer",
  positions: readonly string[] = ["left", "center", "right"],
) {
  return {
    type,
    content: positions.map((position) => ({
      type: "surface_header_footer_slot",
      attrs: { position },
      content: [{ type: "paragraph" }],
    })),
  };
}
