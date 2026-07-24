<?php
// This file is part of Scaffold - https://scaffold.ac/
//
// Scaffold is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, version 3 of the License.

namespace mod_scaffold;

use mod_scaffold\local\assessment_group_validator;
use mod_scaffold\local\assessment_target_validator;
use mod_scaffold\local\json_schema_validator;

defined('MOODLE_INTERNAL') || die();

/**
 * Tests canonical assessment contracts and collection boundaries.
 *
 * @covers \mod_scaffold\local\assessment_group_validator
 * @covers \mod_scaffold\local\assessment_target_validator
 * @covers \mod_scaffold\local\json_schema_validator
 */
final class assessment_contract_test extends \advanced_testcase {
    public function test_target_contract_accepts_canonical_target(): void {
        (new json_schema_validator())->validate_definition(
            'AssessmentTargetContract',
            $this->target(),
        );
        $this->addToAssertionCount(1);
    }

    /**
     * @dataProvider invalid_target_provider
     */
    public function test_target_contract_rejects_invalid_shape(string $mutation): void {
        $target = $this->target();
        match ($mutation) {
            'removed setting' => $target->settings->isRequired = true,
            'unknown target field' => $target->hostMaximum = 100,
            'unknown interaction field' => $target->interaction->provider = 'host',
            'unknown option field' => $target->interaction->options[0]->providerPayload = new \stdClass(),
            'unknown answer field' => $target->assessment->hostItemId = 'item-1',
            'answer kind mismatch' => $target->assessment->kind = 'multi-select',
        };

        $this->assert_contract_rejected('AssessmentTargetContract', $target);
    }

    public static function invalid_target_provider(): array {
        return [
            'removed setting' => ['removed setting'],
            'unknown target field' => ['unknown target field'],
            'unknown interaction field' => ['unknown interaction field'],
            'unknown option field' => ['unknown option field'],
            'unknown answer field' => ['unknown answer field'],
            'answer kind mismatch' => ['answer kind mismatch'],
        ];
    }

    public function test_group_contract_accepts_canonical_group_and_rejects_duplicates(): void {
        $validator = new json_schema_validator();
        $group = $this->group();
        $validator->validate_definition('AssessmentGroupContract', $group);
        $this->addToAssertionCount(1);

        $group->targetIds = ['question-1', 'question-1'];
        $this->assert_contract_rejected('AssessmentGroupContract', $group, $validator);
    }

    public function test_response_contract_requires_an_object(): void {
        $validator = new json_schema_validator();
        $validator->validate_definition(
            'AssessmentResponseValue',
            $this->decode('{"kind":"single-select","optionId":"option-a"}'),
        );
        $this->addToAssertionCount(1);
        $this->assert_contract_rejected('AssessmentResponseValue', [], $validator);
    }

    /**
     * @dataProvider nonfinite_score_provider
     */
    public function test_result_contract_rejects_nonfinite_score(float $score): void {
        $result = $this->decode(
            '{"isCorrect":true,"score":1,"maxScore":1,"feedback":null,"items":{}}',
        );
        $result->score = $score;

        $this->assert_contract_rejected('AssessmentResult', $result);
    }

    public static function nonfinite_score_provider(): array {
        return [
            'infinite' => [INF],
            'not a number' => [NAN],
        ];
    }

    public function test_result_contract_accepts_canonical_result(): void {
        (new json_schema_validator())->validate_definition(
            'AssessmentResult',
            $this->decode(
                '{"isCorrect":true,"score":1,"maxScore":1,"feedback":null,"items":{}}',
            ),
        );
        $this->addToAssertionCount(1);
    }

    public function test_grade_projection_contract_couples_status_score_and_timestamp(): void {
        $validator = new json_schema_validator();
        $projection = $this->decode(<<<'JSON'
{
  "normalizedScore": 0.75,
  "activityStatus": "completed",
  "gradingStatus": "graded",
  "changedAt": "2026-07-15T11:00:00.456+01:00"
}
JSON);
        $validator->validate_definition('AssessmentGradeProjection', $projection);
        $this->addToAssertionCount(1);

        $noscore = $this->copy($projection);
        $noscore->normalizedScore = null;
        $this->assert_contract_rejected('AssessmentGradeProjection', $noscore, $validator);

        $noncanonicaltime = $this->copy($projection);
        $noncanonicaltime->changedAt = '2026-07-15T11:00:00Z';
        $this->assert_contract_rejected(
            'AssessmentGradeProjection',
            $noncanonicaltime,
            $validator,
        );
    }

