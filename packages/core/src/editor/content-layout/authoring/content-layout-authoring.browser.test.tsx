import {
  EmbeddedNodeIdSchema,
  PresentationContentLayout,
  type EmbeddedNodeId,
} from "@scaffold/contracts";
import { Editor, type JSONContent } from "@tiptap/core";
import { EditorContent } from "@tiptap/react";
import { fireEvent } from "@testing-library/react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { page, userEvent } from "vite-plus/test/browser/context";

import {
  createCourseDocumentAuthoringEnvironment,
  getCourseDocumentAuthoringEnvironmentState,
} from "@/composition/authoring/create-authoring-composition";
import { createCoreScaffoldAuthoringComposition } from "@/composition/authoring/scaffold-authoring-composition";
import { getScaffoldAuthoringCataloguesForEditor } from "@/composition/extensions/scaffold-authoring-catalogues-storage";
import { getSemanticDocumentControllerForEditor } from "@/document/authoring/semantic-document/semantic-document-storage";
import { deleteNodeChecked } from "@/document/model/commands/checked-transactions";
import { insertCatalogItemChecked } from "@/editor/insertion/checked-insertion";
import { AuthoringContentChrome } from "@/editor/shell/authoring/AuthoringContentChrome";
import { InteractionTargetKind } from "@/editor/interactions/targets/model/interaction-owner-state";
import { getInteractionFacadeStoreForEditor } from "@/editor/interactions/targets/prosemirror/facade/interaction-facade-storage";
import { createScaffoldDocumentContent } from "@/format/artifact";
import { AppThemeProvider } from "@/theme/app/AppThemeProvider";
import { CourseThemeProvider } from "@/theme/course/CourseThemeProvider";
import { createDefaultPersistedCourseTheme } from "@/theme/course/default-course-theme";
import { AppNotificationsProvider } from "@/ui/components/app/AppNotifications/AppNotifications";
import { CONTENT_LAYOUT_PROJECTION_DOM_ATTRS } from "../view/content-layout-projection-dom";
import { readContentLayoutAuthoringState } from "../prosemirror/content-layout-authoring-extension";
import "@/styles/globals.css";

const IDS = Object.freeze({
  blank: id("para00000003"),
  cell: id("cell00000001"),
  cellFirst: id("para00000004"),
  cellSecond: id("para00000005"),
  calloutFirst: id("callout00001"),
  calloutFinal: id("callout00004"),
  calloutLast: id("callout00003"),
  calloutMiddle: id("callout00002"),
  first: id("para00000001"),
  grid: id("grid00000001"),
  layout: id("layout000001"),
  rejectedLayout: id("layout000002"),
  region: id("region000001"),
  second: id("para00000002"),
  rejectedSection: id("section00002"),
  section: id("section00001"),
  rejectedSecondSection: id("section00003"),
  sectionFirst: id("para00000006"),
  sectionSecond: id("para00000007"),
  tabSecondSection: id("section00004"),
  slideTitle: id("slidetitle01"),
  surface: id("surface00001"),
});

const composition = createCoreScaffoldAuthoringComposition();
const mountedEditors: MountedEditor[] = [];

afterEach(async () => {
  vi.restoreAllMocks();
  for (const mounted of mountedEditors) {
    getInteractionFacadeStoreForEditor(mounted.editor).getState().commands.dismissInteraction();
  }
  await nextFrame();
  const mountedForCleanup = mountedEditors.splice(0);
  for (const mounted of mountedForCleanup) {
    mounted.root.unmount();
    mounted.host.remove();
  }
  await nextFrame();
  for (const mounted of mountedForCleanup) mounted.editor.destroy();
});

