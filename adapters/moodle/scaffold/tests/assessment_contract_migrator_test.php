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

use mod_scaffold\local\assessment_contract_migrator;


/**
 * Verifies pure assessment contract migration before the v2 cutover activates it.
 *
 * @package    mod_scaffold
 * @copyright  2026 Rizvan Ali
 * @license    https://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 * @covers \mod_scaffold\local\assessment_contract_migrator
 */
final class assessment_contract_migrator_test extends \advanced_testcase {
    public function test_v1_definitions_upgrade_without_mutating_the_caller(): void {
        [$targets, $groups] = self::definitions(1);
        $before = serialize([$targets, $groups]);

        $upgraded = assessment_contract_migrator::upgrade_definitions($targets, $groups);

        $this->assertSame($before, serialize([$targets, $groups]));
        $this->assertSame(2, $upgraded['targets'][0]->schemaVersion);
        $this->assertSame('question-1', $upgraded['targets'][0]->targetId);
        $this->assertInstanceOf(
            \stdClass::class,
            $upgraded['targets'][0]->assessment->feedbackByOptionId,
        );
        $this->assertSame(2, $upgraded['groups'][0]->schemaVersion);
        $this->assertNull($upgraded['groups'][0]->settings->passingScore);
        $this->assertNotSame($targets[0], $upgraded['targets'][0]);
        $this->assertNotSame($groups[0]->settings, $upgraded['groups'][0]->settings);
    }

    public function test_exact_v2_definitions_pass_through_as_a_clone(): void {
        [$targets, $groups] = self::definitions(2, 0.75);
        $before = serialize([$targets, $groups]);

        $upgraded = assessment_contract_migrator::upgrade_definitions($targets, $groups);

        $this->assertSame($before, serialize([$targets, $groups]));
        $this->assertSame($before, serialize([$upgraded['targets'], $upgraded['groups']]));
        $this->assertNotSame($targets[0], $upgraded['targets'][0]);
        $this->assertNotSame($groups[0], $upgraded['groups'][0]);
    }

    /**
     * Rejects ambiguous definition versions.
     *
     * @param array $targets Targets.
     * @param array $groups Groups.
     * @dataProvider rejected_definition_provider
     */
    public function test_definition_upgrade_rejects_ambiguous_versions(
        array $targets,
        array $groups,
    ): void {
        $this->expectException(\invalid_parameter_exception::class);
        assessment_contract_migrator::upgrade_definitions($targets, $groups);
    }

    /**
     * Provides rejected definition bundles.
     *
     * @return array
     */
    public static function rejected_definition_provider(): array {
        [$v1targets, $v1groups] = self::definitions(1);
        [$v2targets, $v2groups] = self::definitions(2, null);
        [$futuretargets, $futuregroups] = self::definitions(3);

        $missingtargetversion = self::copy($v1targets);
        unset($missingtargetversion[0]->schemaVersion);
        $missinggroupversion = self::copy($v1groups);
        unset($missinggroupversion[0]->schemaVersion);
        $v1withpassing = self::copy($v1groups);
        $v1withpassing[0]->settings->passingScore = null;

        return [
            'mixed target and group versions' => [$v1targets, $v2groups],
            'mixed group and target versions' => [$v2targets, $v1groups],
            'future definitions' => [$futuretargets, $futuregroups],
            'missing target version' => [$missingtargetversion, $v1groups],
            'missing group version' => [$v1targets, $missinggroupversion],
            'v1 group with v2 passing score' => [$v1targets, $v1withpassing],
        ];
    }

    public function test_v1_snapshot_upgrade_preserves_history_without_mutation(): void {
        $snapshot = self::snapshot(1);
        $before = serialize($snapshot);

        $upgraded = assessment_contract_migrator::upgrade_snapshot($snapshot);

        $this->assertSame($before, serialize($snapshot));
        $this->assertSame(2, $upgraded->snapshotVersion);
        $this->assertSame('moodle-cm-42', $upgraded->artifactId);
        $this->assertSame('2026-07-20T10:05:00.000000Z', $upgraded->quizzes->{'quiz-1'}->finishedAt);
        $this->assertSame(1.0, $upgraded->quizzes->{'quiz-1'}->score);
        $this->assertSame(2.0, $upgraded->quizzes->{'quiz-1'}->maxScore);
        $this->assertNull($upgraded->quizzes->{'quiz-1'}->successStatus);
        $this->assertNull($upgraded->quizzes->{'quiz-2'}->successStatus);
        $this->assertSame(
            'option-b',
            $upgraded->problems->{'question-1'}->response->optionId,
        );
        $this->assertInstanceOf(
            \stdClass::class,
            $upgraded->quizzes->{'quiz-2'}->resultsByTargetId,
        );
        $this->assertNotSame($snapshot, $upgraded);
        $this->assertNotSame($snapshot->quizzes->{'quiz-1'}, $upgraded->quizzes->{'quiz-1'});
    }

