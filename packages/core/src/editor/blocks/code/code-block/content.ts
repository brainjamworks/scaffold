import { CodeBlockDataSchema, type CodeBlockData } from "@scaffold/contracts";

export const CODE_BLOCK_NODE = "code_block";
export const CODE_BLOCK_BODY_NODE = "code_block_body";

export function emptyCodeBlockData(overrides: Partial<CodeBlockData> = {}): CodeBlockData {
  return CodeBlockDataSchema.parse(overrides);
}
