import { nanoid } from "nanoid";

const XBLOCK_ID_SIZE = 12;

export function createXBlockSessionId(): string {
  return `scaffold-xblock-${nanoid(XBLOCK_ID_SIZE)}`;
}

export function createXBlockRequestId(): string {
  return `xblock-bridge-${nanoid(XBLOCK_ID_SIZE)}`;
}