    public function test_exact_v2_snapshot_passes_through_as_a_clone(): void {
        $snapshot = self::snapshot(2);
        $snapshot->quizzes->{'quiz-1'}->successStatus = 'passed';
        $snapshot->quizzes->{'quiz-2'}->successStatus = null;
        $before = serialize($snapshot);

        $upgraded = assessment_contract_migrator::upgrade_snapshot($snapshot);

        $this->assertSame($before, serialize($snapshot));
        $this->assertSame($before, serialize($upgraded));
        $this->assertNotSame($snapshot, $upgraded);
    }

    /**
     * Rejects ambiguous snapshot versions.
     *
     * @param \stdClass $snapshot Snapshot.
     * @dataProvider rejected_snapshot_provider
     */
    public function test_snapshot_upgrade_rejects_ambiguous_versions(\stdClass $snapshot): void {
        $this->expectException(\invalid_parameter_exception::class);
        assessment_contract_migrator::upgrade_snapshot($snapshot);
    }

    /**
     * Provides rejected snapshots.
     *
     * @return array
     */
    public static function rejected_snapshot_provider(): array {
        $missingversion = self::snapshot(1);
        unset($missingversion->snapshotVersion);
        $futureversion = self::snapshot(3);
        $v1withsuccess = self::snapshot(1);
        $v1withsuccess->quizzes->{'quiz-1'}->successStatus = null;

        return [
            'missing version' => [$missingversion],
            'future version' => [$futureversion],
            'v1 attempt with v2 success status' => [$v1withsuccess],
        ];
    }

    /**
     * Builds definition fixtures.
     *
     * @param int $version Version.
     * @param float|null $passingscore Passing score.
     * @return array
     */
    private static function definitions(int $version, ?float $passingscore = null): array {
        $settings = (object) [
            'allowBacktracking' => false,
            'reviewTiming' => 'after_quiz',
            'reviewDetail' => 'result_only',
            'attemptsPerQuestion' => 1,
            'isGraded' => true,
            'timer' => (object) ['enabled' => false, 'durationSeconds' => 0],
        ];
        if ($version === 2) {
            $settings->passingScore = $passingscore;
        }
        return [
            [(object) [
                'schemaVersion' => $version,
                'targetId' => 'question-1',
                'assessment' => (object) ['feedbackByOptionId' => (object) []],
            ]],
            [(object) [
                'schemaVersion' => $version,
                'kind' => 'quiz',
                'groupId' => 'quiz-1',
                'targetIds' => ['question-1'],
                'settings' => $settings,
            ]],
        ];
    }

    /**
     * Builds a snapshot fixture.
     *
     * @param int $version Version.
     * @return \stdClass
     */
    private static function snapshot(int $version): \stdClass {
        return (object) [
            'snapshotVersion' => $version,
            'artifactId' => 'moodle-cm-42',
            'problems' => (object) [
                'question-1' => (object) [
                    'response' => (object) [
                        'kind' => 'single-select',
                        'optionId' => 'option-b',
                    ],
                    'submitted' => true,
                    'attemptNumber' => 1,
                ],
            ],
            'quizzes' => (object) [
                'quiz-1' => (object) [
                    'attemptId' => 'attempt-complete',
                    'status' => 'completed',
                    'currentTargetId' => null,
                    'submittedTargetIds' => ['question-1'],
                    'startedAt' => '2026-07-20T10:00:00.000000Z',
                    'finishedAt' => '2026-07-20T10:05:00.000000Z',
                    'expiresAt' => null,
                    'score' => 1.0,
                    'maxScore' => 2.0,
                    'resultsByTargetId' => (object) [],
                    'answerReviewAuthorized' => true,
                ],
                'quiz-2' => (object) [
                    'attemptId' => 'attempt-progress',
                    'status' => 'in_progress',
                    'currentTargetId' => 'question-2',
                    'submittedTargetIds' => [],
                    'startedAt' => '2026-07-20T11:00:00.000000Z',
                    'finishedAt' => null,
                    'expiresAt' => null,
                    'score' => null,
                    'maxScore' => null,
                    'resultsByTargetId' => (object) [],
                    'answerReviewAuthorized' => false,
                ],
            ],
        ];
    }

    /**
     * Deep copies JSON-shaped values.
     *
     * @param mixed $value Value.
     * @return mixed
     */
    private static function copy(mixed $value): mixed {
        return unserialize(serialize($value));
    }
}
