import { nanoid } from "nanoid";

const ID_TOKEN_SIZE = 12;

export function createStableId(): string {
  return nanoid(ID_TOKEN_SIZE);
}
