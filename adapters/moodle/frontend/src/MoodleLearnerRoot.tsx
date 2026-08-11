import { MoodleLearnerApp } from "./MoodleLearnerApp";
import { useMoodlePayload } from "./moodle-payload";
import type { MoodleApplicationConfig } from "./types";

const freeProductAccess = Object.freeze({ scaffoldPlusAuthorized: false });

export function MoodleLearnerRoot({
  config,
}: {
  readonly config: Extract<MoodleApplicationConfig, { surface: "learner" }>;
}) {
  const { payload, loadError } = useMoodlePayload(config);

  if (loadError) {
    return (
      <div className="sc-moodle-root sc-moodle-error" role="alert">
        <strong>Scaffold content could not be loaded.</strong>
        <span>{loadError}</span>
      </div>
    );
  }

  if (!payload) {
    return (
      <div className="sc-moodle-root sc-moodle-loading" aria-live="polite">
        Loading Scaffold...
      </div>
    );
  }

  if (!payload.learnerPublication) {
    return (
      <div className="sc-moodle-root sc-moodle-error" role="alert">
        <strong>Scaffold document could not be loaded.</strong>
        <span>Learner publication is unavailable.</span>
      </div>
    );
  }

  return (
    <MoodleLearnerApp
      artifact={payload.artifactAccess.artifact}
      cmid={config.cmid}
      productAccess={freeProductAccess}
      publication={payload.learnerPublication}
      wwwroot={config.wwwroot}
      {...(payload.assessmentSnapshot === undefined
        ? {}
        : { assessmentSnapshot: payload.assessmentSnapshot })}
      {...(payload.learnerActivitySnapshot === undefined
        ? {}
        : { learnerActivitySnapshot: payload.learnerActivitySnapshot })}
    />
  );
}