    public function test_problem_contract_couples_submission_and_result(): void {
        $validator = new json_schema_validator();
        $problem = $this->empty_problem();
        $validator->validate_definition('AssessmentProblemSnapshot', $problem);
        $this->addToAssertionCount(1);

        $problem->submitted = true;
        $this->assert_contract_rejected('AssessmentProblemSnapshot', $problem, $validator);
    }

    public function test_quiz_snapshot_contract_couples_score_and_unique_targets(): void {
        $validator = new json_schema_validator();
        $quiz = $this->quiz_snapshot();
        $validator->validate_definition('QuizAttemptSnapshot', $quiz);
        $this->addToAssertionCount(1);

        $scorewithoutmaximum = $this->copy($quiz);
        $scorewithoutmaximum->score = 1;
        $this->assert_contract_rejected(
            'QuizAttemptSnapshot',
            $scorewithoutmaximum,
            $validator,
        );

        $duplicatetarget = $this->copy($quiz);
        $duplicatetarget->submittedTargetIds = ['question-1', 'question-1'];
        $this->assert_contract_rejected(
            'QuizAttemptSnapshot',
            $duplicatetarget,
            $validator,
        );
    }

    public function test_learner_snapshot_uses_local_identity_free_keys(): void {
        $validator = new json_schema_validator();
        $snapshot = (object) [
            'snapshotVersion' => 1,
            'artifactId' => 'artifact-1',
            'problems' => (object) ['question-1' => $this->empty_problem()],
            'quizzes' => (object) ['quiz-1' => $this->quiz_snapshot()],
        ];
        $validator->validate_definition('AssessmentLearnerSnapshot', $snapshot);
        $this->addToAssertionCount(1);

        $compositekey = $this->copy($snapshot);
        $compositekey->problems = (object) [
            'artifact:artifact-1/block:question-1' => $this->empty_problem(),
        ];
        $this->assert_contract_rejected(
            'AssessmentLearnerSnapshot',
            $compositekey,
            $validator,
        );

        $storedgroupid = $this->copy($snapshot);
        $storedgroupid->quizzes->{'quiz-1'}->groupId = 'quiz-1';
        $this->assert_contract_rejected(
            'AssessmentLearnerSnapshot',
            $storedgroupid,
            $validator,
        );
    }

    /**
     * @dataProvider invalid_schema_resource_provider
     */
    public function test_schema_loader_rejects_invalid_resources(string $schemajson): void {
        $path = make_request_directory() . '/assessment.schema.json';
        file_put_contents($path, $schemajson);

        $this->expectException(\invalid_parameter_exception::class);
        new json_schema_validator($path);
    }

    public static function invalid_schema_resource_provider(): array {
        return [
            'unsupported keyword' => ['{"definitions":{"Invalid":{"oneOf":[]}}}'],
            'invalid JSON' => ['{'],
        ];
    }

    public function test_schema_loader_rejects_missing_resource_without_warning(): void {
        set_error_handler(
            static function(int $severity, string $message): bool {
                if ((error_reporting() & $severity) === 0) {
                    return false;
                }
                throw new \ErrorException($message, 0, $severity);
            },
        );
        try {
            new json_schema_validator(
                make_request_directory() . '/missing-assessment.schema.json',
            );
            $this->fail('Missing schema resource was accepted');
        } catch (\invalid_parameter_exception) {
            $this->addToAssertionCount(1);
        } finally {
            restore_error_handler();
        }
    }

    public function test_schema_validator_rejects_unknown_definition(): void {
        $this->expectException(\invalid_parameter_exception::class);
        (new json_schema_validator())->validate_definition('MissingDefinition', null);
    }

    public function test_target_boundary_preserves_values_and_rejects_duplicate_id(): void {
        $first = $this->target();
        $second = $this->copy($first);
        $second->targetId = 'question-2';
        $second->blockId = 'block-2';

        $validated = assessment_target_validator::validate_targets([$first, $second]);
        $this->assertSame([$first, $second], $validated);

        $duplicate = $this->copy($first);
        $duplicate->blockId = 'duplicate-block';
        try {
            assessment_target_validator::validate_targets([$first, $duplicate]);
            $this->fail('Duplicate targetId was accepted');
        } catch (\invalid_parameter_exception) {
            $this->addToAssertionCount(1);
        }
    }

