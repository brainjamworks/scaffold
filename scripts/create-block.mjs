import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

export const BLOCK_RECIPES = new Set([
  "content",
  "settings-data",
  "assessment-composite",
  "shell-widget",
  "media-widget",
]);

const ROOT = process.env.SCAFFOLD_ROOT ?? fileURLToPath(new URL("..", import.meta.url));

const BLOCKS_RUNTIME_EXTENSIONS_PATH =
  "packages/core/src/editor/blocks/runtime-block-extensions.ts";
const BLOCKS_AUTHORING_EXTENSIONS_PATH =
  "packages/core/src/editor/blocks/authoring-block-extensions.ts";
const BUILT_IN_BLOCK_DEFINITIONS_PATH =
  "packages/core/src/editor/blocks/built-in-block-definitions.ts";

try {
  const options = parseArgs(process.argv.slice(2));
  const context = createBlockContext(options.name, options.recipe);
  const plan = buildWritePlan(context);

  if (options.dryRun) {
    printDryRun(plan);
    process.exit(0);
  }

  assertCanWrite(plan);
  writePlan(plan);
  console.log(`Created ${context.pascalName} block scaffold.`);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}

export function parseArgs(args) {
  const options = {
    dryRun: false,
    recipe: null,
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
    if (arg === "--recipe") {
      options.recipe = readFlagValue(args, index, "--recipe");
      index += 1;
      continue;
    }
    throw new Error(`Unknown option: ${arg}`);
  }

  if (!options.name) throw new Error("--name is required.");
  if (!options.recipe) throw new Error("--recipe is required.");
  if (!BLOCK_RECIPES.has(options.recipe)) {
    throw new Error(
      `Unknown recipe "${options.recipe}". Expected one of: ${[...BLOCK_RECIPES].join(", ")}.`,
    );
  }

  return options;
}

export function createBlockContext(name, recipe) {
  const words = splitWords(name);
  if (words.length === 0) {
    throw new Error("--name must contain letters or numbers.");
  }

  const pascalName = words.map(capitalize).join("");
  const kebabName = words.map((word) => word.toLowerCase()).join("-");
  const camelName = lowerFirst(pascalName);

  return {
    camelName,
    kebabName,
    nodeType: words.map((word) => word.toLowerCase()).join("_"),
    pascalName,
    recipe,
    schemaFileName: `${kebabName}.ts`,
  };
}

export function buildWritePlan(context) {
  const createEntries = contentFilePlan(context).map((entry) => ({
    file: join(ROOT, entry.path),
    kind: "create",
    path: entry.path,
    source: entry.source,
  }));

  return [...createEntries, ...registrationUpdatePlan(context)];
}

function contentFilePlan(context) {
  const base = `packages/core/src/editor/blocks/${context.pascalName}`;
  const definitionBase = definitionFileBase(context);
  const plan = [
    {
      path: `packages/core/src/schemas/blocks/${context.schemaFileName}`,
      source: schemaTemplate(context),
    },
    {
      path: `${base}/index.tsx`,
      source: indexTemplate(context),
    },
    {
      path: `${base}/node.ts`,
      source: nodeTemplate(context),
    },
    {
      path: `${base}/${context.pascalName}.tsx`,
      source: nodeViewTemplate(context),
    },
    {
      path: `${base}/${definitionBase}-definition.ts`,
      source: definitionTemplate(context),
    },
    {
      path: `${base}/${definitionBase}-runtime-extension.tsx`,
      source: runtimeExtensionTemplate(context),
    },
    {
      path: `${base}/${definitionBase}-authoring-extension.tsx`,
      source: authoringExtensionTemplate(context),
    },
    {
      path: `${base}/${context.pascalName}.test.ts`,
      source: testTemplate(context),
    },
  ];

  if (isAssessmentRecipe(context)) {
    plan.splice(2, 0, {
      path: `${base}/assessment.ts`,
      source: assessmentTemplate(context),
    });
  }

  if (isShellWidgetRecipe(context)) {
    plan.splice(3, 0, {
      path: `${base}/${context.pascalName}Canvas.tsx`,
      source: canvasTemplate(context),
    });
  }

  return plan;
}

