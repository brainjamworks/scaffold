import type { LearningEvent, LearningEventPort } from "@scaffold/core/ports";

import { moodleCall, type MoodleAjaxResponse } from "./api";

export function createMoodleLearningEventPort(cmid: number, wwwroot: string): LearningEventPort {
  const activityUrl = new URL("/mod/scaffold/view.php", wwwroot);
  activityUrl.searchParams.set("id", String(cmid));

  return {
    rootActivityId: activityUrl.href,
    accept: async (event: LearningEvent) => {
      await moodleCall<MoodleAjaxResponse>("mod_scaffold_accept_learning_event", {
        cmid,
        eventjson: JSON.stringify(event),
      });
    },
  };
}
