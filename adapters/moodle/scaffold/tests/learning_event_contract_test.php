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

use mod_scaffold\learning_event\validator;

/**
 * Verifies the PHP Learning Event trust boundary.
 *
 * @package    mod_scaffold
 * @copyright  2026 Rizvan Ali
 * @license    https://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
final class learning_event_contract_test extends \advanced_testcase {
    /**
     * Builds a valid event with optional overrides.
     *
     * @param array $overrides Event fields to override.
     * @return string Event JSON.
     */
    private function event(array $overrides = []): string {
        return json_encode(array_replace_recursive([
            'id' => '00000000-0000-4000-8000-000000000001',
            'timestamp' => '2026-07-27T12:00:00.000Z',
            'verb' => ['id' => 'http://adlnet.gov/expapi/verbs/progressed', 'display' => ['en' => 'progressed']],
            'object' => ['objectType' => 'Activity', 'id' => 'https://moodle.example/mod/scaffold/view.php?id=42'],
            'result' => ['completion' => false],
        ], $overrides), JSON_THROW_ON_ERROR);
    }

    /** Accepts a response-bearing actorless event. */
    public function test_accepts_actorless_response_bearing_event(): void {
        $event = validator::validate_json($this->event(['result' => ['response' => 'answer-b', 'success' => true]]));
        $this->assertSame('answer-b', $event->result->response);
    }

    /** @dataProvider rejects_untrusted_fields_provider */
    /**
     * Rejects untrusted or unsafe event fields.
     *
     * @param array $overrides Event fields to override.
     */
    public function test_rejects_untrusted_or_unsafe_event(array $overrides): void {
        $this->expectException(\invalid_parameter_exception::class);
        validator::validate_json($this->event($overrides));
    }

    /**
     * Supplies attacker-controlled field cases.
     *
     * @return array Test cases.
     */
    public static function rejects_untrusted_fields_provider(): array {
        return [
            'actor' => [['actor' => ['account' => ['name' => 'attacker']]]],
            'authority' => [['authority' => ['mbox' => 'mailto:attacker@example.test']]],
            'unknown nested field' => [['verb' => ['unexpected' => true]]],
            'cmid collision' => [['context' => ['extensions' => [validator::CMID_EXTENSION => 99]]]],
        ];
    }

    /** Rejects payloads over the size bound. */
    public function test_rejects_oversize_payload(): void {
        $this->expectException(\invalid_parameter_exception::class);
        validator::validate_json(str_repeat('x', validator::MAX_JSON_BYTES + 1));
    }
}
