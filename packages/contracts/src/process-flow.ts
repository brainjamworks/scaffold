import { z } from "zod";

export const ProcessFlowOrientationSchema = z.enum(["horizontal", "vertical"]);
export type ProcessFlowOrientation = z.infer<typeof ProcessFlowOrientationSchema>;

export const ProcessFlowDataSchema = z.object({
  type: z.literal("process_flow").default("process_flow"),
  orientation: ProcessFlowOrientationSchema.default("horizontal"),
  showNumbers: z.boolean().default(true),
  showConnectors: z.boolean().default(true),
});
export type ProcessFlowData = z.infer<typeof ProcessFlowDataSchema>;
