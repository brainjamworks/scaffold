import {
  ClipboardTextIcon as ClipboardText,
  MinusIcon as Minus,
  PlusIcon as Plus,
} from "@phosphor-icons/react";
import { RevoGrid, Template } from "@revolist/react-datagrid";
import type {
  AfterEditEvent,
  ColumnDataSchemaModel,
  ColumnTemplateProp,
  RevoGridCustomEvent,
} from "@revolist/react-datagrid";
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ClipboardEvent,
  type KeyboardEvent,
} from "react";

import { Button } from "@/ui/components/Button/Button";
import { IconButton } from "@/ui/components/IconButton/IconButton";
import * as ToolbarPrimitive from "@/ui/components/Toolbar/Toolbar";
import { createStableId } from "@/document/model/identity/stable-ids";
import { iconSm, iconXs } from "@/ui/tokens/icon-sizes";

import {
  inferDataGridColumnTypes,
  parseClipboardTable,
  type DataGridValue,
} from "./data-grid-model";

import "./data-grid-field.css";

interface DataGridEditorProps {
  ariaLabel?: string;
  ariaLabelledBy?: string;
  disabled?: boolean;
  onChange: (grid: DataGridValue) => void;
  value: DataGridValue;
}

type HeaderEditCallbackRef = {
  current: ((index: number, value: string) => void) | null;
};

const GRID_HEADER_HEIGHT = 44;
const GRID_ROW_HEIGHT = 34;
const GRID_MIN_VISIBLE_ROWS = 3;
const GRID_MAX_VISIBLE_ROWS = 5;

