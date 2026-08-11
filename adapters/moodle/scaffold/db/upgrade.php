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

/**
 * Database upgrades for the Scaffold activity module.
 *
 * @package    mod_scaffold
 * @copyright  2026 Rizvan Ali
 * @license    https://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */

/**
 * Execute Scaffold database upgrades.
 *
 * @param int $oldversion Previously installed plugin version.
 * @return bool
 */
function xmldb_scaffold_upgrade($oldversion): bool {
    global $DB;

    if ($oldversion < 2026081000) {
        $records = $DB->get_records_sql(
            "SELECT s.id, s.name, s.timemodified, s.learnercontentjson, cm.id AS cmid
               FROM {scaffold} s
               JOIN {course_modules} cm ON cm.instance = s.id
               JOIN {modules} m ON m.id = cm.module AND m.name = :modulename",
            ['modulename' => 'scaffold'],
        );
        foreach ($records as $record) {
            $raw = (string) $record->learnercontentjson;
            if (trim($raw) === 'null') {
                continue;
            }
            try {
                $value = json_decode($raw, false, 512, JSON_THROW_ON_ERROR);
            } catch (JsonException $exception) {
                throw new moodle_exception('publicationmigrationinvalid', 'scaffold', '', null, $exception->getMessage());
            }
            if (!($value instanceof stdClass)) {
                throw new moodle_exception('publicationmigrationinvalid', 'scaffold');
            }
            if (($value->publicationVersion ?? null) === 1) {
                continue;
            }
            $course = $value->content[0] ?? null;
            $attrs = $course instanceof stdClass ? ($course->attrs ?? null) : null;
            $mode = $attrs instanceof stdClass && is_string($attrs->mode ?? null)
                ? $attrs->mode
                : 'page';
            $requiresplus = $attrs instanceof stdClass && is_bool($attrs->requiresScaffoldPlus ?? null)
                ? $attrs->requiresScaffoldPlus
                : false;
            $envelope = (object) [
                'publicationVersion' => 1,
                'sourceArtifactRevision' => hash('sha256', "migrated-publication\0" . $raw),
                'publishedAt' => gmdate('Y-m-d\TH:i:s\Z', (int) $record->timemodified),
                'artifact' => (object) [
                    'id' => 'moodle-cm-' . $record->cmid,
                    'title' => (string) $record->name,
                    'mode' => $mode,
                    'requiresScaffoldPlus' => $requiresplus,
                ],
                'learnerContent' => $value,
            ];
            $DB->set_field(
                'scaffold',
                'learnercontentjson',
                json_encode($envelope, JSON_THROW_ON_ERROR),
                ['id' => $record->id],
            );
        }
        upgrade_mod_savepoint(true, 2026081000, 'scaffold');
    }

    return true;
}
