<?php
// This file is part of Scaffold - https://scaffold.ac/
//
// Scaffold is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, version 3 of the License.

namespace mod_scaffold\local;

defined('MOODLE_INTERNAL') || die();

require_once(__DIR__ . '/assessment_result_projection.php');

class assessment_quiz {
    private $clock;
    private $attemptidfactory;
    private $grader;

    public function __construct(
        ?callable $clock = null,
        ?callable $attemptidfactory = null,
        ?callable $grader = null,
    ) {
        $this->clock = $clock ?? static function(): string {
            $now = microtime(true);
            $seconds = (int) floor($now);
            $micros = (int) floor(($now - $seconds) * 1000000);
            return gmdate('Y-m-d\TH:i:s', $seconds) . sprintf('.%06dZ', $micros);
        };
        $this->attemptidfactory = $attemptidfactory ?? static fn(string $groupid): string =>
            $groupid . '-' . bin2hex(random_bytes(16));
        $this->grader = $grader ?? static fn(array $target, array $response): array =>
            grader::grade_assessment($target, $response);
    }

    public function start_state(\stdClass $snapshot, array $targets, array $groups, string $groupid): \stdClass {
        $group = self::group_by_id($groups, $groupid);
        $existing = property_exists($snapshot->quizzes, $groupid) ? $snapshot->quizzes->{$groupid} : null;
        if ($existing instanceof \stdClass) {
            return self::public_attempt($existing, $group);
        }

        $startedat = ($this->clock)();
        $settings = $group['settings'];
        $expiresat = null;
        if ($settings['timer']['enabled'] && $settings['timer']['durationSeconds'] > 0) {
            $expiresat = (new \DateTimeImmutable($startedat))
                ->modify('+' . $settings['timer']['durationSeconds'] . ' seconds')
                ->format('Y-m-d\TH:i:s.u\Z');
        }
        $attempt = (object) [
            'attemptId' => ($this->attemptidfactory)($groupid),
            'status' => 'in_progress',
            'currentTargetId' => $group['targetIds'][0],
            'submittedTargetIds' => [],
            'startedAt' => $startedat,
            'finishedAt' => null,
            'expiresAt' => $expiresat,
            'score' => null,
            'maxScore' => null,
            'resultsByTargetId' => (object) [],
            'answerReviewAuthorized' => false,
        ];
        $snapshot->quizzes->{$groupid} = $attempt;
        return self::public_attempt($attempt, $group);
    }

    public function submit_question_state(
        \stdClass $snapshot,
        array $targets,
        array $groups,
        string $attemptid,
        string $groupid,
        string $targetid,
        array $response,
        ?int $expectedattemptnumber,
    ): \stdClass {
        $group = self::group_by_id($groups, $groupid);
        if ($group['settings']['reviewTiming'] !== 'after_each_answer') {
            throw new \moodle_exception('quiz question submission requires after_each_answer timing', 'scaffold');
        }
        $target = self::target_for_response($targets, $group, $targetid, $response);
        $attempt = self::attempt_for_request($snapshot, $groupid, $attemptid);
        $problem = property_exists($snapshot->problems, $targetid) ? $snapshot->problems->{$targetid} : null;
        $attemptnumber = $problem instanceof \stdClass
            ? max(0, (int) ($problem->attemptNumber ?? 0))
            : 0;
        if ($expectedattemptnumber !== null && $expectedattemptnumber < 0) {
            throw new \invalid_parameter_exception('expectedAttemptNumber must be non-negative');
        }
        if ($expectedattemptnumber !== null && $expectedattemptnumber < $attemptnumber) {
            return self::public_attempt($attempt, $group);
        }
        if ($expectedattemptnumber !== null && $expectedattemptnumber > $attemptnumber) {
            throw new \invalid_parameter_exception('expectedAttemptNumber is ahead of stored assessment state');
        }
        if ($attempt->status !== 'in_progress') {
            return self::public_attempt($attempt, $group);
        }
        if ($this->is_expired($attempt->expiresAt)) {
            self::finalize_attempt($attempt, $group, 'expired', ($this->clock)());
            return self::public_attempt($attempt, $group);
        }
        if ($attempt->currentTargetId !== $targetid) {
            throw new \moodle_exception('quiz current question is ' . $attempt->currentTargetId, 'scaffold');
        }
        if ($attemptnumber >= $group['settings']['attemptsPerQuestion']) {
            throw new \moodle_exception('maximum attempts exceeded', 'scaffold');
        }

        $result = $this->grade_result($target, $response);
        self::store_problem($snapshot, $targetid, $response, $result, $attemptnumber + 1);
        $attempt->resultsByTargetId->{$targetid} = $result;
        $attempt->answerReviewAuthorized = self::review_is_authorized($group);
        $submitted = array_values(array_filter(
            $attempt->submittedTargetIds,
            static fn(mixed $value): bool => is_string($value),
        ));
        $staycurrent = $result->isCorrect !== true
            && $attemptnumber + 1 < $group['settings']['attemptsPerQuestion'];
        if (!$staycurrent && !in_array($targetid, $submitted, true)) {
            $submitted[] = $targetid;
        }
        $attempt->submittedTargetIds = $submitted;
        $attempt->currentTargetId = $staycurrent
            ? $targetid
            : self::first_unsubmitted($group['targetIds'], $submitted);
        if ($attempt->currentTargetId === null) {
            self::finalize_attempt($attempt, $group, 'completed', ($this->clock)());
        }
        return self::public_attempt($attempt, $group);
    }

