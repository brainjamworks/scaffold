// @vitest-environment happy-dom

import { afterEach, describe, expect, it } from "vite-plus/test";

import {
  isAuthoredEditableTarget,
  isAuthoringChromeTarget,
  isIgnoredInteractiveTarget,
  isPlainPrimaryMouseDown,
} from "./activation-dom-policy";
import {
  AUTHORING_CHROME_ATTR,
  AUTHORING_MOVE_HANDLE_ATTR,
  AUTHORING_RESIZE_HANDLE_ATTR,
} from "./authoring-chrome";
import { AUTHORING_FRAME_ATTR, AUTHORING_FRAME_EDITABLE_ATTR } from "./authoring-frame";

afterEach(() => {
  document.body.innerHTML = "";
});

function mouseDown(overrides: Partial<MouseEvent> = {}): MouseEvent {
  return {
    altKey: false,
    button: 0,
    ctrlKey: false,
    metaKey: false,
    shiftKey: false,
    ...overrides,
  } as MouseEvent;
}

describe("isPlainPrimaryMouseDown", () => {
  it("accepts an unmodified primary-button mouse down", () => {
    expect(isPlainPrimaryMouseDown(mouseDown())).toBe(true);
  });

  it("rejects secondary buttons and modified clicks", () => {
    expect(isPlainPrimaryMouseDown(mouseDown({ button: 1 }))).toBe(false);
    expect(isPlainPrimaryMouseDown(mouseDown({ button: 2 }))).toBe(false);
    expect(isPlainPrimaryMouseDown(mouseDown({ altKey: true }))).toBe(false);
    expect(isPlainPrimaryMouseDown(mouseDown({ ctrlKey: true }))).toBe(false);
    expect(isPlainPrimaryMouseDown(mouseDown({ metaKey: true }))).toBe(false);
    expect(isPlainPrimaryMouseDown(mouseDown({ shiftKey: true }))).toBe(false);
  });
});

describe("isIgnoredInteractiveTarget", () => {
  it("ignores native interactive controls", () => {
    for (const html of [
      "<button>b</button>",
      '<a href="/x">a</a>',
      "<input />",
      "<select></select>",
      "<textarea></textarea>",
    ]) {
      const host = document.createElement("div");
      host.innerHTML = html;
      document.body.appendChild(host);
      expect(isIgnoredInteractiveTarget(host.firstElementChild)).toBe(true);
    }
  });

  it("ignores descendants of ARIA widget roles", () => {
    for (const role of [
      "button",
      "checkbox",
      "combobox",
      "dialog",
      "link",
      "listbox",
      "menu",
      "menuitem",
      "option",
      "radio",
      "slider",
      "spinbutton",
      "switch",
      "tab",
    ]) {
      const widget = document.createElement("div");
      widget.setAttribute("role", role);
      const inner = document.createElement("span");
      widget.appendChild(inner);
      document.body.appendChild(widget);
      expect(isIgnoredInteractiveTarget(inner)).toBe(true);
    }
  });

  it("ignores resize handles, move handles, and no-select regions", () => {
    const resize = document.createElement("div");
    resize.setAttribute(AUTHORING_RESIZE_HANDLE_ATTR, "");
    const move = document.createElement("div");
    move.setAttribute(AUTHORING_MOVE_HANDLE_ATTR, "");
    const noSelect = document.createElement("div");
    noSelect.setAttribute("data-no-select", "");
    document.body.append(resize, move, noSelect);

    expect(isIgnoredInteractiveTarget(resize)).toBe(true);
    expect(isIgnoredInteractiveTarget(move)).toBe(true);
    expect(isIgnoredInteractiveTarget(noSelect)).toBe(true);
  });

  it("ignores explicit authoring chrome but not an unowned popper lookalike", () => {
    const chrome = document.createElement("div");
    chrome.setAttribute(AUTHORING_CHROME_ATTR, "bubble");
    const chromeChild = document.createElement("span");
    chrome.appendChild(chromeChild);

    const popper = document.createElement("div");
    popper.setAttribute("data-radix-popper-content-wrapper", "");
    const popperChild = document.createElement("span");
    popper.appendChild(popperChild);

    document.body.append(chrome, popper);

    expect(isIgnoredInteractiveTarget(chromeChild)).toBe(true);
    expect(isIgnoredInteractiveTarget(popperChild)).toBe(false);
  });

  it("does not ignore plain authored content or non-elements", () => {
    const paragraph = document.createElement("p");
    paragraph.textContent = "hello";
    document.body.appendChild(paragraph);

    expect(isIgnoredInteractiveTarget(paragraph)).toBe(false);
    expect(isIgnoredInteractiveTarget(null)).toBe(false);
    expect(isIgnoredInteractiveTarget(document.createTextNode("x"))).toBe(false);
  });
});

