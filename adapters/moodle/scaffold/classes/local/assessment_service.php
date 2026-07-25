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

require_once(__DIR__ . '/quiz_expiry_reconciler.php');
require_once(__DIR__ . '/artifact_identity.php');
require_once(__DIR__ . '/assessment_projection.php');
require_once(__DIR__ . '/assessment_public_projection.php');

/**
 * Applies learner assessment commands against locked canonical state.
 *
 * @package    mod_scaffold
 * @copyright  2026 Rizvan Ali
 * @license    https://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
final class assessment_service {
    /** @var assessment_state_repository Persistence repository. */
    private $repository;
    /** @var \Closure Assessment grading callback. */
    private \Closure $grader;
    /** @var \Closure Grade publication callback. */
    private \Closure $gradepublisher;
    /** @var \Closure Completion update callback. */
    private \Closure $completionupdater;
    /** @var assessment_quiz Quiz assessment service. */
    private assessment_quiz $quiz;
    /** @var ?quiz_expiry_reconciler Quiz expiry reconciler. */
    private ?quiz_expiry_reconciler $quizexpiryreconciler;

    /**
     * Creates a new assessment service instance.
     *
     * @param assessment_state_repository|null $repository Persistence repository.
     * @param callable|null $grader Assessment grading callback.
     * @param callable|null $gradepublisher Grade publication callback.
     * @param callable|null $completionupdater Completion update callback.
     * @param assessment_quiz|null $quiz Quiz assessment service.
     * @param quiz_expiry_reconciler|null $quizexpiryreconciler Quiz expiry reconciler.
     */
    public function __construct(
        ?assessment_state_repository $repository = null,
        ?callable $grader = null,
        ?callable $gradepublisher = null,
        ?callable $completionupdater = null,
        ?assessment_quiz $quiz = null,
        ?quiz_expiry_reconciler $quizexpiryreconciler = null,
    ) {
        $this->repository = $repository ?? new assessment_state_repository();
        $this->grader = \Closure::fromCallable(
            $grader ?? static fn(array $target, array $response): array =>
                grader::grade_assessment($target, $response),
        );
        $this->gradepublisher = \Closure::fromCallable(
            $gradepublisher ?? static fn(\stdClass $scaffold, int $userid, string $artifactid): ?\stdClass =>
                (new grade_publisher())->publish_user($scaffold, $userid),
        );
        $this->completionupdater = \Closure::fromCallable(
            $completionupdater ?? static function (
                \stdClass $scaffold,
                \cm_info $cm,
                int $userid,
            ): void {
                global $CFG;

                require_once($CFG->dirroot . '/mod/scaffold/lib.php');
                scaffold_update_completion($scaffold, $cm, $userid);
            },
        );
        $this->quiz = $quiz ?? new assessment_quiz();
        $this->quizexpiryreconciler = $quizexpiryreconciler;
    }

    /**
     * Checks an assessment response.
     *
     * @param activity_scope $scope Scope.
     * @param string $problemid Runtime problem ID.
     * @param string $targetid Assessment target ID.
     * @param string $interactionkind Interactionkind.
     * @param array $response Response.
     * @param int $expectedattemptnumber Expectedattemptnumber.
     * @return array
     */
    public function check(
        activity_scope $scope,
        string $problemid,
        string $targetid,
        string $interactionkind,
        array $response,
        int $expectedattemptnumber,
    ): array {
        $this->require_submit_scope($scope);
        return $this->apply_attempt(
            $scope->instance,
            $scope->cm,
            $scope->actorid,
            $problemid,
            $targetid,
            $interactionkind,
            $response,
            $expectedattemptnumber,
            'check',
        );
    }

    /**
     * Submits an assessment response.
     *
     * @param activity_scope $scope Scope.
     * @param string $problemid Runtime problem ID.
     * @param string $targetid Assessment target ID.
     * @param string $interactionkind Interactionkind.
     * @param array $response Response.
     * @param int $expectedattemptnumber Expectedattemptnumber.
     * @return array
     */
    public function submit(
        activity_scope $scope,
        string $problemid,
        string $targetid,
        string $interactionkind,
        array $response,
        int $expectedattemptnumber,
    ): array {
        $this->require_submit_scope($scope);
        return $this->apply_attempt(
            $scope->instance,
            $scope->cm,
            $scope->actorid,
            $problemid,
            $targetid,
            $interactionkind,
            $response,
            $expectedattemptnumber,
            'submit',
        );
    }

    /**
     * Reveals answer.
     *
     * @param activity_scope $scope Scope.
     * @param string $problemid Runtime problem ID.
     * @param string $targetid Assessment target ID.
     * @param string $interactionkind Interactionkind.
     * @return array
     */
    public function reveal_answer(
        activity_scope $scope,
        string $problemid,
        string $targetid,
        string $interactionkind,
    ): array {
        if ($scope->capability !== 'mod/scaffold:view') {
            throw new \invalid_parameter_exception('Answer reveal is not authorized by activity scope');
        }

        $target = self::target_for_request(
            assessment_projection::for_activity($scope->instance),
            (int) $scope->cm->id,
            $problemid,
            $targetid,
            $interactionkind,
        );
        $settings = is_array($target['settings'] ?? null) ? $target['settings'] : [];
        if (($settings['showAnswer'] ?? null) !== true) {
            throw new \moodle_exception('answerrevealdisabled', 'scaffold');
        }

        $artifactid = artifact_identity::for_course_module((int) $scope->cm->id);
        $states = $this->repository->find_states_for_activity(
            (int) $scope->instance->id,
            $artifactid,
            $scope->actorid,
        );
        $problem = isset($states[$scope->actorid])
            && property_exists($states[$scope->actorid]->snapshot->problems, $targetid)
            ? $states[$scope->actorid]->snapshot->problems->{$targetid}
            : null;
        if (!self::problem_authorizes_answer_reveal($problem)) {
            throw new \moodle_exception('answerrevealunavailable', 'scaffold');
        }

        return ['answerKey' => $target['assessment'] ?? null];
    }

    /**
     * Reveals hint.
     *
     * @param activity_scope $scope Scope.
     * @param string $problemid Runtime problem ID.
     * @param string $targetid Assessment target ID.
     * @param string $interactionkind Interactionkind.
     * @param int $hintsshown Hintsshown.
     * @return array
     */
    public function reveal_hint(
        activity_scope $scope,
        string $problemid,
        string $targetid,
        string $interactionkind,
        int $hintsshown,
    ): array {
        $this->require_submit_scope($scope);
        return $this->reveal_hint_for(
            $scope->instance,
            $scope->cm,
            $scope->actorid,
            $problemid,
            $targetid,
            $interactionkind,
            $hintsshown,
        );
    }

    /**
     * Starts quiz.
     *
     * @param activity_scope $scope Scope.
     * @param string $groupid Assessment group ID.
     * @return array
     */
    public function start_quiz(activity_scope $scope, string $groupid): array {
        $this->require_submit_scope($scope);
        return $this->start_quiz_for($scope->instance, $scope->cm, $scope->actorid, $groupid);
    }

    /**
     * Submits quiz question.
     *
     * @param activity_scope $scope Scope.
     * @param string $attemptid Quiz attempt ID.
     * @param string $groupid Assessment group ID.
     * @param string $targetid Assessment target ID.
     * @param array $response Response.
     * @param int $expectedattemptnumber Expectedattemptnumber.
     * @return array
     */
    public function submit_quiz_question(
        activity_scope $scope,
        string $attemptid,
        string $groupid,
        string $targetid,
        array $response,
        int $expectedattemptnumber,
    ): array {
        $this->require_submit_scope($scope);
        return $this->submit_quiz_question_for(
            $scope->instance,
            $scope->cm,
            $scope->actorid,
            $attemptid,
            $groupid,
            $targetid,
            $response,
            $expectedattemptnumber,
        );
    }

    /**
     * Finishes quiz.
     *
     * @param activity_scope $scope Scope.
     * @param string $attemptid Quiz attempt ID.
     * @param string $groupid Assessment group ID.
     * @param array $responsesbytargetid Responsesbytargetid.
     * @return array
     */
    public function finish_quiz(
        activity_scope $scope,
        string $attemptid,
        string $groupid,
        array $responsesbytargetid,
    ): array {
        $this->require_submit_scope($scope);
        return $this->finish_quiz_for(
            $scope->instance,
            $scope->cm,
            $scope->actorid,
            $attemptid,
            $groupid,
            $responsesbytargetid,
        );
    }

    /**
     * Reveals quiz.
     *
     * @param activity_scope $scope Scope.
     * @param string $attemptid Quiz attempt ID.
     * @param string $groupid Assessment group ID.
     * @return array
     */
    public function reveal_quiz(activity_scope $scope, string $attemptid, string $groupid): array {
        $this->require_submit_scope($scope);
        return $this->reveal_quiz_for($scope->instance, $scope->cm, $scope->actorid, $attemptid, $groupid);
    }

    /**
     * Starts quiz for.
     *
     * @param \stdClass $scaffold Scaffold.
     * @param \cm_info $cm Moodle course module.
     * @param int $userid User ID.
     * @param string $groupid Assessment group ID.
     * @return array
     */
    private function start_quiz_for(\stdClass $scaffold, \cm_info $cm, int $userid, string $groupid): array {
        $this->reconcile_expiry($scaffold, $cm, $userid);
        $projection = assessment_projection::for_activity($scaffold);
        $attempt = null;
        $result = $this->mutate_quiz(
            $scaffold,
            $cm,
            $userid,
            $projection,
            $groupid,
            function (\stdClass $snapshot) use ($groupid, $projection, &$attempt): \stdClass {
                $attempt = $this->quiz->start_state(
                    $snapshot,
                    $projection['targets'],
                    $projection['groups'],
                    $groupid,
                );
                return $snapshot;
            },
        );
        return $this->quiz_result(
            $result,
            $attempt,
            self::quiz_group_by_id($projection['groups'], $groupid),
            [],
        );
    }

    /**
     * Submits quiz question for.
     *
     * @param \stdClass $scaffold Scaffold.
     * @param \cm_info $cm Moodle course module.
     * @param int $userid User ID.
     * @param string $attemptid Quiz attempt ID.
     * @param string $groupid Assessment group ID.
     * @param string $targetid Assessment target ID.
     * @param array $response Response.
     * @param int|null $expectedattemptnumber Expectedattemptnumber.
     * @return array
     */
    private function submit_quiz_question_for(
        \stdClass $scaffold,
        \cm_info $cm,
        int $userid,
        string $attemptid,
        string $groupid,
        string $targetid,
        array $response,
        ?int $expectedattemptnumber,
    ): array {
        $this->reconcile_expiry($scaffold, $cm, $userid);
        $projection = assessment_projection::for_activity($scaffold);
        $attempt = null;
        $result = $this->mutate_quiz(
            $scaffold,
            $cm,
            $userid,
            $projection,
            $groupid,
            function (\stdClass $snapshot) use (
                $attemptid,
                $expectedattemptnumber,
                $groupid,
                $projection,
                $response,
                $targetid,
                &$attempt,
            ): \stdClass {
                $attempt = $this->quiz->submit_question_state(
                    $snapshot,
                    $projection['targets'],
                    $projection['groups'],
                    $attemptid,
                    $groupid,
                    $targetid,
                    $response,
                    $expectedattemptnumber,
                );
                return $snapshot;
            },
        );
        return $this->quiz_result(
            $result,
            $attempt,
            self::quiz_group_by_id($projection['groups'], $groupid),
            [$targetid],
        );
    }

    /**
     * Finishes quiz for.
     *
     * @param \stdClass $scaffold Scaffold.
     * @param \cm_info $cm Moodle course module.
     * @param int $userid User ID.
     * @param string $attemptid Quiz attempt ID.
     * @param string $groupid Assessment group ID.
     * @param array $responsesbytargetid Responsesbytargetid.
     * @return array
     */
    private function finish_quiz_for(
        \stdClass $scaffold,
        \cm_info $cm,
        int $userid,
        string $attemptid,
        string $groupid,
        array $responsesbytargetid,
    ): array {
        $this->reconcile_expiry($scaffold, $cm, $userid);
        $projection = assessment_projection::for_activity($scaffold);
        $attempt = null;
        $result = $this->mutate_quiz(
            $scaffold,
            $cm,
            $userid,
            $projection,
            $groupid,
            function (\stdClass $snapshot) use (
                $attemptid,
                $groupid,
                $projection,
                $responsesbytargetid,
                &$attempt,
            ): \stdClass {
                $attempt = $this->quiz->finish_state(
                    $snapshot,
                    $projection['targets'],
                    $projection['groups'],
                    $attemptid,
                    $groupid,
                    $responsesbytargetid,
                );
                return $snapshot;
            },
        );
        return $this->quiz_result(
            $result,
            $attempt,
            self::quiz_group_by_id($projection['groups'], $groupid),
            array_keys($responsesbytargetid),
        );
    }

    /**
     * Reveals quiz for.
     *
     * @param \stdClass $scaffold Scaffold.
     * @param \cm_info $cm Moodle course module.
     * @param int $userid User ID.
     * @param string $attemptid Quiz attempt ID.
     * @param string $groupid Assessment group ID.
     * @return array
     */
    private function reveal_quiz_for(
        \stdClass $scaffold,
        \cm_info $cm,
        int $userid,
        string $attemptid,
        string $groupid,
    ): array {
        $this->reconcile_expiry($scaffold, $cm, $userid);
        $projection = assessment_projection::for_activity($scaffold);
        $artifactid = artifact_identity::for_course_module((int) $cm->id);
        $states = $this->repository->find_states_for_activity((int) $scaffold->id, $artifactid, $userid);
        $snapshot = isset($states[$userid])
            ? $states[$userid]->snapshot
            : (object) [
                'snapshotVersion' => 1,
                'artifactId' => $artifactid,
                'problems' => (object) [],
                'quizzes' => (object) [],
            ];
        $attempt = $this->quiz->reveal_state($snapshot, $projection['groups'], $attemptid, $groupid);
        return [
            'outcome' => (object) ['quizAttempt' => $attempt, 'problemsByTargetId' => (object) []],
            'gradePublication' => null,
        ];
    }

    /**
     * Mutates quiz.
     *
     * @param \stdClass $scaffold Scaffold.
     * @param \cm_info $cm Moodle course module.
     * @param int $userid User ID.
     * @param array $projection Projection.
     * @param string $groupid Assessment group ID.
     * @param callable $mutation Mutation.
     * @return array
     */
    private function mutate_quiz(
        \stdClass $scaffold,
        \cm_info $cm,
        int $userid,
        array $projection,
        string $groupid,
        callable $mutation,
    ): array {
        $artifactid = artifact_identity::for_course_module((int) $cm->id);
        $isgraded = self::quiz_group_is_graded($projection['groups'], $groupid);
        if ($isgraded) {
            $state = $this->repository->mutate_with_grade_publication_state(
                (int) $scaffold->id,
                $userid,
                $artifactid,
                $mutation,
            );
        } else {
            $state = $this->repository->mutate_state(
                (int) $scaffold->id,
                $userid,
                $artifactid,
                $mutation,
            );
        }
        $publication = $this->after_commit(
            $scaffold,
            $cm,
            $userid,
            $artifactid,
            $state->changed,
            $isgraded,
        );
        return ['state' => $state, 'gradePublication' => $publication];
    }

    /**
     * Returns quiz result.
     *
     * @param array $result Result.
     * @param \stdClass|null $attempt Attempt.
     * @param array $group Group.
     * @param array $targetids Targetids.
     * @return array
     */
    private function quiz_result(
        array $result,
        ?\stdClass $attempt,
        array $group,
        array $targetids,
    ): array {
        if (!($attempt instanceof \stdClass)) {
            throw new \RuntimeException('Quiz command did not resolve a canonical attempt');
        }
        $groupid = $group['groupId'];
        $storedattempt = $result['state']->snapshot->quizzes->{$groupid} ?? null;
        if (!($storedattempt instanceof \stdClass)) {
            throw new \RuntimeException('Quiz command did not retain a canonical attempt');
        }
        $attempt = assessment_quiz::public_attempt($storedattempt, $group);
        $problems = assessment_quiz::public_problems_by_target_id(
            $result['state']->snapshot->problems,
            $targetids,
            $group,
            $storedattempt,
        );
        return [
            'outcome' => (object) [
                'quizAttempt' => $attempt,
                'problemsByTargetId' => $problems,
            ],
            'gradePublication' => $result['gradePublication'],
        ];
    }

    /**
     * Checks whether quiz group is graded.
     *
     * @param array $groups Groups.
     * @param string $groupid Assessment group ID.
     * @return bool
     */
    private static function quiz_group_is_graded(array $groups, string $groupid): bool {
        $group = self::quiz_group_by_id($groups, $groupid);
        return ($group['settings']['isGraded'] ?? true) === true;
    }

    /**
     * Returns quiz group by ID.
     *
     * @param array $groups Groups.
     * @param string $groupid Assessment group ID.
     * @return array
     */
    private static function quiz_group_by_id(array $groups, string $groupid): array {
        foreach ($groups as $group) {
            if (($group['kind'] ?? null) === 'quiz' && ($group['groupId'] ?? null) === $groupid) {
                return $group;
            }
        }
        throw new \moodle_exception('quizgroupnotfound', 'scaffold');
    }

    /**
     * Applies attempt.
     *
     * @param \stdClass $scaffold Scaffold.
     * @param \cm_info $cm Moodle course module.
     * @param int $userid User ID.
     * @param string $problemid Runtime problem ID.
     * @param string $targetid Assessment target ID.
     * @param string $interactionkind Interactionkind.
     * @param array $response Response.
     * @param int|null $expectedattemptnumber Expectedattemptnumber.
     * @param string $action Action.
     * @return array
     */
    private function apply_attempt(
        \stdClass $scaffold,
        \cm_info $cm,
        int $userid,
        string $problemid,
        string $targetid,
        string $interactionkind,
        array $response,
        ?int $expectedattemptnumber,
        string $action,
    ): array {
        if (!in_array($action, ['check', 'submit'], true)) {
            throw new \invalid_parameter_exception('Unknown standalone assessment action');
        }
        if ($expectedattemptnumber !== null && $expectedattemptnumber < 0) {
            throw new \invalid_parameter_exception('expectedAttemptNumber must be non-negative');
        }

        $projection = assessment_projection::for_activity($scaffold);
        $target = self::target_for_request(
            $projection,
            (int) $cm->id,
            $problemid,
            $targetid,
            $interactionkind,
        );
        json_schema_validator::validate_plugin_definition('AssessmentResponseValue', $response, 'response');
        if (($response['kind'] ?? null) !== ($target['interaction']['kind'] ?? null)) {
            throw new \invalid_parameter_exception('Response kind does not match problem');
        }
        $this->reconcile_expiry($scaffold, $cm, $userid);

        $settings = is_array($target['settings'] ?? null) ? $target['settings'] : [];
        $isgraded = array_key_exists('isGraded', $settings) ? (bool) $settings['isGraded'] : true;
        $maxattempts = self::positive_int_or_null($settings['maxAttempts'] ?? null);
        $artifactid = artifact_identity::for_course_module((int) $cm->id);
        $mutation = function (\stdClass $snapshot) use (
            $action,
            $expectedattemptnumber,
            $maxattempts,
            $response,
            $settings,
            $target,
            $targetid,
        ): \stdClass {
            $problem = property_exists($snapshot->problems, $targetid)
                ? $snapshot->problems->{$targetid}
                : null;
            $attempts = self::problem_attempts($problem);
            if ($expectedattemptnumber !== null && $expectedattemptnumber < $attempts) {
                return $snapshot;
            }
            if ($expectedattemptnumber !== null && $expectedattemptnumber > $attempts) {
                throw new \invalid_parameter_exception(
                    'expectedAttemptNumber is ahead of stored assessment state',
                );
            }
            if ($action === 'check' && ($settings['feedbackMode'] ?? null) !== 'immediate') {
                throw new \moodle_exception('checkrequiresimmediatefeedback', 'scaffold');
            }
            if ($maxattempts !== null && $attempts >= $maxattempts) {
                throw new \moodle_exception('maximumattemptsexceeded', 'scaffold');
            }

            $gradedresult = ($this->grader)($target, $response);
            if (!is_array($gradedresult)) {
                throw new \moodle_exception('assessmentresponseungradable', 'scaffold');
            }
            if (is_array($gradedresult['items'] ?? null)) {
                $gradedresult['items'] = (object) $gradedresult['items'];
            }
            $result = (object) $gradedresult;
            json_schema_validator::validate_plugin_definition('AssessmentResult', $result, 'result');

            $submit = $action === 'submit';
            $snapshot->problems->{$targetid} = (object) [
                'response' => (object) $response,
                'submitted' => $submit || ($problem instanceof \stdClass && ($problem->submitted ?? false) === true),
                'attemptNumber' => $attempts + 1,
                'hintsShown' => self::problem_hints($problem),
                'checkResult' => $action === 'check'
                    ? $result
                    : ($problem instanceof \stdClass ? ($problem->checkResult ?? null) : null),
                'submissionResult' => $submit
                    ? $result
                    : ($problem instanceof \stdClass ? ($problem->submissionResult ?? null) : null),
            ];
            return $snapshot;
        };

        if ($isgraded) {
            $state = $this->repository->mutate_with_grade_publication_state(
                (int) $scaffold->id,
                $userid,
                $artifactid,
                $mutation,
            );
        } else {
            $state = $this->repository->mutate_state(
                (int) $scaffold->id,
                $userid,
                $artifactid,
                $mutation,
            );
        }

        $publication = $this->after_commit($scaffold, $cm, $userid, $artifactid, $state->changed, $isgraded);
        return [
            'outcome' => (object) [
                'problem' => assessment_public_projection::problem(
                    $state->snapshot->problems->{$targetid},
                    $target,
                ),
            ],
            'gradePublication' => $publication,
        ];
    }

    /**
     * Reveals hint for.
     *
     * @param \stdClass $scaffold Scaffold.
     * @param \cm_info $cm Moodle course module.
     * @param int $userid User ID.
     * @param string $problemid Runtime problem ID.
     * @param string $targetid Assessment target ID.
     * @param string $interactionkind Interactionkind.
     * @param int $hintsshown Hintsshown.
     * @return array
     */
    private function reveal_hint_for(
        \stdClass $scaffold,
        \cm_info $cm,
        int $userid,
        string $problemid,
        string $targetid,
        string $interactionkind,
        int $hintsshown,
    ): array {
        if ($hintsshown < 1) {
            throw new \invalid_parameter_exception('hintsShown must be a positive integer');
        }
        $projection = assessment_projection::for_activity($scaffold);
        $target = self::target_for_request(
            $projection,
            (int) $cm->id,
            $problemid,
            $targetid,
            $interactionkind,
        );
        $this->reconcile_expiry($scaffold, $cm, $userid);
        $hintlimit = self::hint_limit($scaffold, $targetid);
        $artifactid = artifact_identity::for_course_module((int) $cm->id);
        $state = $this->repository->mutate_state(
            (int) $scaffold->id,
            $userid,
            $artifactid,
            static function (\stdClass $snapshot) use ($hintlimit, $hintsshown, $targetid): \stdClass {
                $problem = property_exists($snapshot->problems, $targetid)
                    ? $snapshot->problems->{$targetid}
                    : null;
                $current = self::problem_hints($problem);
                if ($hintsshown <= $current) {
                    return $snapshot;
                }
                if ($hintsshown !== $current + 1) {
                    throw new \invalid_parameter_exception('hintsShown cannot skip unrevealed hints');
                }
                if ($hintsshown > $hintlimit) {
                    throw new \moodle_exception('hintreveallimitexceeded', 'scaffold');
                }

                $snapshot->problems->{$targetid} = self::problem_with_hints($problem, $hintsshown);
                return $snapshot;
            },
        );

        return [
            'outcome' => (object) [
                'problem' => assessment_public_projection::problem(
                    $state->snapshot->problems->{$targetid},
                    $target,
                ),
            ],
            'gradePublication' => null,
        ];
    }

    /**
     * Reconciles expiry.
     *
     * @param \stdClass $scaffold Scaffold.
     * @param \cm_info $cm Moodle course module.
     * @param int $userid User ID.
     */
    private function reconcile_expiry(\stdClass $scaffold, \cm_info $cm, int $userid): void {
        ($this->quizexpiryreconciler ?? new quiz_expiry_reconciler())->reconcile_user_and_apply_effects(
            $scaffold,
            $cm,
            $userid,
            artifact_identity::for_course_module((int) $cm->id),
        );
    }

    /**
     * Runs a callback after the database transaction commits.
     *
     * @param \stdClass $scaffold Scaffold.
     * @param \cm_info $cm Moodle course module.
     * @param int $userid User ID.
     * @param string $artifactid Scaffold artifact ID.
     * @param bool $changed Whether state changed.
     * @param bool $publishgrade Publishgrade.
     * @return \stdClass|null
     */
    private function after_commit(
        \stdClass $scaffold,
        \cm_info $cm,
        int $userid,
        string $artifactid,
        bool $changed,
        bool $publishgrade,
    ): ?\stdClass {
        if (!$changed) {
            return null;
        }
        if (!empty($scaffold->completionactivitystatus)) {
            try {
                ($this->completionupdater)($scaffold, $cm, $userid);
            } catch (\Throwable) {
                debugging(
                    'Scaffold completion update failed after the assessment state was committed.',
                    DEBUG_DEVELOPER,
                );
            }
        }
        if (!$publishgrade) {
            return null;
        }
        try {
            $publication = ($this->gradepublisher)($scaffold, $userid, $artifactid);
            return $publication instanceof \stdClass ? $publication : null;
        } catch (\Throwable) {
            return (object) ['status' => 'pending'];
        }
    }

    /**
     * Requires submit scope.
     *
     * @param activity_scope $scope Scope.
     */
    private function require_submit_scope(activity_scope $scope): void {
        if ($scope->capability !== 'mod/scaffold:submit') {
            throw new \invalid_parameter_exception('Assessment command is not authorized by activity scope');
        }
    }

    /**
     * Returns target for request.
     *
     * @param array $projection Projection.
     * @param int $cmid Course module ID.
     * @param string $problemid Runtime problem ID.
     * @param string $targetid Assessment target ID.
     * @param string $interactionkind Interactionkind.
     * @return array
     */
    private static function target_for_request(
        array $projection,
        int $cmid,
        string $problemid,
        string $targetid,
        string $interactionkind,
    ): array {
        $assessmentid = self::assessment_id_from_problem_id($problemid, $cmid);
        if ($assessmentid === null || $assessmentid !== $targetid) {
            throw new \invalid_parameter_exception('targetId does not match problem');
        }
        foreach ($projection['targets'] as $target) {
            if (($target['targetId'] ?? null) !== $targetid) {
                continue;
            }
            if (($target['interaction']['kind'] ?? null) !== $interactionkind) {
                throw new \invalid_parameter_exception('interactionKind does not match problem');
            }
            $ownership = assessment_group_validator::quiz_group_id_by_target_id($projection['groups']);
            if (isset($ownership[$targetid])) {
                throw new \moodle_exception('quiztargetrequiresquizattempt', 'scaffold');
            }
            return $target;
        }
        throw new \moodle_exception('problemnotfound', 'scaffold');
    }

    /**
     * Returns assessment ID from problem ID.
     *
     * @param string $problemid Runtime problem ID.
     * @param int $cmid Course module ID.
     * @return string|null
     */
    private static function assessment_id_from_problem_id(string $problemid, int $cmid): ?string {
        $marker = '/block:';
        $pos = strrpos($problemid, $marker);
        if ($pos === false) {
            return null;
        }
        $artifact = substr($problemid, 0, $pos);
        $block = trim(substr($problemid, $pos + strlen($marker)));
        if ($artifact !== 'artifact:' . artifact_identity::for_course_module($cmid)) {
            return null;
        }
        return $block !== '' ? $block : null;
    }

    /**
     * Returns problem attempts.
     *
     * @param \stdClass|null $problem Problem.
     * @return int
     */
    private static function problem_attempts(?\stdClass $problem): int {
        return $problem instanceof \stdClass ? max(0, (int) ($problem->attemptNumber ?? 0)) : 0;
    }

    /**
     * Returns problem hints.
     *
     * @param \stdClass|null $problem Problem.
     * @return int
     */
    private static function problem_hints(?\stdClass $problem): int {
        return $problem instanceof \stdClass ? max(0, (int) ($problem->hintsShown ?? 0)) : 0;
    }

    /**
     * Returns problem with hints.
     *
     * @param \stdClass|null $problem Problem.
     * @param int $hintsshown Hintsshown.
     * @return \stdClass
     */
    private static function problem_with_hints(?\stdClass $problem, int $hintsshown): \stdClass {
        return (object) [
            'response' => $problem instanceof \stdClass ? ($problem->response ?? null) : null,
            'submitted' => $problem instanceof \stdClass && ($problem->submitted ?? false) === true,
            'attemptNumber' => self::problem_attempts($problem),
            'hintsShown' => $hintsshown,
            'checkResult' => $problem instanceof \stdClass ? ($problem->checkResult ?? null) : null,
            'submissionResult' => $problem instanceof \stdClass ? ($problem->submissionResult ?? null) : null,
        ];
    }

    /**
     * Checks whether problem authorizes answer reveal.
     *
     * @param \stdClass|null $problem Problem.
     * @return bool
     */
    private static function problem_authorizes_answer_reveal(?\stdClass $problem): bool {
        if (!($problem instanceof \stdClass) || ($problem->submitted ?? null) !== true) {
            return false;
        }

        $submissionresult = $problem->submissionResult ?? null;
        return $submissionresult instanceof \stdClass && ($submissionresult->isCorrect ?? null) === false;
    }

    /**
     * Returns hint limit.
     *
     * @param \stdClass $scaffold Scaffold.
     * @param string $targetid Assessment target ID.
     * @return int
     */
    private static function hint_limit(\stdClass $scaffold, string $targetid): int {
        $content = content_service::read_json_nullable_object((string) ($scaffold->learnercontentjson ?? 'null'));
        $target = $content === null ? null : self::content_node_by_id($content, $targetid);
        if ($target === null) {
            throw new \moodle_exception('assessmenthintcontentnotfound', 'scaffold');
        }
        return self::count_content_nodes_by_type($target, 'assessment_hint');
    }

    /**
     * Returns content node by ID.
     *
     * @param array $node Node.
     * @param string $targetid Assessment target ID.
     * @return array|null
     */
    private static function content_node_by_id(array $node, string $targetid): ?array {
        if (!array_is_list($node) && ($node['attrs']['id'] ?? null) === $targetid) {
            return $node;
        }
        $children = !array_is_list($node) && is_array($node['content'] ?? null) ? $node['content'] : [];
        foreach ($children as $child) {
            if (is_array($child)) {
                $match = self::content_node_by_id($child, $targetid);
                if ($match !== null) {
                    return $match;
                }
            }
        }
        return null;
    }

    /**
     * Counts content nodes by type.
     *
     * @param array $node Node.
     * @param string $type Type.
     * @return int
     */
    private static function count_content_nodes_by_type(array $node, string $type): int {
        $count = !array_is_list($node) && ($node['type'] ?? null) === $type ? 1 : 0;
        $children = !array_is_list($node) && is_array($node['content'] ?? null) ? $node['content'] : [];
        foreach ($children as $child) {
            if (is_array($child)) {
                $count += self::count_content_nodes_by_type($child, $type);
            }
        }
        return $count;
    }

    /**
     * Returns positive int or null.
     *
     * @param mixed $value Value.
     * @return int|null
     */
    private static function positive_int_or_null(mixed $value): ?int {
        if ($value === null) {
            return null;
        }
        if (!is_int($value) || $value < 1) {
            throw new \invalid_parameter_exception('Stored maximum attempts is invalid');
        }
        return $value;
    }
}