describe("mounted Content Layout authoring", () => {
  it("keeps Region intent and child one physical selection after Sequence whitespace activation", async () => {
    const mounted = await mountRegionEditor(PresentationContentLayout.Sequence);
    const { editor } = mounted;
    const documentBefore = JSON.stringify(editor.getJSON());
    const undoBefore = editor.can().undo();

    await expectProjectedChild(editor, IDS.first, "available");
    await expectProjectedChild(editor, IDS.second, "withheld");

    await openRegionBubble(editor);
    await expect
      .element(page.getByRole("button", { name: "Previous sequence child" }))
      .toBeDisabled();
    await expect
      .element(page.getByRole("button", { name: "Next sequence child" }))
      .not.toBeDisabled();
    await userEvent.click(page.getByRole("button", { name: "Next sequence child" }));
    await expectProjectedChild(editor, IDS.second, "available");
    await openRegionBubble(editor);
    await expect
      .element(page.getByRole("status", { name: "Current sequence child 2 of 2" }))
      .toBeVisible();
    await expect.element(page.getByRole("button", { name: "Next sequence child" })).toBeDisabled();
    await expect
      .element(page.getByRole("button", { name: "Previous sequence child" }))
      .not.toBeDisabled();

    await userEvent.click(page.getByRole("button", { name: "Previous sequence child" }));
    await expectProjectedChild(editor, IDS.first, "available");
    await openRegionBubble(editor);
    await expect
      .element(page.getByRole("status", { name: "Current sequence child 1 of 2" }))
      .toBeVisible();

    getInteractionFacadeStoreForEditor(editor).getState().commands.dismissInteraction();
    await nextFrame();
    await clickRegionWhitespace(editor);

    await expectProjectedChild(editor, IDS.first, "available");
    await expectProjectedChild(editor, IDS.second, "withheld");
    expect(getSemanticDocumentControllerForEditor(editor).getSnapshot()).toMatchObject({
      selectedId: IDS.region,
      selectionOrigin: "editor",
    });
    expectSelectionWithin(editor, IDS.first);
    expectProjectedDom(editor, IDS.first, "available");
    expectProjectedDom(editor, IDS.second, "withheld");
    expect(JSON.stringify(editor.getJSON())).toBe(documentBefore);
    expect(editor.can().undo()).toBe(undoBefore);
    expect(editor.can().undo()).toBe(false);
    await openRegionBubble(editor);
    await expect
      .element(page.getByRole("status", { name: "Current sequence child 1 of 2" }))
      .toBeVisible();
  });

  it("keeps Flow structural placement on the production pointer path", async () => {
    const mounted = await mountRegionEditor(PresentationContentLayout.Flow);
    const { editor } = mounted;
    const documentBefore = JSON.stringify(editor.getJSON());
    const posAtCoords = vi.spyOn(editor.view, "posAtCoords");

    await clickRegionWhitespace(editor);

    expect(posAtCoords).toHaveBeenCalled();
    expect(getSemanticDocumentControllerForEditor(editor).getSnapshot()).toMatchObject({
      selectedId: IDS.region,
      selectionOrigin: "editor",
    });
    expectSelectionWithin(editor, IDS.region);
    expect(findNodeDom(editor, IDS.first)).not.toHaveAttribute(
      CONTENT_LAYOUT_PROJECTION_DOM_ATTRS.slot,
    );
    expect(findNodeDom(editor, IDS.second)).not.toHaveAttribute(
      CONTENT_LAYOUT_PROJECTION_DOM_ATTRS.slot,
    );
    expect(JSON.stringify(editor.getJSON())).toBe(documentBefore);
    expect(editor.can().undo()).toBe(false);
  });

  it("hands a navigated Sequence child to ordinary editable click selection", async () => {
    const mounted = await mountRegionEditor(PresentationContentLayout.Sequence);
    const { editor } = mounted;

    await expectProjectedChild(editor, IDS.first, "available");
    await openRegionBubble(editor);
    expectSingleSequenceControlSet();
    await userEvent.click(page.getByRole("button", { name: "Next sequence child" }));
    await expectProjectedChild(editor, IDS.second, "available");

    getInteractionFacadeStoreForEditor(editor).getState().commands.dismissInteraction();
    await nextFrame();
    const second = requireNodeDom(editor, IDS.second);
    await userEvent.click(second);

    expect(getSemanticDocumentControllerForEditor(editor).getSnapshot()).toMatchObject({
      selectedId: IDS.second,
      selectionOrigin: "editor",
    });
    expectSelectionWithin(editor, IDS.second);
    expect(
      readContentLayoutAuthoringState(editor.state).containers.get(IDS.region)?.activeChildId,
    ).toBe(IDS.second);
    expectProjectedDom(editor, IDS.second, "available");
    expectProjectedDom(editor, IDS.first, "withheld");
  });

  it("changes the active child from ordinary direct-child selection and retains it on reactivation", async () => {
    const mounted = await mountRegionEditor(PresentationContentLayout.Sequence);
    const { editor } = mounted;

    await expectProjectedChild(editor, IDS.first, "available");
    await expectProjectedChild(editor, IDS.second, "withheld");

    const secondPosition = findNodePosition(editor, IDS.second);
    expect(
      editor.commands.setTextSelection({ from: secondPosition + 1, to: secondPosition + 1 }),
    ).toBe(true);
    await waitForCondition(
      () =>
        readContentLayoutAuthoringState(editor.state).containers.get(IDS.region)?.activeChildId ===
        IDS.second,
      "ordinary direct-child selection activation",
    );

    expect(getSemanticDocumentControllerForEditor(editor).getSnapshot()).toMatchObject({
      selectedId: IDS.second,
      selectionOrigin: "editor",
    });
    expectSelectionWithin(editor, IDS.second);
    await expectProjectedChild(editor, IDS.second, "available");
    await expectProjectedChild(editor, IDS.first, "withheld");

    await openRegionBubble(editor);
    await expect
      .element(page.getByRole("status", { name: "Current sequence child 2 of 2" }))
      .toBeVisible();
    expect(
      readContentLayoutAuthoringState(editor.state).containers.get(IDS.region)?.activeChildId,
    ).toBe(IDS.second);
    await expectProjectedChild(editor, IDS.second, "available");
    await expectProjectedChild(editor, IDS.first, "withheld");
  });

  it("mounts Cell and built-in Tabs Section controls through the production shell", async () => {
    const mounted = await mountAuthoringEditor(
      createDocument(PresentationContentLayout.Flow, createNestedContainerContent()),
      IDS.cellFirst,
    );
    const { editor } = mounted;

    await openStructuralBubble(editor, IDS.cell, InteractionTargetKind.Cell);
    await expect.element(page.getByRole("radio", { name: "Flow" })).toBeVisible();
    await userEvent.click(page.getByRole("radio", { name: "Sequence" }));
    await expect
      .element(page.getByRole("status", { name: "Current sequence child 1 of 2" }))
      .toBeVisible();
    await expectProjectedChild(editor, IDS.cellFirst, "available");
    await expectProjectedChild(editor, IDS.cellSecond, "withheld");
    await expect
      .element(page.getByRole("button", { name: "Previous sequence child" }))
      .toBeDisabled();
    await expect
      .element(page.getByRole("button", { name: "Next sequence child" }))
      .not.toBeDisabled();

    await userEvent.click(page.getByRole("button", { name: "Next sequence child" }));
    await expectProjectedChild(editor, IDS.cellSecond, "available");
    await openStructuralBubble(editor, IDS.cell, InteractionTargetKind.Cell);
    await expect
      .element(page.getByRole("status", { name: "Current sequence child 2 of 2" }))
      .toBeVisible();
    await expect.element(page.getByRole("button", { name: "Next sequence child" })).toBeDisabled();

    await openStructuralBubble(editor, IDS.section, InteractionTargetKind.Section);
    await userEvent.click(page.getByRole("radio", { name: "Sequence" }));
    await expect
      .element(page.getByRole("status", { name: "Current sequence child 1 of 2" }))
      .toBeVisible();
    await expectProjectedChild(editor, IDS.sectionFirst, "available");
    await expectProjectedChild(editor, IDS.sectionSecond, "withheld");
    expect(
      readContentLayoutAuthoringState(editor.state).containers.get(IDS.cell)?.activeChildId,
    ).toBe(IDS.cellSecond);
    expect(
      readContentLayoutAuthoringState(editor.state).containers.get(IDS.section)?.activeChildId,
    ).toBe(IDS.sectionFirst);
    expect(
      readContentLayoutAuthoringState(editor.state).containers.get(IDS.region)?.resolution,
    ).toBe("flow");
  });

  it("retains outer and nested Sequence children across structural reactivation", async () => {
    const mounted = await mountAuthoringEditor(
      createDocument(PresentationContentLayout.Sequence, createNestedContainerContent()),
      IDS.first,
    );
    const { editor } = mounted;
    await waitForRegionFrame(editor);

    await expectProjectedChild(editor, IDS.first, "available");
    await openRegionBubble(editor);
    await userEvent.click(page.getByRole("button", { name: "Next sequence child" }));
    await expectProjectedChild(editor, IDS.grid, "available");
    expect(
      readContentLayoutAuthoringState(editor.state).containers.get(IDS.region)?.activeChildId,
    ).toBe(IDS.grid);

    await openStructuralBubble(editor, IDS.cell, InteractionTargetKind.Cell);
    await userEvent.click(page.getByRole("radio", { name: "Sequence" }));
    await expectProjectedChild(editor, IDS.cellFirst, "available");
    await userEvent.click(page.getByRole("button", { name: "Next sequence child" }));
    await expectProjectedChild(editor, IDS.cellSecond, "available");

    await openStructuralBubble(editor, IDS.cell, InteractionTargetKind.Cell);
    await expect
      .element(page.getByRole("status", { name: "Current sequence child 2 of 2" }))
      .toBeVisible();
    expect(
      readContentLayoutAuthoringState(editor.state).containers.get(IDS.cell)?.activeChildId,
    ).toBe(IDS.cellSecond);

    await openRegionBubble(editor);
    await expect
      .element(page.getByRole("status", { name: "Current sequence child 2 of 3" }))
      .toBeVisible();
    expect(
      readContentLayoutAuthoringState(editor.state).containers.get(IDS.region)?.activeChildId,
    ).toBe(IDS.grid);

    await userEvent.click(page.getByRole("button", { name: "Next sequence child" }));
    await expectProjectedChild(editor, IDS.layout, "available");
    await openRegionBubble(editor);
    await expect
      .element(page.getByRole("status", { name: "Current sequence child 3 of 3" }))
      .toBeVisible();
    await expect.element(page.getByRole("button", { name: "Next sequence child" })).toBeDisabled();

    await openStructuralBubble(editor, IDS.section, InteractionTargetKind.Section);
    await userEvent.click(page.getByRole("radio", { name: "Sequence" }));
    await expectProjectedChild(editor, IDS.sectionFirst, "available");
    await userEvent.click(page.getByRole("button", { name: "Next sequence child" }));
    await expectProjectedChild(editor, IDS.sectionSecond, "available");

    await openStructuralBubble(editor, IDS.section, InteractionTargetKind.Section);
    await expect
      .element(page.getByRole("status", { name: "Current sequence child 2 of 2" }))
      .toBeVisible();
    expect(
      readContentLayoutAuthoringState(editor.state).containers.get(IDS.section)?.activeChildId,
    ).toBe(IDS.sectionSecond);
    expect(
      readContentLayoutAuthoringState(editor.state).containers.get(IDS.region)?.activeChildId,
    ).toBe(IDS.layout);
    expect(
      readContentLayoutAuthoringState(editor.state).containers.get(IDS.cell)?.activeChildId,
    ).toBe(IDS.cellSecond);
  });

  it("exposes a visually blank Sequence through its real empty paragraph", async () => {
    const mounted = await mountRegionEditor(
      PresentationContentLayout.Flow,
      [paragraph(IDS.blank)],
      IDS.blank,
    );
    const { editor } = mounted;

    await openStructuralBubble(editor, IDS.region, InteractionTargetKind.Region);
    await userEvent.click(page.getByRole("radio", { name: "Sequence" }));

    await expect
      .element(page.getByRole("status", { name: "Current sequence child 1 of 1" }))
      .toBeVisible();
    await expectProjectedChild(editor, IDS.blank, "available");
    await expect
      .element(page.getByRole("button", { name: "Previous sequence child" }))
      .toBeDisabled();
    await expect.element(page.getByRole("button", { name: "Next sequence child" })).toBeDisabled();
    expect(editor.state.doc.nodeAt(findNodePosition(editor, IDS.blank))?.textContent).toBe("");
    expectSelectionWithin(editor, IDS.blank);
  });

  it("activates a direct child inserted through the production catalogue owner", async () => {
    const mounted = await mountRegionEditor(PresentationContentLayout.Sequence);
    const { editor } = mounted;
    const beforeState = readContentLayoutAuthoringState(editor.state).containers.get(IDS.region);
    if (!beforeState) throw new Error("Expected mounted Region authoring state.");

    const firstPosition = findNodePosition(editor, IDS.first);
    expect(
      editor.commands.setTextSelection({ from: firstPosition + 1, to: firstPosition + 1 }),
    ).toBe(true);
    expectSelectionWithin(editor, IDS.first);

    const item = getScaffoldAuthoringCataloguesForEditor(editor).inDocument.getById("callout");
    if (!item) throw new Error("Expected the Callout insertion action in the mounted catalogue.");

    expect(
      insertCatalogItemChecked(
        editor,
        item,
        composition.capabilities.blocks.registry,
        composition.capabilities.layouts.registry,
        composition.capabilities.surfaces.registry,
      ),
    ).toBe(true);

    const existingChildIds = new Set(beforeState.directChildIds);
    const regionPosition = findNodePosition(editor, IDS.region);
    const region = editor.state.doc.nodeAt(regionPosition);
    if (!region) throw new Error("Expected the mounted Region node after insertion.");

    let insertedId: EmbeddedNodeId | null = null;
    region.forEach((child) => {
      const candidateId = EmbeddedNodeIdSchema.safeParse(child.attrs["id"]);
      if (
        child.type.name === item.nodeType &&
        candidateId.success &&
        !existingChildIds.has(candidateId.data)
      ) {
        insertedId = candidateId.data;
      }
    });
    if (!insertedId)
      throw new Error("Expected the production insertion to create a new stable child ID.");

    await waitForNodeDom(editor, insertedId);
    await waitForCondition(
      () =>
        readContentLayoutAuthoringState(editor.state).containers.get(IDS.region)?.activeChildId ===
        insertedId,
      "inserted child authoring activation",
    );
    const afterState = readContentLayoutAuthoringState(editor.state).containers.get(IDS.region);
    if (!afterState) throw new Error("Expected mounted Region state after insertion.");
    expect(afterState.directChildIds).toContain(insertedId);
    expect(afterState.activeChildId).toBe(insertedId);
    expect(afterState.resolution).toBe("selected");
    await expectProjectedChild(editor, insertedId, "available");
    for (const childId of afterState.directChildIds) {
      if (childId === insertedId) continue;
      await expectProjectedChild(editor, childId, "withheld");
    }
    expectSelectionWithin(editor, insertedId);
  });

  it("normalizes active first, middle, and last deletion through the existing owner", async () => {
    const mounted = await mountRegionEditor(
      PresentationContentLayout.Sequence,
      [
        paragraph(IDS.calloutFirst, "First child"),
        paragraph(IDS.calloutMiddle, "Middle child"),
        paragraph(IDS.calloutLast, "Last child"),
        paragraph(IDS.calloutFinal, "Final child"),
      ],
      IDS.calloutFirst,
    );
    const { editor } = mounted;

    await expectProjectedChild(editor, IDS.calloutFirst, "available");
    await expectProjectedChild(editor, IDS.calloutMiddle, "withheld");
    await expectProjectedChild(editor, IDS.calloutLast, "withheld");
    await expectProjectedChild(editor, IDS.calloutFinal, "withheld");

    const middlePosition = findNodePosition(editor, IDS.calloutMiddle);
    expect(
      editor.commands.setTextSelection({ from: middlePosition + 1, to: middlePosition + 1 }),
    ).toBe(true);
    await waitForCondition(
      () =>
        readContentLayoutAuthoringState(editor.state).containers.get(IDS.region)?.activeChildId ===
        IDS.calloutMiddle,
      "ordinary middle child activation",
    );
    expectSelectionWithin(editor, IDS.calloutMiddle);
    await expectProjectedChild(editor, IDS.calloutMiddle, "available");
    await expectProjectedChild(editor, IDS.calloutFirst, "withheld");
    await expectProjectedChild(editor, IDS.calloutLast, "withheld");
    await expectProjectedChild(editor, IDS.calloutFinal, "withheld");

    deleteChildThroughExistingOwner(editor, IDS.calloutMiddle);
    await waitForCondition(
      () =>
        readContentLayoutAuthoringState(editor.state).containers.get(IDS.region)?.activeChildId ===
        IDS.calloutLast,
      "next active child after middle deletion",
    );
    expectSelectionWithin(editor, IDS.calloutLast);
    await expectProjectedChild(editor, IDS.calloutLast, "available");
    await expectProjectedChild(editor, IDS.calloutFirst, "withheld");
    await expectProjectedChild(editor, IDS.calloutFinal, "withheld");

    const firstPosition = findNodePosition(editor, IDS.calloutFirst);
    expect(
      editor.commands.setTextSelection({ from: firstPosition + 1, to: firstPosition + 1 }),
    ).toBe(true);
    await waitForCondition(
      () =>
        readContentLayoutAuthoringState(editor.state).containers.get(IDS.region)?.activeChildId ===
        IDS.calloutFirst,
      "ordinary first child activation",
    );
    expectSelectionWithin(editor, IDS.calloutFirst);
    await expectProjectedChild(editor, IDS.calloutFirst, "available");
    await expectProjectedChild(editor, IDS.calloutLast, "withheld");
    await expectProjectedChild(editor, IDS.calloutFinal, "withheld");

    deleteChildThroughExistingOwner(editor, IDS.calloutFirst);
    await waitForCondition(() => {
      const state = readContentLayoutAuthoringState(editor.state).containers.get(IDS.region);
      return state?.directChildIds.length === 2 && state.activeChildId === IDS.calloutLast;
    }, "next active child after first deletion");

    expectSelectionWithin(editor, IDS.calloutLast);
    await expectProjectedChild(editor, IDS.calloutLast, "available");
    await expectProjectedChild(editor, IDS.calloutFinal, "withheld");

    const finalPosition = findNodePosition(editor, IDS.calloutFinal);
    expect(
      editor.commands.setTextSelection({ from: finalPosition + 1, to: finalPosition + 1 }),
    ).toBe(true);
    await waitForCondition(
      () =>
        readContentLayoutAuthoringState(editor.state).containers.get(IDS.region)?.activeChildId ===
        IDS.calloutFinal,
      "ordinary last child activation",
    );
    expectSelectionWithin(editor, IDS.calloutFinal);
    await expectProjectedChild(editor, IDS.calloutFinal, "available");
    await expectProjectedChild(editor, IDS.calloutLast, "withheld");

    deleteChildThroughExistingOwner(editor, IDS.calloutFinal);
    await waitForCondition(() => {
      const state = readContentLayoutAuthoringState(editor.state).containers.get(IDS.region);
      return state?.directChildIds.length === 1 && state.activeChildId === IDS.calloutLast;
    }, "previous active child after last deletion");

    expectSelectionWithin(editor, IDS.calloutLast);
    await expectProjectedChild(editor, IDS.calloutLast, "available");

    deleteChildThroughExistingOwner(editor, IDS.calloutLast);
    await waitForCondition(() => {
      const state = readContentLayoutAuthoringState(editor.state).containers.get(IDS.region);
      return state?.directChildIds.length === 1 && state.activeChildId === state.directChildIds[0];
    }, "real empty paragraph after final deletion");

    const finalState = readContentLayoutAuthoringState(editor.state).containers.get(IDS.region);
    if (!finalState) throw new Error("Expected mounted Region state after final deletion.");
    const finalChildId = finalState.directChildIds[0];
    if (!finalChildId) throw new Error("Expected a final editor-owned empty paragraph.");
    const finalChild = editor.state.doc.nodeAt(findNodePosition(editor, finalChildId));
    expect(finalChild?.type.name).toBe("paragraph");
    expect(finalChild?.textContent).toBe("");
    expect(finalState.activeChildId).toBe(finalChildId);
    expectSelectionWithin(editor, finalChildId);
    await expectProjectedChild(editor, finalChildId, "available");
  });

  it("persists only contentLayout and keeps selection-only navigation out of history", async () => {
    const mounted = await mountRegionEditor(PresentationContentLayout.Flow);
    const { editor } = mounted;
    const flowJson = editor.getJSON();

    await openStructuralBubble(editor, IDS.region, InteractionTargetKind.Region);
    await userEvent.click(page.getByRole("radio", { name: "Sequence" }));
    await expect
      .element(page.getByRole("status", { name: "Current sequence child 1 of 2" }))
      .toBeVisible();
    const sequenceJson = editor.getJSON();
    expect(contentLayoutInJson(sequenceJson, IDS.region)).toBe(PresentationContentLayout.Sequence);
    expect(withoutContentLayout(sequenceJson)).toEqual(withoutContentLayout(flowJson));
    expect(editor.can().undo()).toBe(true);

    await userEvent.click(page.getByRole("button", { name: "Next sequence child" }));
    await expectProjectedChild(editor, IDS.second, "available");
    expect(editor.getJSON()).toEqual(sequenceJson);
    expect(editor.can().undo()).toBe(true);

    expect(editor.commands.undo()).toBe(true);
    await waitForCondition(
      () => contentLayoutInJson(editor.getJSON(), IDS.region) === PresentationContentLayout.Flow,
      "Flow content layout after undo",
    );
    expect(editor.getJSON()).toEqual(flowJson);
    expect(
      readContentLayoutAuthoringState(editor.state).containers.get(IDS.region)?.resolution,
    ).toBe("flow");
    expect(findNodeDom(editor, IDS.first)).not.toHaveAttribute(
      CONTENT_LAYOUT_PROJECTION_DOM_ATTRS.availability,
    );
    expect(findNodeDom(editor, IDS.second)).not.toHaveAttribute(
      CONTENT_LAYOUT_PROJECTION_DOM_ATTRS.availability,
    );

    expect(editor.commands.redo()).toBe(true);
    await waitForCondition(
      () =>
        contentLayoutInJson(editor.getJSON(), IDS.region) === PresentationContentLayout.Sequence,
      "Sequence content layout after redo",
    );
    await expectProjectedChild(editor, IDS.first, "available");
    await expectProjectedChild(editor, IDS.second, "withheld");
    expect(
      readContentLayoutAuthoringState(editor.state).containers.get(IDS.region)?.activeChildId,
    ).toBe(IDS.first);
    getInteractionFacadeStoreForEditor(editor).getState().commands.dismissInteraction();
    await nextFrame();
  });

  it("rejects incompatible Sequence-to-Flow conversion without changing document or projection", async () => {
    const mounted = await mountRegionEditor(
      PresentationContentLayout.Sequence,
      rejectedFlowChildren(),
      IDS.rejectedLayout,
    );
    const { editor } = mounted;
    const documentBefore = JSON.stringify(editor.getJSON());
    const stateBefore = readContentLayoutAuthoringState(editor.state).containers.get(IDS.region);
    if (!stateBefore) throw new Error("Expected mounted Region state before rejected conversion.");

    await expectProjectedChild(editor, IDS.rejectedLayout, "available");
    await expectProjectedChild(editor, IDS.layout, "withheld");
    await openRegionBubble(editor);
    await userEvent.click(page.getByRole("radio", { name: "Flow" }));

    await expect
      .element(
        page.getByText("Flow is unavailable while this container has multiple fill children."),
      )
      .toBeVisible();
    expect(JSON.stringify(editor.getJSON())).toBe(documentBefore);
    expect(
      readContentLayoutAuthoringState(editor.state).containers.get(IDS.region)?.resolution,
    ).toBe(stateBefore.resolution);
    expect(
      readContentLayoutAuthoringState(editor.state).containers.get(IDS.region)?.activeChildId,
    ).toBe(IDS.rejectedLayout);
    await expectProjectedChild(editor, IDS.rejectedLayout, "available");
    await expectProjectedChild(editor, IDS.layout, "withheld");
    getInteractionFacadeStoreForEditor(editor).getState().commands.dismissInteraction();
    await nextFrame();
  });

  it("keeps ordinary editing and active Callout authoring controls available", async () => {
    const mounted = await mountRegionEditor(
      PresentationContentLayout.Sequence,
      [paragraph(IDS.first, "Editable child"), callout(IDS.calloutFirst)],
      IDS.first,
    );
    const { editor } = mounted;

    const firstPosition = findNodePosition(editor, IDS.first);
    expect(
      editor.commands.setTextSelection({ from: firstPosition + 1, to: firstPosition + 1 }),
    ).toBe(true);
    expect(editor.commands.insertContent(" edited")).toBe(true);
    expect(editor.state.doc.nodeAt(findNodePosition(editor, IDS.first))?.textContent).toContain(
      " edited",
    );

    await openRegionBubble(editor);
    await userEvent.click(page.getByRole("button", { name: "Next sequence child" }));
    await expectProjectedChild(editor, IDS.calloutFirst, "available");
    expect(
      readContentLayoutAuthoringState(editor.state).containers.get(IDS.region)?.activeChildId,
    ).toBe(IDS.calloutFirst);

    await openBlockBubble(editor, IDS.calloutFirst);
    expectNoSequenceControls();
    await expect.element(page.getByRole("button", { name: "Delete block" })).toBeVisible();
    await expect
      .element(page.getByRole("radiogroup", { name: "Horizontal alignment" }))
      .toBeVisible();
    await userEvent.click(page.getByRole("radio", { name: "Horizontal alignment: Right" }));
    expect(
      editor.state.doc.nodeAt(findNodePosition(editor, IDS.calloutFirst))?.attrs["frame"],
    ).toMatchObject({
      align: "end",
    });
    const resizeElement = requireNodeDom(editor, IDS.calloutFirst).querySelector<HTMLElement>(
      "[data-authoring-frame-wrapper]",
    );
    if (!resizeElement) throw new Error("Expected Callout resize frame wrapper.");
    mockResizableGeometry(resizeElement);
    const resizeHandle = resizeElement.querySelector<HTMLElement>(
      '[data-authoring-resize-handle="bottom-right"]',
    );
    if (!resizeHandle) throw new Error("Expected Callout bottom-right resize handle.");
    await expect.element(page.elementLocator(resizeHandle)).toBeVisible();

    const frameBeforeResize = editor.state.doc.nodeAt(findNodePosition(editor, IDS.calloutFirst))
      ?.attrs["frame"];
    fireEvent.mouseDown(resizeHandle, { clientX: 0, clientY: 0 });
    fireEvent.mouseMove(document, { clientX: 100, clientY: 50 });
    fireEvent.mouseUp(document);
    await waitForCondition(() => {
      const frame = editor.state.doc.nodeAt(findNodePosition(editor, IDS.calloutFirst))?.attrs[
        "frame"
      ];
      return JSON.stringify(frame) !== JSON.stringify(frameBeforeResize);
    }, "Callout resize frame update");
    const frameAfterResize = editor.state.doc.nodeAt(findNodePosition(editor, IDS.calloutFirst))
      ?.attrs["frame"];
    expect(frameAfterResize).not.toEqual(frameBeforeResize);
    expect(frameAfterResize).toMatchObject({ widthMode: "percent" });

    await userEvent.click(page.getByRole("button", { name: "Open block settings" }));
    await expect.element(page.getByRole("dialog", { name: "Callout settings" })).toBeVisible();
    expectNoSequenceControls();
    await expect.element(page.getByRole("combobox", { name: "Variant" })).toBeVisible();
    await userEvent.click(page.getByRole("combobox", { name: "Variant" }));
    await userEvent.click(page.getByRole("option", { name: "Warning" }));
    await userEvent.click(page.getByRole("button", { name: "Save" }));
    await waitForCondition(
      () =>
        editor.state.doc.nodeAt(findNodePosition(editor, IDS.calloutFirst))?.attrs["data"]
          ?.variant === "warning",
      "Callout settings update",
    );
    expect(document.querySelectorAll('[aria-label="Next sequence child"]')).toHaveLength(0);
    getInteractionFacadeStoreForEditor(editor).getState().commands.dismissInteraction();
    await nextFrame();
  });

  it("keeps representative Tabs and Accordion section controls on mounted children", async () => {
    const mounted = await mountRegionEditor(
      PresentationContentLayout.Sequence,
      tabsAndAccordionContent(),
      IDS.layout,
    );
    const { editor } = mounted;

    expect(requireLayoutFrame(editor, IDS.layout)).toHaveAttribute("data-layout-kind", "tabs");
    expect(requireLayoutFrame(editor, IDS.rejectedLayout)).toHaveAttribute(
      "data-layout-kind",
      "accordion",
    );
    await expectProjectedChild(editor, IDS.layout, "available");
    await expectProjectedChild(editor, IDS.rejectedLayout, "withheld");

    await openStructuralBubble(editor, IDS.section, InteractionTargetKind.Section);
    await userEvent.click(page.getByRole("radio", { name: "Sequence" }));
    await expect
      .element(page.getByRole("status", { name: "Current sequence child 1 of 2" }))
      .toBeVisible();
    await expectProjectedChild(editor, IDS.sectionFirst, "available");
    await expectProjectedChild(editor, IDS.sectionSecond, "withheld");
    expectSingleSequenceControlSet();

    const firstTab = page.getByRole("tab", { name: "Tab one" });
    const secondTab = page.getByRole("tab", { name: "Tab two" });
    await expect.element(firstTab).toHaveAttribute("aria-selected", "true");
    await userEvent.click(secondTab);
    await expect.element(secondTab).toHaveAttribute("aria-selected", "true");
    await expect.element(firstTab).toHaveAttribute("aria-selected", "false");
    expect(getSemanticDocumentControllerForEditor(editor).getSnapshot()).toMatchObject({
      selectedId: IDS.tabSecondSection,
      selectionOrigin: "component",
    });
    expect(
      readContentLayoutAuthoringState(editor.state).containers.get(IDS.region)?.activeChildId,
    ).toBe(IDS.layout);
    await expectProjectedChild(editor, IDS.layout, "available");

    await openStructuralMenu(editor, IDS.layout, InteractionTargetKind.Layout);
    expectNoSequenceControls();
    await expect.element(page.getByRole("button", { name: "Duplicate layout" })).toBeVisible();
    await expect.element(page.getByRole("button", { name: "Delete layout" })).toBeVisible();

    await openRegionBubble(editor);
    await userEvent.click(page.getByRole("button", { name: "Next sequence child" }));
    await expectProjectedChild(editor, IDS.rejectedLayout, "available");
    await openStructuralBubble(editor, IDS.rejectedSection, InteractionTargetKind.Section);
    await userEvent.click(page.getByRole("radio", { name: "Sequence" }));
    await expect
      .element(page.getByRole("status", { name: "Current sequence child 1 of 1" }))
      .toBeVisible();
    await expectProjectedChild(editor, IDS.calloutMiddle, "available");
    getInteractionFacadeStoreForEditor(editor).getState().commands.dismissInteraction();
    await nextFrame();
    const firstAccordion = page.getByRole("button", { name: "Accordion one" });
    const secondAccordion = page.getByRole("button", { name: "Accordion two" });
    const secondAccordionButton = document.querySelector<HTMLButtonElement>(
      '[data-scaffold-accordion-trigger][aria-label="Accordion two"]',
    );
    if (!secondAccordionButton) throw new Error("Expected the Accordion two production trigger.");
    await expect.element(firstAccordion).toHaveAttribute("aria-expanded", "true");
    await expect.element(secondAccordion).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(secondAccordionButton);
    await expect.element(firstAccordion).toHaveAttribute("aria-expanded", "false");
    await expect.element(secondAccordion).toHaveAttribute("aria-expanded", "true");
    expect(
      readContentLayoutAuthoringState(editor.state).containers.get(IDS.region)?.activeChildId,
    ).toBe(IDS.rejectedLayout);
    await expectProjectedChild(editor, IDS.rejectedLayout, "available");
    getInteractionFacadeStoreForEditor(editor).getState().commands.dismissInteraction();
    await nextFrame();
  });
});

