import { describe, expect, it } from "vite-plus/test";

import {
  EMPTY_SURFACE_OWNED_IMAGE,
  SurfaceOwnedImageSchema,
  defineSurfaceImageRoles,
} from "./surface-owned-image";

describe("surface-owned image values", () => {
  it("accepts empty, populated, and positioned values without materialising centre", () => {
    expect(SurfaceOwnedImageSchema.parse({})).toEqual({});
    expect(SurfaceOwnedImageSchema.parse(EMPTY_SURFACE_OWNED_IMAGE)).toEqual({});
    expect(
      SurfaceOwnedImageSchema.parse({
        imageUrl: "https://example.test/image.png",
        imageAlt: "A described image",
        imagePosition: "bottom-right",
      }),
    ).toEqual({
      imageUrl: "https://example.test/image.png",
      imageAlt: "A described image",
      imagePosition: "bottom-right",
    });
  });

  it("rejects malformed positions and undeclared fields", () => {
    expect(SurfaceOwnedImageSchema.safeParse({ imagePosition: "middle" }).success).toBe(false);
    expect(SurfaceOwnedImageSchema.safeParse({ focalPoint: "top-left" }).success).toBe(false);
  });
});

describe("surface image role maps", () => {
  it.each([
    [["primary"] as const, { primary: {} }],
    [["primary", "secondary"] as const, { primary: {}, secondary: {} }],
    [["primary", "secondary", "tertiary"] as const, { primary: {}, secondary: {}, tertiary: {} }],
  ])("defaults the exact declared roles for %j", (roles, expected) => {
    const schema = defineSurfaceImageRoles(roles);

    expect(schema.parse({})).toEqual(expected);
    const first = schema.parse({});
    const second = schema.parse({});
    expect(first).not.toBe(second);
    for (const role of roles) {
      expect(first[role]).not.toBe(second[role]);
    }
  });

  it("fills missing declared roles without collapsing supplied values", () => {
    const schema = defineSurfaceImageRoles(["primary", "secondary"]);

    expect(schema.parse({ primary: { imageUrl: "https://example.test/one.png" } })).toEqual({
      primary: { imageUrl: "https://example.test/one.png" },
      secondary: {},
    });
  });

  it("rejects roles outside the declared map", () => {
    const schema = defineSurfaceImageRoles(["primary"]);

    expect(schema.safeParse({ primary: {}, secondary: {} }).success).toBe(false);
  });
});
