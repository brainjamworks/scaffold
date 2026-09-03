const reactDependencyPath = ["node_modules/react/", "node_modules/react-dom/"];
const reactViewDependencyPath = ["node_modules/@tiptap/react/", ...reactDependencyPath];
const frameworkAndBrowserDependencyPath = [
  "node_modules/@hocuspocus/",
  "node_modules/@tiptap/",
  "node_modules/happy-dom/",
  "node_modules/idb/",
  "node_modules/jsdom/",
  "node_modules/pinia/",
  "node_modules/prosemirror-",
  ...reactDependencyPath,
  "node_modules/vue/",
  "node_modules/y-prosemirror/",
  "node_modules/yjs/",
];
const privateAgentProductDependencyPath = [
  "^@scaffold/agent(?:/|$)",
  "node_modules/@scaffold/agent/",
];
const runtimeOwnerPath = [
  "^packages/core/src/entrypoints/runtime\\.ts$",
  "^packages/core/src/composition/runtime/",
  "^packages/core/src/runtime/",
  "^packages/core/src/editor/blocks/runtime-block-extensions\\.[^/]+$",
  "^packages/core/src/editor/arrangements/(?:grid|layout)/runtime/",
  "^packages/core/src/editor/blocks/assessment/shared/runtime/",
  "^packages/core/src/editor/blocks/[^/]+/[^/]+/[^/]*(?:runtime|Runtime)[^/]*\\.[^/]+$",
  "^packages/core/src/editor/frame/runtime/",
  "^packages/core/src/editor/rich-text/(?:runtime/|[^/]+/runtime/)",
  "^packages/core/src/editor/surfaces/runtime/",
];
const authoringCatalogueStoragePath =
  "^packages/core/src/composition/extensions/scaffold-authoring-catalogues-storage\\.[^/]+$";
const legacyBuiltInInsertCatalogPath =
  "^packages/core/src/editor/insertion/built-in-insert-catalog\\.[^/]+$";
const legacyCreationInventoryPath = [
  legacyBuiltInInsertCatalogPath,
  "^packages/core/src/editor/insertion/core-structural-insert-actions\\.[^/]+$",
];
const builtInCreationRegistrySourcePath = [
  "^packages/core/src/editor/blocks/built-in-block-definitions\\.[^/]+$",
  "^packages/core/src/editor/arrangements/layout/model/built-in-layout-definitions\\.[^/]+$",
  "^packages/core/src/editor/surfaces/model/built-in-surface-variant-definitions\\.[^/]+$",
];
const authoringOwnerPath = [
  "^packages/core/src/entrypoints/authoring\\.ts$",
  "^packages/core/src/authoring/",
  "^packages/core/src/document/authoring/",
  "^packages/core/src/composition/authoring/",
  authoringCatalogueStoragePath,
  "^packages/core/src/editor/blocks/authoring-block-extensions\\.[^/]+$",
  "^packages/core/src/editor/(?:shell|suggestions)/",
  "^packages/core/src/editor/movement/",
  "^packages/core/src/editor/interactions/(?!drag(?:/|$))",
  "^packages/core/src/editor/(?:bounded-containers|frame|media)/authoring/",
  "^packages/core/src/editor/arrangements/(?:grid|layout)/authoring/",
  "^packages/core/src/editor/blocks/[^/]+/[^/]+/[^/]*(?:authoring|Authoring)[^/]*\\.[^/]+$",
  "^packages/core/src/editor/rich-text/(?:authoring/|[^/]+/authoring/)",
  "^packages/core/src/editor/surfaces/authoring/",
  "^packages/core/src/editor/selection/(?:native-drag-guard|selection-commands)\\.ts$",
];
const authoringCompatibilityImplementationPath = [
  "^packages/core/src/document/authoring/unavailable-content/",
  "^packages/core/src/composition/authoring/",
];
const adapterLearnerEntrypointPath = [
  "^adapters/moodle/frontend/src/inner/moodle-learner-inner-entry\\.[^/]+$",
  "^adapters/xblock/frontend/src/(?:inner/student-inner-entry|student-entry)\\.[^/]+$",
];
const coreNonAuthoringCompatibilityConsumerPath = [
  ...runtimeOwnerPath,
  "^packages/core/src/entrypoints/(?:format|ports)\\.ts$",
  "^packages/core/src/host/ports/",
  "^packages/core/src/format/",
  "^packages/core/src/document/model/",
];
const surfaceAuthoringBindingContractPath =
  "^packages/core/src/editor/surfaces/authoring/surface-authoring-view-registry\\.[^/]+$";
const surfaceRuntimeBindingContractPath =
  "^packages/core/src/editor/surfaces/runtime/surface-runtime-view-registry\\.[^/]+$";
const surfaceLaneBindingAllowedOwnerPath = [
  ...authoringOwnerPath,
  ...runtimeOwnerPath,
  "^packages/core/src/composition/application/",
  "^packages/core/src/entrypoints/extensions\\.ts$",
  "^packages/core/src/editor/surfaces/testing/slide-composition-browser-harness\\.tsx$",
]
  .map((path) => `(?:${path})`)
  .join("|");
const surfaceVariantFolderPath = "^packages/core/src/editor/surfaces/variants/";
const surfaceVariantBlockSeamPath =
  "^packages/core/src/editor/blocks/assessment/(?:[^/]+/[^/]*definition\\.[^/]+$|fill-blanks/commands\\.ts$)";
const blockConstructionOwnerPath =
  "^packages/core/src/editor/blocks/(?:block-definition|block-registry|built-in-block-definitions)\\.[^/]+$";
const auditedNeutralSelectionPath =
  "^packages/core/src/editor/selection/(?:block-context|course-selection-projection|selection-facts|selection-transactions)\\.ts$";