interface MountedEditor {
  readonly editor: Editor;
  readonly host: HTMLElement;
  readonly root: Root;
}

async function mountRegionEditor(
  contentLayout: PresentationContentLayout,
  children: readonly JSONContent[] = [
    paragraph(IDS.first, "First child"),
    paragraph(IDS.second, "Second child"),
  ],
  readyChildId: EmbeddedNodeId = IDS.first,
): Promise<MountedEditor> {
  const mounted = await mountAuthoringEditor(createDocument(contentLayout, children), readyChildId);
  await waitForRegionFrame(mounted.editor);
  establishRegionTestGeometry(
    mounted.editor,
    children.map((child) => id(String(child.attrs?.id))),
  );
  return mounted;
}

async function mountAuthoringEditor(
  content: JSONContent,
  readyChildId: EmbeddedNodeId,
): Promise<MountedEditor> {
  const environment = createCourseDocumentAuthoringEnvironment({ composition, editable: true });
  const editor = new Editor({
    editable: true,
    extensions: getCourseDocumentAuthoringEnvironmentState(environment).extensions,
    content,
  });
  const host = document.createElement("div");
  host.style.cssText =
    "height: 640px; inset: 0 auto auto 0; overflow: visible; position: absolute; width: 960px;";
  document.body.append(host);
  const root = createRoot(host);
  root.render(
    <AppThemeProvider appearance="light">
      <main>
        <AppNotificationsProvider appearance="light">
          <CourseThemeProvider appearance="light" theme={createDefaultPersistedCourseTheme()}>
            <AuthoringContentChrome
              blockDefinitions={composition.capabilities.blocks.registry}
              editable
              editor={editor}
              overlayContainer={host}
              surfaceAuthoringChrome={composition.surfaces.chrome}
              surfaceVariants={composition.capabilities.surfaces.registry}
            >
              <EditorContent className="sc-course-document-editor__content" editor={editor} />
            </AuthoringContentChrome>
          </CourseThemeProvider>
        </AppNotificationsProvider>
      </main>
    </AppThemeProvider>,
  );

  const mounted = { editor, host, root };
  mountedEditors.push(mounted);
  await waitForNodeDom(editor, readyChildId);
  return mounted;
}

