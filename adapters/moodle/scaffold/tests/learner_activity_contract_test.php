<?php
// This file is part of Scaffold - https://scaffold.ac/
//
// Scaffold is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, version 3 of the License.

namespace mod_scaffold;

use mod_scaffold\local\json_schema_validator;
use mod_scaffold\local\learner_activity_validator;

defined('MOODLE_INTERNAL') || die();

/**
 * Tests learner-activity schema boundaries.
 *
 * @covers \mod_scaffold\local\json_schema_validator
 * @covers \mod_scaffold\local\learner_activity_validator
 */
final class learner_activity_contract_test extends \advanced_testcase {
    public function test_valid_record_and_snapshot_are_accepted(): void {
        learner_activity_validator::validate_definition(
            'LearnerActivityRecord',
            $this->record(),
            '$.activities.flashcards',
        );
        learner_activity_validator::validate_definition(
            'LearnerActivitySnapshot',
            $this->snapshot(),
        );
        $this->addToAssertionCount(2);
    }

    /**
     * @dataProvider blank_identity_provider
     */
    public function test_blank_artifact_identity_and_activity_kind_are_rejected(
        string $blankidentity,
    ): void {
        $snapshot = $this->snapshot();
        $snapshot->artifactId = $blankidentity;
        $this->assert_learner_activity_rejected('LearnerActivitySnapshot', $snapshot);

        $record = $this->record();
        $record->activityKind = $blankidentity;
        $this->assert_learner_activity_rejected('LearnerActivityRecord', $record);
    }

    public static function blank_identity_provider(): array {
        return [
            'empty' => [''],
            'whitespace' => ['   '],
        ];
    }

    public function test_snapshot_rejects_invalid_identity_and_envelope_shapes(): void {
        $blankblock = $this->snapshot();
        $blankblock->activities = (object) ['' => $this->record()];
        $this->assert_learner_activity_rejected('LearnerActivitySnapshot', $blankblock);

        $compositekey = $this->snapshot();
        $compositekey->activities = (object) [
            'artifact:scaffold-42/block:flashcards' => $this->record(),
        ];
        $this->assert_learner_activity_rejected('LearnerActivitySnapshot', $compositekey);

        $futureversion = $this->snapshot();
        $futureversion->snapshotVersion = 2;
        $this->assert_learner_activity_rejected('LearnerActivitySnapshot', $futureversion);

        $missingenvelope = $this->snapshot();
        unset($missingenvelope->activities);
        $this->assert_learner_activity_rejected('LearnerActivitySnapshot', $missingenvelope);

        $extrafield = $this->snapshot();
        $extrafield->assessment = (object) [];
        $this->assert_learner_activity_rejected('LearnerActivitySnapshot', $extrafield);
    }

    public function test_record_rejects_assessment_fields_and_invalid_data(): void {
        $assessmentfield = $this->record();
        $assessmentfield->attemptNumber = 1;
        $this->assert_learner_activity_rejected('LearnerActivityRecord', $assessmentfield);

        $listdata = $this->record();
        $listdata->data = [];
        $this->assert_learner_activity_rejected('LearnerActivityRecord', $listdata);

        $nonfinite = $this->record();
        $nonfinite->data->confidence->{'card-1'} = INF;
        $this->assert_learner_activity_rejected('LearnerActivityRecord', $nonfinite);
    }

    /**
     * @dataProvider invalid_timestamp_provider
     */
    public function test_invalid_updated_at_is_rejected(string $timestamp): void {
        $record = $this->record();
        $record->updatedAt = $timestamp;

        $this->assert_learner_activity_rejected('LearnerActivityRecord', $record);
    }

    public static function invalid_timestamp_provider(): array {
        return [
            'missing timezone' => ['2026-07-17T12:45:12'],
            'invalid date' => ['2026-02-30T12:45:12Z'],
        ];
    }

    public function test_schema_loader_rejects_unsupported_keywords(): void {
        $path = make_request_directory() . '/learner-activity.schema.json';
        file_put_contents($path, '{"definitions":{"Invalid":{"oneOf":[]}}}');

        $this->expectException(\invalid_parameter_exception::class);
        new json_schema_validator($path);
    }

    public function test_assessment_and_learner_activity_validators_are_isolated(): void {
        $assessmentsnapshot = $this->decode(
            '{"snapshotVersion":1,"artifactId":"scaffold-42","problems":{},"quizzes":{}}',
        );
        json_schema_validator::validate_plugin_definition(
            'AssessmentLearnerSnapshot',
            $assessmentsnapshot,
        );
        $this->addToAssertionCount(1);

        $this->assert_learner_activity_rejected(
            'LearnerActivitySnapshot',
            $assessmentsnapshot,
        );
        $this->assert_assessment_rejected('AssessmentLearnerSnapshot', $this->snapshot());
        $this->assert_assessment_rejected('LearnerActivitySnapshot', $this->snapshot());
        $this->assert_learner_activity_rejected(
            'AssessmentLearnerSnapshot',
            $assessmentsnapshot,
        );
    }

    private function assert_learner_activity_rejected(
        string $definition,
        mixed $value,
    ): void {
        try {
            learner_activity_validator::validate_definition($definition, $value);
            $this->fail('Learner activity contract unexpectedly accepted invalid input');
        } catch (\invalid_parameter_exception) {
            $this->addToAssertionCount(1);
        }
    }

    private function assert_assessment_rejected(string $definition, mixed $value): void {
        try {
            json_schema_validator::validate_plugin_definition($definition, $value);
            $this->fail('Assessment contract unexpectedly accepted invalid input');
        } catch (\invalid_parameter_exception) {
            $this->addToAssertionCount(1);
        }
    }

    private function record(): \stdClass {
        return $this->decode(<<<'JSON'
{
  "activityKind": "flashcard",
  "data": {
    "currentCardId": "card-2",
    "knownCardIds": ["card-1"],
    "confidence": {"card-1": 0.75},
    "reviewRequired": false,
    "nextCardId": null
  },
  "completed": false,
  "updatedAt": "2026-07-17T13:45:12.345+01:00"
}
JSON);
    }

    private function snapshot(): \stdClass {
        return $this->decode(<<<'JSON'
{
  "snapshotVersion": 1,
  "artifactId": "scaffold-42",
  "activities": {
    "flashcards": {
      "activityKind": "flashcard",
      "data": {
        "currentCardId": "card-2",
        "knownCardIds": ["card-1"],
        "confidence": {"card-1": 0.75},
        "reviewRequired": false,
        "nextCardId": null
      },
      "completed": false,
      "updatedAt": "2026-07-17T12:45:12Z"
    },
    "checklist": {
      "activityKind": "checklist",
      "data": {"checkedItemIds": []},
      "completed": true,
      "updatedAt": null
    }
  }
}
JSON);
    }

    private function decode(string $json): \stdClass {
        $value = json_decode($json, false, 512, JSON_THROW_ON_ERROR);
        if (!($value instanceof \stdClass)) {
            throw new \RuntimeException('Expected object fixture');
        }
        return $value;
    }
}
