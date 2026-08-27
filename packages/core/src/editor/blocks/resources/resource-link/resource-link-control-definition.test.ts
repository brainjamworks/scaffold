import { describe, expect, it } from "vite-plus/test";

import { resourceLinkBlockDefinition } from "./resource-link-definition";

describe("Resource Link Control Definition", () => {
  it("advertises only the approved root launch event", () => {
    expect(resourceLinkBlockDefinition.control).toEqual({
      owner: {
        events: [{ type: "launched", label: "Resource launched" }],
      },
    });
    expect(resourceLinkBlockDefinition.control?.owner?.states).toBeUndefined();
    expect(resourceLinkBlockDefinition.control?.owner?.commands).toBeUndefined();
    expect(resourceLinkBlockDefinition.control?.semanticChildren).toBeUndefined();
  });
});