async function openRegionBubble(editor: Editor): Promise<void> {
  await openStructuralBubble(editor, IDS.region, InteractionTargetKind.Region);
  await expect.element(page.getByRole("status", { name: /Current sequence child/ })).toBeVisible();
}

function expectSingleSequenceControlSet(): void {
  expect(document.querySelectorAll('[aria-label="Previous sequence child"]')).toHaveLength(1);
  expect(document.querySelectorAll('[aria-label="Next sequence child"]')).toHaveLength(1);
  expect(
    document.querySelectorAll('[role="status"][aria-label^="Current sequence child"]'),
  ).toHaveLength(1);
}

function expectNoSequenceControls(): void {
  expect(document.querySelectorAll('[aria-label="Previous sequence child"]')).toHaveLength(0);
  expect(document.querySelectorAll('[aria-label="Next sequence child"]')).toHaveLength(0);
  expect(
    document.querySelectorAll('[role="status"][aria-label^="Current sequence child"]'),
  ).toHaveLength(0);
}

async function openStructuralBubble(
  editor: Editor,
  targetId: EmbeddedNodeId,
  kind: InteractionTargetKind,
): Promise<void> {
  await openStructuralMenu(editor, targetId, kind);
  await expect.element(page.getByRole("radio", { name: "Flow" })).toBeVisible();
}

