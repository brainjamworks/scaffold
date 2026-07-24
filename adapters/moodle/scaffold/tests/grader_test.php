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

use mod_scaffold\local\grader;
use mod_scaffold\local\json_schema_validator;

defined('MOODLE_INTERNAL') || die();

/**
 * Tests canonical assessment grading.
 *
 * @package    mod_scaffold
 * @copyright  2026 Rizvan Ali
 * @license    https://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 *
 * @covers \mod_scaffold\local\grader
 */
final class grader_test extends \basic_testcase {
    public function test_single_select_result_includes_feedback_and_item_outcome(): void {
        $result = grader::grade_assessment($this->single_select_target(), [
            'kind' => 'single-select',
            'optionId' => 'b',
        ]);

        $this->assertTrue($result['isCorrect']);
        $this->assertSame(1, $result['score']);
        $this->assertSame(1, $result['maxScore']);
        $this->assertSame($this->rich_feedback('Summary'), $result['feedback']);
        $this->assertTrue($result['items']['b']['correct']);
    }

    public function test_multi_select_applies_wrong_pick_penalty(): void {
        $result = grader::grade_assessment([
            'interaction' => [
                'kind' => 'multi-select',
                'options' => [['id' => 'a'], ['id' => 'b'], ['id' => 'c']],
            ],
            'assessment' => [
                'kind' => 'multi-select',
                'correctOptionIds' => ['a', 'b'],
            ],
        ], [
            'kind' => 'multi-select',
            'optionIds' => ['a', 'c'],
        ]);

        $this->assertFalse($result['isCorrect']);
        $this->assertSame(0, $result['score']);
    }

    public function test_fill_blanks_normalises_case_and_whitespace(): void {
        $result = grader::grade_assessment([
            'interaction' => [
                'kind' => 'fill-blanks',
                'blanks' => [['id' => 'blank-1']],
            ],
            'assessment' => [
                'kind' => 'fill-blanks',
                'blanks' => [[
                    'blankId' => 'blank-1',
                    'acceptedAnswers' => ['London'],
                    'caseSensitive' => false,
                    'trimWhitespace' => true,
                ]],
            ],
        ], [
            'kind' => 'fill-blanks',
            'blanks' => [['blankId' => 'blank-1', 'value' => ' london ']],
        ]);

        $this->assertTrue($result['isCorrect']);
        $this->assertSame(1, $result['score']);
    }

    public function test_empty_result_preserves_contract_object_shape(): void {
        $result = grader::grade_assessment(null, null);

        $this->assertNull($result['feedback']);
        $this->assertSame(
            '{"isCorrect":false,"score":0,"maxScore":1,"feedback":null,"items":{}}',
            json_encode($result, JSON_THROW_ON_ERROR),
        );
    }

    public function test_empty_rich_text_feedback_is_not_omitted(): void {
        $target = $this->single_select_target();
        $target['assessment']['summaryFeedback'] = [
            'kind' => 'rich-text',
            'document' => ['type' => 'doc', 'content' => []],
        ];

        $result = grader::grade_assessment($target, [
            'kind' => 'single-select',
            'optionId' => 'b',
        ]);

        $this->assertSame($target['assessment']['summaryFeedback'], $result['feedback']);
    }

    public function test_results_remain_unweighted_units(): void {
        $firsttarget = $this->single_select_target();
        $firsttarget['settings']['points'] = 2;
        $firsttarget['settings']['isGraded'] = true;
        $secondtarget = $this->single_select_target();
        $secondtarget['settings']['points'] = 8;
        $secondtarget['settings']['isGraded'] = false;

        foreach ([$firsttarget, $secondtarget] as $target) {
            $result = grader::grade_assessment($target, [
                'kind' => 'single-select',
                'optionId' => 'b',
            ]);
            $this->assertSame(1, $result['score']);
            $this->assertSame(1, $result['maxScore']);
            $this->assertArrayNotHasKey('points', $result);
            $this->assertArrayNotHasKey('isGraded', $result);
        }
    }

    public function test_stored_result_contract_rejects_malformed_shapes(): void {
        $result = grader::grade_assessment($this->single_select_target(), [
            'kind' => 'single-select',
            'optionId' => 'b',
        ]);
        $storedresult = json_decode(
            json_encode($result, JSON_THROW_ON_ERROR),
            false,
            512,
            JSON_THROW_ON_ERROR,
        );
        $validator = new json_schema_validator();
        $validator->validate_definition('AssessmentResult', $storedresult, 'storedResult');

        $missingmaximum = clone $storedresult;
        unset($missingmaximum->maxScore);
        $this->assert_result_rejected($validator, $missingmaximum);

        $listitems = clone $storedresult;
        $listitems->items = [];
        $this->assert_result_rejected($validator, $listitems);
    }

