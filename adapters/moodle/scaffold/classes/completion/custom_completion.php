<?php
// This file is part of Scaffold - https://scaffold.ac/
//
// Scaffold is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, version 3 of the License.

declare(strict_types=1);

namespace mod_scaffold\completion;

use core_completion\activity_custom_completion;
use mod_scaffold\local\assessment_projection;

class custom_completion extends activity_custom_completion {
    private const RULE_ACTIVITY_STATUS = 'completionactivitystatus';

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

    public static function get_defined_custom_rules(): array {
        return [self::RULE_ACTIVITY_STATUS];
    }

    public function get_custom_rule_descriptions(): array {
        return [
            self::RULE_ACTIVITY_STATUS => get_string('completiondetail:activitystatus', 'scaffold'),
        ];
    }

    public function get_sort_order(): array {
        return [
            'completionview',
            self::RULE_ACTIVITY_STATUS,
            'completionusegrade',
            'completionpassgrade',
        ];
    }
}