function registrationUpdatePlan(context) {
  const builtInDefinitionsFile = join(ROOT, BUILT_IN_BLOCK_DEFINITIONS_PATH);
  const runtimeExtensionsFile = join(ROOT, BLOCKS_RUNTIME_EXTENSIONS_PATH);
  const authoringExtensionsFile = join(ROOT, BLOCKS_AUTHORING_EXTENSIONS_PATH);

  return [
    {
      file: builtInDefinitionsFile,
      kind: "update",
      path: BUILT_IN_BLOCK_DEFINITIONS_PATH,
      source: updateBuiltInDefinitionList(
        context,
        readRequiredSource(builtInDefinitionsFile, BUILT_IN_BLOCK_DEFINITIONS_PATH),
      ),
    },
    {
      file: runtimeExtensionsFile,
      kind: "update",
      path: BLOCKS_RUNTIME_EXTENSIONS_PATH,
      source: updateExtensionArrayEntry(
        context,
        readRequiredSource(runtimeExtensionsFile, BLOCKS_RUNTIME_EXTENSIONS_PATH),
        "runtime",
      ),
    },
    {
      file: authoringExtensionsFile,
      kind: "update",
      path: BLOCKS_AUTHORING_EXTENSIONS_PATH,
      source: updateExtensionArrayEntry(
        context,
        readRequiredSource(authoringExtensionsFile, BLOCKS_AUTHORING_EXTENSIONS_PATH),
        "authoring",
      ),
    },
  ];
}

function readRequiredSource(file, path) {
  if (!existsSync(file)) {
    throw new Error(`Could not find extension catalog file: ${path}`);
  }
  return readFileSync(file, "utf8");
}

