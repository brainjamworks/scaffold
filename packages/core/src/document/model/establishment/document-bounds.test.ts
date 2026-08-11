import { describe, expect, it } from "vite-plus/test";
import { ScaffoldArtifactSchema } from "@/schemas/course-document";

import { DEFAULT_DOCUMENT_BOUNDS, inspectBoundedJson } from "./document-bounds";

describe("inspectBoundedJson", () => {
  it("accepts exact limits and reports node count, depth and an owned clone", () => {
    const input = { type: "doc", content: [{ type: "leaf" }] };
    expect(inspectBoundedJson(input, { maxNodeCount: 2, maxNestingDepth: 3 })).toEqual({
      ok: true,
      ownedValue: input,
      nodeCount: 2,
      nestingDepth: 3,
    });
  });

  it.each([
    [{ maxNodeCount: 1, maxNestingDepth: 3 }, "document_nodes_exceeded"],
    [{ maxNodeCount: 2, maxNestingDepth: 2 }, "document_depth_exceeded"],
  ] as const)("rejects one past a resource limit", (limits, code) => {
    expect(inspectBoundedJson({ type: "doc", content: [{ type: "leaf" }] }, limits)).toEqual(
      expect.objectContaining({ ok: false, issue: expect.objectContaining({ code }) }),
    );
  });

  it("does not impose an arbitrary serialized-byte ceiling", () => {
    expect(
      inspectBoundedJson({ type: "doc", text: "x".repeat(5 * 1024 * 1024 + 1) }),
    ).toMatchObject({ ok: true, nodeCount: 1 });
  });

  it("rejects cycles and non-JSON values at their structural paths", () => {
    const cyclic: Record<string, unknown> = { type: "doc" };
    cyclic["content"] = [cyclic];

    expect(inspectBoundedJson(cyclic, DEFAULT_DOCUMENT_BOUNDS)).toEqual({
      ok: false,
      issue: expect.objectContaining({ code: "cyclic_json", path: ["content", 0] }),
    });
    expect(
      inspectBoundedJson({ type: "doc", attrs: { bad: undefined } }, DEFAULT_DOCUMENT_BOUNDS),
    ).toEqual({
      ok: false,
      issue: expect.objectContaining({ code: "invalid_json_value", path: ["attrs", "bad"] }),
    });
  });

  it("rejects accessors without invoking attacker-controlled code", () => {
    let invoked = false;
    const hostile = Object.defineProperty({}, "type", {
      enumerable: true,
      get() {
        invoked = true;
        return "doc";
      },
    });

    expect(inspectBoundedJson(hostile, DEFAULT_DOCUMENT_BOUNDS)).toEqual({
      ok: false,
      issue: expect.objectContaining({ code: "invalid_json_value", path: [] }),
    });
    expect(invoked).toBe(false);
  });

  it.each(["ownKeys", "getOwnPropertyDescriptor", "getPrototypeOf"] as const)(
    "contains a throwing %s Proxy trap",
    (trap) => {
      const hostile = new Proxy(
        { type: "doc" },
        {
          [trap]() {
            throw new Error("hostile trap");
          },
        },
      );

      expect(() => inspectBoundedJson(hostile)).not.toThrow();
      expect(inspectBoundedJson(hostile)).toEqual({
        ok: false,
        issue: expect.objectContaining({ code: "invalid_json_value", path: [] }),
      });
    },
  );

  it("clones captured descriptor values without re-reading a mutating source", () => {
    const source = { type: "doc", title: "captured" };
    const hostile = new Proxy(source, {
      getOwnPropertyDescriptor(target, property) {
        const descriptor = Reflect.getOwnPropertyDescriptor(target, property);
        if (property === "title") target.title = "mutated-after-capture";
        return descriptor;
      },
    });

    const inspected = inspectBoundedJson(hostile);

    expect(inspected).toMatchObject({
      ok: true,
      ownedValue: { type: "doc", title: "captured" },
    });
    expect(source.title).toBe("mutated-after-capture");
  });

  it("accepts serializable null-prototype attrs emitted by ProseMirror", () => {
    const attrs = Object.assign(Object.create(null) as Record<string, unknown>, {
      id: "paragraph001",
    });

    expect(inspectBoundedJson({ type: "paragraph", attrs }, DEFAULT_DOCUMENT_BOUNDS)).toEqual(
      expect.objectContaining({ ok: true, nodeCount: 1 }),
    );
  });

  it("preserves own __proto__ keys without mutating cloned prototypes", () => {
    const input = JSON.parse(
      '{"type":"doc","attrs":{"original":{"ordinary":"kept","__proto__":{"polluted":true}}}}',
    ) as Record<string, unknown>;

    const inspected = inspectBoundedJson(input);

    expect(inspected.ok).toBe(true);
    if (!inspected.ok) return;
    const ownedDocument = inspected.ownedValue as Record<string, unknown>;
    const ownedAttrs = ownedDocument["attrs"] as Record<string, unknown>;
    const ownedOriginal = ownedAttrs["original"] as Record<string, unknown>;
    expect(Object.hasOwn(ownedOriginal, "__proto__")).toBe(true);
    expect(ownedOriginal["__proto__"]).toEqual({ polluted: true });
    expect(ownedOriginal["ordinary"]).toBe("kept");
    expect(Object.getPrototypeOf(ownedDocument)).toBeNull();
    expect(Object.getPrototypeOf(ownedAttrs)).toBeNull();
    expect(Object.getPrototypeOf(ownedOriginal)).toBeNull();
    expect(({} as Record<string, unknown>)["polluted"]).toBeUndefined();
  });

  it("does not turn an outer __proto__ value into inherited artifact fields", () => {
    const input = JSON.parse(
      '{"__proto__":{"id":"artifact-hostile","title":"Inherited","mode":"page","content":{"type":"doc"}}}',
    );

    const inspected = inspectBoundedJson(input);

    expect(inspected.ok).toBe(true);
    if (!inspected.ok) return;
    const ownedArtifact = inspected.ownedValue as Record<string, unknown>;
    expect(Object.hasOwn(ownedArtifact, "__proto__")).toBe(true);
    expect(Object.hasOwn(ownedArtifact, "id")).toBe(false);
    expect(ownedArtifact["id"]).toBeUndefined();
    expect(Object.getPrototypeOf(ownedArtifact)).toBeNull();
    expect(ScaffoldArtifactSchema.safeParse(ownedArtifact).success).toBe(false);
  });
});