export function DataGridEditor({
  ariaLabel = "Data grid",
  ariaLabelledBy,
  disabled = false,
  onChange,
  value,
}: DataGridEditorProps) {
  const [isPasteOpen, setIsPasteOpen] = useState(false);
  const headerEditCallbackRef = useRef<HeaderEditCallbackRef["current"]>(null);
  const headerInputIdPrefix = useId();
  const pastePanelId = useId();
  const labelProps = ariaLabelledBy
    ? { "aria-labelledby": ariaLabelledBy }
    : { "aria-label": ariaLabel };

  const updateHeader = useCallback(
    (index: number, header: string) => {
      if (disabled) return;
      onChange({
        ...value,
        headers: value.headers.map((current, currentIndex) =>
          currentIndex === index ? header : current,
        ),
      });
    },
    [disabled, onChange, value],
  );

  useEffect(() => {
    headerEditCallbackRef.current = updateHeader;
    return () => {
      if (headerEditCallbackRef.current === updateHeader) {
        headerEditCallbackRef.current = null;
      }
    };
  }, [updateHeader]);

  const gridHeight =
    GRID_HEADER_HEIGHT +
    Math.min(GRID_MAX_VISIBLE_ROWS, Math.max(GRID_MIN_VISIBLE_ROWS, value.rows.length)) *
      GRID_ROW_HEIGHT;

  const revoColumns = useMemo(
    () =>
      value.headers.map((header, index) => ({
        columnTemplate: dataGridHeaderTemplate,
        scaffoldHeaderDisabled: disabled,
        scaffoldHeaderEditCallbackRef: headerEditCallbackRef,
        scaffoldHeaderInputId: `${headerInputIdPrefix}-column-${index + 1}`,
        scaffoldHeaderInputName: `data-grid-column-${index + 1}`,
        scaffoldHeaderValue: header,
        name: header || `Column ${index + 1}`,
        prop: getColumnProp(index),
      })),
    [disabled, headerInputIdPrefix, value.headers],
  );

  const revoSource = useMemo(
    () =>
      value.rows.map((row) =>
        Object.fromEntries(
          value.headers.map((_, index) => [getColumnProp(index), row[index] ?? ""]),
        ),
      ),
    [value.headers, value.rows],
  );

  function handleAfterEdit(event: RevoGridCustomEvent<AfterEditEvent>) {
    if (disabled) return;
    const edit = parseRevoGridEdit(event.detail);
    if (!edit) return;
    updateCell(edit.rowIndex, edit.columnIndex, edit.value);
  }

  function updateCell(rowIndex: number, columnIndex: number, cellValue: string) {
    if (disabled) return;
    const rows = value.rows.map((row, currentRowIndex) =>
      currentRowIndex === rowIndex
        ? value.headers.map((_, currentColumnIndex) =>
            currentColumnIndex === columnIndex ? cellValue : (row[currentColumnIndex] ?? ""),
          )
        : row,
    );

    onChange({
      ...value,
      ...(value.columnTypes
        ? { columnTypes: inferDataGridColumnTypes(rows, value.headers.length) }
        : {}),
      rows,
    });
  }

  function addRow() {
    if (disabled) return;
    onChange({
      ...value,
      ...(value.rowIds ? { rowIds: [...value.rowIds, createStableId()] } : {}),
      rows: [...value.rows, value.headers.map(() => "")],
    });
  }

  function removeRow() {
    if (disabled) return;
    onChange({
      ...value,
      ...(value.rowIds ? { rowIds: value.rowIds.slice(0, -1) } : {}),
      rows: value.rows.length > 1 ? value.rows.slice(0, -1) : value.rows,
    });
  }

  function addColumn() {
    if (disabled) return;
    const nextColumnIndex = value.headers.length;
    onChange({
      ...value,
      ...(value.columnIds ? { columnIds: [...value.columnIds, createStableId()] } : {}),
      ...(value.columnTypes ? { columnTypes: [...value.columnTypes, "text" as const] } : {}),
      headers: [...value.headers, `Column ${nextColumnIndex + 1}`],
      rows: value.rows.map((row) => [...row, ""]),
    });
  }

  function removeColumn() {
    if (disabled) return;
    if (value.headers.length <= 2) return;
    onChange({
      ...value,
      ...(value.columnIds ? { columnIds: value.columnIds.slice(0, -1) } : {}),
      ...(value.columnTypes ? { columnTypes: value.columnTypes.slice(0, -1) } : {}),
      headers: value.headers.slice(0, -1),
      rows: value.rows.map((row) => row.slice(0, -1)),
    });
  }

  function applyClipboardText(text: string) {
    if (disabled) return;
    const cells = parseClipboardTable(text);
    const [headers, ...rows] = cells;
    if (!headers || headers.length === 0) return;
    const nextRows = rows.length > 0 ? rows : [headers.map(() => "")];
    onChange({
      ...(value.columnIds ? { columnIds: headers.map(() => createStableId()) } : {}),
      ...(value.columnTypes
        ? { columnTypes: inferDataGridColumnTypes(nextRows, headers.length) }
        : {}),
      headers,
      ...(value.rowIds
        ? {
            rowIds: nextRows.map(() => createStableId()),
          }
        : {}),
      rows: nextRows,
    });
    setIsPasteOpen(false);
  }

  function handlePasteTable(event: ClipboardEvent<HTMLTextAreaElement>) {
    event.preventDefault();
    event.stopPropagation();
    applyClipboardText(event.clipboardData.getData("text/plain"));
  }

  function stopShortcutPropagation(event: KeyboardEvent<HTMLTextAreaElement>) {
    event.stopPropagation();
  }

  return (
    <div
      className="sc-settings-data-grid"
      data-testid="settings-data-grid-editor"
      role="group"
      {...labelProps}
    >
      <div className="sc-settings-data-grid__grid-shell" style={{ height: gridHeight }}>
        <RevoGrid
          canFocus
          className="sc-settings-data-grid__grid"
          columns={revoColumns}
          data-testid="settings-revogrid"
          onAfteredit={handleAfterEdit}
          readonly={disabled}
          resize
          rowHeaders
          source={revoSource}
          stretch
          style={{ height: gridHeight, minHeight: gridHeight, width: "100%" }}
          theme="compact"
          useClipboard
          {...labelProps}
        />
      </div>

      {/* Row/column actions cluster: tight IconButton group on the left
          (rows + columns), Paste-table pill button on the right. The
          icon-only cluster keeps the visual weight on the grid itself,
          not the chrome. */}
      <ToolbarPrimitive.Root
        aria-label={`${ariaLabel} actions`}
        className="sc-settings-data-grid__toolbar"
      >
        <div role="group" className="sc-settings-data-grid__action-group" aria-label="Row actions">
          <IconButton
            type="button"
            variant="ghost"
            size="md"
            aria-label="Add row"
            title="Add row"
            disabled={disabled}
            onClick={addRow}
          >
            <Plus size={iconSm} weight="bold" />
          </IconButton>
          <IconButton
            type="button"
            variant="ghost"
            size="md"
            aria-label={dataGridRemoveRowLabel(value.rows.length)}
            title={dataGridRemoveRowLabel(value.rows.length)}
            disabled={disabled || value.rows.length <= 1}
            onClick={removeRow}
          >
            <Minus size={iconSm} weight="bold" />
          </IconButton>
          <span aria-hidden className="sc-settings-data-grid__action-label">
            row
          </span>
        </div>

        <div
          role="group"
          className="sc-settings-data-grid__action-group"
          aria-label="Column actions"
        >
          <IconButton
            type="button"
            variant="ghost"
            size="md"
            aria-label="Add column"
            title="Add column"
            disabled={disabled}
            onClick={addColumn}
          >
            <Plus size={iconSm} weight="bold" />
          </IconButton>
          <IconButton
            type="button"
            variant="ghost"
            size="md"
            aria-label={dataGridRemoveColumnLabel(value.headers.length, value.headers.at(-1))}
            title={dataGridRemoveColumnLabel(value.headers.length, value.headers.at(-1))}
            disabled={disabled || value.headers.length <= 2}
            onClick={removeColumn}
          >
            <Minus size={iconSm} weight="bold" />
          </IconButton>
          <span aria-hidden className="sc-settings-data-grid__action-label">
            col
          </span>
        </div>

        <ToolbarPrimitive.Button asChild>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="sc-settings-data-grid__paste-action"
            aria-controls={pastePanelId}
            aria-expanded={isPasteOpen}
            disabled={disabled}
            onClick={() => setIsPasteOpen((current) => !current)}
          >
            <ClipboardText size={iconXs} weight="bold" />
            Paste table
          </Button>
        </ToolbarPrimitive.Button>
      </ToolbarPrimitive.Root>

      {isPasteOpen && (
        <div
          className="sc-settings-data-grid__paste-panel"
          data-testid="settings-data-grid-paste-panel"
          id={pastePanelId}
          role="region"
          aria-label="Paste table"
        >
          <textarea
            aria-label="Paste table"
            onKeyDown={stopShortcutPropagation}
            onKeyUp={stopShortcutPropagation}
            onPaste={handlePasteTable}
            placeholder={"Fruit\tVotes\nApples\t12\nBananas\t18"}
            rows={4}
            value=""
            onChange={() => undefined}
            disabled={disabled}
            className="sc-settings-data-grid__paste-input"
          />
        </div>
      )}
    </div>
  );
}

