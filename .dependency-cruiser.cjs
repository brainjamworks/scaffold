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
  "^packages/core/src/editor/arrangements/(?:grid|layout)/runtime/",
  "^packages/core/src/editor/blocks/assessment/shared/runtime/",
  "^packages/core/src/editor/blocks/[^/]+/[^/]+/[^/]*(?:runtime|Runtime)[^/]*\\.[^/]+$",
  "^packages/core/src/editor/frame/runtime/",
  "^packages/core/src/editor/rich-text/(?:runtime/|[^/]+/runtime/)",
  "^packages/core/src/editor/surfaces/runtime/",
];
const authoringOwnerPath = [
  "^packages/core/src/entrypoints/authoring\\.ts$",
  "^packages/core/src/authoring/",
  "^packages/core/src/document/authoring/",
  "^packages/core/src/composition/authoring/",
  "^packages/core/src/editor/(?:drag|interactions|shell|suggestions)/",
  "^packages/core/src/editor/(?:bounded-containers|frame|media)/authoring/",
  "^packages/core/src/editor/arrangements/(?:grid|layout)/authoring/",
  "^packages/core/src/editor/blocks/[^/]+/[^/]+/[^/]*(?:authoring|Authoring)[^/]*\\.[^/]+$",
  "^packages/core/src/editor/rich-text/(?:authoring/|[^/]+/authoring/)",
  "^packages/core/src/editor/surfaces/authoring/",
  "^packages/core/src/editor/selection/(?:native-drag-guard|selection-commands)\\.ts$",
];
const blockConstructionOwnerPath =
  "^packages/core/src/editor/blocks/(?:block-definition|block-registry|built-in-block-definitions)\\.[^/]+$";
const auditedNeutralSelectionPath =
  "^packages/core/src/editor/selection/(?:block-context|course-selection-projection|selection-facts|selection-transactions)\\.ts$";
const classifiedNeutralOwnerPath = [
  "^packages/core/src/document/model/",
  "^packages/core/src/composition/model/",
  blockConstructionOwnerPath,
  "^packages/core/src/editor/arrangements/grid/model/",
  "^packages/core/src/editor/arrangements/layout/model/",
  "^packages/core/src/editor/surfaces/model/",
  "^packages/core/src/editor/frame/model/",
  "^packages/core/src/editor/drag/model/",
  "^packages/core/src/editor/interactions/targets/(?:model|engine)/",
  auditedNeutralSelectionPath,
];
const higherCoreOwnerPath = [
  "^packages/core/src/entrypoints/",
  "^packages/core/src/composition/(?:authoring|runtime)/",
  "^packages/core/src/authoring/",
  "^packages/core/src/document/authoring/",
  "^packages/core/src/runtime/",
  "^packages/core/src/editor/shell/",
  "^packages/core/src/editor/suggestions/",
  "^packages/core/src/editor/arrangements/(?:grid|layout)/(?:authoring|runtime)/",
  "^packages/core/src/editor/surfaces/(?:authoring|runtime|view)/",
  "^packages/core/src/editor/frame/(?:authoring|runtime|view)/",
  "^packages/core/src/editor/drag/view/",
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
const interactionFeaturePolicyPath = [
  "^packages/core/src/editor/blocks/",
  "^packages/core/src/editor/arrangements/(?:grid|layout)/(?:authoring|runtime)/",
  "^packages/core/src/editor/surfaces/(?:authoring|runtime|view)/",
  "^packages/core/src/editor/frame/(?:authoring|runtime|view)/",
  "^packages/core/src/editor/drag/view/",
  "^packages/core/src/editor/shell/",
  "^packages/core/src/editor/suggestions/",
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
          "^packages/core/src/(?:entrypoints/(?:agent-host|authoring|format|media-policy|ports|runtime)\\.ts|styles/globals\\.css)$",
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
      // Preview delegates only to the learner application, never another runtime module.
      name: "preview-does-not-import-other-runtime-modules",
      severity: "error",
      from: {
        path: "^packages/core/src/editor/shell/authoring/ScaffoldAuthoringApp\\.tsx$",
      },
      to: {
        path: "^packages/core/src/runtime/",
        pathNot: "^packages/core/src/runtime/app/ScaffoldLearnerApp\\.tsx$",
      },
    },
    {
      // Owner: the exact Preview exception in the tracked architecture.
      // The learner app stays lazy; a static or type edge does not qualify.
      name: "preview-learner-app-import-must-be-dynamic",
      severity: "error",
      from: {
        path: "^packages/core/src/editor/shell/authoring/ScaffoldAuthoringApp\\.tsx$",
      },
      to: {
        path: "^packages/core/src/runtime/app/ScaffoldLearnerApp\\.tsx$",
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
        path: "^packages/core/src/runtime/(?:assessment|foundation|guards|learner-activity|players)/",
      },
      to: {
        path: [
          "^packages/core/src/entrypoints/",
          "^packages/core/src/composition/(?:authoring|runtime)/",
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
          "^packages/core/src/editor/insertion/(?:built-in-insert-catalog|built-in-non-block-inserts|insert-catalog)\\.[^/]+$",
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
        path: "^packages/core/src/editor/surfaces/authoring/",
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
        path: "^packages/core/src/editor/surfaces/runtime/",
      },
      to: {
        path: "^packages/core/src/editor/surfaces/authoring/",
        reachable: true,
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
      // Owner: Drag intent, target, and geometry model in the tracked V2 architecture.
      name: "drag-model-does-not-reach-higher-owners",
      severity: "error",
      from: {
        path: "^packages/core/src/editor/drag/model/",
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
      // Lane roots may assemble arbitrary lower leaves; those leaves cannot traverse back upward.
      name: "core-leaves-do-not-reach-lane-composition-roots",
      severity: "error",
      from: {
        path: "^packages/core/src/(?!entrypoints/|composition/(?:authoring|runtime)/|authoring/|document/authoring/|runtime/|editor/shell/)",
      },
      to: {
        path: "^packages/core/src/composition/(?:authoring|runtime)/",
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
      // Owner: Frame/Drag semantic coordination in the tracked V2 architecture.
      name: "frame-authoring-does-not-reach-drag-view-state",
      severity: "error",
      from: {
        path: "^packages/core/src/editor/frame/authoring/",
      },
      to: {
        path: "^packages/core/src/editor/drag/view/",
        reachable: true,
      },
    },
    {
      // Owner: Frame/Drag semantic coordination in the tracked V2 architecture.
      name: "drag-view-does-not-reach-frame-authoring-state",
      severity: "error",
      from: {
        path: "^packages/core/src/editor/drag/view/",
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
          "^packages/core/src/composition/(?:authoring|runtime)/",
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
  ],
  options: {
    doNotFollow: {
      path: "(^|/)node_modules/",
    },
    exclude: {
      path: [
        "(^|/)(?:__tests__|tests?|fixtures?|screenshots?)(?:/|$)",
        "(^|/)(?:coverage|dist|generated|vendor|vendored|\\.tmp|tmp)(?:/|$)",
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
