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

namespace mod_scaffold\event;

/**
 * A Scaffold xAPI statement was accepted into Moodle.
 *
 * @package    mod_scaffold
 * @copyright  2026 Rizvan Ali
 * @license    https://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
class statement_received extends \core\event\base {
    /**
     * Defines event metadata.
     */
    protected function init(): void {
        $this->data['objecttable'] = 'scaffold';
        $this->data['crud'] = 'u';
        $this->data['edulevel'] = self::LEVEL_PARTICIPATING;
    }

    /**
     * Returns the localized event name.
     *
     * @return string
     */
    public static function get_name(): string {
        return get_string('eventstatementreceived', 'mod_scaffold');
    }

    /**
     * Describes the event.
     *
     * @return string
     */
    public function get_description(): string {
        return "The user with id '{$this->userid}' submitted an xAPI statement " .
            "for the Scaffold activity with id '{$this->objectid}'.";
    }

    /**
     * Returns the activity URL.
     *
     * @return \moodle_url
     */
    public function get_url(): \moodle_url {
        return new \moodle_url('/mod/scaffold/view.php', ['id' => $this->contextinstanceid]);
    }

    /**
     * Defines restore mapping for the activity object.
     *
     * @return array
     */
    public static function get_objectid_mapping(): array {
        return ['db' => 'scaffold', 'restore' => 'scaffold'];
    }
}