    /**
     * Tests canonical grading case.
     *
     * @param string $caseid Caseid.
     * @param \stdClass $target Target.
     * @param \stdClass $response Response.
     * @param \stdClass $expected Expected.
     * @dataProvider grading_case_provider
     */
    public function test_canonical_grading_case(
        string $caseid,
        \stdClass $target,
        \stdClass $response,
        \stdClass $expected,
    ): void {
        $targetarray = json_decode(
            json_encode($target, JSON_THROW_ON_ERROR),
            true,
            512,
            JSON_THROW_ON_ERROR,
        );
        $responsearray = json_decode(
            json_encode($response, JSON_THROW_ON_ERROR),
            true,
            512,
            JSON_THROW_ON_ERROR,
        );
        $actualarray = grader::grade_assessment($targetarray, $responsearray);
        $actual = json_decode(
            json_encode($actualarray, JSON_THROW_ON_ERROR),
            false,
            512,
            JSON_THROW_ON_ERROR,
        );

        (new json_schema_validator())->validate_definition(
            'AssessmentResult',
            $actual,
            'case.' . $caseid . '.result',
        );
        $this->assertSame(1, $actual->maxScore, $caseid);
        $this->assertIsNumeric($actual->score, $caseid);
        $this->assertGreaterThanOrEqual(0, $actual->score, $caseid);
        $this->assertLessThanOrEqual(1, $actual->score, $caseid);
        $this->assertInstanceOf(\stdClass::class, $actual->items, $caseid);
        $this->assertInstanceOf(\stdClass::class, $expected->items, $caseid);
        $this->assertSame(
            self::normalised_json($expected),
            self::normalised_json($actual),
            $caseid,
        );
    }

    /**
     * Provides grading case cases.
     *
     * @return array
     */
    public static function grading_case_provider(): array {
        $corpusbytes = file_get_contents(__DIR__ . '/fixtures/assessment-grading.json');
        if ($corpusbytes === false) {
            throw new \RuntimeException('Moodle assessment grading corpus is missing');
        }
        $corpus = json_decode($corpusbytes, false, 512, JSON_THROW_ON_ERROR);
        if (!($corpus instanceof \stdClass) || !is_array($corpus->cases ?? null)) {
            throw new \RuntimeException('Moodle assessment grading corpus is malformed');
        }
        if (count($corpus->cases) !== 21) {
            throw new \RuntimeException('Moodle assessment grading corpus must contain 21 cases');
        }

        $cases = [];
        foreach ($corpus->cases as $case) {
            if (
                !($case instanceof \stdClass)
                || !is_string($case->id ?? null)
                || !(($case->target ?? null) instanceof \stdClass)
                || !(($case->response ?? null) instanceof \stdClass)
                || !(($case->expected ?? null) instanceof \stdClass)
            ) {
                throw new \RuntimeException('Canonical grading case is malformed');
            }
            $cases[$case->id] = [$case->id, $case->target, $case->response, $case->expected];
        }
        return $cases;
    }

    /**
     * Asserts result rejected.
     *
     * @param json_schema_validator $validator Shared schema validator.
     * @param \stdClass $result Result.
     */
    private function assert_result_rejected(
        json_schema_validator $validator,
        \stdClass $result,
    ): void {
        try {
            $validator->validate_definition('AssessmentResult', $result, 'storedResult');
            $this->fail('Malformed stored assessment result was accepted');
        } catch (\invalid_parameter_exception) {
            $this->addToAssertionCount(1);
        }
    }

    /**
     * Returns normalised json.
     *
     * @param mixed $value Value.
     * @return string
     */
    private static function normalised_json(mixed $value): string {
        if ($value instanceof \stdClass) {
            $properties = get_object_vars($value);
            ksort($properties);
            $normalised = new \stdClass();
            foreach ($properties as $key => $child) {
                $normalised->{$key} = json_decode(
                    self::normalised_json($child),
                    false,
                    512,
                    JSON_THROW_ON_ERROR,
                );
            }
            return json_encode($normalised, JSON_THROW_ON_ERROR);
        }

        if (is_array($value)) {
            $normalised = array_map(
                static fn(mixed $child): mixed => json_decode(
                    self::normalised_json($child),
                    false,
                    512,
                    JSON_THROW_ON_ERROR,
                ),
                $value,
            );
            return json_encode($normalised, JSON_THROW_ON_ERROR);
        }

        return json_encode($value, JSON_THROW_ON_ERROR);
    }

    /**
     * Returns rich feedback.
     *
     * @param string $text Text.
     * @return array
     */
    private function rich_feedback(string $text): array {
        return [
            'kind' => 'rich-text',
            'document' => [
                'type' => 'doc',
                'content' => [[
                    'type' => 'paragraph',
                    'content' => [['type' => 'text', 'text' => $text]],
                ]],
            ],
        ];
    }

    /**
     * Returns single select target.
     *
     * @return array
     */
    private function single_select_target(): array {
        return [
            'schemaVersion' => 1,
            'targetId' => 'mcq-1',
            'blockId' => 'mcq-1',
            'blockType' => 'mcq',
            'interaction' => [
                'kind' => 'single-select',
                'options' => [['id' => 'a'], ['id' => 'b']],
            ],
            'assessment' => [
                'kind' => 'single-select',
                'correctOptionId' => 'b',
                'feedbackByOptionId' => ['b' => $this->rich_feedback('Correct choice')],
                'summaryFeedback' => $this->rich_feedback('Summary'),
            ],
            'settings' => [
                'feedbackMode' => 'on_submit',
                'isGraded' => true,
                'showAnswer' => true,
                'points' => 1,
                'maxAttempts' => null,
            ],
        ];
    }
}
