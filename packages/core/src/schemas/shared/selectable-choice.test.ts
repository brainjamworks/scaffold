import { describe, expect, expectTypeOf, it } from "vite-plus/test";
import type { EmbeddedNodeId } from "@scaffold/contracts";

import { SelectableChoiceAttrsSchema, type SelectableChoiceAttrs } from "./selectable-choice";

describe("selectable choice identity", () => {
  it("uses the embedded node family for the mounted choice owner", () => {
    const parsed = SelectableChoiceAttrsSchema.parse({ id: "option_00001" });

    expect(parsed).toEqual({ id: "option_00001" });
    expect(SelectableChoiceAttrsSchema.safeParse({ id: "option-1" }).success).toBe(false);
    expectTypeOf(parsed.id).toEqualTypeOf<EmbeddedNodeId>();
    expectTypeOf<SelectableChoiceAttrs["id"]>().toEqualTypeOf<string>();
  });
});
