// This file is part of Scaffold - https://scaffold.ac/
//
// Scaffold is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, version 3 of the License.

/**
 * Moodle AMD bootstrap for the Vite-built Scaffold bundle.
 *
 * @module mod_scaffold/bootstrap
 */
import Ajax from "core/ajax";

const loadBundle = (config) =>
  new Promise((resolve, reject) => {
    if (window.ScaffoldMoodle) {
      resolve(window.ScaffoldMoodle);
      return;
    }

    const script = document.createElement("script");
    script.type = "module";
    script.src = config.bundleUrl;
    script.addEventListener(
      "load",
      () => {
        if (!window.ScaffoldMoodle) {
          reject(new Error("Scaffold bundle did not register its mount API"));
          return;
        }
        resolve(window.ScaffoldMoodle);
      },
      { once: true },
    );
    script.addEventListener("error", () => reject(new Error("Scaffold bundle failed to load")), {
      once: true,
    });
    document.head.append(script);
  });

export const init = (rootId, config) => {
  const root = document.getElementById(rootId);
  if (!root) {
    window.console.error(`Scaffold root element not found: ${rootId}`);
    return;
  }

  const callMoodle = (methodname, args) => Ajax.call([{ methodname, args }])[0];

  loadBundle(config)
    .then((bundle) => bundle.mountMoodle(root, config, callMoodle))
    .catch((error) => {
      window.console.error("Scaffold bundle failed to load", error);
      root.replaceChildren();
      const alert = document.createElement("div");
      alert.className = "sc-moodle-frame-error";
      alert.setAttribute("role", "alert");
      alert.textContent = "Scaffold could not be loaded.";
      root.append(alert);
    });
};