type HeaderTemplateProps = ColumnTemplateProp & {
  scaffoldHeaderDisabled?: boolean;
  scaffoldHeaderEditCallbackRef?: HeaderEditCallbackRef;
  scaffoldHeaderInputId?: string;
  scaffoldHeaderInputName?: string;
  scaffoldHeaderValue?: string;
};

function HeaderEditor(props: ColumnDataSchemaModel | ColumnTemplateProp) {
  const headerProps = "index" in props ? (props as HeaderTemplateProps) : null;
  const columnIndex = headerProps?.index ?? 0;
  const fallback = `Column ${columnIndex + 1}`;
  const headerValue =
    typeof headerProps?.scaffoldHeaderValue === "string"
      ? headerProps.scaffoldHeaderValue
      : typeof headerProps?.name === "string"
        ? headerProps.name
        : "";
  const [draft, setDraft] = useState(headerValue);
  const latestDraftRef = useRef(headerValue);
  const skipNextBlur = useRef(false);

  if (!headerProps) return null;
  const safeHeaderProps = headerProps;

  function commit(nextDraft = latestDraftRef.current) {
    if (nextDraft === headerValue) return;
    safeHeaderProps.scaffoldHeaderEditCallbackRef?.current?.(safeHeaderProps.index, nextDraft);
  }

  function blurAfterHandlingKeyboard(input: HTMLInputElement) {
    skipNextBlur.current = true;
    input.blur();
  }

  return (
    <input
      aria-label={dataGridHeaderEditorAccessibilityLabel({
        fallback,
        headerValue,
      })}
      className="sc-settings-data-grid__header-input"
      id={safeHeaderProps.scaffoldHeaderInputId}
      name={safeHeaderProps.scaffoldHeaderInputName}
      onBlur={(event) => {
        if (skipNextBlur.current) {
          skipNextBlur.current = false;
          return;
        }
        commit(event.currentTarget.value);
      }}
      onChange={(event) => {
        latestDraftRef.current = event.target.value;
        setDraft(event.target.value);
      }}
      onFocus={() => {
        skipNextBlur.current = false;
      }}
      onKeyDown={(event) => {
        event.stopPropagation();
        if (event.nativeEvent.isComposing) return;
        if (event.key === "Enter") {
          event.preventDefault();
          commit(event.currentTarget.value);
          blurAfterHandlingKeyboard(event.currentTarget);
        } else if (event.key === "Escape") {
          event.preventDefault();
          latestDraftRef.current = headerValue;
          setDraft(headerValue);
          blurAfterHandlingKeyboard(event.currentTarget);
        }
      }}
      onKeyUp={(event) => event.stopPropagation()}
      placeholder={fallback}
      type="text"
      value={draft}
      disabled={safeHeaderProps.scaffoldHeaderDisabled}
    />
  );
}

