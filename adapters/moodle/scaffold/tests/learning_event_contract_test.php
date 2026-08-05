<?php

namespace mod_scaffold;

use mod_scaffold\learning_event\validator;

/** Verifies the PHP Learning Event trust boundary. */
final class learning_event_contract_test extends \advanced_testcase {
    private function event(array $overrides = []): string {
        return json_encode(array_replace_recursive([
            'id' => '00000000-0000-4000-8000-000000000001',
            'timestamp' => '2026-07-27T12:00:00.000Z',
            'verb' => ['id' => 'http://adlnet.gov/expapi/verbs/progressed', 'display' => ['en' => 'progressed']],
            'object' => ['objectType' => 'Activity', 'id' => 'https://moodle.example/mod/scaffold/view.php?id=42'],
            'result' => ['completion' => false],
        ], $overrides), JSON_THROW_ON_ERROR);
    }

    public function test_accepts_actorless_response_bearing_event(): void {
        $event = validator::validate_json($this->event(['result' => ['response' => 'answer-b', 'success' => true]]));
        $this->assertSame('answer-b', $event->result->response);
    }

    /** @dataProvider rejects_untrusted_fields_provider */
    public function test_rejects_untrusted_or_unsafe_event(array $overrides): void {
        $this->expectException(\invalid_parameter_exception::class);
        validator::validate_json($this->event($overrides));
    }

    public static function rejects_untrusted_fields_provider(): array {
        return [
            'actor' => [['actor' => ['account' => ['name' => 'attacker']]]],
            'authority' => [['authority' => ['mbox' => 'mailto:attacker@example.test']]],
            'unknown nested field' => [['verb' => ['unexpected' => true]]],
            'cmid collision' => [['context' => ['extensions' => [validator::CMID_EXTENSION => 99]]]],
        ];
    }

    public function test_rejects_oversize_payload(): void {
        $this->expectException(\invalid_parameter_exception::class);
        validator::validate_json(str_repeat('x', validator::MAX_JSON_BYTES + 1));
    }
}
