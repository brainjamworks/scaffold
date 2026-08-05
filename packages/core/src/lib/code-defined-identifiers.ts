const SNAKE_CASE_CODE_NAME = /^[a-z][a-z0-9]*(?:_[a-z0-9]+)*$/;
const KEBAB_CASE_CODE_NAME = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;

export function isBlockNodeType(value: string): boolean {
  return SNAKE_CASE_CODE_NAME.test(value);
}

export function isLayoutVariantId(value: string): boolean {
  return KEBAB_CASE_CODE_NAME.test(value);
}

export function isSurfaceVariantId(value: string): boolean {
  return KEBAB_CASE_CODE_NAME.test(value);
}

export function isInsertActionId(value: string): boolean {
  return KEBAB_CASE_CODE_NAME.test(value);
}

export function isExtensionPackName(value: string): boolean {
  return KEBAB_CASE_CODE_NAME.test(value);
}
