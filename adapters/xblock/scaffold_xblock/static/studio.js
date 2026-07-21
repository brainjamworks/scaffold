globalThis.ScaffoldStudioView = function ScaffoldStudioView(runtime, element, data) {
  (async function mountScaffoldStudioView() {
    var target = unwrapXBlockElement(element);

    try {
      runtime.element = element;
      if (!data || typeof data.outerUrl !== "string" || !data.outerUrl) {
        throw new Error("Scaffold Studio payload is missing outerUrl.");
      }
      var module = await import(data.outerUrl);
      module.renderBlock(target, data, runtime, element);
    } catch (error) {
      console.error("Failed to load Scaffold Studio view:", error);
      renderScaffoldLoadError(
        target,
        "Failed to load the Scaffold editor. Please refresh the page. If the problem persists, contact support.",
      );
    }
  })();
};

function unwrapXBlockElement(element) {
  if (element instanceof Element) return element;
  if (element && typeof element.get === "function") return element.get(0);
  if (element && element[0] instanceof Element) return element[0];
  return element;
}

function renderScaffoldLoadError(target, message) {
  if (!target) return;

  target.innerHTML =
    '<div class="alert alert-danger" role="alert">' +
    "<strong>Error:</strong> " +
    escapeScaffoldHtml(message) +
    "</div>";
}

function escapeScaffoldHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