const presentationModelPath = "^packages/core/src/presentation/model/";
const classifiedNeutralOwnerPath = [
  "^packages/core/src/document/model/",
  "^packages/core/src/composition/model/",
  presentationModelPath,
  blockConstructionOwnerPath,
  "^packages/core/src/editor/arrangements/grid/model/",
  "^packages/core/src/editor/arrangements/layout/model/",
  "^packages/core/src/editor/surfaces/model/",
  "^packages/core/src/editor/frame/model/",
  "^packages/core/src/editor/interactions/targets/(?:model|engine)/",
  auditedNeutralSelectionPath,
];
const higherCoreOwnerPath = [
  "^packages/core/src/entrypoints/",
  "^packages/core/src/composition/(?:application|authoring|runtime)/",
  "^packages/core/src/authoring/",
  "^packages/core/src/document/authoring/",
  "^packages/core/src/runtime/",
  "^packages/core/src/editor/shell/",
  "^packages/core/src/editor/suggestions/",
  "^packages/core/src/editor/arrangements/(?:grid|layout)/(?:authoring|runtime)/",
  "^packages/core/src/editor/surfaces/(?:authoring|runtime|view)/",
  "^packages/core/src/editor/frame/(?:authoring|runtime|view)/",
  "^packages/core/src/editor/movement/view/",
  "^packages/core/src/editor/blocks/(?:authoring-block-extensions|runtime-block-extensions)\\.[^/]+$",
  "^packages/core/src/editor/blocks/[^/]+/[^/]*(?:authoring|Authoring|runtime|Runtime|view|View)[^/]*\\.[^/]+$",
  "^packages/core/src/editor/blocks/[^/]+/[^/]+/[^/]*(?:authoring|Authoring|runtime|Runtime|view|View)[^/]*\\.[^/]+$",
  "^packages/core/src/editor/selection/(?:native-drag-guard|selection-commands)\\.ts$",
];
const interactionFrameworkDependencyPath = [
  "node_modules/@tiptap/",
  "node_modules/prosemirror-",
  ...reactDependencyPath,
];
const contentLayoutPath = "^packages/core/src/editor/content-layout/";
const interactionFeaturePolicyPath = [
  "^packages/core/src/editor/blocks/",
  "^packages/core/src/editor/arrangements/(?:grid|layout)/(?:authoring|runtime)/",
  contentLayoutPath,
  "^packages/core/src/editor/surfaces/(?:authoring|runtime|view)/",
  "^packages/core/src/editor/frame/(?:authoring|runtime|view)/",
  "^packages/core/src/editor/movement/view/",
  "^packages/core/src/editor/shell/",
  "^packages/core/src/editor/suggestions/",
];
const centralDragPath = "^packages/core/src/editor/interactions/drag/";
const centralDragModelPath = `${centralDragPath}model/`;
const centralDragDOMPath = `${centralDragPath}dom/`;
const centralDragReactPath = `${centralDragPath}react/`;
const interactionTargetsPath = "^packages/core/src/editor/interactions/targets/";
const dndKitDependencyPath = [
  "^node_modules/@dnd-kit/",
  "^node_modules/\\.pnpm/[^/]+/node_modules/@dnd-kit/",
];
const lowLevelFloatingInfrastructurePath = [
  "^packages/core/src/editor/interactions/bubble/bubble-anchor\\.ts$",
  "^packages/core/src/editor/interactions/floating/(?:editor-floating-layer-kind|floating-anchor|overlay-floating-positioner|structural-floating-geometry)\\.ts$",
  "^packages/core/src/ui/overlays/",
];

