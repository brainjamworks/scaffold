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

declare(strict_types=1);

namespace mod_scaffold\completion;

use core_completion\activity_custom_completion;
use mod_scaffold\local\assessment_projection;

class custom_completion extends activity_custom_completion {
    private const RULE_ACTIVITY_STATUS = 'completionactivitystatus';

    #[\Override]
    public function get_state(string $rule): int {
        global $DB;

        $this->validate_rule($rule);
        $scaffold = $DB->get_record(
            'scaffold',
            ['id' => $this->cm->instance],
            '*',
            MUST_EXIST,
        );
        $status = assessment_projection::activity_status_for_user(
            $scaffold,
            (int) $this->cm->id,
            $this->userid,
        );
        return $status === 'completed' ? COMPLETION_COMPLETE : COMPLETION_INCOMPLETE;
    }

    #[\Override]
    public static function get_defined_custom_rules(): array {
        return [self::RULE_ACTIVITY_STATUS];
    }

    #[\Override]
    public function get_custom_rule_descriptions(): array {
        return [
            self::RULE_ACTIVITY_STATUS => get_string('completiondetail:activitystatus', 'scaffold'),
        ];
    }

    #[\Override]
    public function get_sort_order(): array {
        return [
            'completionview',
            self::RULE_ACTIVITY_STATUS,
            'completionusegrade',
            'completionpassgrade',
        ];
    }
}
