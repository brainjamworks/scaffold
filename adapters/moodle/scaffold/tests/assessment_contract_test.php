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

namespace mod_scaffold;

use mod_scaffold\local\assessment_group_validator;
use mod_scaffold\local\assessment_target_validator;
use mod_scaffold\local\json_schema_validator;


/**
 * Tests canonical assessment contracts and collection boundaries.
 *
 * @package    mod_scaffold
 * @copyright  2026 Rizvan Ali
 * @license    https://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 *
 * @covers \mod_scaffold\local\assessment_group_validator
 * @covers \mod_scaffold\local\assessment_target_validator
 * @covers \mod_scaffold\local\json_schema_validator
 */
final class assessment_contract_test extends \advanced_testcase {
    public function test_spatial_placement_semantics_reject_malformed_portable_graphs(): void {
        $fixture = $this->decode(
            file_get_contents(__DIR__ . '/fixtures/assessment-grading.json'),
        );
        $case = null;
        foreach ($fixture->cases as $candidate) {
            if ($candidate->id === 'spatial-placement-partial-credit-fully-correct') {
                $case = $candidate;
                break;
            }
        }
        $this->assertNotNull($case);
        $validator = new json_schema_validator();

        $duplicatemarkers = $this->copy($case->target);
        $duplicatemarkers->interaction->markers[1]->id = $duplicatemarkers->interaction->markers[0]->id;
        $missinganswer = $this->copy($case->target);
        array_pop($missinganswer->assessment->correctPlacements);
        $missingaspect = $this->copy($case->target);
        $missingaspect->assessment->imageAspectRatio = null;
        $danglingfeedback = $this->copy($case->target);
        $danglingfeedback->assessment->feedbackByMarkerId->{'marker_99999'} = $this->decode(
            '{"kind":"rich-text","document":{"type":"doc","content":[]}}',
        );
        $blanklabel = $this->copy($case->target);
        $blanklabel->interaction->markers[0]->label = '   ';
        $duplicateresponse = $this->copy($case->response);
        $duplicateresponse->placements[1]->markerId = $duplicateresponse->placements[0]->markerId;
        $invalidreveal = (object) ['answerKey' => $this->copy($case->target->assessment)];
        $invalidreveal->answerKey->imageAspectRatio = null;

        foreach ([
            ['AssessmentTargetContract', $duplicatemarkers],
            ['AssessmentTargetContract', $missinganswer],
            ['AssessmentTargetContract', $missingaspect],
            ['AssessmentTargetContract', $danglingfeedback],
            ['AssessmentTargetContract', $blanklabel],
            ['AssessmentResponseValue', $duplicateresponse],
            ['AnswerReveal', $invalidreveal],
        ] as [$definition, $value]) {
            $this->assert_contract_rejected($definition, $value, $validator);
        }
    }

    public function test_score_boundary_accepts_only_the_canonical_shapes(): void {
        $validator = new json_schema_validator();
        foreach ([
            (object) ['scaled' => 0.25],
            (object) ['scaled' => 0.5, 'raw' => 1, 'min' => 0, 'max' => 2],
        ] as $score) {
            $validator->validate_definition('Score', $score, 'score');
        }

        foreach ([
            (object) [],
            (object) ['scaled' => -0.1],
            (object) ['scaled' => 1.1],
            (object) ['scaled' => 0.5, 'raw' => 1, 'min' => 0],
            (object) ['scaled' => 0.5, 'raw' => 0.5, 'min' => 0, 'max' => 1],
            (object) ['scaled' => 0.5, 'raw' => 3, 'min' => 0, 'max' => 2],
            (object) ['scaled' => 0.5, 'raw' => 1, 'min' => 2, 'max' => 2],
        ] as $score) {
            $this->assert_contract_rejected('Score', $score, $validator);
        }
    }

