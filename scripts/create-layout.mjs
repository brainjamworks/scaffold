import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = process.env.SCAFFOLD_ROOT ?? fileURLToPath(new URL("..", import.meta.url));
const BUILT_IN_LAYOUT_DEFINITIONS_PATH =
  "packages/core/src/editor/arrangements/layout/model/built-in-layout-definitions.ts";
const LAYOUT_AUTHORING_VIEWS_PATH =
  "packages/core/src/editor/arrangements/layout/authoring/built-in-layout-views.ts";
const LAYOUT_RUNTIME_VIEWS_PATH =
  "packages/core/src/editor/arrangements/layout/runtime/built-in-layout-views.ts";

try {
  const options = parseArgs(process.argv.slice(2));
  const context = createLayoutContext(options);
  const plan = buildWritePlan(context);

  if (options.dryRun) {
    printDryRun(context, plan);
    process.exit(0);
  }

  assertCanWrite(plan);
  writePlan(plan);
  console.log(`Created ${context.pascalName} layout scaffold.`);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}

export function parseArgs(args) {
  const options = {
    addLabel: null,
    dryRun: false,
    sectionLabel: null,
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--") continue;
    if (arg === "--dry-run") {
      options.dryRun = true;
      continue;
    }
    if (arg === "--name") {
      options.name = readFlagValue(args, index, "--name");
      index += 1;
      continue;
    }
    if (arg === "--section-label") {
      options.sectionLabel = readFlagValue(args, index, "--section-label");
      index += 1;
      continue;
    }
    if (arg === "--add-label") {
      options.addLabel = readFlagValue(args, index, "--add-label");
      index += 1;
      continue;
    }
    throw new Error(`Unknown option: ${arg}`);
  }

  if (!options.name) throw new Error("--name is required.");
  if (!options.sectionLabel) throw new Error("--section-label is required.");
  if (!options.addLabel) throw new Error("--add-label is required.");
  return options;
}

export function createLayoutContext(options) {
  const words = splitWords(options.name);
  if (words.length === 0) {
    throw new Error("--name must contain letters or numbers.");
  }

  const pascalName = words.map(capitalize).join("");
  const kebabName = words.map((word) => word.toLowerCase()).join("-");
  const camelName = lowerFirst(pascalName);

  return {
    addLabel: options.addLabel,
    camelName,
    kebabName,
    pascalName,
    sectionLabel: options.sectionLabel,
  };
}

export function buildWritePlan(context) {
  const base = `packages/core/src/editor/arrangements/layout/${context.kebabName}`;
  const createEntries = [
    {
      path: `${base}/${context.kebabName}-definition.tsx`,
      source: definitionTemplate(context),
    },
    {
      path: `${base}/${context.kebabName}-content.ts`,
      source: contentTemplate(context),
    },
    {
      path: `${base}/${context.kebabName}-views.tsx`,
      source: viewsTemplate(context),
    },
    {
      path: `${base}/${context.kebabName}-runtime-views.tsx`,
      source: runtimeViewsTemplate(context),
    },
    {
      path: `${base}/${context.kebabName}.test.ts`,
      source: testTemplate(context),
    },
  ].map((entry) => ({
    file: join(ROOT, entry.path),
    kind: "create",
    path: entry.path,
    source: entry.source,
  }));

  return [
    ...createEntries,
    catalogUpdatePlan(context, BUILT_IN_LAYOUT_DEFINITIONS_PATH, updateBuiltInLayoutDefinitions),
    catalogUpdatePlan(context, LAYOUT_AUTHORING_VIEWS_PATH, updateLayoutAuthoringViews),
    catalogUpdatePlan(context, LAYOUT_RUNTIME_VIEWS_PATH, updateLayoutRuntimeViews),
  ];
}

function catalogUpdatePlan(context, path, update) {
  const file = join(ROOT, path);
  return {
    file,
    kind: "update",
    path,
    source: update(context, readRequiredSource(file, path), path),
  };
}

function readRequiredSource(file, path) {
  if (!existsSync(file)) {
    throw new Error(`Could not find layout catalog file: ${path}`);
  }
  return readFileSync(file, "utf8");
}