function updateExtensionArrayEntry(context, source, facet) {
  const extensionName = `${context.pascalName}${capitalize(facet)}Extension`;
  const factoryName =
    facet === "runtime" ? "createRuntimeBlockExtensions" : "createAuthoringBlockExtensions";
  const importLine =
    facet === "runtime"
      ? `import { ${extensionName} } from './${context.pascalName}/${definitionFileBase(context)}-runtime-extension';\n`
      : `import { ${extensionName} } from './${context.pascalName}/${definitionFileBase(context)}-authoring-extension';\n`;
  const entryLine = `    ${extensionName},\n`;
  let nextSource = source;

  if (!nextSource.includes(importLine.trim())) {
    const lastImportMatch = [...nextSource.matchAll(/^import .+ from ['"].+['"];$/gm)].at(-1);
    if (!lastImportMatch || lastImportMatch.index === undefined) {
      throw new Error(
        `Could not find import anchor in packages/core/src/editor/blocks/${facet}-block-extensions.ts.`,
      );
    }

    const insertAt = lastImportMatch.index + lastImportMatch[0].length + 1;
    nextSource = `${nextSource.slice(0, insertAt)}${importLine}${nextSource.slice(insertAt)}`;
  }

  const factoryStart = nextSource.indexOf(`export function ${factoryName}`);
  const arrayStart = nextSource.indexOf("return [", factoryStart);
  const arrayEnd = nextSource.indexOf("];", arrayStart);
  if (factoryStart === -1 || arrayStart === -1 || arrayEnd === -1) {
    throw new Error(
      `Could not find ${factoryName} array anchor in packages/core/src/editor/blocks/${facet}-block-extensions.ts.`,
    );
  }

  const arraySource = nextSource.slice(arrayStart, arrayEnd);
  if (new RegExp(`\\b${extensionName}\\b`).test(arraySource)) {
    return nextSource;
  }

  return `${nextSource.slice(0, arrayEnd)}${entryLine}${nextSource.slice(arrayEnd)}`;
}

function updateBuiltInDefinitionList(context, source) {
  const definitionName = blockDefinitionVarName(context);
  const importLine = `import { ${definitionName} } from './${context.pascalName}/${definitionFileBase(context)}-definition';\n`;
  let nextSource = source;

  if (!nextSource.includes(importLine.trim())) {
    const importAnchor = nextSource.indexOf("import type { BlockDefinition }");
    if (importAnchor === -1) {
      throw new Error(
        "Could not find definition import anchor in packages/core/src/editor/blocks/built-in-block-definitions.ts.",
      );
    }
    nextSource = `${nextSource.slice(0, importAnchor)}${importLine}${nextSource.slice(importAnchor)}`;
  }

  const listStart = nextSource.indexOf("export const builtInBlockDefinitions");
  const arrayStart = nextSource.indexOf("Object.freeze([", listStart);
  const arrayEnd = nextSource.indexOf("]);", arrayStart);
  if (listStart === -1 || arrayStart === -1 || arrayEnd === -1) {
    throw new Error(
      "Could not find builtInBlockDefinitions array anchor in packages/core/src/editor/blocks/built-in-block-definitions.ts.",
    );
  }

  const arraySource = nextSource.slice(arrayStart, arrayEnd);
  if (new RegExp(`\\b${definitionName}\\b`).test(arraySource)) return nextSource;

  return `${nextSource.slice(0, arrayEnd)}    ${definitionName},\n${nextSource.slice(arrayEnd)}`;
}

function definitionFileBase(context) {
  return context.kebabName;
}

function blockIdConstName(context) {
  return `${context.nodeType.toUpperCase()}_BLOCK_ID`;
}

function blockDefinitionVarName(context) {
  return `${context.camelName}BlockDefinition`;
}

function configurationVarName(context) {
  return `${context.camelName}Configuration`;
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

function printDryRun(plan) {
  const createEntries = plan.filter((entry) => entry.kind === "create");
  const updateEntries = plan.filter((entry) => entry.kind === "update");

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

function isAssessmentRecipe(context) {
  return context.recipe === "assessment-composite" || context.recipe === "shell-widget";
}

function isShellWidgetRecipe(context) {
  return context.recipe === "shell-widget";
}

function isMediaWidgetRecipe(context) {
  return context.recipe === "media-widget";
}

function schemaTemplate(context) {
  if (isAssessmentRecipe(context)) return assessmentSchemaTemplate(context);
  if (isMediaWidgetRecipe(context)) return mediaSchemaTemplate(context);

  return `import { z } from 'zod';

export const ${context.pascalName}DataSchema = z.object({
  label: z.string().default(''),
});

export type ${context.pascalName}Data = z.infer<typeof ${context.pascalName}DataSchema>;

export function empty${context.pascalName}Data(): ${context.pascalName}Data {
  return ${context.pascalName}DataSchema.parse({});
}
`;
}

function assessmentSchemaTemplate(context) {
  return `import { z } from 'zod';
import { AssessmentCommonSettingsSchema } from '@scaffold/contracts';

export const ${context.pascalName}SettingsSchema = AssessmentCommonSettingsSchema.extend({
  points: z.number().min(0).default(1),
  maxAttempts: z.number().int().min(1).nullable().default(null),
  legend: z.string().default(''),
});

export type ${context.pascalName}Settings = z.infer<typeof ${context.pascalName}SettingsSchema>;

export const ${context.pascalName}PrivateAssessmentSchema = z.object({});

export type ${context.pascalName}PrivateAssessment = z.infer<typeof ${context.pascalName}PrivateAssessmentSchema>;

export const ${context.pascalName}ResponseSchema = z.object({
  value: z.unknown().nullable().default(null),
});

export type ${context.pascalName}Response = z.infer<typeof ${context.pascalName}ResponseSchema>;
`;
}

function mediaSchemaTemplate(context) {
  return `import { z } from 'zod';

export const ${context.pascalName}DataSchema = z.object({
  sourceUrl: z.string().url().nullable().default(null),
  altText: z.string().default(''),
  caption: z.string().default(''),
});

export type ${context.pascalName}Data = z.infer<typeof ${context.pascalName}DataSchema>;

export function empty${context.pascalName}Data(): ${context.pascalName}Data {
  return ${context.pascalName}DataSchema.parse({});
}
`;
}

function indexTemplate(context) {
  const canvasExport = isShellWidgetRecipe(context)
    ? `export { ${context.pascalName}CanvasNode } from './${context.pascalName}Canvas';\n`
    : "";
  const definitionBase = definitionFileBase(context);

  return `export { ${context.pascalName}AuthoringExtension } from './${definitionBase}-authoring-extension';
export { ${context.pascalName}RuntimeExtension } from './${definitionBase}-runtime-extension';
export {
  ${blockIdConstName(context)},
  ${blockDefinitionVarName(context)},
} from './${definitionBase}-definition';
export { create${context.pascalName}Node, ${context.pascalName}Node } from './node';
export { ${context.pascalName}View } from './${context.pascalName}';
${canvasExport}`;
}

function definitionTemplate(context) {
  if (isAssessmentRecipe(context)) return assessmentDefinitionTemplate(context);

  return `import { SquareIcon as Square } from '@phosphor-icons/react';

import { defineBlock } from '@/editor/blocks/block-definition';
import { defineConfiguration } from '@/editor/configuration/definition';
import { createStableId } from '@/document/model/identity/stable-ids';
import {
  ${context.pascalName}DataSchema,
  empty${context.pascalName}Data,
} from '@/schemas/blocks/${context.kebabName}';

export const ${blockIdConstName(context)} = '${context.kebabName}';

const ${configurationVarName(context)} = defineConfiguration({
  attr: 'data',
  schema: ${context.pascalName}DataSchema,
  controls: [],
});

export const ${blockDefinitionVarName(context)} = defineBlock({
  nodeType: '${context.nodeType}',
  configuration: ${configurationVarName(context)},
  frame: {
    resizable: true,
    resizeMode: 'responsive',
  },
  insert: {
    id: ${blockIdConstName(context)},
    category: 'content',
    title: '${context.pascalName}',
    description: 'Add ${context.kebabName} content',
    icon: Square,
    keywords: ['${context.kebabName}'],
    content: () => ({
      type: '${context.nodeType}',
      attrs: {
        id: createStableId('block'),
        data: empty${context.pascalName}Data(),
      },
    }),
  },
});
`;
}

function assessmentDefinitionTemplate(context) {
  return `import { SquareIcon as Square } from '@phosphor-icons/react';

import { pageAssessmentExperience } from '@/editor/blocks/assessment/shared/model/assessment-capability';
import {
  defineAssessmentCapability,
  defineBlock,
} from '@/editor/blocks/block-definition';
import { createAssessmentConfiguration } from '@/editor/configuration/assessment-configuration';
import { createStableId } from '@/document/model/identity/stable-ids';
import {
  ${context.pascalName}PrivateAssessmentSchema,
  ${context.pascalName}SettingsSchema,
} from '@/schemas/blocks/${context.kebabName}';

import {
  ${context.camelName}ResponseCodec,
  project${context.pascalName}Assessment,
  project${context.pascalName}Interaction,
  project${context.pascalName}LearnerNode,
  project${context.pascalName}Settings,
} from './assessment';

export const ${blockIdConstName(context)} = '${context.kebabName}';

const ${configurationVarName(context)} = createAssessmentConfiguration({
  schema: ${context.pascalName}SettingsSchema,
  title: '${context.pascalName} settings',
  defaultOpenSections: ['scoring'],
  sections: [{ id: 'scoring', title: 'Scoring' }],
  controls: [
    {
      kind: 'number',
      name: 'points',
      label: 'Points',
      min: 0,
      step: 1,
      integer: true,
      placement: { sheet: { section: 'scoring' } },
    },
  ],
});

export const ${blockDefinitionVarName(context)} = defineBlock({
  nodeType: '${context.nodeType}',
  configuration: ${configurationVarName(context)},
  capabilities: {
    assessment: defineAssessmentCapability({
      interactionKind: 'single-select',
      experience: pageAssessmentExperience,
      response: ${context.camelName}ResponseCodec,
      projection: {
        projectInteraction: project${context.pascalName}Interaction,
        projectAssessment: project${context.pascalName}Assessment,
        projectSettings: project${context.pascalName}Settings,
        projectLearnerNode: project${context.pascalName}LearnerNode,
      },
    }),
  },
  frame: {
    resizable: true,
    resizeMode: 'responsive',
  },
  insert: {
    id: ${blockIdConstName(context)},
    category: 'assessment',
    title: '${context.pascalName}',
    description: 'Add ${context.kebabName} assessment',
    icon: Square,
    keywords: ['${context.kebabName}', 'assessment'],
    content: () => ({
      type: '${context.nodeType}',
      attrs: {
        id: createStableId(),
        assessment: ${context.pascalName}PrivateAssessmentSchema.parse({}),
      },
      content: ${assessmentShellContent(
        isShellWidgetRecipe(context) ? `${context.nodeType}_canvas` : null,
      )},
    }),
  },
});
`;
}

function runtimeExtensionTemplate(context) {
  const canvasImport = isShellWidgetRecipe(context)
    ? `import { ${context.pascalName}CanvasNode } from './${context.pascalName}Canvas';\n`
    : "";
  const canvasEntry = isShellWidgetRecipe(context)
    ? `      ${context.pascalName}CanvasNode,\n`
    : "";
  const runtimeImport = isAssessmentRecipe(context)
    ? `import { AssessmentRuntimeProblemContent } from '@/editor/blocks/assessment/shared/runtime/AssessmentRuntimeProblemContent';\n`
    : "";
  const viewDeclaration = isAssessmentRecipe(context)
    ? `
function ${context.pascalName}RuntimeView(props: NodeViewProps) {
  return (
    <AssessmentRuntimeProblemContent
      blockClass="sc-${context.kebabName}"
      definition={${blockDefinitionVarName(context)}}
      props={props}
    />
  );
}
`
    : `import { ${context.pascalName}View } from './${context.pascalName}';\n\n`;

  return `import { Extension } from '@tiptap/core';
${isAssessmentRecipe(context) ? `import { type NodeViewProps } from '@tiptap/react';\n` : ""}

import { createBlockRuntimeNodeView } from '@/editor/frame/runtime/create-block-runtime-node-view';
${runtimeImport}
import { ${blockDefinitionVarName(context)} } from './${definitionFileBase(context)}-definition';
${canvasImport}import { create${context.pascalName}Node } from './node';
${viewDeclaration}
const ${context.pascalName}RuntimeNode = create${context.pascalName}Node({
  addNodeView: () =>
    createBlockRuntimeNodeView({
      definition: ${blockDefinitionVarName(context)},
      view: { component: ${isAssessmentRecipe(context) ? `${context.pascalName}RuntimeView` : `${context.pascalName}View`} },
    }),
});

export const ${context.pascalName}RuntimeExtension = Extension.create({
  name: '${context.nodeType}_runtime_bundle',

  addExtensions() {
    return [
${canvasEntry}      ${context.pascalName}RuntimeNode,
    ];
  },
});
`;
}

function authoringExtensionTemplate(context) {
  const canvasImport = isShellWidgetRecipe(context)
    ? `import { ${context.pascalName}CanvasNode } from './${context.pascalName}Canvas';\n`
    : "";
  const canvasEntry = isShellWidgetRecipe(context)
    ? `      ${context.pascalName}CanvasNode,\n`
    : "";
  const extensionImportSpacing = isAssessmentRecipe(context) ? "" : "\n";

  return `import { Extension } from '@tiptap/core';
${extensionImportSpacing}
import { createBlockAuthoringNodeView } from '@/editor/frame/authoring/create-block-authoring-node-view';

import { ${blockDefinitionVarName(context)} } from './${definitionFileBase(context)}-definition';
${canvasImport}import { create${context.pascalName}Node } from './node';
import { ${context.pascalName}View } from './${context.pascalName}';

${
  isAssessmentRecipe(context)
    ? `function ${context.pascalName}AuthoringView() {
  return <${context.pascalName}View editable />;
}
`
    : ""
}
const ${context.pascalName}AuthoringNode = create${context.pascalName}Node({
  addNodeView: () =>
    createBlockAuthoringNodeView({
      definition: ${blockDefinitionVarName(context)},
      view: { component: ${isAssessmentRecipe(context) ? `${context.pascalName}AuthoringView` : `${context.pascalName}View`} },
    }),
});

export const ${context.pascalName}AuthoringExtension = Extension.create({
  name: '${context.nodeType}_authoring_bundle',

  addExtensions() {
    return [
${canvasEntry}      ${context.pascalName}AuthoringNode,
    ];
  },
});
`;
}

function assessmentShellContent(canvasNodeType) {
  const canvasEntry = canvasNodeType
    ? `          {
            type: '${canvasNodeType}',
            attrs: { id: createStableId() },
          },
`
    : "";

  return `[
        { type: 'assessment_title', content: [{ type: 'paragraph' }] },
        { type: 'assessment_instructions', content: [{ type: 'paragraph' }] },
        { type: 'assessment_prompt', content: [{ type: 'paragraph' }] },
${canvasEntry}        { type: 'assessment_hints_group' },
        { type: 'assessment_summary_feedback' },
      ]`;
}

function nodeTemplate(context) {
  if (isAssessmentRecipe(context)) return assessmentNodeTemplate(context);

  return `import {
  Node,
  mergeAttributes,
  type NodeViewRenderer,
} from '@tiptap/core';

import { COURSE_BLOCK_CONTENT } from '@/document/model/content-model/content-groups';
import { stableNodeIdAttribute } from '@/document/model/identity/stable-node-attribute';
import {
  ${context.pascalName}DataSchema,
  empty${context.pascalName}Data,
  type ${context.pascalName}Data,
} from '@/schemas/blocks/${context.kebabName}';

export interface ${context.pascalName}NodeOptions {
  addNodeView?: () => NodeViewRenderer;
}

export function create${context.pascalName}Node(options: ${context.pascalName}NodeOptions = {}) {
  return Node.create({
    name: '${context.nodeType}',
    group: \`block \${COURSE_BLOCK_CONTENT}\`,
    content: 'block*',
    defining: true,
    selectable: true,
    draggable: false,

    addAttributes() {
      return {
        id: stableNodeIdAttribute(),
        data: {
          default: empty${context.pascalName}Data(),
          parseHTML: (element: HTMLElement) => {
            const raw = element.getAttribute('data-${context.kebabName}');
            if (!raw) return empty${context.pascalName}Data();
            try {
              const parsed = ${context.pascalName}DataSchema.safeParse(JSON.parse(raw));
              return parsed.success ? parsed.data : empty${context.pascalName}Data();
            } catch {
              return empty${context.pascalName}Data();
            }
          },
          renderHTML: (attrs: { data: ${context.pascalName}Data }) => ({
            'data-${context.kebabName}': JSON.stringify(attrs.data),
          }),
        },
      };
    },

    parseHTML() {
      return [{ tag: 'section[data-node="${context.nodeType}"]' }];
    },

    renderHTML({ HTMLAttributes }) {
      return [
        'section',
        mergeAttributes(HTMLAttributes, { 'data-node': '${context.nodeType}' }),
        0,
      ];
    },

    ...(options.addNodeView
      ? {
          addNodeView() {
            return options.addNodeView!();
          },
        }
      : {}),
  });
}

export const ${context.pascalName}Node = create${context.pascalName}Node();
`;
}

function assessmentNodeTemplate(context) {
  const content = isShellWidgetRecipe(context)
    ? `'assessment_title assessment_instructions assessment_prompt ${context.nodeType}_canvas assessment_hints_group assessment_summary_feedback'`
    : `'assessment_title assessment_instructions assessment_prompt assessment_hints_group assessment_summary_feedback'`;

  return `import {
  Node,
  mergeAttributes,
  type NodeViewRenderer,
} from '@tiptap/core';

import { COURSE_BLOCK_CONTENT } from '@/document/model/content-model/content-groups';
import { stableNodeIdAttribute } from '@/document/model/identity/stable-node-attribute';
import {
  ${context.pascalName}PrivateAssessmentSchema,
  ${context.pascalName}SettingsSchema,
  type ${context.pascalName}PrivateAssessment,
  type ${context.pascalName}Settings,
} from '@/schemas/blocks/${context.kebabName}';

export interface ${context.pascalName}NodeOptions {
  addNodeView?: () => NodeViewRenderer;
}

export function create${context.pascalName}Node(options: ${context.pascalName}NodeOptions = {}) {
  return Node.create({
    name: '${context.nodeType}',
    group: \`block \${COURSE_BLOCK_CONTENT}\`,
    content: ${content},
    defining: true,
    selectable: true,
    draggable: false,

    addAttributes() {
      const settingsDefault: ${context.pascalName}Settings = ${context.pascalName}SettingsSchema.parse({});
      const assessmentDefault: ${context.pascalName}PrivateAssessment =
        ${context.pascalName}PrivateAssessmentSchema.parse({});

      return {
        id: stableNodeIdAttribute(),
        settings: {
          default: settingsDefault,
          parseHTML: (element: HTMLElement) => {
            const raw = element.getAttribute('data-${context.kebabName}-settings');
            if (!raw) return settingsDefault;
            try {
              const parsed = ${context.pascalName}SettingsSchema.safeParse(JSON.parse(raw));
              return parsed.success ? parsed.data : settingsDefault;
            } catch {
              return settingsDefault;
            }
          },
          renderHTML: (attrs: { settings: ${context.pascalName}Settings }) => ({
            'data-${context.kebabName}-settings': JSON.stringify(attrs.settings),
          }),
        },
        assessment: {
          default: assessmentDefault,
          parseHTML: (element: HTMLElement) => {
            const raw = element.getAttribute('data-${context.kebabName}-assessment');
            if (!raw) return assessmentDefault;
            try {
              const parsed = ${context.pascalName}PrivateAssessmentSchema.safeParse(JSON.parse(raw));
              return parsed.success ? parsed.data : assessmentDefault;
            } catch {
              return assessmentDefault;
            }
          },
          renderHTML: () => ({}),
        },
      };
    },

    parseHTML() {
      return [{ tag: 'section[data-node="${context.nodeType}"]' }];
    },

    renderHTML({ HTMLAttributes }) {
      return [
        'section',
        mergeAttributes(HTMLAttributes, { 'data-node': '${context.nodeType}' }),
        0,
      ];
    },

    ...(options.addNodeView
      ? {
          addNodeView() {
            return options.addNodeView!();
          },
        }
      : {}),
  });
}

export const ${context.pascalName}Node = create${context.pascalName}Node();
`;
}

function nodeViewTemplate(context) {
  if (isAssessmentRecipe(context)) return assessmentNodeViewTemplate(context);

  return `import { NodeViewContent, type NodeViewProps } from '@tiptap/react';

export function ${context.pascalName}View(props: NodeViewProps) {
  const data = props.node.attrs['data'];

  return (
    <div
      data-node="${context.nodeType}"
      className="relative rounded-(--radius-md) border border-border bg-background p-4"
    >
      <div
        className="mb-2 text-xs font-medium text-text-muted"
        contentEditable={false}
      >
        {data?.label || '${context.pascalName}'}
      </div>
      {render${context.pascalName}Body()}
      <NodeViewContent className="min-w-0" />
    </div>
  );
}

function render${context.pascalName}Body(): never {
  throw new Error('Implement ${context.pascalName} body rendering before shipping this block.');
}
`;
}

function assessmentNodeViewTemplate(context) {
  return `import { AssessmentProblemContent } from '@/editor/blocks/assessment/shared/chrome/AssessmentProblemContent';

export interface ${context.pascalName}ViewProps {
  editable: boolean;
}

export function ${context.pascalName}View({ editable }: ${context.pascalName}ViewProps) {
  return (
    <AssessmentProblemContent
      editable={editable}
      blockClass="sc-${context.kebabName}"
    />
  );
}
`;
}

function assessmentTemplate(context) {
  return `import type { JSONContent } from '@tiptap/core';
import type {
  AssessmentAnswerKey,
  AssessmentInteractionContract,
  AssessmentResponseValue,
  AssessmentTargetSettings,
} from '@scaffold/contracts';

import type { AssessmentCapabilityResponseDefinition } from '@/editor/blocks/block-definition';
import {
  ${context.pascalName}ResponseSchema,
  type ${context.pascalName}Response,
} from '@/schemas/blocks/${context.kebabName}';

export function project${context.pascalName}LearnerNode(_node: JSONContent): JSONContent {
  throw new Error('Implement ${context.pascalName} learner projection before shipping this block.');
}

export function project${context.pascalName}Interaction(
  _node: JSONContent,
): AssessmentInteractionContract {
  throw new Error('Implement ${context.pascalName} interaction projection before shipping this block.');
}

export function project${context.pascalName}Assessment(_node: JSONContent): AssessmentAnswerKey {
  throw new Error('Implement ${context.pascalName} assessment projection before shipping this block.');
}

export function project${context.pascalName}Settings(
  _settings: unknown,
): Partial<AssessmentTargetSettings> {
  throw new Error('Implement ${context.pascalName} settings projection before shipping this block.');
}

export function to${context.pascalName}ContractResponse(
  _response: unknown,
): AssessmentResponseValue {
  throw new Error('Implement ${context.pascalName} contract response projection before shipping this block.');
}

export function from${context.pascalName}ContractResponse(
  _response: AssessmentResponseValue,
): ${context.pascalName}Response {
  throw new Error('Implement ${context.pascalName} local response projection before shipping this block.');
}

export function has${context.pascalName}Response(_response: unknown): boolean {
  throw new Error('Implement ${context.pascalName} response presence check before shipping this block.');
}

export const ${context.camelName}ResponseCodec: AssessmentCapabilityResponseDefinition<${context.pascalName}Response> = {
  schema: ${context.pascalName}ResponseSchema,
  toContractResponse: to${context.pascalName}ContractResponse,
  fromContractResponse: from${context.pascalName}ContractResponse,
  hasResponse: has${context.pascalName}Response,
};
`;
}

function canvasTemplate(context) {
  return `import { Node, mergeAttributes } from '@tiptap/core';
import {
  NodeViewWrapper,
  ReactNodeViewRenderer,
  type NodeViewProps,
} from '@tiptap/react';

import { stableNodeIdAttribute } from '@/document/model/identity/stable-node-attribute';

export const ${context.pascalName}CanvasNode = Node.create({
  name: '${context.nodeType}_canvas',
  atom: true,
  selectable: false,
  draggable: false,

  addAttributes() {
    return {
      id: stableNodeIdAttribute(),
      data: {
        default: {},
        parseHTML: (element: HTMLElement) => {
          const raw = element.getAttribute('data-${context.kebabName}-canvas');
          if (!raw) return {};
          try {
            return JSON.parse(raw) as Record<string, unknown>;
          } catch {
            return {};
          }
        },
        renderHTML: (attrs: { data: Record<string, unknown> }) => ({
          'data-${context.kebabName}-canvas': JSON.stringify(attrs.data),
        }),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-node="${context.kebabName}-canvas"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'div',
      mergeAttributes(HTMLAttributes, { 'data-node': '${context.kebabName}-canvas' }),
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(${context.pascalName}CanvasNodeView);
  },
});

function ${context.pascalName}CanvasNodeView(_props: NodeViewProps) {
  return (
    <NodeViewWrapper
      data-node="${context.kebabName}-canvas"
      className="rounded-(--radius-md) border border-dashed border-border p-4 text-sm text-text-muted"
    >
      {render${context.pascalName}Canvas()}
    </NodeViewWrapper>
  );
}

function render${context.pascalName}Canvas(): never {
  throw new Error('Implement ${context.pascalName} canvas rendering before shipping this block.');
}
`;
}

function testTemplate(context) {
  const expectsAssessment = isAssessmentRecipe(context) ? `  expectsAssessment: true,\n` : "";
  const assessmentTestImports = isAssessmentRecipe(context)
    ? `import { expect, it } from 'vite-plus/test';
import { ${context.pascalName}SettingsSchema } from '@/schemas/blocks/${context.kebabName}';
`
    : "";
  const assessmentSettingsTest = isAssessmentRecipe(context)
    ? `
it('rejects unsupported assessment settings', () => {
  expect(${context.pascalName}SettingsSchema.safeParse({ unsupportedSetting: true }).success).toBe(false);
});
`
    : "";

  return `// @vitest-environment happy-dom

${assessmentTestImports}import { builtInBlockRegistry } from '@/editor/blocks/built-in-block-definitions';
import { describeBlockContract } from '@/editor/testing';

import './index';

describeBlockContract({
  blockDefinitions: builtInBlockRegistry,
  nodeType: '${context.nodeType}',
  catalogId: '${context.kebabName}',
  expectsFrame: true,
  expectsConfiguration: true,
${expectsAssessment}
});
${assessmentSettingsTest}`;
}