    public function test_shared_score_transport_corpus_matches_root_and_nested_boundaries(): void {
        $fixture = $this->decode(
            file_get_contents(__DIR__ . '/fixtures/score-transport-conformance.json'),
        );
        $validator = new json_schema_validator();

        foreach ($fixture->transportCases as $case) {
            $score = json_decode(
                $case->json,
                false,
                512,
                JSON_THROW_ON_ERROR | JSON_BIGINT_AS_STRING,
            );
            $result = $this->decode(
                '{"isCorrect":true,"score":{"scaled":1},"feedback":null,"items":{}}',
            );
            $result->score = $score;

            foreach ([['Score', $score], ['AssessmentResult', $result]] as [$definition, $value]) {
                try {
                    $validator->validate_definition($definition, $value, $case->name);
                    $actual = true;
                } catch (\invalid_parameter_exception) {
                    $actual = false;
                }
                $this->assertSame($case->valid, $actual, $case->name . ': ' . $definition);
            }
        }

        $programmaticvalues = [
            'nan' => NAN,
            'positiveInfinity' => INF,
            'negativeInfinity' => -INF,
        ];
        foreach ($fixture->programmaticCases as $case) {
            $score = (object) ['scaled' => 0.5, 'raw' => 1, 'min' => 0, 'max' => 2];
            $score->{$case->field} = $programmaticvalues[$case->value];
            $this->assert_contract_rejected('Score', $score, $validator);
        }
    }

    public function test_score_semantics_are_name_independent(): void {
        $schema = $this->decode(
            file_get_contents(dirname(__DIR__) . '/schemas/assessment.schema.json'),
        );
        $schema->{'x-scaffold-semantics'} = ['score-v1', 'spatial-placement-v1'];
        $schema->definitions->CanonicalScore = $schema->definitions->Score;
        unset($schema->definitions->Score);
        $this->replace_refs($schema, '#/definitions/Score', '#/definitions/CanonicalScore');

        $validator = $this->schema_validator($schema);
        $validator->validate_definition(
            'CanonicalScore',
            (object) ['scaled' => 0.5, 'raw' => 1, 'min' => 0, 'max' => 2],
        );
        $this->assert_contract_rejected(
            'CanonicalScore',
            (object) ['scaled' => 0.5, 'raw' => 1, 'min' => 1, 'max' => 1],
            $validator,
        );
        $result = $this->decode(
            '{"isCorrect":true,"score":{"scaled":0.5,"raw":1,"min":1,"max":1},"feedback":null,"items":{}}',
        );
        $this->assert_contract_rejected('AssessmentResult', $result, $validator);

        $unmarked = $this->copy($schema);
        unset($unmarked->definitions->CanonicalScore->{'x-scaffold-semantic'});
        $this->assert_schema_rejected($unmarked);

        $generic = $this->decode(
            '{"definitions":{"Score":{"type":"string"},"Other":{"type":"integer"}}}',
        );
        $genericvalidator = $this->schema_validator($generic);
        $genericvalidator->validate_definition('Score', 'ordinary');
        $genericvalidator->validate_definition('Other', 1);
        $this->addToAssertionCount(3);
    }

    public function test_score_semantics_execute_in_branches_and_through_refs(): void {
        $schema = $this->decode(<<<'JSON'
{
  "x-scaffold-semantics": ["score-v1"],
  "definitions": {
    "Shape": {"type": "object"},
    "AdjacentRef": {
      "$ref": "#/definitions/Shape",
      "x-scaffold-semantic": "score-v1"
    },
    "BehindRef": {"$ref": "#/definitions/AdjacentRef"},
    "Branch": {
      "oneOf": [
        {"type": "null"},
        {"$ref": "#/definitions/Shape", "x-scaffold-semantic": "score-v1"}
      ]
    }
  }
}
JSON);
        $validator = $this->schema_validator($schema);
        $valid = (object) ['scaled' => 0.5, 'raw' => 1, 'min' => 0, 'max' => 2];
        $invalid = (object) ['scaled' => 0.5, 'raw' => 1, 'min' => 1, 'max' => 1];

        foreach (['AdjacentRef', 'BehindRef', 'Branch'] as $definition) {
            $validator->validate_definition($definition, $valid);
            $this->assert_contract_rejected($definition, $invalid, $validator);
        }
        $this->addToAssertionCount(3);
    }