    public function test_group_boundary_preserves_values_and_rejects_invalid_ownership(): void {
        $firsttarget = $this->target();
        $secondtarget = $this->copy($firsttarget);
        $secondtarget->targetId = 'question-2';
        $secondtarget->blockId = 'block-2';
        $targets = [$firsttarget, $secondtarget];
        $group = $this->group();

        $this->assertSame(
            [$group],
            assessment_group_validator::validate_groups([$group], $targets),
        );

        $duplicateid = $this->copy($group);
        $duplicateid->targetIds = ['question-2'];
        $this->assert_group_rejected([$group, $duplicateid], $targets);

        $missingtarget = $this->copy($group);
        $missingtarget->targetIds = ['question-1', 'missing-target'];
        $this->assert_group_rejected([$missingtarget], $targets);

        $overlapping = $this->copy($group);
        $overlapping->groupId = 'quiz-2';
        $overlapping->targetIds = ['question-1'];
        $this->assert_group_rejected([$group, $overlapping], $targets);
    }

    private function assert_contract_rejected(
        string $definition,
        mixed $value,
        ?json_schema_validator $validator = null,
    ): void {
        try {
            ($validator ?? new json_schema_validator())->validate_definition(
                $definition,
                $value,
            );
            $this->fail('Assessment contract unexpectedly accepted invalid input');
        } catch (\invalid_parameter_exception) {
            $this->addToAssertionCount(1);
        }
    }

    private function assert_group_rejected(array $groups, array $targets): void {
        try {
            assessment_group_validator::validate_groups($groups, $targets);
            $this->fail('Assessment group boundary unexpectedly accepted invalid input');
        } catch (\invalid_parameter_exception) {
            $this->addToAssertionCount(1);
        }
    }

    private function target(): \stdClass {
        return $this->decode(<<<'JSON'
{
  "schemaVersion": 1,
  "targetId": "question-1",
  "blockId": "block-1",
  "blockType": "mcq",
  "interaction": {
    "kind": "single-select",
    "options": [{"id": "option-a"}, {"id": "option-b"}]
  },
  "assessment": {
    "kind": "single-select",
    "correctOptionId": "option-b",
    "feedbackByOptionId": {}
  },
  "settings": {
    "feedbackMode": "on_submit",
    "isGraded": true,
    "showAnswer": true,
    "points": 1,
    "maxAttempts": null
  }
}
JSON);
    }

    private function group(): \stdClass {
        return $this->decode(<<<'JSON'
{
  "schemaVersion": 1,
  "kind": "quiz",
  "groupId": "quiz-1",
  "targetIds": ["question-1", "question-2"],
  "settings": {
    "allowBacktracking": true,
    "reviewTiming": "after_quiz",
    "reviewDetail": "result_only",
    "attemptsPerQuestion": 1,
    "isGraded": true,
    "timer": {"enabled": false, "durationSeconds": 0}
  }
}
JSON);
    }

    private function empty_problem(): \stdClass {
        return $this->decode(<<<'JSON'
{
  "response": null,
  "submitted": false,
  "attemptNumber": 0,
  "hintsShown": 0,
  "checkResult": null,
  "submissionResult": null
}
JSON);
    }

    private function quiz_snapshot(): \stdClass {
        return $this->decode(<<<'JSON'
{
  "attemptId": "attempt-1",
  "status": "in_progress",
  "currentTargetId": "question-1",
  "submittedTargetIds": [],
  "startedAt": "2026-07-15T12:00:00Z",
  "finishedAt": null,
  "expiresAt": null,
  "score": null,
  "maxScore": null,
  "resultsByTargetId": {},
  "answerReviewAuthorized": false
}
JSON);
    }

    private function copy(mixed $value): mixed {
        return json_decode(
            json_encode($value, JSON_THROW_ON_ERROR),
            false,
            512,
            JSON_THROW_ON_ERROR,
        );
    }

    private function decode(string $json): \stdClass {
        $value = json_decode($json, false, 512, JSON_THROW_ON_ERROR);
        if (!($value instanceof \stdClass)) {
            throw new \RuntimeException('Expected object fixture');
        }
        return $value;
    }
}