function updateBuiltInLayoutDefinitions(context, source, path) {
  assertLayoutIdIsAbsent(context, source, path);
  const nextImport = `import { ${layoutDefinitionVarName(context)} } from '../${context.kebabName}/${context.kebabName}-definition';`;
  const importPattern =
    /^import \{ [A-Za-z0-9_]+LayoutDefinition \} from ["']\.\.\/[^"']+\/[^"']+-definition["'];$/gm;
  const importMatches = [...source.matchAll(importPattern)];
  if (importMatches.length === 0) {
    throw new Error(`Could not find layout definition imports in ${path}.`);
  }

  const imports = [...new Set([...importMatches.map((match) => match[0]), nextImport])].sort(
    (a, b) => a.localeCompare(b),
  );
  const firstImport = importMatches[0];
  const lastImport = importMatches.at(-1);
  let next = `${source.slice(0, firstImport.index)}${imports.join("\n")}${source.slice(
    lastImport.index + lastImport[0].length,
  )}`;

  const nextEntry = `  ${layoutDefinitionVarName(context)},`;
  const arrayPattern =
    /export const builtInLayoutDefinitions(?:\s*:\s*readonly LayoutDefinition\[\])?\s*=\s*Object\.freeze\(\[\n([\s\S]*?)\n\]\);/;
  const arrayMatch = next.match(arrayPattern);
  if (!arrayMatch) {
    throw new Error(`Could not find builtInLayoutDefinitions array in ${path}.`);
  }
  const entries = [
    ...new Set([
      ...arrayMatch[1]
        .split("\n")
        .map((line) => line.trimEnd())
        .filter((line) => line.trim().length > 0),
      nextEntry,
    ]),
  ].sort((a, b) => a.localeCompare(b));

  next = next.replace(
    arrayPattern,
    `export const builtInLayoutDefinitions: readonly LayoutDefinition[] = Object.freeze([\n${entries.join("\n")}\n]);`,
  );

  return next;
}

function updateLayoutAuthoringViews(context, source, path) {
  assertLayoutIdIsAbsent(context, source, path);
  const nextImport = `import { ${context.pascalName}LayoutView, ${context.pascalName}SectionView } from '../${context.kebabName}/${context.kebabName}-views';`;
  const nextEntry = `  {
    id: '${context.kebabName}',
    layout: ${context.pascalName}LayoutView,
    section: ${context.pascalName}SectionView,
  },`;

  return updateLaneCatalog({
    arrayName: "builtInLayoutAuthoringViews",
    entry: nextEntry,
    importSource: nextImport,
    path,
    source,
    typeName: "LayoutViewRegistration",
  });
}

function updateLayoutRuntimeViews(context, source, path) {
  assertLayoutIdIsAbsent(context, source, path);
  const nextImport = `import {
  ${context.pascalName}LayoutRuntimeView,
  ${context.pascalName}SectionRuntimeView,
} from '../${context.kebabName}/${context.kebabName}-runtime-views';`;
  const nextDefinition = `  {
    id: '${context.kebabName}',
    component: ${context.pascalName}LayoutRuntimeView,
    sectionComponent: ${context.pascalName}SectionRuntimeView,
  },`;

  return updateLaneCatalog({
    arrayName: "builtInLayoutRuntimeViews",
    entry: nextDefinition,
    importSource: nextImport,
    path,
    source,
    typeName: "LayoutRuntimeViewRegistration",
  });
}

function updateLaneCatalog({ arrayName, entry, importSource, path, source, typeName }) {
  const importBlockMatch = source.match(/^(?:import[\s\S]*?;\n)+/);
  if (!importBlockMatch) {
    throw new Error(`Could not update ${arrayName} in ${path}; missing import block.`);
  }
  const importBlock = importBlockMatch[0];
  const next = `${importBlock}${importSource}\n${source.slice(importBlock.length)}`;
  const arrayPattern = new RegExp(
    `export const ${arrayName} = Object\\.freeze\\(\\[\\n([\\s\\S]*?)\\n\\] as const satisfies readonly ${typeName}\\[\\]\\);`,
  );
  const arrayMatch = next.match(arrayPattern);
  if (!arrayMatch) {
    throw new Error(`Could not find ${arrayName} array in ${path}.`);
  }
  const entries = arrayMatch[1].trimEnd();
  return next.replace(
    arrayPattern,
    `export const ${arrayName} = Object.freeze([\n${entries}\n${entry}\n] as const satisfies readonly ${typeName}[]);`,
  );
}

function assertLayoutIdIsAbsent(context, source, path) {
  const definitionName = layoutDefinitionVarName(context);
  const idPattern = new RegExp(`id:\\s*["']${escapeRegExp(context.kebabName)}["']`);
  if (source.includes(definitionName) || idPattern.test(source)) {
    throw new Error(`${path} already contains layout ID "${context.kebabName}".`);
  }
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function assertCanWrite(plan) {
  const existing = plan.filter((entry) => entry.kind !== "update" && existsSync(entry.file));
  if (existing.length === 0) return;

  throw new Error(
    `Refusing to overwrite existing files:\n${existing
      .map((entry) => `- ${entry.path}`)
      .join("\n")}`,
  );
}

function writePlan(plan) {
  for (const entry of plan) {
    mkdirSync(dirname(entry.file), { recursive: true });
    writeFileSync(entry.file, entry.source, "utf8");
  }
}

function printDryRun(context, plan) {
  const createEntries = plan.filter((entry) => entry.kind === "create");
  const updateEntries = plan.filter((entry) => entry.kind === "update");

  console.log(`Layout: ${context.pascalName}`);
  console.log(`section label: ${context.sectionLabel}`);
  console.log(`add label: ${context.addLabel}`);
  console.log("Would create:");
  for (const entry of createEntries) {
    console.log(`- ${relative(ROOT, entry.file)}`);
  }
  if (updateEntries.length > 0) {
    console.log("Would update:");
    for (const entry of updateEntries) {
      console.log(`- ${relative(ROOT, entry.file)}`);
    }
  }
}

function readFlagValue(args, index, flag) {
  const value = args[index + 1];
  if (!value || value.startsWith("--")) {
    throw new Error(`${flag} requires a value.`);
  }
  return value;
}

function splitWords(value) {
  return value
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .split(/[^A-Za-z0-9]+/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function capitalize(value) {
  return `${value.slice(0, 1).toUpperCase()}${value.slice(1).toLowerCase()}`;
}

function lowerFirst(value) {
  return `${value.slice(0, 1).toLowerCase()}${value.slice(1)}`;
}

function layoutDefinitionVarName(context) {
  return context.camelName.endsWith("Layout")
    ? `${context.camelName}Definition`
    : `${context.camelName}LayoutDefinition`;
}

function definitionTemplate(context) {
  return `import { SquareIcon as Square } from '@phosphor-icons/react';
import { z } from 'zod';

import { defineConfiguration } from '@/editor/configuration/definition';

import type { LayoutDefinition } from '../model/layout-definition';
import { create${context.pascalName}Content, create${context.pascalName}Section } from './${context.kebabName}-content';

const ${context.pascalName}LayoutOptionsSchema = z.object({
  label: z.string().default('${context.pascalName}'),
});

const ${context.pascalName}SectionOptionsSchema = z.object({
  label: z.string().default(''),
});

export const ${layoutDefinitionVarName(context)} = {
  id: '${context.kebabName}',
  title: '${context.pascalName}',
  description: 'Arrange content into ${context.kebabName} sections',
  icon: Square,
  keywords: ['${context.kebabName}', 'layout'],
  configuration: defineConfiguration({
    attr: 'options',
    schema: ${context.pascalName}LayoutOptionsSchema,
    sheet: {
      title: '${context.pascalName} settings',
      sections: [{ id: '${context.kebabName}', title: '${context.pascalName}' }],
      defaultOpenSections: ['${context.kebabName}'],
    },
    controls: [
      {
        kind: 'text',
        name: 'label',
        label: 'Accessible label',
        placement: { sheet: { section: '${context.kebabName}' } },
      },
    ],
  }),
  section: {
    label: '${context.sectionLabel}',
    addLabel: '${context.addLabel}',
    create: ({ index }) => create${context.pascalName}Section(index, \`${context.sectionLabel} \${index + 1}\`),
    configuration: defineConfiguration({
      attr: 'options',
      schema: ${context.pascalName}SectionOptionsSchema,
      sheet: {
        title: '${context.sectionLabel} settings',
        sections: [{ id: 'section', title: '${context.sectionLabel}' }],
        defaultOpenSections: ['section'],
      },
      controls: [
        {
          kind: 'text',
          name: 'label',
          label: 'Label',
          placement: { sheet: { section: 'section' } },
        },
      ],
    }),
  },
  createContent: (input) => create${context.pascalName}Content(input?.options),
} satisfies LayoutDefinition;
`;
}

function contentTemplate(context) {
  return `import type { JSONContent } from '@tiptap/core';

import { createStableId } from '@/document/model/identity/stable-ids';

export function create${context.pascalName}Content(
  options: Record<string, unknown> | undefined,
): JSONContent {
  const label = parseString(options?.['label']) ?? '${context.pascalName}';

  return {
    type: 'layout',
    attrs: {
      id: createStableId(),
      variant: '${context.kebabName}',
      options: { label },
    },
    content: [create${context.pascalName}Section(0, '${context.sectionLabel} 1')],
  };
}

export function create${context.pascalName}Section(
  index: number,
  label: string | undefined,
): JSONContent {
  const resolvedLabel = label ?? \`${context.sectionLabel} \${index + 1}\`;

  return {
    type: 'section',
    attrs: {
      id: createStableId(),
      role: '${context.kebabName}-section',
      label: resolvedLabel,
      options: { label: resolvedLabel },
    },
    content: [{ type: 'paragraph' }],
  };
}

function parseString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}
`;
}

function viewsTemplate(context) {
  return `import { NodeViewContent, NodeViewWrapper } from '@tiptap/react';

import { isValidEditorDocPos } from '@/editor/prosemirror/position/document-position';
import { cn } from '@/lib/cn';

import {
  LayoutAddGhost,
  SectionActionTrigger,
  SectionMovementHandle,
} from '../authoring/layout-chrome';
import type {
  LayoutComponentProps,
  SectionComponentProps,
} from '../authoring/layout-view-definition';

export function ${context.pascalName}LayoutView(props: LayoutComponentProps) {
  const layoutId = readStableStringId(props.node.attrs['id']);
  const addLabel = props.definition?.section?.addLabel ?? '${context.addLabel}';

  return (
    <NodeViewWrapper
      data-empty={props.isEmpty ? 'true' : undefined}
      data-layout-kind="${context.kebabName}"
      className={cn(
        'group/layout relative my-4 rounded-sm',
        props.editable && props.isEmpty && 'min-h-24',
      )}
    >
      <NodeViewContent className="grid gap-3" />
      {props.editable && props.definition?.section ? (
        <LayoutAddGhost
          editor={props.editor}
          getPos={props.getPos}
          label={addLabel}
          layoutId={layoutId}
          className="mt-3"
        />
      ) : null}
    </NodeViewWrapper>
  );
}

export function ${context.pascalName}SectionView(props: SectionComponentProps) {
  const sectionId = readStableStringId(props.node.attrs['id']);
  const label = readSectionLabel(props.node.attrs) ?? render${context.pascalName}SectionLabel();
  const sectionPosition = resolveSectionPosition(props);

  return (
    <NodeViewWrapper
      data-empty={props.isEmpty ? 'true' : undefined}
      data-layout-kind="${context.kebabName}"
      className="group/section relative min-w-0 rounded-sm border border-border bg-background"
    >
      <div
        contentEditable={false}
        className="relative flex min-h-touch-target items-center border-b border-border px-3 py-2"
      >
        {props.editable && sectionPosition.layoutPos !== null ? (
          <SectionMovementHandle
            editor={props.editor}
            layoutPos={sectionPosition.layoutPos}
            sectionIndex={sectionPosition.sectionIndex}
            sectionId={sectionId}
            className="absolute left-2 top-1/2 z-[var(--z-interactive)] -translate-y-1/2"
          />
        ) : null}
        <div
          className={cn(
            'min-w-0 flex-1 truncate text-sm font-medium text-text-primary',
            props.editable && 'pl-7 pr-7',
          )}
        >
          {label}
        </div>
        {props.editable && sectionPosition.layoutPos !== null ? (
          <SectionActionTrigger
            blockDefinitions={props.blockDefinitions}
            editor={props.editor}
            layoutPos={sectionPosition.layoutPos}
            sectionIndex={sectionPosition.sectionIndex}
            sectionId={sectionId}
            className="absolute right-2 top-1/2 z-[var(--z-interactive)] -translate-y-1/2"
          />
        ) : null}
      </div>
      <NodeViewContent className="min-w-0 px-3 py-3 text-base leading-body text-text-primary [&>*:first-child]:mt-0 [&>*:last-child]:mb-0" />
    </NodeViewWrapper>
  );
}

function resolveSectionPosition(props: SectionComponentProps): {
  layoutPos: number | null;
  sectionIndex: number;
} {
  try {
    const pos = props.getPos();
    if (!isValidEditorDocPos(props.editor, pos)) return { layoutPos: null, sectionIndex: 0 };
    const $pos = props.editor.state.doc.resolve(pos);
    return { layoutPos: $pos.before($pos.depth), sectionIndex: $pos.index() };
  } catch {
    return { layoutPos: null, sectionIndex: 0 };
  }
}

function readSectionLabel(attrs: Record<string, unknown>): string | null {
  const label = parseText(attrs['label']);
  if (label) return label;
  const options = attrs['options'];
  if (!options || typeof options !== 'object' || Array.isArray(options)) return null;
  return parseText((options as Record<string, unknown>)['label']);
}

function parseText(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

function readStableStringId(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function render${context.pascalName}SectionLabel(): never {
  throw new Error('Implement ${context.pascalName} section label rendering before shipping this layout.');
}
`;
}

function runtimeViewsTemplate(context) {
  return `import { NodeViewContent, NodeViewWrapper } from '@tiptap/react';

import type {
  LayoutRuntimeViewProps,
  SectionRuntimeViewProps,
} from '../runtime/layout-view-definition';

export function ${context.pascalName}LayoutRuntimeView(props: LayoutRuntimeViewProps) {
  const layoutId = readStableStringId(props.node.attrs['id']);
  const options = parseOptions(props.node.attrs['options']);
  const label = parseText(options['label']) ?? '${context.pascalName}';

  return (
    <NodeViewWrapper
      data-node="layout"
      data-definition="${context.kebabName}"
      data-id={layoutId}
      data-empty={props.isEmpty ? 'true' : undefined}
      data-layout-kind="${context.kebabName}"
      className="min-w-0 rounded-sm"
    >
      <section aria-label={label} className="grid gap-3">
        <NodeViewContent />
      </section>
    </NodeViewWrapper>
  );
}

export function ${context.pascalName}SectionRuntimeView(props: SectionRuntimeViewProps) {
  const sectionId = readStableStringId(props.node.attrs['id']);
  const label = readSectionLabel(props.node.attrs) ?? '${context.sectionLabel}';

  return (
    <NodeViewWrapper
      data-node="section"
      data-definition="${context.kebabName}"
      data-id={sectionId}
      data-empty={props.isEmpty ? 'true' : undefined}
      data-layout-kind="${context.kebabName}"
      className="min-w-0 rounded-sm border border-border bg-background"
    >
      <div
        contentEditable={false}
        className="border-b border-border px-3 py-2 text-sm font-medium text-text-primary"
      >
        {label}
      </div>
      <NodeViewContent className="min-w-0 px-3 py-3 text-base leading-body text-text-primary [&>*:first-child]:mt-0 [&>*:last-child]:mb-0" />
    </NodeViewWrapper>
  );
}

function readSectionLabel(attrs: Record<string, unknown>): string | null {
  const label = parseText(attrs['label']);
  if (label) return label;
  const options = parseOptions(attrs['options']);
  return parseText(options['label']);
}

function parseOptions(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function parseText(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

function readStableStringId(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}
`;
}

function testTemplate(context) {
  return `// @vitest-environment happy-dom

import { builtInLayoutRegistry } from '@/editor/arrangements/layout/model/built-in-layout-definitions';
import { builtInLayoutAuthoringViewRegistry } from '@/editor/arrangements/layout/authoring/built-in-layout-views';
import { builtInBlockRegistry } from '@/editor/blocks/built-in-block-definitions';
import { describeLayoutContract } from '@/editor/testing';

describeLayoutContract({
  blockDefinitions: builtInBlockRegistry,
  layoutDefinitions: builtInLayoutRegistry,
  layoutAuthoringViews: builtInLayoutAuthoringViewRegistry,
  layoutId: '${context.kebabName}',
  expectsLayoutConfiguration: true,
  expectsSectionConfiguration: true,
});
`;
}