    public function test_target_contract_accepts_canonical_target(): void {
        (new json_schema_validator())->validate_definition(
            'AssessmentTargetContract',
            $this->target(),
        );
        $this->addToAssertionCount(1);
    }

    /**
     * Tests target contract rejects invalid shape.
     *
     * @param string $mutation Mutation.
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

    /**
     * Provides invalid target cases.
     *
     * @return array
     */
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

    public function test_contract_requires_quiz_success_fields(): void {
        $validator = new json_schema_validator();
        $validator->validate_definition('AssessmentGroupContract', $this->group());
        $validator->validate_definition('QuizAttemptSnapshot', $this->quiz_snapshot());

        $group = $this->group();
        unset($group->settings->passingScore);
        $this->assert_contract_rejected('AssessmentGroupContract', $group, $validator);

        $quiz = $this->quiz_snapshot();
        unset($quiz->successStatus);
        $this->assert_contract_rejected('QuizAttemptSnapshot', $quiz, $validator);
        $this->addToAssertionCount(2);
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
     * Tests result contract rejects nonfinite score.
     *
     * @param float $score Score.
     * @dataProvider nonfinite_score_provider
     */
    public function test_result_contract_rejects_nonfinite_score(float $score): void {
        $result = $this->decode(
            '{"isCorrect":true,"score":{"scaled":1},"feedback":null,"items":{}}',
        );
        $result->score->scaled = $score;

        $this->assert_contract_rejected('AssessmentResult', $result);
    }

    /**
     * Provides nonfinite score cases.
     *
     * @return array
     */
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
                '{"isCorrect":true,"score":{"scaled":1,"raw":1,"min":0,"max":1},"feedback":null,"items":{}}',
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
        $scorewithoutmaximum->score = (object) ['scaled' => 0.5, 'raw' => 1, 'min' => 0];
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
            'snapshotVersion' => 2,
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
     * Tests schema loader rejects invalid resources.
     *
     * @param string $schemajson Schemajson.
     * @dataProvider invalid_schema_resource_provider
     */
    public function test_schema_loader_rejects_invalid_resources(string $schemajson): void {
        $path = make_request_directory() . '/assessment.schema.json';
        file_put_contents($path, $schemajson);

        $this->expectException(\invalid_parameter_exception::class);
        new json_schema_validator($path);
    }

    /**
     * Provides invalid schema resource cases.
     *
     * @return array
     */
    public static function invalid_schema_resource_provider(): array {
        return [
            'unsupported keyword' => ['{"definitions":{"Invalid":{"minLength":1}}}'],
            'missing manifest' => [
                '{"definitions":{"Canonical":{"type":"object","x-scaffold-semantic":"score-v1"}}}',
            ],
            'null manifest' => ['{"x-scaffold-semantics":null,"definitions":{}}'],
            'malformed manifest' => ['{"x-scaffold-semantics":"score-v1","definitions":{}}'],
            'empty manifest' => ['{"x-scaffold-semantics":[],"definitions":{}}'],
            'duplicate manifest entry' => [
                '{"x-scaffold-semantics":["score-v1","score-v1"],"definitions":{}}',
            ],
            'unknown manifest entry' => [
                '{"x-scaffold-semantics":["score-v2"],"definitions":{}}',
            ],
            'missing required marker' => [
                '{"x-scaffold-semantics":["score-v1"],"definitions":{"Canonical":{"type":"object"}}}',
            ],
            'malformed marker' => [
                '{"x-scaffold-semantics":["score-v1"],"definitions":{"Canonical":{"type":"object","x-scaffold-semantic":1}}}',
            ],
            'unknown marker' => [
                '{"x-scaffold-semantics":["score-v1"],"definitions":{"Canonical":{"type":"object","x-scaffold-semantic":"score-v2"}}}',
            ],
            'marker on bundle root' => [
                '{"x-scaffold-semantics":["score-v1"],"x-scaffold-semantic":"score-v1","definitions":{"Probe":{"type":"object"}}}',
            ],
            'invalid JSON' => ['{'],
        ];
    }

    public function test_schema_loader_rejects_missing_resource_without_warning(): void {
        set_error_handler(
            static function (int $severity, string $message): bool {
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

    /**
     * Asserts contract rejected.
     *
     * @param string $definition Definition.
     * @param mixed $value Value.
     * @param json_schema_validator|null $validator Shared schema validator.
     */
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

    private function assert_schema_rejected(
        \stdClass $schema,
    ): void {
        try {
            $this->schema_validator($schema);
            $this->fail('Semantic schema protocol unexpectedly accepted an invalid bundle');
        } catch (\invalid_parameter_exception) {
            $this->addToAssertionCount(1);
        }
    }

    private function schema_validator(\stdClass $schema): json_schema_validator {
        $path = make_request_directory() . '/semantic-assessment.schema.json';
        file_put_contents($path, json_encode($schema, JSON_THROW_ON_ERROR));
        return new json_schema_validator($path);
    }

    private function replace_refs(mixed $value, string $from, string $to): void {
        if ($value instanceof \stdClass) {
            foreach (get_object_vars($value) as $key => $child) {
                if ($key === '$ref' && is_string($child)) {
                    $value->{$key} = str_replace($from, $to, $child);
                    continue;
                }
                $this->replace_refs($child, $from, $to);
            }
            return;
        }
        if (is_array($value)) {
            foreach ($value as $child) {
                $this->replace_refs($child, $from, $to);
            }
        }
    }

    /**
     * Asserts group rejected.
     *
     * @param array $groups Groups.
     * @param array $targets Targets.
     */
    private function assert_group_rejected(array $groups, array $targets): void {
        try {
            assessment_group_validator::validate_groups($groups, $targets);
            $this->fail('Assessment group boundary unexpectedly accepted invalid input');
        } catch (\invalid_parameter_exception) {
            $this->addToAssertionCount(1);
        }
    }

    /**
     * Returns target.
     *
     * @return \stdClass
     */
    private function target(): \stdClass {
        return $this->decode(<<<'JSON'
{
  "schemaVersion": 2,
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

    /**
     * Returns group.
     *
     * @return \stdClass
     */
    private function group(): \stdClass {
        return $this->decode(<<<'JSON'
{
  "schemaVersion": 2,
  "kind": "quiz",
  "groupId": "quiz-1",
  "targetIds": ["question-1", "question-2"],
  "settings": {
    "allowBacktracking": true,
    "reviewTiming": "after_quiz",
    "reviewDetail": "result_only",
    "attemptsPerQuestion": 1,
    "isGraded": true,
    "passingScore": null,
    "timer": {"enabled": false, "durationSeconds": 0}
  }
}
JSON);
    }

    /**
     * Builds an empty problem.
     *
     * @return \stdClass
     */
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

    /**
     * Returns quiz snapshot.
     *
     * @return \stdClass
     */
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
  "successStatus": null,
  "resultsByTargetId": {},
  "answerReviewAuthorized": false
}
JSON);
    }

    /**
     * Returns a detached copy of the supplied value.
     *
     * @param mixed $value Value.
     * @return mixed
     */
    private function copy(mixed $value): mixed {
        return json_decode(
            json_encode($value, JSON_THROW_ON_ERROR),
            false,
            512,
            JSON_THROW_ON_ERROR,
        );
    }

    /**
     * Decodes the supplied JSON value.
     *
     * @param string $json Json.
     * @return \stdClass
     */
    private function decode(string $json): \stdClass {
        $value = json_decode($json, false, 512, JSON_THROW_ON_ERROR);
        if (!($value instanceof \stdClass)) {
            throw new \RuntimeException('Expected object fixture');
        }
        return $value;
    }
}
