import { KeyValueListDataSchema, type KeyValueListData } from "@scaffold/contracts";

/* KeyValueList — repeated rows of (key, value). Authored content
 * lives in real ProseMirror children; only presentation lives here. */

export const KEY_VALUE_LIST_NODE = "key_value_list";
export const KEY_VALUE_ROW_NODE = "key_value_row";
export const KEY_VALUE_ROW_KEY_NODE = "key_value_row_key";
export const KEY_VALUE_ROW_VALUE_NODE = "key_value_row_value";

export function emptyKeyValueListData(overrides: Partial<KeyValueListData> = {}): KeyValueListData {
  return KeyValueListDataSchema.parse(overrides);
}