async function openStructuralMenu(
  editor: Editor,
  targetId: EmbeddedNodeId,
  kind: InteractionTargetKind,
): Promise<void> {
  const target = { id: targetId, kind, pos: findNodePosition(editor, targetId) } as const;
  const commands = getInteractionFacadeStoreForEditor(editor).getState().commands;
  expect(commands.activateStructuralTarget(target)).toBe(true);
  expect(commands.openMenu(target)).toBe(true);
  await nextFrame();
}

async function openBlockBubble(editor: Editor, targetId: EmbeddedNodeId): Promise<void> {
  const pos = findNodePosition(editor, targetId);
  const commands = getInteractionFacadeStoreForEditor(editor).getState().commands;
  expect(editor.commands.setNodeSelection(pos)).toBe(true);
  expect(
    commands.selectObjectTarget({ id: targetId, kind: InteractionTargetKind.Block, pos }),
  ).toBe(true);
  editor.view.focus();
  await expect.element(page.getByRole("toolbar", { name: "Block actions" })).toBeVisible();
}

async function clickRegionWhitespace(editor: Editor): Promise<void> {
  const region = requireRegionFrame(editor);
  await userEvent.click(region, { position: { x: 8, y: 8 } });
}

function establishRegionTestGeometry(
  editor: Editor,
  childIds: readonly EmbeddedNodeId[] = [IDS.first, IDS.second],
): void {
  const region = requireRegionFrame(editor);
  region.style.boxSizing = "border-box";
  region.style.height = "360px";
  region.style.padding = "32px";
  region.style.width = "720px";
  const contentRoot = region.querySelector<HTMLElement>("[data-content-layout-root]");
  if (!contentRoot) throw new Error("Expected mounted Region content root.");
  contentRoot.style.display = "grid";
  contentRoot.style.height = "296px";
  contentRoot.style.width = "656px";
  for (const childId of childIds) {
    const child = findNodeDom(editor, childId);
    if (!child) continue;
    child.style.alignSelf = "start";
    child.style.minHeight = "64px";
    child.style.width = "320px";
  }
}