    public function finish_state(
        \stdClass $snapshot,
        array $targets,
        array $groups,
        string $attemptid,
        string $groupid,
        array $responsesbytargetid,
    ): \stdClass {
        $group = self::group_by_id($groups, $groupid);
        $attempt = self::attempt_for_request($snapshot, $groupid, $attemptid);
        if ($attempt->status !== 'in_progress') {
            return self::public_attempt($attempt, $group);
        }
        if ($this->is_expired($attempt->expiresAt)) {
            self::finalize_attempt($attempt, $group, 'expired', ($this->clock)());
            return self::public_attempt($attempt, $group);
        }
        if ($group['settings']['reviewTiming'] === 'after_each_answer') {
            throw new \moodle_exception('quiz finish requires after_quiz timing or expired attempt', 'scaffold');
        }
        foreach ($responsesbytargetid as $targetid => $response) {
            if (!is_string($targetid) || !in_array($targetid, $group['targetIds'], true)) {
                throw new \invalid_parameter_exception('responsesByTargetId contains unknown target');
            }
            if (!is_array($response)) {
                throw new \invalid_parameter_exception('responsesByTargetId values must be objects');
            }
            self::target_for_response($targets, $group, $targetid, $response);
        }
        if (count($responsesbytargetid) !== count($group['targetIds'])) {
            throw new \invalid_parameter_exception('responsesByTargetId must include every quiz target');
        }

        $attempt->resultsByTargetId = (object) [];
        $attempt->submittedTargetIds = [];
        foreach ($group['targetIds'] as $targetid) {
            if (!array_key_exists($targetid, $responsesbytargetid)) {
                continue;
            }
            $response = $responsesbytargetid[$targetid];
            $target = self::target_for_response($targets, $group, $targetid, $response);
            $result = $this->grade_result($target, $response);
            $problem = property_exists($snapshot->problems, $targetid) ? $snapshot->problems->{$targetid} : null;
            $attemptnumber = $problem instanceof \stdClass
                ? max(0, (int) ($problem->attemptNumber ?? 0))
                : 0;
            self::store_problem($snapshot, $targetid, $response, $result, $attemptnumber + 1);
            $attempt->resultsByTargetId->{$targetid} = $result;
            $attempt->submittedTargetIds[] = $targetid;
        }
        self::finalize_attempt($attempt, $group, 'completed', ($this->clock)());
        return self::public_attempt($attempt, $group);
    }

    public function reveal_state(
        \stdClass $snapshot,
        array $groups,
        string $attemptid,
        string $groupid,
    ): \stdClass {
        $group = self::group_by_id($groups, $groupid);
        if ($group['settings']['reviewDetail'] !== 'full_review') {
            throw new \moodle_exception('quiz answer review disabled', 'scaffold');
        }
        $attempt = self::attempt_for_request($snapshot, $groupid, $attemptid);
        if (!in_array($attempt->status, ['completed', 'expired'], true)) {
            throw new \moodle_exception('quiz attempt is not complete', 'scaffold');
        }
        return self::public_attempt($attempt, $group, true);
    }

