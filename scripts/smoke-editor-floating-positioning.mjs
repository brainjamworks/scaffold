#!/usr/bin/env node

const args = parseArgs(process.argv.slice(2));

if (args.help) {
  printHelp();
  process.exit(0);
}

const referenceSelector = requiredArg(args, "reference");
const floatingSelector = requiredArg(args, "floating");
const port = Number(args.port ?? 9222);
const scrollAmount = Number(args.scroll ?? 24);
const tolerance = Number(args.tolerance ?? 1);
const urlMatch = String(args.urlMatch ?? "localhost:5847");
const scrollContainerSelector =
  typeof args.scrollContainer === "string" ? args.scrollContainer : null;

if (typeof WebSocket !== "function") {
  console.error("This smoke helper needs a Node runtime with global WebSocket support.");
  process.exit(1);
}

const page = await findChromePage({ port, urlMatch });
const client = await connectToChromePage(page.webSocketDebuggerUrl);

try {
  const result = await evaluateInPage(client, {
    floatingSelector,
    referenceSelector,
    scrollAmount,
    scrollContainerSelector,
  });

  const maxGapDelta = Math.max(
    ...result.samples.map((sample) => Math.abs(sample.gapDeltaFromBefore)),
  );
  const pass =
    result.samples.every((sample) => sample.reference.visible && sample.floating.visible) &&
    maxGapDelta <= tolerance;

  console.log(
    JSON.stringify(
      {
        floatingSelector,
        maxGapDelta,
        pass,
        referenceSelector,
        samples: result.samples,
        scrollAmount,
        scrollContainerSelector,
        tolerance,
        url: page.url,
      },
      null,
      2,
    ),
  );

  process.exit(pass ? 0 : 1);
} finally {
  client.close();
}

function parseArgs(argv) {
  const out = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--help" || arg === "-h") {
      out.help = true;
      continue;
    }
    if (!arg.startsWith("--")) {
      throw new Error(`Unexpected argument: ${arg}`);
    }
    const key = arg.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) {
      out[key] = true;
      continue;
    }
    out[key] = next;
    index += 1;
  }
  return out;
}

function requiredArg(parsedArgs, key) {
  const value = parsedArgs[key];
  if (typeof value === "string" && value.length > 0) return value;
  console.error(`Missing required --${key} selector.`);
  printHelp();
  process.exit(1);
}

function printHelp() {
  console.log(`Usage:
  node scripts/smoke-editor-floating-positioning.mjs \\
    --reference '[data-authoring-frame="layout"]' \\
    --floating '[data-layout-menu-trigger]' \\
    [--scroll-container '.ProseMirror'] \\
    [--scroll 24] [--tolerance 1] [--port 9222] [--url-match localhost:5847]

Checks that a portalled floating control keeps a stable gap to its reference
element across immediate, requestAnimationFrame 1, and requestAnimationFrame 2
scroll samples in the currently open shared Chrome tab.`);
}

async function findChromePage({ port, urlMatch }) {
  const response = await fetch(`http://127.0.0.1:${port}/json`);
  if (!response.ok) {
    throw new Error(`Chrome debugging endpoint returned ${response.status}.`);
  }

  const pages = await response.json();
  const page = pages.find(
    (entry) =>
      entry.type === "page" &&
      typeof entry.url === "string" &&
      entry.url.includes(urlMatch) &&
      entry.webSocketDebuggerUrl,
  );
  if (!page) {
    throw new Error(`No Chrome page matching ${urlMatch} on debugging port ${port}.`);
  }
  return page;
}

function connectToChromePage(url) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(url);
    let nextId = 1;
    const pending = new Map();

    socket.addEventListener("open", () => {
      resolve({
        close: () => socket.close(),
        send(method, params = {}) {
          const id = nextId;
          nextId += 1;
          socket.send(JSON.stringify({ id, method, params }));
          return new Promise((methodResolve, methodReject) => {
            pending.set(id, { reject: methodReject, resolve: methodResolve });
          });
        },
      });
    });
    socket.addEventListener("message", (event) => {
      const message = JSON.parse(String(event.data));
      if (!message.id) return;
      const callbacks = pending.get(message.id);
      if (!callbacks) return;
      pending.delete(message.id);
      if (message.error) {
        callbacks.reject(new Error(message.error.message ?? "Chrome DevTools protocol error"));
        return;
      }
      callbacks.resolve(message.result);
    });
    socket.addEventListener("error", () => {
      reject(new Error("Failed to connect to Chrome debugging WebSocket."));
    });
    socket.addEventListener("close", () => {
      for (const callbacks of pending.values()) {
        callbacks.reject(new Error("Chrome debugging WebSocket closed."));
      }
      pending.clear();
    });
  });
}

async function evaluateInPage(client, input) {
  const expression = `(${pageProbe.toString()})(${JSON.stringify(input)})`;
  const response = await client.send("Runtime.evaluate", {
    awaitPromise: true,
    expression,
    returnByValue: true,
  });
  if (response.exceptionDetails) {
    throw new Error(response.exceptionDetails.text ?? "Browser probe failed.");
  }
  return response.result.value;
}

async function pageProbe({
  floatingSelector,
  referenceSelector,
  scrollAmount,
  scrollContainerSelector,
}) {
  const reference = document.querySelector(referenceSelector);
  const floating = document.querySelector(floatingSelector);
  const scrollContainer = scrollContainerSelector
    ? document.querySelector(scrollContainerSelector)
    : null;

  if (!reference) throw new Error(`Missing reference element: ${referenceSelector}`);
  if (!floating) throw new Error(`Missing floating element: ${floatingSelector}`);
  if (scrollContainerSelector && !scrollContainer) {
    throw new Error(`Missing scroll container: ${scrollContainerSelector}`);
  }

  const before = sample("before", reference, floating);
  scrollByAmount(scrollContainer, scrollAmount);
  const immediate = sampleFromBefore("immediate", reference, floating, before);
  await nextAnimationFrame();
  const raf1 = sampleFromBefore("raf1", reference, floating, before);
  await nextAnimationFrame();
  const raf2 = sampleFromBefore("raf2", reference, floating, before);
  scrollByAmount(scrollContainer, -scrollAmount);

  return {
    samples: [{ ...before, gapDeltaFromBefore: 0 }, immediate, raf1, raf2],
  };
}

function sampleFromBefore(label, reference, floating, before) {
  const current = sample(label, reference, floating);
  return {
    ...current,
    gapDeltaFromBefore: current.gap.y - before.gap.y,
  };
}

function sample(label, reference, floating) {
  const referenceRect = rectFor(reference);
  const floatingRect = rectFor(floating);
  return {
    floating: floatingRect,
    gap: {
      x: floatingRect.left - referenceRect.left,
      y: floatingRect.top - referenceRect.top,
    },
    label,
    reference: referenceRect,
  };
}

function rectFor(element) {
  const rect = element.getBoundingClientRect();
  const style = getComputedStyle(element);
  return {
    bottom: rect.bottom,
    height: rect.height,
    left: rect.left,
    top: rect.top,
    visible:
      rect.width > 0 &&
      rect.height > 0 &&
      style.display !== "none" &&
      style.visibility !== "hidden" &&
      Number(style.opacity || "1") !== 0,
    width: rect.width,
  };
}

function scrollByAmount(scrollContainer, amount) {
  if (scrollContainer) {
    scrollContainer.scrollTop += amount;
    return;
  }
  window.scrollBy(0, amount);
}

function nextAnimationFrame() {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}