export function dataGridHeaderEditorAccessibilityLabel({
  fallback,
  headerValue,
}: {
  fallback: string;
  headerValue: string;
}): string {
  const label = headerValue.trim() || fallback;
  return `${label} column name`;
}

function dataGridRemoveRowLabel(rowCount: number): string {
  return `Remove row ${Math.max(1, rowCount)}`;
}

function dataGridRemoveColumnLabel(columnCount: number, header: string | undefined): string {
  const columnNumber = Math.max(1, columnCount);
  const label = header?.trim();
  return label ? `Remove column ${columnNumber}: ${label}` : `Remove column ${columnNumber}`;
}

const dataGridHeaderTemplate = Template(HeaderEditor);

function getColumnProp(index: number): string {
  return `column_${index + 1}`;
}

function parseRevoGridEdit(
  detail: unknown,
): { columnIndex: number; rowIndex: number; value: string } | null {
  if (!detail || typeof detail !== "object") return null;

  const edit = detail as { prop?: unknown; rowIndex?: unknown; val?: unknown };
  if (typeof edit.rowIndex !== "number" || !Number.isInteger(edit.rowIndex) || edit.rowIndex < 0) {
    return null;
  }

  const columnIndex = getColumnIndexFromProp(edit.prop);
  if (columnIndex === null) return null;

  return {
    columnIndex,
    rowIndex: edit.rowIndex,
    value: edit.val == null ? "" : String(edit.val),
  };
}

function getColumnIndexFromProp(prop: unknown): number | null {
  if (typeof prop !== "string") return null;

  const match = /^column_(\d+)$/.exec(prop);
  if (!match) return null;

  const index = Number(match[1]) - 1;
  return Number.isInteger(index) && index >= 0 ? index : null;
}