    /**
     * Finalizes every due in-progress Quiz in one caller-owned state mutation.
     *
     * @return string[] expired group IDs in snapshot order
     */
    public function expire_due_state(\stdClass $snapshot, array $groups, string $now): array {
        try {
            $servernow = new \DateTimeImmutable($now);
        } catch (\Throwable) {
            throw new \invalid_parameter_exception('Server Quiz reconciliation time is invalid');
        }

        $expired = [];
        foreach (get_object_vars($snapshot->quizzes ?? (object) []) as $groupid => $attempt) {
            if (!($attempt instanceof \stdClass) || ($attempt->status ?? null) !== 'in_progress') {
                continue;
            }
            $expiresat = $attempt->expiresAt ?? null;
            if ($expiresat === null) {
                continue;
            }
            if (!is_string($expiresat) || $expiresat === '') {
                throw new \invalid_parameter_exception('Stored Quiz expiry is invalid');
            }
            try {
                $deadline = new \DateTimeImmutable($expiresat);
            } catch (\Throwable) {
                throw new \invalid_parameter_exception('Stored Quiz expiry is invalid');
            }
            if ($deadline > $servernow) {
                continue;
            }

            $group = self::group_by_id($groups, $groupid);
            self::finalize_attempt($attempt, $group, 'expired', $now);
            $expired[] = $groupid;
        }
        return $expired;
    }

    private function is_expired(mixed $expiresat): bool {
        if (!is_string($expiresat) || $expiresat === '') {
            return false;
        }
        try {
            return new \DateTimeImmutable(($this->clock)()) >= new \DateTimeImmutable($expiresat);
        } catch (\Throwable) {
            throw new \invalid_parameter_exception('Stored Quiz expiry is invalid');
        }
    }

    private static function group_by_id(array $groups, string $groupid): array {
        foreach ($groups as $group) {
            if (($group['kind'] ?? null) === 'quiz' && ($group['groupId'] ?? null) === $groupid) {
                return $group;
            }
        }
        throw new \moodle_exception('quiz group not found', 'scaffold');
    }

    private static function attempt_for_request(
        \stdClass $snapshot,
        string $groupid,
        string $attemptid,
    ): \stdClass {
        $attempt = property_exists($snapshot->quizzes, $groupid)
            ? $snapshot->quizzes->{$groupid}
            : null;
        if (!($attempt instanceof \stdClass) || ($attempt->attemptId ?? null) !== $attemptid) {
            throw new \moodle_exception('quiz attempt is not latest', 'scaffold');
        }
        return $attempt;
    }

    private static function target_for_response(
        array $targets,
        array $group,
        string $targetid,
        array $response,
    ): array {
        if (!in_array($targetid, $group['targetIds'], true)) {
            throw new \invalid_parameter_exception('targetId does not match quiz');
        }
        $target = null;
        foreach ($targets as $candidate) {
            if (($candidate['targetId'] ?? null) === $targetid) {
                $target = $candidate;
                break;
            }
        }
        if ($target === null) {
            throw new \moodle_exception('problem not found', 'scaffold');
        }
        $responseobject = json_decode(json_encode($response, JSON_THROW_ON_ERROR));
        json_schema_validator::validate_plugin_definition(
            'AssessmentResponseValue',
            $responseobject,
            'response',
        );
        if (($response['kind'] ?? null) !== ($target['interaction']['kind'] ?? null)) {
            throw new \invalid_parameter_exception('interactionKind does not match problem');
        }
        return $target;
    }

    private function grade_result(array $target, array $response): \stdClass {
        $graded = ($this->grader)($target, $response);
        if (!is_array($graded)) {
            throw new \moodle_exception('assessment response is ungradable', 'scaffold');
        }
        if (is_array($graded['items'])) {
            $graded['items'] = (object) $graded['items'];
        }
        $result = (object) $graded;
        json_schema_validator::validate_plugin_definition(
            'AssessmentResult',
            $result,
            'result',
        );
        return $result;
    }

    private static function store_problem(
        \stdClass $snapshot,
        string $targetid,
        array $response,
        \stdClass $result,
        int $attemptnumber,
    ): void {
        $previous = property_exists($snapshot->problems, $targetid)
            ? $snapshot->problems->{$targetid}
            : null;
        $snapshot->problems->{$targetid} = (object) [
            'response' => json_decode(json_encode($response, JSON_THROW_ON_ERROR)),
            'submitted' => true,
            'attemptNumber' => $attemptnumber,
            'hintsShown' => $previous instanceof \stdClass
                ? max(0, (int) ($previous->hintsShown ?? 0))
                : 0,
            'checkResult' => $previous instanceof \stdClass
                ? ($previous->checkResult ?? null)
                : null,
            'submissionResult' => $result,
        ];
    }

