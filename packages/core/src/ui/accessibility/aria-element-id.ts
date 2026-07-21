export function createAriaElementId(role: string, ...parts: readonly unknown[]): string {
  return `sc-${role}-${hashParts(parts)}`;
}

function hashParts(parts: readonly unknown[]): string {
  let hash = 0x811c9dc5;
  const input = parts.map((part) => String(part ?? "")).join("|");

  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }

  return (hash >>> 0).toString(36);
}