async function expectProjectedChild(
  editor: Editor,
  childId: EmbeddedNodeId,
  availability: "available" | "withheld",
): Promise<void> {
  const child = requireNodeDom(editor, childId);
  await expect
    .element(page.elementLocator(child))
    .toHaveAttribute(CONTENT_LAYOUT_PROJECTION_DOM_ATTRS.availability, availability);
}

function expectProjectedDom(
  editor: Editor,
  childId: EmbeddedNodeId,
  availability: "available" | "withheld",
): void {
  const child = requireNodeDom(editor, childId);
  expect(child).toHaveAttribute(CONTENT_LAYOUT_PROJECTION_DOM_ATTRS.slot, "shared");
  expect(child).toHaveAttribute(CONTENT_LAYOUT_PROJECTION_DOM_ATTRS.availability, availability);
  expect(child).toHaveAttribute(
    CONTENT_LAYOUT_PROJECTION_DOM_ATTRS.interaction,
    availability === "available" ? "enabled" : "inert",
  );
  expect(child).toHaveAttribute(
    CONTENT_LAYOUT_PROJECTION_DOM_ATTRS.accessibility,
    availability === "available" ? "exposed" : "hidden",
  );
  if (availability === "available") {
    expect(child).not.toHaveAttribute("inert");
    expect(child).not.toHaveAttribute("aria-hidden");
  } else {
    expect(child).toHaveAttribute("inert", "");
    expect(child).toHaveAttribute("aria-hidden", "true");
  }
}

