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
        $this->assertSame(['scaled' => 1, 'raw' => 1, 'min' => 0, 'max' => 1], $result['score']);
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
        $this->assertSame(['scaled' => 0, 'raw' => 0, 'min' => 0, 'max' => 2], $result['score']);
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
        $this->assertSame(['scaled' => 1, 'raw' => 1, 'min' => 0, 'max' => 1], $result['score']);
    }

    public function test_empty_result_preserves_contract_object_shape(): void {
        $result = grader::grade_assessment(null, null);

        $this->assertNull($result['feedback']);
        $this->assertSame(
            '{"isCorrect":false,"score":{"scaled":0},"feedback":null,"items":{}}',
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
            $this->assertSame(['scaled' => 1, 'raw' => 1, 'min' => 0, 'max' => 1], $result['score']);
            $this->assertArrayNotHasKey('points', $result);
            $this->assertArrayNotHasKey('isGraded', $result);
        }
    }

    public function test_spatial_placement_uses_aspect_correct_boundary_geometry(): void {
        $result = grader::grade_assessment([
            'interaction' => [
                'kind' => 'spatial-placement',
                'markers' => [['id' => 'marker-1', 'label' => 'Marker 1']],
            ],
            'assessment' => [
                'kind' => 'spatial-placement',
                'gradingMode' => 'partial-credit',
                'imageAspectRatio' => 2,
                'correctPlacements' => [[
                    'markerId' => 'marker-1',
                    'geometry' => [
                        'kind' => 'circle',
                        'centerX' => 50,
                        'centerY' => 50,
                        'radius' => 5,
                    ],
                ]],
                'feedbackByMarkerId' => [],
            ],
        ], [
            'kind' => 'spatial-placement',
            'placements' => [['markerId' => 'marker-1', 'x' => 50, 'y' => 60]],
        ]);

        $this->assertTrue($result['isCorrect']);
        $this->assertSame(['scaled' => 1, 'raw' => 1, 'min' => 0, 'max' => 1], $result['score']);
        $this->assertSame(
            ['correct' => true, 'expected' => true, 'given' => true],
            $result['items']['marker-1'],
        );
    }

    public function test_spatial_placement_all_or_nothing_rejects_incomplete_coverage(): void {
        $result = grader::grade_assessment([
            'interaction' => [
                'kind' => 'spatial-placement',
                'markers' => [
                    ['id' => 'marker-1', 'label' => 'Marker 1'],
                    ['id' => 'marker-2', 'label' => 'Marker 2'],
                ],
            ],
            'assessment' => [
                'kind' => 'spatial-placement',
                'gradingMode' => 'all-or-nothing',
                'imageAspectRatio' => 1,
                'correctPlacements' => [
                    [
                        'markerId' => 'marker-1',
                        'geometry' => [
                            'kind' => 'circle',
                            'centerX' => 20,
                            'centerY' => 20,
                            'radius' => 5,
                        ],
                    ],
                    [
                        'markerId' => 'marker-2',
                        'geometry' => [
                            'kind' => 'circle',
                            'centerX' => 80,
                            'centerY' => 80,
                            'radius' => 5,
                        ],
                    ],
                ],
                'feedbackByMarkerId' => [],
            ],
        ], [
            'kind' => 'spatial-placement',
            'placements' => [['markerId' => 'marker-1', 'x' => 20, 'y' => 20]],
        ]);

        $this->assertFalse($result['isCorrect']);
        $this->assertSame(['scaled' => 0, 'raw' => 0, 'min' => 0, 'max' => 1], $result['score']);
        $this->assertSame(
            ['correct' => false, 'expected' => true, 'given' => false],
            $result['items']['marker-2'],
        );
    }

    public function test_empty_spatial_placement_is_zero_and_incorrect(): void {
        $result = grader::grade_assessment([
            'interaction' => [
                'kind' => 'spatial-placement',
                'markers' => [],
            ],
            'assessment' => [
                'kind' => 'spatial-placement',
                'gradingMode' => 'partial-credit',
                'imageAspectRatio' => null,
                'correctPlacements' => [],
                'feedbackByMarkerId' => [],
            ],
        ], [
            'kind' => 'spatial-placement',
            'placements' => [],
        ]);

        $this->assertFalse($result['isCorrect']);
        $this->assertSame(['scaled' => 0.0], $result['score']);
        $this->assertInstanceOf(\stdClass::class, $result['items']);
    }

    public function test_spatial_placement_rejects_unknown_response_marker(): void {
        $this->expectException(\invalid_parameter_exception::class);
        $this->expectExceptionMessage('spatial-placement response references unknown marker: stale-marker');

        grader::grade_assessment([
            'interaction' => [
                'kind' => 'spatial-placement',
                'markers' => [['id' => 'marker-1', 'label' => 'Marker 1']],
            ],
            'assessment' => [
                'kind' => 'spatial-placement',
                'gradingMode' => 'partial-credit',
                'imageAspectRatio' => 1,
                'correctPlacements' => [[
                    'markerId' => 'marker-1',
                    'geometry' => [
                        'kind' => 'circle',
                        'centerX' => 50,
                        'centerY' => 50,
                        'radius' => 5,
                    ],
                ]],
                'feedbackByMarkerId' => [],
            ],
        ], [
            'kind' => 'spatial-placement',
            'placements' => [['markerId' => 'stale-marker', 'x' => 50, 'y' => 50]],
        ]);
    }

    public function test_spatial_placement_rejects_duplicate_response_marker(): void {
        $this->expectException(\invalid_parameter_exception::class);
        $this->expectExceptionMessage('duplicate spatial-placement response marker id: marker-1');

        grader::grade_assessment([
            'interaction' => [
                'kind' => 'spatial-placement',
                'markers' => [['id' => 'marker-1', 'label' => 'Marker 1']],
            ],
            'assessment' => [
                'kind' => 'spatial-placement',
                'gradingMode' => 'partial-credit',
                'imageAspectRatio' => 1,
                'correctPlacements' => [[
                    'markerId' => 'marker-1',
                    'geometry' => [
                        'kind' => 'circle',
                        'centerX' => 50,
                        'centerY' => 50,
                        'radius' => 5,
                    ],
                ]],
                'feedbackByMarkerId' => [],
            ],
        ], [
            'kind' => 'spatial-placement',
            'placements' => [
                ['markerId' => 'marker-1', 'x' => 50, 'y' => 50],
                ['markerId' => 'marker-1', 'x' => 70, 'y' => 70],
            ],
        ]);
    }

    /**
     * Tests malformed spatial target relationships remain observable.
     *
     * @param string $mutation Mutation.
     * @param string $message Message.
     * @dataProvider malformed_spatial_placement_target_provider
     */
    public function test_spatial_placement_rejects_malformed_target_relationships(
        string $mutation,
        string $message,
    ): void {
        $target = $this->spatial_placement_target();
        match ($mutation) {
            'duplicate markers' => $target['interaction']['markers'][1]['id'] = 'marker-1',
            'duplicate answers' => $target['assessment']['correctPlacements'][1]['markerId'] = 'marker-1',
            'missing answer' => array_pop($target['assessment']['correctPlacements']),
            'unknown answer' => $target['assessment']['correctPlacements'][1]['markerId'] = 'stale-marker',
            'unknown feedback' => $target['assessment']['feedbackByMarkerId']['stale-marker'] =
                $this->rich_feedback('Stale feedback'),
            'missing aspect ratio' => $target['assessment']['imageAspectRatio'] = null,
        };

        $this->expectException(\invalid_parameter_exception::class);
        $this->expectExceptionMessage($message);
        grader::grade_assessment($target, [
            'kind' => 'spatial-placement',
            'placements' => [],
        ]);
    }

    /**
     * Provides malformed spatial target relationships.
     *
     * @return array
     */
    public static function malformed_spatial_placement_target_provider(): array {
        return [
            'duplicate markers' => [
                'duplicate markers',
                'duplicate spatial-placement interaction marker id: marker-1',
            ],
            'duplicate answers' => [
                'duplicate answers',
                'duplicate spatial-placement correct-placement marker id: marker-1',
            ],
            'missing answer' => [
                'missing answer',
                'spatial-placement answer is missing marker: marker-2',
            ],
            'unknown answer' => [
                'unknown answer',
                'spatial-placement answer references unknown marker: stale-marker',
            ],
            'unknown feedback' => [
                'unknown feedback',
                'spatial-placement feedback references unknown marker: stale-marker',
            ],
            'missing aspect ratio' => [
                'missing aspect ratio',
                'spatial-placement image aspect ratio must be finite and positive',
            ],
        ];
    }

    /**
     * Tests malformed spatial values remain observable before numeric grading.
     *
     * @param string $mutation Mutation.
     * @param string $message Message.
     * @dataProvider malformed_spatial_placement_value_provider
     */
    public function test_spatial_placement_rejects_malformed_values(
        string $mutation,
        string $message,
    ): void {
        $target = $this->spatial_placement_target();
        $response = [
            'kind' => 'spatial-placement',
            'placements' => [['markerId' => 'marker-1', 'x' => 20, 'y' => 20]],
        ];
        match ($mutation) {
            'interaction kind' => $target['interaction']['kind'] = 'spatial-hotspot',
            'circle kind' => $target['assessment']['correctPlacements'][0]['geometry']['kind'] = 'square',
            'learner coordinate' => $response['placements'][0]['x'] = 'twenty',
        };

        $this->expectException(\invalid_parameter_exception::class);
        $this->expectExceptionMessage($message);
        grader::grade_assessment($target, $response);
    }

    /**
     * Provides malformed spatial values.
     *
     * @return array
     */
    public static function malformed_spatial_placement_value_provider(): array {
        return [
            'interaction kind' => [
                'interaction kind',
                'spatial-placement interaction kind must match assessment: spatial-hotspot',
            ],
            'circle kind' => [
                'circle kind',
                'spatial-placement answer geometry must be a circle: marker-1',
            ],
            'learner coordinate' => [
                'learner coordinate',
                'spatial-placement response marker marker-1 x must be finite and within 0..100',
            ],
        ];
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

        $partialscore = clone $storedresult;
        unset($partialscore->score->max);
        $this->assert_result_rejected($validator, $partialscore);

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
        $this->assertInstanceOf(\stdClass::class, $actual->score, $caseid);
        $this->assertIsNumeric($actual->score->scaled, $caseid);
        $this->assertGreaterThanOrEqual(0, $actual->score->scaled, $caseid);
        $this->assertLessThanOrEqual(1, $actual->score->scaled, $caseid);
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
        if (count($corpus->cases) !== 33) {
            throw new \RuntimeException('Moodle assessment grading corpus must contain 33 cases');
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
            'schemaVersion' => 2,
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

    /**
     * Returns a spatial placement target.
     *
     * @return array
     */
    private function spatial_placement_target(): array {
        return [
            'interaction' => [
                'kind' => 'spatial-placement',
                'markers' => [
                    ['id' => 'marker-1', 'label' => 'Marker 1'],
                    ['id' => 'marker-2', 'label' => 'Marker 2'],
                ],
            ],
            'assessment' => [
                'kind' => 'spatial-placement',
                'gradingMode' => 'partial-credit',
                'imageAspectRatio' => 1,
                'correctPlacements' => [
                    [
                        'markerId' => 'marker-1',
                        'geometry' => [
                            'kind' => 'circle',
                            'centerX' => 20,
                            'centerY' => 20,
                            'radius' => 5,
                        ],
                    ],
                    [
                        'markerId' => 'marker-2',
                        'geometry' => [
                            'kind' => 'circle',
                            'centerX' => 80,
                            'centerY' => 80,
                            'radius' => 5,
                        ],
                    ],
                ],
                'feedbackByMarkerId' => [],
            ],
        ];
    }
}
