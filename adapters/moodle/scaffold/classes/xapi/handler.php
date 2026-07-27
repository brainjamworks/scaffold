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

namespace mod_scaffold\xapi;

use core\event\base as event_base;
use core_xapi\handler as handler_base;
use core_xapi\local\state;
use core_xapi\local\statement;
use mod_scaffold\event\statement_received;

/**
 * Converts accepted Scaffold xAPI statements into Moodle events.
 *
 * @package    mod_scaffold
 * @copyright  2026 Rizvan Ali
 * @license    https://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
class handler extends handler_base {
    /** Moodle course-module placement extension. */
    private const CMID_EXTENSION = 'https://scaffold.ac/xapi/extensions/moodle-course-module-id';

    /** @var string[] Core verbs emitted by Scaffold. */
    private const VERBS = [
        'http://adlnet.gov/expapi/verbs/initialized',
        'http://adlnet.gov/expapi/verbs/launched',
        'http://adlnet.gov/expapi/verbs/experienced',
        'http://adlnet.gov/expapi/verbs/attempted',
        'http://adlnet.gov/expapi/verbs/answered',
        'http://adlnet.gov/expapi/verbs/interacted',
        'http://adlnet.gov/expapi/verbs/completed',
        'http://adlnet.gov/expapi/verbs/passed',
        'http://adlnet.gov/expapi/verbs/failed',
        'http://adlnet.gov/expapi/verbs/terminated',
    ];

    /**
     * Converts an accepted statement to a standard Moodle event.
     *
     * @param statement $statement Statement to convert.
     * @return event_base|null
     */
    public function statement_to_event(statement $statement): ?event_base {
        if (!in_array($statement->get_verb_id(), self::VERBS, true)) {
            return null;
        }

        $contextitem = $statement->get_context();
        $contextdata = $contextitem ? $contextitem->get_data() : null;
        $extension = self::CMID_EXTENSION;
        $cmid = $contextdata->extensions->{$extension} ?? null;
        if (!is_int($cmid) && !(is_string($cmid) && ctype_digit($cmid))) {
            return null;
        }

        $context = \context_module::instance((int) $cmid, IGNORE_MISSING);
        if (!$context) {
            return null;
        }
        $cm = get_coursemodule_from_id('scaffold', (int) $cmid, 0, false);
        if (!$cm) {
            return null;
        }

        $user = $statement->get_user();
        if (!has_capability('mod/scaffold:view', $context, $user)) {
            return null;
        }

        $params = [
            'other' => $statement->minify(),
            'context' => $context,
            'objectid' => $cm->instance,
            'userid' => $user->id,
        ];
        return statement_received::create($params);
    }

    /**
     * Scaffold does not use Moodle's xAPI State API.
     *
     * @param state $state State request.
     * @return bool
     */
    protected function validate_state(state $state): bool {
        return false;
    }
}