function expectSelectionWithin(editor: Editor, id: EmbeddedNodeId): void {
  const from = findNodePosition(editor, id);
  const node = editor.state.doc.nodeAt(from);
  if (!node) throw new Error(`Expected document node ${id}.`);
  expect(editor.state.selection.from).toBeGreaterThan(from);
  expect(editor.state.selection.to).toBeLessThan(from + node.nodeSize);
}

function deleteChildThroughExistingOwner(editor: Editor, id: EmbeddedNodeId): void {
  editor.commands.focus();
  const result = deleteNodeChecked({ tr: editor.state.tr, pos: findNodePosition(editor, id) });
  if (!result.ok) {
    throw new Error(`Expected checked deletion to succeed for ${id}: ${result.issue.code}`);
  }
  editor.view.dispatch(result.tr.scrollIntoView());
}

function findNodeDom(editor: Editor, id: EmbeddedNodeId): HTMLElement | null {
  const dom = editor.view.nodeDOM(findNodePosition(editor, id));
  return dom instanceof HTMLElement ? dom : null;
}

function requireNodeDom(editor: Editor, id: EmbeddedNodeId): HTMLElement {
  const dom = findNodeDom(editor, id);
  if (!dom) throw new Error(`Expected mounted DOM node ${id}.`);
  return dom;
}

function requireRegionFrame(editor: Editor): HTMLElement {
  const regionNodeView = requireNodeDom(editor, IDS.region);
  const regionFrame = regionNodeView.querySelector<HTMLElement>(
    `[data-authoring-frame="region"][data-id="${IDS.region}"]`,
  );
  if (!regionFrame) throw new Error("Expected mounted Region authoring frame.");
  return regionFrame;
}

function requireLayoutFrame(editor: Editor, id: EmbeddedNodeId): HTMLElement {
  const nodeView = requireNodeDom(editor, id);
  const frame = nodeView.querySelector<HTMLElement>(
    `[data-authoring-frame="layout"][data-id="${id}"]`,
  );
  if (!frame) throw new Error(`Expected mounted Layout authoring frame for ${id}.`);
  return frame;
}

function mockResizableGeometry(element: HTMLElement): void {
  defineElementGeometry(element);

  const resizeTarget = element.firstElementChild;
  if (resizeTarget instanceof HTMLElement) {
    defineElementGeometry(resizeTarget);

    const blockElement = resizeTarget.querySelector('[data-authoring-frame="block"]');
    if (blockElement instanceof HTMLElement) defineElementGeometry(blockElement);
  }

  const container = element.closest("[data-resize-container]");
  if (container?.parentElement) {
    container.parentElement.getBoundingClientRect = () =>
      DOMRect.fromRect({ height: 200, width: 400, x: 0, y: 0 });
  }
}

function defineElementGeometry(
  element: HTMLElement,
  fallback: { height: number; width: number } = { height: 100, width: 200 },
): void {
  Object.defineProperty(element, "offsetWidth", {
    configurable: true,
    get: () => pixelWidth(element, fallback.width),
  });
  Object.defineProperty(element, "offsetHeight", {
    configurable: true,
    get: () => pixelSize(element.style.height, fallback.height),
  });
  element.getBoundingClientRect = () =>
    DOMRect.fromRect({
      height: element.offsetHeight,
      width: element.offsetWidth,
      x: 0,
      y: 0,
    });
}

function pixelSize(value: string, fallback: number): number {
  if (!value.endsWith("px")) return fallback;
  const size = Number.parseFloat(value);
  return Number.isFinite(size) && size > 0 ? size : fallback;
}

function pixelWidth(element: HTMLElement, fallback: number): number {
  if (element.style.width === "100%" && element.parentElement) {
    return pixelSize(element.parentElement.style.width, fallback);
  }
  return pixelSize(element.style.width, fallback);
}

async function waitForRegionFrame(editor: Editor): Promise<void> {
  await waitForCondition(() => {
    const regionNodeView = findNodeDom(editor, IDS.region);
    return (
      regionNodeView?.querySelector(
        `[data-authoring-frame="region"][data-id="${IDS.region}"]`,
      ) instanceof HTMLElement
    );
  }, "mounted Region authoring frame");
}

function findNodePosition(editor: Editor, id: EmbeddedNodeId): number {
  let found: number | null = null;
  editor.state.doc.descendants((node, position) => {
    if (node.attrs["id"] !== id) return true;
    found = position;
    return false;
  });
  if (found === null) throw new Error(`Expected document node ${id}.`);
  return found;
}

function createDocument(
  contentLayout: PresentationContentLayout,
  regionContent: readonly JSONContent[] = [
    paragraph(IDS.first, "First child"),
    paragraph(IDS.second, "Second child"),
  ],
): JSONContent {
  const content = createScaffoldDocumentContent({
    initialCourseSectionTitle: "Mounted Content Layout",
    mode: "slideshow",
    surfaceId: IDS.surface,
  });
  const courseDocument = content.content?.[0];
  const courseSection = courseDocument?.content?.[0];
  if (!courseDocument || courseDocument.type !== "courseDocument" || !courseSection) {
    throw new Error("Expected generated slideshow Course Document.");
  }
  courseDocument.content = [
    courseSection,
    {
      type: "surface",
      attrs: {
        id: IDS.surface,
        settings: {
          footer: { enabled: false },
          header: { enabled: false },
          slideTitle: { enabled: true },
        },
        variant: "slide-content",
      },
      content: [
        { type: "slide_title", attrs: { id: IDS.slideTitle } },
        {
          type: "region",
          attrs: { contentLayout, id: IDS.region, role: "main" },
          content: [...regionContent],
        },
      ],
    },
  ];
  return content;
}