module.exports = {
  forbidden: [
    {
      // Owner: "One production dependency graph" in the tracked architecture.
      // Use a relative path, @/*, or a declared workspace public source seam.
      name: "no-unresolved-internal-dependencies",
      severity: "error",
      from: {
        path: "^(?:packages|apps|adapters)/",
      },
      to: {
        couldNotResolve: true,
        path: "^(?:\\.{1,2}/|@/|@scaffold/|packages/|apps/|adapters/)",
      },
    },
    {
      // Owner: "Type ownership and executable cycles are separate policies" in the
      // tracked architecture. Move shared runtime code to a lower neutral owner;
      // pure type-only cycles remain visible to owner-direction rules.
      name: "no-circular-at-runtime",
      severity: "error",
      from: {},
      to: {
        circular: true,
        viaOnly: {
          dependencyTypesNot: ["type-only"],
        },
      },
    },
    {
      // Owner: package DAG in AGENTS.md and the tracked architecture.
      // Contracts is the provider-neutral leaf; move shared persisted schemas into it.
      name: "contracts-have-no-scaffold-dependencies",
      severity: "error",
      from: {
        path: "^packages/contracts/src/",
      },
      to: {
        path: "^(?:packages/(?:core|grading)/src/|apps/|adapters/)",
      },
    },
    {
      // Owner: package DAG in AGENTS.md and the tracked architecture.
      // Contracts stays serializable and provider neutral.
      name: "contracts-have-no-framework-or-browser-dependencies",
      severity: "error",
      from: {
        path: "^packages/contracts/src/",
      },
      to: {
        path: frameworkAndBrowserDependencyPath,
      },
    },
    {
      // Owner: package DAG in AGENTS.md and the tracked architecture.
      // Grading may consume Contracts; browser-local wiring belongs to Playground.
      name: "grading-depends-only-on-contracts",
      severity: "error",
      from: {
        path: "^packages/grading/src/",
      },
      to: {
        path: "^(?:packages/core/src/|apps/|adapters/)",
      },
    },
    {
      // Owner: package DAG in AGENTS.md and the tracked architecture.
      // Keep the grader portable across browser and server hosts.
      name: "grading-has-no-framework-or-browser-dependencies",
      severity: "error",
      from: {
        path: "^packages/grading/src/",
      },
      to: {
        path: frameworkAndBrowserDependencyPath,
      },
    },
    {
      // Owner: package DAG in AGENTS.md and the tracked architecture.
      // Core receives host results through ports and never imports application wiring.
      name: "core-does-not-depend-on-grading-apps-or-adapters",
      severity: "error",
      from: {
        path: "^packages/core/src/",
      },
      to: {
        path: "^(?:packages/grading/src/|apps/|adapters/)",
      },
    },
    {
      // Owner: supported public package seams in the tracked architecture.
      // Public consumers use the Contracts root entrypoint, never its source leaves.
      name: "apps-and-adapters-use-contracts-public-entrypoint",
      severity: "error",
      from: {
        path: "^(?:apps|adapters)/",
      },
      to: {
        path: "^packages/contracts/src/",
        pathNot: "^packages/contracts/src/index\\.ts$",
      },
    },
    {
      // Owner: package DAG in AGENTS.md and the tracked architecture.
      // Playground is the sole current browser-local Grading consumer.
      name: "grading-is-playground-only",
      severity: "error",
      from: {
        path: "^(?:adapters/|apps/(?!playground/))",
      },
      to: {
        path: "^packages/grading/src/",
      },
    },
    {
      // Owner: supported public package seams in the tracked architecture.
      // Playground consumes Grading through its root entrypoint.
      name: "playground-uses-grading-public-entrypoint",
      severity: "error",
      from: {
        path: "^apps/playground/",
      },
      to: {
        path: "^packages/grading/src/",
        pathNot: "^packages/grading/src/index\\.ts$",
      },
    },
    {
      // Owner: supported public package seams in the tracked architecture.
      // This is intentionally direct-only: public entrypoints may traverse Core internally.
      name: "apps-and-adapters-use-core-public-entrypoints",
      severity: "error",
      from: {
        path: "^(?:apps|adapters)/",
      },
      to: {
        path: "^packages/core/src/",
        pathNot:
          "^packages/core/src/(?:entrypoints/(?:agent-host|authoring|extensions|format|media-policy|ports|runtime)\\.ts|styles/globals\\.css)$",
      },
    },
    {
      // Owner: public/private Agent boundary in AGENTS.md and the tracked architecture.
      // The exact private first-party consumer lives outside these public roots.
      name: "public-consumers-do-not-use-agent-host",
      severity: "error",
      from: {
        path: "^(?:apps|adapters)/",
      },
      to: {
        path: "^packages/core/src/entrypoints/agent-host\\.ts$",
      },
    },
    {
      // Owner: public/private Agent boundary in AGENTS.md and the tracked architecture.
      // Core owns only its neutral host seam and shared presentation.
      name: "core-agent-owners-do-not-reach-private-product",
      severity: "error",
      from: {
        path: "^packages/core/src/",
      },
      to: {
        path: privateAgentProductDependencyPath,
      },
    },
    {
      // Owner: public/private Agent boundary in AGENTS.md and the tracked architecture.
      // OSS packages, apps, and installed adapters never receive private Agent code.
      name: "public-consumers-do-not-reach-private-agent-product",
      severity: "error",
      from: {
        path: "^(?:packages/(?:contracts|grading)/src/|apps/|adapters/)",
      },
      to: {
        path: privateAgentProductDependencyPath,
      },
    },
    {
      // Owner: Core public-entrypoint direction in the tracked architecture.
      // Leaves import their owning implementation seams, never package entrypoints upward.
      name: "core-leaves-do-not-import-public-entrypoints",
      severity: "error",
      from: {
        path: "^packages/core/src/",
        pathNot: "^packages/core/src/entrypoints/",
      },
      to: {
        path: "^packages/core/src/entrypoints/",
        reachable: true,
      },
    },
    {
      // Owner: host-port seam in AGENTS.md and the tracked architecture.
      // Ports are low-level contracts; implementations and application owners point toward them.
      name: "host-ports-do-not-reach-implementations",
      severity: "error",
      from: {
        path: "^packages/core/src/host/ports/",
      },
      to: {
        path: [
          "^packages/core/src/host/providers/",
          "^packages/core/src/runtime/",
          "^packages/core/src/editor/shell/authoring/",
          "^apps/playground/",
          "^adapters/",
          ...reactDependencyPath,
        ],
        reachable: true,
      },
    },
    {
      // Owner: unavailable-content compatibility is authoring working state only.
      // Non-authoring lanes consume portable lifecycle results through public seams.
      name: "core-non-authoring-lanes-do-not-reach-authoring-compatibility",
      severity: "error",
      from: {
        path: coreNonAuthoringCompatibilityConsumerPath,
      },
      to: {
        path: authoringCompatibilityImplementationPath,
        reachable: true,
      },
    },
    {
      // Adapters consume authoring only through its public entrypoint; they never
      // import compatibility presentation or authoring composition internals.
      name: "adapters-do-not-import-authoring-compatibility-internals",
      severity: "error",
      from: {
        path: "^adapters/",
      },
      to: {
        path: authoringCompatibilityImplementationPath,
      },
    },
    {
      // Learner adapter entrypoints consume only runtime/publication seams.
      // Their sibling authoring entrypoints retain the approved public authoring seam.
      name: "adapter-learner-entrypoints-do-not-reach-core-authoring",
      severity: "error",
      from: {
        path: adapterLearnerEntrypointPath,
      },
      to: {
        path: "^packages/core/src/entrypoints/authoring\\.ts$",
        reachable: true,
      },
    },
    {
      // Owner: runtime/authoring separation in the tracked architecture.
      // Runtime-safe selection is limited to facts, transactions, block context, and projection;
      // Editor/DOM selection adapters remain authoring-only.
      name: "runtime-does-not-reach-authoring",
      severity: "error",
      from: {
        path: runtimeOwnerPath,
      },
      to: {
        path: authoringOwnerPath,
        reachable: true,
      },
    },
    {
      // Owner: runtime/authoring separation in the tracked architecture.
      // Authoring owners use neutral seams; only Preview's exact source is considered below.
      name: "authoring-does-not-import-runtime-except-preview",
      severity: "error",
      from: {
        path: authoringOwnerPath,
        pathNot: "^packages/core/src/editor/shell/authoring/ScaffoldAuthoringApp\\.tsx$",
      },
      to: {
        path: runtimeOwnerPath,
      },
    },
    {
      // Owner: the exact Preview exception in the tracked architecture.
      // Preview delegates only to the dedicated author Preview application, never another runtime
      // module (including the public learner application).
      name: "preview-does-not-import-other-runtime-modules",
      severity: "error",
      from: {
        path: "^packages/core/src/editor/shell/authoring/ScaffoldAuthoringApp\\.tsx$",
      },
      to: {
        path: "^packages/core/src/runtime/",
        pathNot: "^packages/core/src/runtime/app/ScaffoldAuthorPreviewApp\\.tsx$",
      },
    },
    {
      // Owner: the exact Preview exception in the tracked architecture.
      // The author Preview app stays lazy; a static or type edge does not qualify.
      name: "preview-author-app-import-must-be-dynamic",
      severity: "error",
      from: {
        path: "^packages/core/src/editor/shell/authoring/ScaffoldAuthoringApp\\.tsx$",
      },
      to: {
        path: "^packages/core/src/runtime/app/ScaffoldAuthorPreviewApp\\.tsx$",
        dynamic: false,
      },
    },
    {
      // Owner: assessment/activity runtime separation in the tracked architecture.
      // Assessment response lifecycle never owns learner-activity progress.
      name: "assessment-runtime-does-not-reach-learner-activity",
      severity: "error",
      from: {
        path: "^packages/core/src/runtime/assessment/",
      },
      to: {
        path: "^packages/core/src/runtime/learner-activity/",
        reachable: true,
      },
    },
    {
      // Owner: assessment/activity runtime separation in the tracked architecture.
      // Learner-activity progress never owns assessment response lifecycle.
      name: "learner-activity-runtime-does-not-reach-assessment",
      severity: "error",
      from: {
        path: "^packages/core/src/runtime/learner-activity/",
      },
      to: {
        path: "^packages/core/src/runtime/assessment/",
        reachable: true,
      },
    },
    {
      // Owner: assessment feature direction in the tracked architecture.
      // Quiz coordinates through shared assessment owners, not concrete child features.
      name: "quiz-does-not-reach-concrete-assessment-children",
      severity: "error",
      from: {
        path: "^packages/core/src/editor/blocks/assessment/quiz/",
      },
      to: {
        path: "^packages/core/src/editor/blocks/assessment/(?!quiz/|shared/)",
      },
    },
    {
      // Owner: assessment feature direction in the tracked architecture.
      // Concrete children coordinate through shared assessment owners, not Quiz internals.
      name: "concrete-assessment-children-do-not-reach-quiz",
      severity: "error",
      from: {
        path: "^packages/core/src/editor/blocks/assessment/(?!quiz/|shared/)",
      },
      to: {
        path: "^packages/core/src/editor/blocks/assessment/quiz/",
      },
    },
    {
      // Owner: runtime leaf direction in the tracked architecture.
      // Leaves consume narrow runtime/model owners, not public seams or composition roots.
      name: "runtime-leaves-do-not-import-public-entrypoints-or-composition-roots",
      severity: "error",
      from: {
        path: "^packages/core/src/runtime/(?:assessment|foundation|guards|learner-activity|learner-interaction|players|presentation)/",
      },
      to: {
        path: [
          "^packages/core/src/entrypoints/",
          "^packages/core/src/composition/(?:application|authoring|runtime)/",
        ],
      },
    },
    {
      // Owner: block feature isolation in the architecture and source-structure rules.
      // Concrete features share through blocks/shared or their own domain shared owner.
      name: "block-features-do-not-import-peer-features",
      severity: "error",
      from: {
        path: "^packages/core/src/editor/blocks/(?!shared/)([^/]+)/(?!shared/)([^/]+)/",
      },
      to: {
        path: "^packages/core/src/editor/blocks/",
        pathNot:
          "^packages/core/src/editor/blocks/(?:shared/|$1/(?:shared/|$2/)|(?:block-definition|block-registry|built-in-block-definitions|authoring-block-extensions|runtime-block-extensions)\\.[^/]+$)",
      },
    },
    {
      // Owner: pure block definitions in the architecture and block-type rules.
      // Built-in collections, lane lists, insertion catalogues, and composers point to definitions.
      name: "block-definitions-do-not-reach-construction-roots",
      severity: "error",
      from: {
        path: "^packages/core/src/editor/blocks/(?:[^/]+/[^/]+-definition|[^/]+/[^/]+/[^/]+-definition)\\.(?:ts|tsx)$",
      },
      to: {
        path: [
          "^packages/core/src/editor/blocks/(?:block-registry|built-in-block-definitions|authoring-block-extensions|runtime-block-extensions)\\.[^/]+$",
          "^packages/core/src/editor/insertion/(?:built-in-insert-catalog|core-structural-insert-actions|insert-catalog)\\.[^/]+$",
          "^packages/core/src/composition/",
          "^packages/core/src/entrypoints/",
        ],
        reachable: true,
      },
    },
    {
      // Owner: neutral block registry construction in the architecture and block-type rules.
      // React NodeViews and lane lists consume registry policy; the registry never assembles them.
      name: "block-registry-does-not-reach-react-views-or-lane-lists",
      severity: "error",
      from: {
        path: "^packages/core/src/editor/blocks/block-registry\\.[^/]+$",
      },
      to: {
        path: [
          "^packages/core/src/editor/blocks/(?:authoring-block-extensions|runtime-block-extensions)\\.[^/]+$",
          "^packages/core/src/editor/blocks/[^/]+/[^/]*(?:authoring|Authoring|runtime|Runtime|view|View)[^/]*\\.[^/]+$",
          "^packages/core/src/editor/blocks/[^/]+/[^/]+/[^/]*(?:authoring|Authoring|runtime|Runtime|view|View)[^/]*\\.[^/]+$",
        ],
        reachable: true,
      },
    },
    {
      // Owner: neutral block registry construction in the architecture and block-type rules.
      // A direct React/Tiptap React import is view ownership, not registry policy.
      name: "block-registry-does-not-import-react",
      severity: "error",
      from: {
        path: "^packages/core/src/editor/blocks/block-registry\\.[^/]+$",
      },
      to: {
        path: reactViewDependencyPath,
      },
    },
    {
      // Owner: explicit block lane construction in the architecture and block-type rules.
      // Authoring extensions never assemble or traverse the runtime extension list.
      name: "authoring-block-lane-does-not-reach-runtime-block-lane",
      severity: "error",
      from: {
        path: "^packages/core/src/editor/blocks/authoring-block-extensions\\.[^/]+$",
      },
      to: {
        path: "^packages/core/src/editor/blocks/runtime-block-extensions\\.[^/]+$",
        reachable: true,
      },
    },
    {
      // Owner: explicit block lane construction in the architecture and block-type rules.
      // Runtime extensions never assemble or traverse the authoring extension list.
      name: "runtime-block-lane-does-not-reach-authoring-block-lane",
      severity: "error",
      from: {
        path: "^packages/core/src/editor/blocks/runtime-block-extensions\\.[^/]+$",
      },
      to: {
        path: "^packages/core/src/editor/blocks/authoring-block-extensions\\.[^/]+$",
        reachable: true,
      },
    },
    {
      // Owner: layout definition and registry direction in the architecture and source-structure rules.
      // Pure construction may use neutral Tiptap adaptation, but not views, lanes, shell, or block Frame policy.
      name: "layout-model-does-not-reach-views-or-block-owners",
      severity: "error",
      from: {
        path: "^packages/core/src/editor/arrangements/layout/model/(?:built-in-layout-definitions|layout-definition|layout-nodes|layout-registry)\\.[^/]+$",
      },
      to: {
        path: [
          "^packages/core/src/editor/arrangements/layout/(?:authoring|runtime)/",
          "^packages/core/src/editor/arrangements/layout/[^/]+/[^/]*(?:component|view)[^/]*\\.(?:ts|tsx)$",
          "^packages/core/src/editor/shell/",
          "^packages/core/src/editor/frame/(?:authoring|runtime|view)/",
          "^packages/core/src/editor/frame/model/(?:block-frame|frame-attributes-extension)\\.[^/]+$",
          "^packages/core/src/editor/blocks/(?:block-registry|built-in-block-definitions)\\.[^/]+$",
        ],
        reachable: true,
      },
    },
    {
      // Owner: layout definition and registry direction in the architecture and source-structure rules.
      // Editor-local configuration may adapt below this owner; the layout construction roots do not import React.
      name: "layout-model-does-not-import-react",
      severity: "error",
      from: {
        path: "^packages/core/src/editor/arrangements/layout/model/(?:built-in-layout-definitions|layout-definition|layout-nodes|layout-registry)\\.[^/]+$",
      },
      to: {
        path: reactViewDependencyPath,
      },
    },
    {
      // Owner: explicit layout lane construction in the architecture and source-structure rules.
      name: "authoring-layout-lane-does-not-reach-runtime-layout-lane",
      severity: "error",
      from: {
        path: "^packages/core/src/editor/arrangements/layout/authoring/",
      },
      to: {
        path: "^packages/core/src/editor/arrangements/layout/runtime/",
        reachable: true,
      },
    },
    {
      // Owner: explicit layout lane construction in the architecture and source-structure rules.
      name: "runtime-layout-lane-does-not-reach-authoring-layout-lane",
      severity: "error",
      from: {
        path: "^packages/core/src/editor/arrangements/layout/runtime/",
      },
      to: {
        path: "^packages/core/src/editor/arrangements/layout/authoring/",
        reachable: true,
      },
    },
    {
      // Owner: surface model and registry direction in the architecture and source-structure rules.
      // Lane views, players, shell, and public entrypoints assemble above the neutral surface model.
      name: "surface-model-does-not-reach-views-players-shell-or-entrypoints",
      severity: "error",
      from: {
        path: "^packages/core/src/editor/surfaces/model/",
      },
      to: {
        path: [
          "^packages/core/src/editor/surfaces/(?:authoring|runtime|view)/",
          "^packages/core/src/runtime/players/",
          "^packages/core/src/editor/shell/",
          "^packages/core/src/entrypoints/",
        ],
        reachable: true,
      },
    },
    {
      // Owner: surface model and registry direction in the architecture and source-structure rules.
      // Surface model files remain directly React-free while lower local adaptations keep their own contract.
      name: "surface-model-does-not-import-react",
      severity: "error",
      from: {
        path: "^packages/core/src/editor/surfaces/model/",
      },
      to: {
        path: reactViewDependencyPath,
      },
    },
    {
      // Owner: explicit surface lane construction in the architecture and source-structure rules.
      name: "authoring-surface-lane-does-not-reach-runtime-surface-lane",
      severity: "error",
      from: {
        path: [
          "^packages/core/src/composition/authoring/",
          "^packages/core/src/editor/surfaces/authoring/",
        ],
      },
      to: {
        path: "^packages/core/src/editor/surfaces/runtime/",
        reachable: true,
      },
    },
    {
      // Owner: explicit surface lane construction in the architecture and source-structure rules.
      name: "runtime-surface-lane-does-not-reach-authoring-surface-lane",
      severity: "error",
      from: {
        path: [
          "^packages/core/src/composition/runtime/",
          "^packages/core/src/editor/surfaces/runtime/",
        ],
      },
      to: {
        path: "^packages/core/src/editor/surfaces/authoring/",
        reachable: true,
      },
    },
    {
      // Owner: complete Surface capabilities are joined by application integration.
      // Neutral Surface owners cannot relay either environment binding contract.
      name: "neutral-surface-relays-do-not-reach-lane-bindings",
      severity: "error",
      from: {
        path: "^packages/core/src/",
        pathNot: surfaceLaneBindingAllowedOwnerPath,
      },
      to: {
        path: [surfaceAuthoringBindingContractPath, surfaceRuntimeBindingContractPath],
        reachable: true,
      },
    },
    {
      // Owner: explicit per-variant surface bindings (surfaces restructure).
      // Each binding pairs one block definition with the shared draft helpers,
      // so bindings never reach back into any variant folder: no sibling or
      // view coupling can hide inside a binding.
      name: "surface-variant-bindings-do-not-reach-variant-folders",
      severity: "error",
      from: {
        path: `${surfaceVariantFolderPath}[^/]+/binding\\.ts$`,
      },
      to: {
        path: surfaceVariantFolderPath,
      },
    },
    {
      // Owner: the explicitly classified neutral owners in the tracked V2 architecture.
      // Tiptap/ProseMirror adaptation is intentional; React views and styles remain above these owners.
      name: "classified-neutral-owners-do-not-import-react-or-css",
      severity: "error",
      from: {
        path: classifiedNeutralOwnerPath,
      },
      to: {
        path: [...reactViewDependencyPath, "\\.css$"],
      },
    },
    {
      // Owner: neutral document model direction in the tracked V2 architecture.
      name: "document-model-does-not-reach-higher-owners",
      severity: "error",
      from: {
        path: "^packages/core/src/document/model/",
      },
      to: {
        path: higherCoreOwnerPath,
        reachable: true,
      },
    },
    {
      // Owner: the neutral Presentation compiler and scene seam. Authoring and runtime consume it;
      // the model cannot reach either implementation lane.
      name: "presentation-model-does-not-reach-higher-owners",
      severity: "error",
      from: {
        path: presentationModelPath,
      },
      to: {
        path: higherCoreOwnerPath,
        reachable: true,
      },
    },
    {
      // Owner: neutral document composition in the tracked V2 architecture.
      // Lane roots assemble this model; the model never discovers a lane or shell above itself.
      name: "neutral-composition-does-not-reach-lane-or-shell-owners",
      severity: "error",
      from: {
        path: "^packages/core/src/composition/model/",
      },
      to: {
        path: higherCoreOwnerPath,
        reachable: true,
      },
    },
    {
      // Owner: grid model and ProseMirror command adaptation in the tracked V2 architecture.
      name: "grid-model-does-not-reach-higher-owners",
      severity: "error",
      from: {
        path: "^packages/core/src/editor/arrangements/grid/model/",
      },
      to: {
        path: higherCoreOwnerPath,
        reachable: true,
      },
    },
    {
      // Owner: layout model and definition direction in the tracked V2 architecture.
      name: "layout-model-does-not-reach-higher-owners",
      severity: "error",
      from: {
        path: "^packages/core/src/editor/arrangements/layout/model/",
      },
      to: {
        path: higherCoreOwnerPath,
        reachable: true,
      },
    },
    {
      // Owner: surface model and definition direction in the tracked V2 architecture.
      name: "surface-model-does-not-reach-higher-owners",
      severity: "error",
      from: {
        path: "^packages/core/src/editor/surfaces/model/",
      },
      to: {
        path: higherCoreOwnerPath,
        reachable: true,
      },
    },
    {
      // Owner: persisted Frame model and Tiptap transaction adaptation in the tracked V2 architecture.
      name: "frame-model-does-not-reach-higher-owners",
      severity: "error",
      from: {
        path: "^packages/core/src/editor/frame/model/",
      },
      to: {
        path: higherCoreOwnerPath,
        reachable: true,
      },
    },
    {
      // Owner: authoring movement intent, target, and geometry model in the tracked V2 architecture.
      name: "movement-model-does-not-reach-higher-owners",
      severity: "error",
      from: {
        path: "^packages/core/src/editor/movement/model/",
      },
      to: {
        path: higherCoreOwnerPath,
        reachable: true,
      },
    },
    {
      // Owner: the audited runtime-safe selection facts and transaction helpers.
      // DOM, chrome, lane, and shell policy remain in the named authoring selection adapters.
      name: "neutral-selection-does-not-reach-authoring-policy",
      severity: "error",
      from: {
        path: auditedNeutralSelectionPath,
      },
      to: {
        path: higherCoreOwnerPath,
        reachable: true,
      },
    },
    {
      // Owner: immutable block construction in the tracked V2 architecture.
      // Definitions and registries are inputs to lane and shell composition, never consumers of it.
      name: "block-construction-does-not-reach-higher-owners",
      severity: "error",
      from: {
        path: blockConstructionOwnerPath,
      },
      to: {
        path: higherCoreOwnerPath,
        reachable: true,
      },
    },
    {
      // Owner: composition-root direction in the tracked V2 architecture.
      // The application root integrates both lanes; application and lane roots may assemble
      // arbitrary lower leaves, while those leaves cannot traverse back upward.
      name: "core-leaves-do-not-reach-lane-composition-roots",
      severity: "error",
      from: {
        path: "^packages/core/src/(?!entrypoints/|composition/(?:application|authoring|runtime)/|authoring/|document/authoring/|runtime/|editor/shell/)",
      },
      to: {
        path: "^packages/core/src/composition/(?:application|authoring|runtime)/",
      },
    },
    {
      // Owner: the authoring catalogue editor-storage dependency inversion.
      // Lane roots construct and install this lower seam; it cannot relay back upward.
      name: "authoring-catalogue-storage-does-not-reach-lane-composition-roots",
      severity: "error",
      from: {
        path: authoringCatalogueStoragePath,
      },
      to: {
        path: "^packages/core/src/composition/(?:application|authoring|runtime)/",
        reachable: true,
      },
    },
    {
      // Owner: the resolved authoring-catalogue contract for suggestion creation.
      name: "suggestion-creation-does-not-reach-built-in-inventories",
      severity: "error",
      from: {
        path: "^packages/core/src/editor/suggestions/(?:slash|empty-row)/",
      },
      to: {
        path: legacyCreationInventoryPath,
        reachable: true,
      },
    },
    {
      // Registry definitions remain legitimate dependencies of lower placement policy,
      // so protect the migrated suggestion owner from direct shortcuts only.
      name: "suggestion-creation-does-not-import-built-in-registries",
      severity: "error",
      from: {
        path: "^packages/core/src/editor/suggestions/(?:slash|empty-row)/",
      },
      to: {
        path: builtInCreationRegistrySourcePath,
      },
    },
    {
      // Owner: injectable Block Strip and Surface picker creation presentations.
      name: "authoring-creation-ui-does-not-reach-built-in-inventories",
      severity: "error",
      from: {
        path: [
          "^packages/core/src/editor/shell/chrome/BlockStrip\\.[^/]+$",
          "^packages/core/src/editor/surfaces/authoring/SurfaceTemplatePickerHost\\.[^/]+$",
        ],
      },
      to: {
        path: legacyCreationInventoryPath,
        reachable: true,
      },
    },
    {
      // Presentation leaves receive registries explicitly and cannot import Core defaults.
      name: "authoring-creation-ui-does-not-import-built-in-registries",
      severity: "error",
      from: {
        path: [
          "^packages/core/src/editor/shell/chrome/BlockStrip\\.[^/]+$",
          "^packages/core/src/editor/surfaces/authoring/SurfaceTemplatePickerHost\\.[^/]+$",
        ],
      },
      to: {
        path: builtInCreationRegistrySourcePath,
      },
    },
    {
      // Owner: the mixed authoring shell may retain deferred settings/framing registries,
      // but its creation wiring cannot regain the deleted catalogue through a relay.
      name: "authoring-document-chrome-does-not-reach-legacy-insert-catalog",
      severity: "error",
      from: {
        path: "^packages/core/src/editor/shell/authoring/AuthoringDocumentChrome\\.[^/]+$",
      },
      to: {
        path: legacyBuiltInInsertCatalogPath,
        reachable: true,
      },
    },
    {
      // Owner: Quiz creation and active-child controls use editor-installed inputs.
      name: "quiz-authoring-does-not-reach-built-in-inventories",
      severity: "error",
      from: {
        path: "^packages/core/src/editor/blocks/assessment/quiz/(?:quiz-authoring|quick-actions)\\.[^/]+$",
      },
      to: {
        path: legacyCreationInventoryPath,
        reachable: true,
      },
    },
    {
      // Quiz receives the installed Block registry through its current editor.
      name: "quiz-authoring-does-not-import-built-in-registries",
      severity: "error",
      from: {
        path: "^packages/core/src/editor/blocks/assessment/quiz/(?:quiz-authoring|quick-actions)\\.[^/]+$",
      },
      to: {
        path: builtInCreationRegistrySourcePath,
      },
    },
    {
      // Owner: schema-only Agent insertion requires a caller-supplied catalogue.
      name: "agent-insertion-does-not-reach-built-in-inventories",
      severity: "error",
      from: {
        path: "^packages/core/src/host/agent/insertion\\.[^/]+$",
      },
      to: {
        path: legacyCreationInventoryPath,
        reachable: true,
      },
    },
    {
      // Agent insertion accepts a caller-supplied catalogue and imports no Core registry.
      name: "agent-insertion-does-not-import-built-in-registries",
      severity: "error",
      from: {
        path: "^packages/core/src/host/agent/insertion\\.[^/]+$",
      },
      to: {
        path: builtInCreationRegistrySourcePath,
      },
    },
    {
      // Owner: environment-specific composition remains below explicit application integration.
      // Lane defaults and assembly consume neutral/model and same-lane owners only.
      name: "lane-composition-roots-do-not-reach-application-integration",
      severity: "error",
      from: {
        path: "^packages/core/src/composition/(?:authoring|runtime)/",
      },
      to: {
        path: "^packages/core/src/composition/application/",
        reachable: true,
      },
    },
    {
      // Owner: framework-neutral central drag values. DOM and React adapt this model from above.
      name: "drag-model-does-not-reach-dom-react-or-feature-policy",
      severity: "error",
      from: {
        path: centralDragModelPath,
      },
      to: {
        path: [
          centralDragDOMPath,
          centralDragReactPath,
          ...interactionFeaturePolicyPath,
          ...interactionFrameworkDependencyPath,
        ],
        reachable: true,
      },
    },
    {
      // Owner: central drag DOM utilities. React and feature policy consume this layer from above.
      name: "drag-dom-does-not-reach-react-or-feature-policy",
      severity: "error",
      from: {
        path: centralDragDOMPath,
      },
      to: {
        path: [
          centralDragReactPath,
          ...interactionFeaturePolicyPath,
          ...interactionFrameworkDependencyPath,
        ],
        reachable: true,
      },
    },
    {
      // Owner: central drag React adapter. Feature-specific policy is supplied by its consumers.
      name: "drag-react-does-not-reach-feature-policy",
      severity: "error",
      from: {
        path: centralDragReactPath,
      },
      to: {
        path: interactionFeaturePolicyPath,
        reachable: true,
      },
    },
    {
      // Owner: the shared drag session cannot discover feature-level interaction targets.
      // Authoring movement remains the explicit bridge to targets.
      name: "central-drag-does-not-reach-interaction-targets",
      severity: "error",
      from: {
        path: centralDragPath,
      },
      to: {
        path: interactionTargetsPath,
        reachable: true,
      },
    },
    {
      // Owner: dnd-kit is an implementation detail of the central React drag adapter.
      name: "dnd-kit-is-owned-by-central-drag-react-adapter",
      severity: "error",
      from: {
        path: "^packages/core/src/",
        pathNot: centralDragReactPath,
      },
      to: {
        path: dndKitDependencyPath,
      },
    },
    {
      // Owner: Interaction Targets owns feature-neutral activation placement; Content Layout
      // supplies its policy through authoring composition, never through a reverse dependency.
      name: "interaction-targets-do-not-reach-content-layout",
      severity: "error",
      from: {
        path: interactionTargetsPath,
      },
      to: {
        path: contentLayoutPath,
        reachable: true,
      },
    },
    {
      // Owner: pure interaction-target model in the tracked V2 architecture.
      name: "interaction-target-model-does-not-reach-engine-adapters-or-feature-policy",
      severity: "error",
      from: {
        path: "^packages/core/src/editor/interactions/targets/model/",
      },
      to: {
        path: [
          "^packages/core/src/editor/interactions/targets/(?:engine|facade|prosemirror)/",
          ...interactionFeaturePolicyPath,
          ...interactionFrameworkDependencyPath,
          "node_modules/zustand/",
        ],
        reachable: true,
      },
    },
    {
      // Owner: pure interaction-target engine in the tracked V2 architecture.
      // ProseMirror projection and React facade layers consume this engine from above.
      name: "interaction-target-engine-does-not-reach-adapters-or-feature-policy",
      severity: "error",
      from: {
        path: "^packages/core/src/editor/interactions/targets/engine/",
      },
      to: {
        path: [
          "^packages/core/src/editor/interactions/targets/(?:facade|prosemirror)/",
          ...interactionFeaturePolicyPath,
          ...interactionFrameworkDependencyPath,
          "node_modules/zustand/",
        ],
        reachable: true,
      },
    },
    {
      // Owner: the framework-neutral vanilla interaction store in the tracked V2 architecture.
      name: "interaction-store-remains-framework-neutral",
      severity: "error",
      from: {
        path: "^packages/core/src/editor/interactions/targets/facade/interaction-store\\.ts$",
      },
      to: {
        path: [
          "^packages/core/src/editor/interactions/targets/facade/interaction-provider\\.tsx$",
          "^packages/core/src/editor/interactions/targets/prosemirror/",
          ...interactionFrameworkDependencyPath,
        ],
        reachable: true,
      },
    },
    {
      // Owner: the React interaction facade in the tracked V2 architecture.
      // React and Zustand are local facade mechanisms; ProseMirror and feature policy remain adapters.
      name: "interaction-provider-does-not-reach-prosemirror-or-feature-policy",
      severity: "error",
      from: {
        path: "^packages/core/src/editor/interactions/targets/facade/interaction-provider\\.tsx$",
      },
      to: {
        path: [
          "^packages/core/src/editor/interactions/targets/prosemirror/",
          "node_modules/@tiptap/",
          "node_modules/prosemirror-",
          ...interactionFeaturePolicyPath,
        ],
        reachable: true,
      },
    },
    {
      // Owner: exact low-level floating infrastructure in the tracked V2 architecture.
      // Higher coordinators normalize feature and target information before it reaches these utilities.
      name: "low-level-floating-infrastructure-does-not-reach-shell-or-feature-policy",
      severity: "error",
      from: {
        path: lowLevelFloatingInfrastructurePath,
      },
      to: {
        path: ["^packages/core/src/editor/shell/", "^packages/core/src/editor/blocks/(?!shared/)"],
        reachable: true,
      },
    },
    {
      // Owner: Frame/Movement semantic coordination in the tracked V2 architecture.
      name: "frame-authoring-does-not-reach-movement-view-state",
      severity: "error",
      from: {
        path: "^packages/core/src/editor/frame/authoring/",
      },
      to: {
        path: "^packages/core/src/editor/movement/view/",
        reachable: true,
      },
    },
    {
      // Owner: Frame/Movement semantic coordination in the tracked V2 architecture.
      name: "movement-view-does-not-reach-frame-authoring-state",
      severity: "error",
      from: {
        path: "^packages/core/src/editor/movement/view/",
      },
      to: {
        path: "^packages/core/src/editor/frame/authoring/",
        reachable: true,
      },
    },
    {
      // Owner: insertion catalogue and checked insertion direction in the tracked V2 architecture.
      // Shells consume insertion actions; insertion never discovers a lane or application owner.
      name: "insertion-does-not-reach-shell-runtime-or-lane-construction",
      severity: "error",
      from: {
        path: "^packages/core/src/editor/insertion/",
      },
      to: {
        path: [
          "^packages/core/src/entrypoints/",
          "^packages/core/src/composition/(?:application|authoring|runtime)/",
          "^packages/core/src/document/authoring/",
          "^packages/core/src/runtime/",
          "^packages/core/src/editor/shell/",
          "^packages/core/src/editor/blocks/(?:authoring-block-extensions|runtime-block-extensions)\\.[^/]+$",
          "^packages/core/src/editor/arrangements/(?:grid|layout)/(?:authoring|runtime)/",
          "^packages/core/src/editor/surfaces/(?:authoring|runtime|view)/",
          "^packages/core/src/editor/frame/(?:authoring|runtime|view)/",
        ],
        reachable: true,
      },
    },
    {
      // Owner: Scaffold UI composition rules. Core code consumes Radix only through local wrappers.
      name: "radix-is-owned-by-core-ui-components",
      severity: "error",
      from: {
        path: "^packages/core/src/",
        pathNot: "^packages/core/src/ui/components/",
      },
      to: {
        path: "node_modules/@radix-ui/",
      },
    },
    {
      // Owner: assessment domain direction (surfaces restructure).
      // Blocks and surfaces consume the assessment domain; it consumes
      // neither. Domain tests may fixture real blocks. The block-definition
      // and block-registry carve-out covers type-only threads plus one pure
      // accessor, all scheduled to move in the content-definition split.
      name: "assessment-domain-does-not-reach-blocks-or-surfaces",
      severity: "error",
      from: {
        path: "^packages/core/src/editor/assessment/",
        pathNot: "\\.test\\.(ts|tsx)$",
      },
      to: {
        path: "^packages/core/src/editor/(?:blocks|surfaces)/",
        pathNot: "^packages/core/src/editor/blocks/(?:block-definition|block-registry)\\.[^/]+$",
      },
    },
    {
      // Owner: assessment domain direction (surfaces restructure).
      // Variant folders compose shared parents and domain cores, never
      // sibling block features. Every variant file — bindings included —
      // may use only the sanctioned seam: block definitions plus neutral
      // fill-blanks commands. Variant tests may fixture real blocks.
      name: "surface-variants-do-not-reach-blocks",
      severity: "error",
      from: {
        path: "^packages/core/src/editor/surfaces/variants/",
        pathNot: "\\.test\\.(ts|tsx)$",
      },
      to: {
        path: "^packages/core/src/editor/blocks/",
        pathNot: surfaceVariantBlockSeamPath,
      },
    },
  ],
  options: {
    doNotFollow: {
      path: "(^|/)node_modules/",
    },
    exclude: {
      path: [
        "(^|/)(?:__tests__|tests?|fixtures?|screenshots?)(?:/|$)",
        "(^|/)(?:coverage|generated|vendor|vendored|\\.tmp|tmp)(?:/|$)",
        "^adapters/(?:moodle/scaffold/public|xblock/scaffold_xblock/public)(?:/|$)",
        "\\.(?:browser\\.)?(?:test|spec)\\.[^/]+$",
      ],
    },
    moduleSystems: ["es6", "cjs", "tsd"],
    tsConfig: {
      fileName: "tsconfig.architecture.json",
    },
    tsPreCompilationDeps: true,
    enhancedResolveOptions: {
      exportsFields: ["exports"],
      conditionNames: ["import", "require", "node", "default", "types"],
      extensions: [
        ".ts",
        ".tsx",
        ".mts",
        ".cts",
        ".js",
        ".jsx",
        ".mjs",
        ".cjs",
        ".d.ts",
        ".d.mts",
        ".d.cts",
        ".css",
        ".json",
      ],
      mainFields: ["module", "main", "types", "typings"],
    },
  },
};
