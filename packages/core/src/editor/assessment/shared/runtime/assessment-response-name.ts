function responseNamePart(value: string, fallback: string): string {
  const normalized = value.trim();
  return encodeURIComponent(normalized || fallback);
}

export function assessmentResponseName(authoredBlockId: string, responseId?: string): string {
  const blockName = `assessment-${responseNamePart(authoredBlockId, "pending")}`;
  return responseId === undefined
    ? blockName
    : `${blockName}-response-${responseNamePart(responseId, "pending")}`;
}
