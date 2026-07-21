<?php
// This file is part of Scaffold - https://scaffold.ac/
//
// Scaffold is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, version 3 of the License.

namespace mod_scaffold\local;

defined('MOODLE_INTERNAL') || die();

require_once(__DIR__ . '/artifact_identity.php');
require_once(__DIR__ . '/assessment_projection.php');

class grade_publisher {
    private const RETRY_DELAY_SECONDS = 60;
    private const MAX_RETRY_DELAY_SECONDS = 3600;

    private $staterepository;
    private $publicationrepository;
    private readonly \Closure $activityloader;
    private readonly \Closure $gradewriter;
    private readonly \Closure $conflictchecker;
    private readonly \Closure $clock;
    private readonly \Closure $projectionloader;

    public function __construct(
        $staterepository = null,
        $publicationrepository = null,
        ?callable $activityloader = null,
        ?callable $gradewriter = null,
        ?callable $conflictchecker = null,
        ?callable $clock = null,
        ?callable $projectionloader = null,
    ) {
        $this->staterepository = $staterepository ?? new assessment_state_repository();
        $this->publicationrepository = $publicationrepository ?? new grade_publication_repository();
        $this->activityloader = \Closure::fromCallable($activityloader ?? static function(int $scaffoldid): \stdClass {
            global $DB;
            return $DB->get_record('scaffold', ['id' => $scaffoldid], '*', MUST_EXIST);
        });
        $this->gradewriter = \Closure::fromCallable($gradewriter ?? static function(
            \stdClass $scaffold,
            array $grade,
        ): int {
            global $CFG;
            require_once($CFG->dirroot . '/mod/scaffold/lib.php');
            return scaffold_grade_item_update($scaffold, $grade);
        });
        $this->conflictchecker = \Closure::fromCallable($conflictchecker ?? static function(
            \stdClass $scaffold,
            int $userid,
        ): ?string {
            global $CFG;
            require_once($CFG->dirroot . '/mod/scaffold/lib.php');
            return scaffold_grade_publication_conflict($scaffold, $userid);
        });
        $this->clock = \Closure::fromCallable($clock ?? static fn(): int => time());
        $this->projectionloader = \Closure::fromCallable($projectionloader ?? static function(
            \stdClass $scaffold,
            \stdClass $state,
        ): \stdClass {
            $definition = assessment_projection::for_activity($scaffold);
            return assessment_grade_projector::build(
                $definition['targets'],
                $definition['groups'],
                $state->snapshot,
                $state->changedAt,
            );
        });
    }

    public function publish_user(\stdClass $scaffold, int $userid): \stdClass {
        $scaffoldid = (int) ($scaffold->id ?? 0);
        if ($scaffoldid <= 0 || $userid <= 0) {
            throw new \invalid_parameter_exception('Grade publication identity is invalid');
        }

        return $this->staterepository->with_learner_lock(
            $scaffoldid,
            $userid,
            function() use ($scaffoldid, $userid): \stdClass {
                $currentactivity = ($this->activityloader)($scaffoldid);
                $cmid = self::course_module_id($currentactivity);
                $artifactid = artifact_identity::for_course_module($cmid);
                $states = $this->staterepository->find_states_for_activity(
                    $scaffoldid,
                    $artifactid,
                    $userid,
                );
                $state = $states[$userid] ?? null;
                if (!($state instanceof \stdClass)) {
                    return self::outcome('not_applicable');
                }

                $staterevision = (int) $state->stateRevision;
                $definitionversion = (int) ($currentactivity->assessmentdefinitionversion ?? 1);
                $publication = $this->publicationrepository->get($scaffoldid, $userid);
                if (!($publication instanceof \stdClass)
                    || (int) $publication->staterevision !== $staterevision
                    || (int) $publication->definitionversion !== $definitionversion) {
                    return self::outcome('pending');
                }
                if ((int) ($currentactivity->gradeitemversion ?? 0) !== $definitionversion
                    || ($currentactivity->gradeitemstatus ?? 'pending') !== 'published') {
                    return self::outcome('pending');
                }

                $projection = ($this->projectionloader)($currentactivity, $state);
                if (!($projection instanceof \stdClass)) {
                    throw new \invalid_parameter_exception('Current assessment grade projection is invalid');
                }
                $grade = assessment_grade_projector::to_moodle_grade_record(
                    $projection,
                    $currentactivity->grade ?? null,
                    $userid,
                );
                if ($grade === null) {
                    if (!$this->publicationrepository->record_status(
                        $scaffoldid,
                        $userid,
                        $staterevision,
                        $definitionversion,
                        'published',
                    )) {
                        return self::outcome('pending');
                    }
                    return self::outcome('not_applicable');
                }

                $claimed = $this->publicationrepository->claim(
                    $scaffoldid,
                    $userid,
                    $staterevision,
                    $definitionversion,
                );
                if (!($claimed instanceof \stdClass)) {
                    return self::outcome('pending');
                }

                $conflict = ($this->conflictchecker)($currentactivity, $userid);
                if ($conflict !== null) {
                    return $this->persist_conflict(
                        $scaffoldid,
                        $userid,
                        $staterevision,
                        $definitionversion,
                        $conflict,
                    );
                }

                try {
                    $status = ($this->gradewriter)($currentactivity, $grade);
                } catch (\Throwable) {
                    return $this->persist_failure(
                        $scaffoldid,
                        $userid,
                        $staterevision,
                        $definitionversion,
                        'grade_update_exception',
                        true,
                    );
                }

                return $this->persist_grade_status(
                    $scaffoldid,
                    $userid,
                    $staterevision,
                    $definitionversion,
                    (int) $status,
                );
            },
        );
    }