    private static function first_unsubmitted(array $targetids, array $submitted): ?string {
        foreach ($targetids as $targetid) {
            if (!in_array($targetid, $submitted, true)) {
                return $targetid;
            }
        }
        return null;
    }

    private static function finalize_attempt(
        \stdClass $attempt,
        array $group,
        string $status,
        string $finishedat,
    ): void {
        $score = 0.0;
        foreach ($group['targetIds'] as $targetid) {
            if (property_exists($attempt->resultsByTargetId, $targetid)) {
                $score += (float) $attempt->resultsByTargetId->{$targetid}->score;
            }
        }
        $attempt->status = $status;
        $attempt->currentTargetId = null;
        $attempt->finishedAt = $finishedat;
        $attempt->score = $score;
        $attempt->maxScore = (float) count($group['targetIds']);
        $attempt->answerReviewAuthorized = self::review_is_authorized($group);
    }

    private static function review_is_authorized(array $group): bool {
        return ($group['settings']['reviewDetail'] ?? 'none') !== 'none';
    }

    public static function public_attempt(
        \stdClass $attempt,
        array $group,
        bool $authorizefullreview = false,
    ): \stdClass {
        $value = clone $attempt;
        $value->groupId = $group['groupId'];
        [$reviewdetail, $fullreviewauthorized] = self::public_review_policy(
            $attempt,
            $group,
            $authorizefullreview,
        );
        $value->answerReviewAuthorized = (bool) ($attempt->answerReviewAuthorized ?? false)
            || $fullreviewauthorized;
        if ($reviewdetail === 'none') {
            $value->resultsByTargetId = (object) [];
        } elseif (!$fullreviewauthorized) {
            $results = [];
            foreach (get_object_vars($attempt->resultsByTargetId ?? (object) []) as $targetid => $result) {
                if ($result instanceof \stdClass) {
                    $results[$targetid] = assessment_result_projection::result($result);
                }
            }
            $value->resultsByTargetId = (object) $results;
        } else {
            $value->resultsByTargetId = self::copy_object(
                $attempt->resultsByTargetId ?? (object) [],
            );
        }
        return $value;
    }

    public static function public_problems_by_target_id(
        \stdClass $problems,
        array $targetids,
        array $group,
        \stdClass $attempt,
    ): \stdClass {
        [$reviewdetail, $fullreviewauthorized] = self::public_review_policy($attempt, $group);
        $publicproblems = [];
        foreach ($targetids as $targetid) {
            if (!is_string($targetid) || !property_exists($problems, $targetid)) {
                continue;
            }
            $problem = $problems->{$targetid};
            if (!($problem instanceof \stdClass)) {
                continue;
            }
            $publicproblem = self::copy_object($problem);
            if ($reviewdetail === 'none') {
                $publicproblem->submitted = false;
                $publicproblem->checkResult = null;
                $publicproblem->submissionResult = null;
            } elseif (!$fullreviewauthorized) {
                foreach (['checkResult', 'submissionResult'] as $field) {
                    $result = $problem->{$field} ?? null;
                    $publicproblem->{$field} = $result instanceof \stdClass
                        ? assessment_result_projection::result($result)
                        : null;
                }
            }
            $publicproblems[$targetid] = $publicproblem;
        }
        return (object) $publicproblems;
    }

    private static function public_review_policy(
        \stdClass $attempt,
        array $group,
        bool $authorizefullreview = false,
    ): array {
        $reviewdetail = $group['settings']['reviewDetail'] ?? 'none';
        if (!in_array($reviewdetail, ['none', 'result_only', 'full_review'], true)) {
            $reviewdetail = 'none';
        }
        $isterminal = in_array($attempt->status ?? null, ['completed', 'expired'], true);
        $reviewauthorized = (bool) ($attempt->answerReviewAuthorized ?? false) || $authorizefullreview;
        return [
            $reviewdetail,
            $reviewdetail === 'full_review' && $isterminal && $reviewauthorized,
        ];
    }

    private static function copy_object(\stdClass $value): \stdClass {
        return json_decode(
            json_encode($value, JSON_THROW_ON_ERROR),
            false,
            512,
            JSON_THROW_ON_ERROR,
        );
    }
}
