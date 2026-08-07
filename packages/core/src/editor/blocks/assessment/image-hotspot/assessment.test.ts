import { describe, expect, it } from "vite-plus/test";
import { ZodError } from "zod";

import { projectImageHotspotAssessment } from "./assessment";

describe("image-hotspot assessment projection", () => {
  it("rejects dangling assessment references against the complete authored payload", () => {
    const node = {
      type: "image_hotspot",
      attrs: {
        assessment: {
          correctHotspotIds: ["hotsp_000002"],
        },
      },
      content: [
        {
          type: "image_hotspot_canvas",
          attrs: {
            data: {
              hotspots: [
                {
                  id: "hotsp_000001",
                  centerX: 50,
                  centerY: 50,
                  radius: 10,
                  label: "Only hotspot",
                },
              ],
            },
          },
        },
      ],
    };

    try {
      projectImageHotspotAssessment(node);
      throw new Error("Expected the dangling hotspot reference to fail validation");
    } catch (error) {
      expect(error).toBeInstanceOf(ZodError);
      if (!(error instanceof ZodError)) return;
      expect(error.issues).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            path: ["assessment", "correctHotspotIds", 0],
          }),
        ]),
      );
    }
  });
});