describe("isAuthoredEditableTarget", () => {
  function editorRootWith(html: string): {
    editorRoot: HTMLElement;
    query: (selector: string) => Element;
  } {
    const editorRoot = document.createElement("div");
    editorRoot.setAttribute("contenteditable", "true");
    editorRoot.innerHTML = html;
    document.body.appendChild(editorRoot);
    return {
      editorRoot,
      query: (selector: string) => {
        const found = editorRoot.querySelector(selector);
        if (!found) throw new Error(`missing ${selector}`);
        return found;
      },
    };
  }

  it("rejects targets inside non-editable chrome", () => {
    const { editorRoot, query } = editorRootWith(
      '<div contenteditable="false"><span id="t">x</span></div>',
    );
    expect(isAuthoredEditableTarget(query("#t"), editorRoot)).toBe(false);
  });

  it("rejects the frame element itself", () => {
    const { editorRoot, query } = editorRootWith(
      `<section ${AUTHORING_FRAME_ATTR}="block" id="t"></section>`,
    );
    expect(isAuthoredEditableTarget(query("#t"), editorRoot)).toBe(false);
  });

  it("accepts targets inside marked editable frame interiors", () => {
    const { editorRoot, query } = editorRootWith(
      `<section ${AUTHORING_FRAME_ATTR}="block"><div ${AUTHORING_FRAME_EDITABLE_ATTR}><span id="t">x</span></div></section>`,
    );
    expect(isAuthoredEditableTarget(query("#t"), editorRoot)).toBe(true);
  });

  it("accepts targets inside nested editable hosts, not the root itself", () => {
    const { editorRoot, query } = editorRootWith(
      '<div contenteditable="true" id="host"><span id="t">x</span></div><p id="rootChild">y</p>',
    );
    expect(isAuthoredEditableTarget(query("#t"), editorRoot)).toBe(true);
    expect(isAuthoredEditableTarget(query("#rootChild"), editorRoot)).toBe(false);
  });

  it("accepts nested node-view content regions below the surface content", () => {
    const { editorRoot, query } = editorRootWith(
      `<div data-surface-content data-node-view-content>
         <section ${AUTHORING_FRAME_ATTR}="block">
           <div data-node-view-content><span id="nested">x</span></div>
         </section>
         <span id="direct">y</span>
       </div>`,
    );
    expect(isAuthoredEditableTarget(query("#nested"), editorRoot)).toBe(true);
    expect(isAuthoredEditableTarget(query("#direct"), editorRoot)).toBe(true);
  });

  it("rejects block shell descendants wrapped by parent node-view content", () => {
    const { editorRoot, query } = editorRootWith(
      `<div data-surface-content data-node-view-content>
         <section ${AUTHORING_FRAME_ATTR}="section">
           <div data-node-view-content-react>
             <section ${AUTHORING_FRAME_ATTR}="block" id="block">
               <section id="shell">Question card shell</section>
               <div data-node-view-content id="field">
                 <span id="fieldText">Actual field text</span>
               </div>
             </section>
           </div>
         </section>
       </div>`,
    );

    expect(isAuthoredEditableTarget(query("#shell"), editorRoot)).toBe(false);
    expect(isAuthoredEditableTarget(query("#field"), editorRoot)).toBe(false);
    expect(isAuthoredEditableTarget(query("#fieldText"), editorRoot)).toBe(true);
  });

  it("accepts authored textblocks directly under the surface content", () => {
    const { editorRoot, query } = editorRootWith(
      `<div data-surface-content data-node-view-content>
         <h1 id="heading">Module 1</h1>
         <p><span id="text">body text</span></p>
       </div>`,
    );
    expect(isAuthoredEditableTarget(query("#heading"), editorRoot)).toBe(true);
    expect(isAuthoredEditableTarget(query("#text"), editorRoot)).toBe(true);
  });

  it("rejects the surface content container itself as blank structural space", () => {
    const { editorRoot, query } = editorRootWith(
      `<div data-surface-content data-node-view-content id="container">
         <p>text</p>
       </div>`,
    );
    expect(isAuthoredEditableTarget(query("#container"), editorRoot)).toBe(false);
  });

  it("rejects framed child shells and their chrome inside the surface content", () => {
    const { editorRoot, query } = editorRootWith(
      `<div data-surface-content data-node-view-content>
         <section ${AUTHORING_FRAME_ATTR}="block" id="shell">
           <div id="shellChrome"></div>
         </section>
       </div>`,
    );
    expect(isAuthoredEditableTarget(query("#shell"), editorRoot)).toBe(false);
    expect(isAuthoredEditableTarget(query("#shellChrome"), editorRoot)).toBe(false);
  });

  it("rejects non-element and outside targets", () => {
    const { editorRoot } = editorRootWith("<p>x</p>");
    const outside = document.createElement("div");
    document.body.appendChild(outside);

    expect(isAuthoredEditableTarget(null, editorRoot)).toBe(false);
    expect(isAuthoredEditableTarget(outside, editorRoot)).toBe(false);
  });
});

describe("isAuthoringChromeTarget delegation", () => {
  it("detects chrome-marked targets through the neutral chrome markers", () => {
    const chrome = document.createElement("div");
    chrome.setAttribute(AUTHORING_CHROME_ATTR, "menu");
    document.body.appendChild(chrome);

    expect(isAuthoringChromeTarget(chrome)).toBe(true);
    expect(isAuthoringChromeTarget(document.body)).toBe(false);
  });
});
