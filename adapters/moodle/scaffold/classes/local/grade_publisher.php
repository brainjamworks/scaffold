<?php
// This file is part of Scaffold - https://scaffold.ac/
//
// Scaffold is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// Scaffold is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU General Public License for more details.
//
// You should have received a copy of the GNU General Public License
// along with Moodle.  If not, see <https://www.gnu.org/licenses/>.

namespace mod_scaffold\local;

defined('MOODLE_INTERNAL') || die();

require_once(__DIR__ . '/artifact_identity.php');
require_once(__DIR__ . '/assessment_projection.php');

/**
 * Publishes learner grades to the Moodle gradebook.
 *
 * Projects assessment state and records the publication outcome.
 *
 * @package    mod_scaffold
 * @copyright  2026 Rizvan Ali
 * @license    https://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
class grade_publisher {
    /**
     * RETRY DELAY SECONDS.
     */
    private const RETRY_DELAY_SECONDS = 60;
    /**
     * MAX RETRY DELAY SECONDS.
     */
    private const MAX_RETRY_DELAY_SECONDS = 3600;

    /** @var assessment_state_repository Assessment state repository. */
    private $staterepository;
    /** @var grade_publication_repository Grade publication repository. */
    private $publicationrepository;
    /** @var \Closure Activity loading callback. */
    private readonly \Closure $activityloader;
    /** @var \Closure Moodle grade writing callback. */
    private readonly \Closure $gradewriter;
    /** @var \Closure Grade conflict checking callback. */
    private readonly \Closure $conflictchecker;
    /** @var \Closure Clock callback. */
    private readonly \Closure $clock;
    /** @var \Closure Grade projection loading callback. */
    private readonly \Closure $projectionloader;

    /**
     * Creates a new grade publisher instance.
     *
     * @param object|null $staterepository Assessment state repository.
     * @param object|null $publicationrepository Grade publication repository.
     * @param callable|null $activityloader Activity loading callback.
     * @param callable|null $gradewriter Moodle grade writing callback.
     * @param callable|null $conflictchecker Grade conflict checking callback.
     * @param callable|null $clock Clock callback.
     * @param callable|null $projectionloader Grade projection loading callback.
     */
    public function __construct(
        ?object $staterepository = null,
        ?object $publicationrepository = null,
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

    /**
     * Publishes user.
     *
     * @param \stdClass $scaffold Scaffold.
     * @param int $userid User ID.
     * @return \stdClass
     */
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

    /**
     * Persists grade status.
     *
     * @param int $scaffoldid Scaffold activity ID.
     * @param int $userid User ID.
     * @param int $staterevision Persisted state revision.
     * @param int $definitionversion Definitionversion.
     * @param int $status Status.
     * @return \stdClass
     */
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

    /**
     * Persists conflict.
     *
     * @param int $scaffoldid Scaffold activity ID.
     * @param int $userid User ID.
     * @param int $staterevision Persisted state revision.
     * @param int $definitionversion Definitionversion.
     * @param string $conflict Conflict.
     * @return \stdClass
     */
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

    /**
     * Persists failure.
     *
     * @param int $scaffoldid Scaffold activity ID.
     * @param int $userid User ID.
     * @param int $staterevision Persisted state revision.
     * @param int $definitionversion Definitionversion.
     * @param string $code Code.
     * @param bool $retryable Retryable.
     * @return \stdClass
     */
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

    /**
     * Persists the publication outcome.
     *
     * @param int $scaffoldid Scaffold activity ID.
     * @param int $userid User ID.
     * @param int $staterevision Persisted state revision.
     * @param int $definitionversion Definitionversion.
     * @param string $status Status.
     * @param string|null $code Code.
     * @param int|null $retryafter Retryafter.
     * @param \stdClass $outcome Outcome.
     * @return \stdClass
     */
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

    /**
     * Returns outcome.
     *
     * @param string $status Status.
     * @param string|null $code Code.
     * @return \stdClass
     */
    private static function outcome(string $status, ?string $code = null): \stdClass {
        $outcome = (object) ['status' => $status];
        if ($code !== null) {
            $outcome->code = $code;
        }
        return $outcome;
    }

    /**
     * Returns failed outcome.
     *
     * @param string $code Code.
     * @param bool $retryable Retryable.
     * @param int|null $retryafter Retryafter.
     * @return \stdClass
     */
    private static function failed_outcome(string $code, bool $retryable, ?int $retryafter): \stdClass {
        return (object) [
            'status' => 'failed',
            'code' => $code,
            'retryable' => $retryable,
            'retryAfter' => $retryafter,
        ];
    }

    /**
     * Returns course module ID.
     *
     * @param \stdClass $scaffold Scaffold.
     * @return int
     */
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