function createNestedContainerContent(): readonly JSONContent[] {
  return [
    paragraph(IDS.first, "Region child"),
    {
      type: "grid",
      attrs: { columnWidths: [1], id: IDS.grid },
      content: [
        {
          type: "cell",
          attrs: { contentLayout: PresentationContentLayout.Flow, id: IDS.cell },
          content: [
            paragraph(IDS.cellFirst, "Cell first"),
            paragraph(IDS.cellSecond, "Cell second"),
          ],
        },
      ],
    },
    {
      type: "layout",
      attrs: { id: IDS.layout, variant: "tabs" },
      content: [
        {
          type: "section",
          attrs: {
            contentLayout: PresentationContentLayout.Flow,
            id: IDS.section,
            role: "tab-panel",
          },
          content: [
            paragraph(IDS.sectionFirst, "Section first"),
            paragraph(IDS.sectionSecond, "Section second"),
          ],
        },
      ],
    },
  ];
}

function rejectedFlowChildren(): readonly JSONContent[] {
  return [
    layoutWithSection(IDS.rejectedLayout, "tabs", IDS.rejectedSection, "Rejected tabs"),
    layoutWithSection(IDS.layout, "accordion", IDS.rejectedSecondSection, "Rejected accordion"),
  ];
}

function tabsAndAccordionContent(): readonly JSONContent[] {
  return [
    layoutWithSections(IDS.layout, [
      {
        children: [
          paragraph(IDS.sectionFirst, "Tab one content"),
          paragraph(IDS.sectionSecond, "Tab one second content"),
        ],
        id: IDS.section,
        label: "Tab one",
      },
      {
        children: [paragraph(IDS.second, "Tab two content")],
        id: IDS.tabSecondSection,
        label: "Tab two",
      },
    ]),
    accordionLayoutWithSections(IDS.rejectedLayout, [
      accordionSectionWithChildren(IDS.rejectedSection, "Accordion one", true, [
        paragraph(IDS.calloutMiddle, "Accordion one content"),
      ]),
      accordionSectionWithChildren(IDS.rejectedSecondSection, "Accordion two", false, [
        paragraph(IDS.calloutLast, "Accordion two content"),
      ]),
    ]),
  ];
}

function layoutWithSection(
  layoutId: EmbeddedNodeId,
  variant: "accordion" | "tabs",
  sectionId: EmbeddedNodeId,
  text: string,
): JSONContent {
  if (variant === "accordion") {
    return accordionLayoutWithChildren(layoutId, sectionId, [paragraph(IDS.second, text)]);
  }
  return layoutWithChildren(
    layoutId,
    variant,
    sectionId,
    [paragraph(variant === "tabs" ? IDS.first : IDS.second, text)],
    text,
  );
}

function layoutWithChildren(
  layoutId: EmbeddedNodeId,
  _variant: "accordion" | "tabs",
  sectionId: EmbeddedNodeId,
  children: readonly JSONContent[],
  label = "Section",
): JSONContent {
  return layoutWithSections(layoutId, [{ children, id: sectionId, label }]);
}

function layoutWithSections(
  layoutId: EmbeddedNodeId,
  sections: readonly {
    readonly children: readonly JSONContent[];
    readonly id: EmbeddedNodeId;
    readonly label: string;
  }[],
): JSONContent {
  return {
    type: "layout",
    attrs: {
      id: layoutId,
      options: { label: "Lesson sections", variant: "default" },
      variant: "tabs",
    },
    content: sections.map(({ children, id, label }) => ({
      type: "section",
      attrs: {
        contentLayout: PresentationContentLayout.Flow,
        id,
        options: { label },
        role: "tab-panel",
      },
      content: [...children],
    })),
  };
}

function accordionLayoutWithChildren(
  layoutId: EmbeddedNodeId,
  sectionId: EmbeddedNodeId,
  children: readonly JSONContent[],
): JSONContent {
  return accordionLayoutWithSections(layoutId, [
    accordionSectionWithChildren(sectionId, "Accordion section", true, children),
  ]);
}

function accordionLayoutWithSections(
  layoutId: EmbeddedNodeId,
  sections: readonly JSONContent[],
): JSONContent {
  return {
    type: "layout",
    attrs: {
      id: layoutId,
      options: { allowMultiple: false, label: "Topics", variant: "default" },
      variant: "accordion",
    },
    content: [...sections],
  };
}

function accordionSectionWithChildren(
  sectionId: EmbeddedNodeId,
  label: string,
  defaultOpen: boolean,
  children: readonly JSONContent[],
): JSONContent {
  return {
    type: "section",
    attrs: {
      contentLayout: PresentationContentLayout.Flow,
      id: sectionId,
      options: { defaultOpen },
      role: "accordion-panel",
    },
    content: [
      {
        type: "accordion_section_title",
        content: [{ type: "paragraph", content: [{ type: "text", text: label }] }],
      },
      { type: "accordion_section_panel", content: [...children] },
    ],
  };
}

function callout(id: EmbeddedNodeId): JSONContent {
  const item = composition.catalogues.inDocument.getById("callout");
  if (!item) throw new Error("Expected the Callout insertion action in the mounted catalogue.");
  const content = item.content() as JSONContent;
  return { ...content, attrs: { ...content.attrs, id } };
}

function paragraph(id: EmbeddedNodeId, text = ""): JSONContent {
  return {
    type: "paragraph",
    attrs: { id },
    ...(text ? { content: [{ type: "text", text }] } : {}),
  };
}

function withoutContentLayout(value: JSONContent): JSONContent {
  const next: JSONContent = { ...value };
  if (value.attrs) {
    const attrs = { ...value.attrs };
    delete attrs["contentLayout"];
    next.attrs = attrs;
  }
  if (value.content) next.content = value.content.map(withoutContentLayout);
  return next;
}

function contentLayoutInJson(value: JSONContent, id: EmbeddedNodeId): unknown {
  if (value.attrs?.["id"] === id) return value.attrs["contentLayout"];
  for (const child of value.content ?? []) {
    const result = contentLayoutInJson(child, id);
    if (result !== undefined) return result;
  }
  return undefined;
}

function id(value: string): EmbeddedNodeId {
  return EmbeddedNodeIdSchema.parse(value);
}

async function nextFrame(): Promise<void> {
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
}

async function waitForNodeDom(editor: Editor, nodeId: EmbeddedNodeId): Promise<void> {
  await waitForCondition(() => findNodeDom(editor, nodeId) !== null, `mounted node ${nodeId}`);
}

async function waitForCondition(
  predicate: () => boolean,
  description: string,
  timeoutMs = 8_000,
): Promise<void> {
  const deadline = performance.now() + timeoutMs;
  while (performance.now() < deadline) {
    if (predicate()) return;
    await nextFrame();
  }
  throw new Error(`Timed out waiting for ${description}.`);
}
