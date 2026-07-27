import type { XapiPort } from "@scaffold/core/ports";

import { moodleCall, type MoodleAjaxResponse } from "./api";

export function createMoodleXapiPort(cmid: number, wwwroot: string): XapiPort {
  const activityUrl = new URL("/mod/scaffold/view.php", wwwroot);
  activityUrl.searchParams.set("id", String(cmid));

  return {
    activityId: activityUrl.href,
    send: async (statement) => {
      await moodleCall<MoodleAjaxResponse>("mod_scaffold_accept_xapi_statement", {
        cmid,
        statementjson: JSON.stringify(statement),
      });
    },
  };
}