    private function persist_grade_status(
        int $scaffoldid,
        int $userid,
        int $staterevision,
        int $definitionversion,
        int $status,
    ): \stdClass {
        return match ($status) {
            GRADE_UPDATE_OK => $this->persist(
                $scaffoldid,
                $userid,
                $staterevision,
                $definitionversion,
                'published',
                null,
                null,
                self::outcome('published'),
            ),
            GRADE_UPDATE_FAILED => $this->persist_failure(
                $scaffoldid,
                $userid,
                $staterevision,
                $definitionversion,
                'grade_update_failed',
                true,
            ),
            GRADE_UPDATE_MULTIPLE => $this->persist(
                $scaffoldid,
                $userid,
                $staterevision,
                $definitionversion,
                'configuration_error',
                'multiple_grade_items',
                null,
                self::outcome('configuration_error', 'multiple_grade_items'),
            ),
            GRADE_UPDATE_ITEM_LOCKED => $this->persist(
                $scaffoldid,
                $userid,
                $staterevision,
                $definitionversion,
                'locked',
                'grade_item_locked',
                null,
                self::outcome('locked', 'grade_item_locked'),
            ),
            default => $this->persist_failure(
                $scaffoldid,
                $userid,
                $staterevision,
                $definitionversion,
                'unknown_grade_update_status',
                false,
            ),
        };
    }

    private function persist_conflict(
        int $scaffoldid,
        int $userid,
        int $staterevision,
        int $definitionversion,
        string $conflict,
    ): \stdClass {
        if (in_array($conflict, ['grade_item_locked', 'learner_grade_locked', 'instructor_override'], true)) {
            return $this->persist(
                $scaffoldid,
                $userid,
                $staterevision,
                $definitionversion,
                'locked',
                $conflict,
                null,
                self::outcome('locked', $conflict),
            );
        }
        return $this->persist(
            $scaffoldid,
            $userid,
            $staterevision,
            $definitionversion,
            'configuration_error',
            'gradebook_conflict',
            null,
            self::outcome('configuration_error', 'gradebook_conflict'),
        );
    }

    private function persist_failure(
        int $scaffoldid,
        int $userid,
        int $staterevision,
        int $definitionversion,
        string $code,
        bool $retryable,
    ): \stdClass {
        $retryafter = null;
        if ($retryable) {
            $publication = $this->publicationrepository->get($scaffoldid, $userid);
            $retrycount = max(1, (int) ($publication->retrycount ?? 1));
            $delay = min(
                self::MAX_RETRY_DELAY_SECONDS,
                self::RETRY_DELAY_SECONDS * (2 ** min(10, $retrycount - 1)),
            );
            $retryafter = ($this->clock)() + $delay;
        }
        return $this->persist(
            $scaffoldid,
            $userid,
            $staterevision,
            $definitionversion,
            'failed',
            $code,
            $retryafter,
            self::failed_outcome($code, $retryable, $retryafter),
        );
    }

    private function persist(
        int $scaffoldid,
        int $userid,
        int $staterevision,
        int $definitionversion,
        string $status,
        ?string $code,
        ?int $retryafter,
        \stdClass $outcome,
    ): \stdClass {
        if (!$this->publicationrepository->record_status(
            $scaffoldid,
            $userid,
            $staterevision,
            $definitionversion,
            $status,
            $code,
            $retryafter,
        )) {
            return self::outcome('pending');
        }
        return $outcome;
    }

    private static function outcome(string $status, ?string $code = null): \stdClass {
        $outcome = (object) ['status' => $status];
        if ($code !== null) {
            $outcome->code = $code;
        }
        return $outcome;
    }

    private static function failed_outcome(string $code, bool $retryable, ?int $retryafter): \stdClass {
        return (object) [
            'status' => 'failed',
            'code' => $code,
            'retryable' => $retryable,
            'retryAfter' => $retryafter,
        ];
    }

    private static function course_module_id(\stdClass $scaffold): int {
        if (isset($scaffold->coursemodule) && (int) $scaffold->coursemodule > 0) {
            return (int) $scaffold->coursemodule;
        }
        $cm = get_coursemodule_from_instance(
            'scaffold',
            (int) $scaffold->id,
            isset($scaffold->course) ? (int) $scaffold->course : 0,
            false,
            MUST_EXIST,
        );
        return (int) $cm->id;
    }
}
