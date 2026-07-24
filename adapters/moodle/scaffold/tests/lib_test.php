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

use mod_scaffold\local\activity_scope;

defined('MOODLE_INTERNAL') || die();

/**
 * Tests Moodle module callbacks against core records, contexts, and files.
 *
 * @package    mod_scaffold
 * @copyright  2026 Rizvan Ali
 * @license    https://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
final class lib_test extends \advanced_testcase {
    public function test_advertises_supported_features_and_branded_icon(): void {
        global $CFG;

        require_once($CFG->dirroot . '/mod/scaffold/lib.php');

        $this->assertTrue(scaffold_supports(FEATURE_MOD_INTRO));
        $this->assertTrue(scaffold_supports(FEATURE_COMPLETION_TRACKS_VIEWS));
        $this->assertTrue(scaffold_supports(FEATURE_COMPLETION_HAS_RULES));
        $this->assertTrue(scaffold_supports(FEATURE_GRADE_HAS_GRADE));
        $this->assertTrue(scaffold_supports(FEATURE_BACKUP_MOODLE2));
        $this->assertTrue(scaffold_supports(FEATURE_SHOW_DESCRIPTION));
        $this->assertSame(
            MOD_PURPOSE_INTERACTIVECONTENT,
            scaffold_supports(FEATURE_MOD_PURPOSE),
        );
        $this->assertNull(scaffold_supports('mod/scaffold:unknown-feature'));
        $this->assertTrue(scaffold_is_branded());
    }

    public function test_course_module_info_exposes_the_enabled_completion_rule(): void {
        global $CFG;

        $this->resetAfterTest(true);
        require_once($CFG->dirroot . '/mod/scaffold/lib.php');
        [$course, $activity, $cm] = $this->create_activity(true);

        $info = scaffold_get_coursemodule_info((object) [
            'instance' => $activity->id,
            'completion' => COMPLETION_TRACKING_AUTOMATIC,
        ]);
        $this->assertInstanceOf(\cached_cm_info::class, $info);
        $this->assertSame(
            1,
            $info->customdata['customcompletionrules']['completionactivitystatus'],
        );

        rebuild_course_cache((int) $course->id, true);
        $runtimecm = get_fast_modinfo($course)->get_cm($cm->id);
        $this->assertSame(
            1,
            $runtimecm->customdata['customcompletionrules']['completionactivitystatus'],
        );
        $this->assertSame(
            [get_string('completiondetail:activitystatus', 'scaffold')],
            mod_scaffold_get_completion_active_rule_descriptions($runtimecm),
        );
        $this->assertSame(
            [get_string('completiondetail:activitystatus', 'scaffold')],
            mod_scaffold_get_completion_active_rule_descriptions((object) [
                'completion' => COMPLETION_TRACKING_AUTOMATIC,
                'customdata' => [
                    'customcompletionrules' => ['completionactivitystatus' => 1],
                ],
            ]),
        );
        $this->assertSame([], mod_scaffold_get_completion_active_rule_descriptions((object) [
            'completion' => COMPLETION_TRACKING_NONE,
            'customdata' => [],
        ]));
        $this->assertFalse(scaffold_get_coursemodule_info((object) [
            'instance' => (int) $activity->id + 9999,
            'completion' => COMPLETION_TRACKING_AUTOMATIC,
        ]));
    }

    public function test_activity_scope_keeps_moodle_authorization_evidence_immutable(): void {
        $this->resetAfterTest(true);
        [, $activity, $cm, $context] = $this->create_activity();
        $actor = $this->getDataGenerator()->create_user();

        $scope = new activity_scope(
            get_course((int) $activity->course),
            $cm,
            $context,
            $activity,
            (int) $actor->id,
            'mod/scaffold:view',
        );

        $this->assertSame((int) $cm->id, (int) $scope->cm->id);
        $this->assertSame((int) $context->id, (int) $scope->context->id);
        foreach (['course', 'cm', 'context', 'instance', 'actorid', 'capability'] as $propertyname) {
            $this->assertTrue(
                (new \ReflectionProperty(activity_scope::class, $propertyname))->isReadOnly(),
                $propertyname,
            );
        }
    }

    public function test_pluginfile_rejects_invalid_or_unauthorized_file_lookups(): void {
        global $DB;

        $this->resetAfterTest(true);
        [$course, $activity, $cm, $context] = $this->create_activity();
        $learner = $this->getDataGenerator()->create_user();
        $studentroleid = $DB->get_field(
            'role',
            'id',
            ['shortname' => 'student'],
            MUST_EXIST,
        );
        $this->getDataGenerator()->enrol_user(
            $learner->id,
            $course->id,
            $studentroleid,
        );
        $this->setUser($learner);
        $cmrecord = get_coursemodule_from_id('scaffold', $cm->id, 0, false, MUST_EXIST);

        $this->assertFalse(mod_scaffold_pluginfile(
            $course,
            $cmrecord,
            \context_course::instance($course->id),
            'media',
            [$activity->id, 'image.png'],
            false,
        ));
        $this->assertFalse(mod_scaffold_pluginfile(
            $course,
            $cmrecord,
            $context,
            'intro',
            [$activity->id, 'image.png'],
            false,
        ));
        $this->assertFalse(mod_scaffold_pluginfile(
            $course,
            $cmrecord,
            $context,
            'media',
            [(int) $activity->id + 1, 'image.png'],
            false,
        ));
        $this->assertFalse(mod_scaffold_pluginfile(
            $course,
            $cmrecord,
            $context,
            'media',
            [$activity->id],
            false,
        ));
        $this->assertFalse(mod_scaffold_pluginfile(
            $course,
            $cmrecord,
            $context,
            'media',
            [$activity->id, 'missing.png'],
            false,
        ));

        $file = get_file_storage()->create_file_from_string([
            'contextid' => $context->id,
            'component' => 'mod_scaffold',
            'filearea' => 'media',
            'itemid' => $activity->id,
            'filepath' => '/nested/',
            'filename' => 'image.png',
        ], 'image bytes');
        $this->assertSame('image bytes', $file->get_content());
        $this->assertNotFalse(get_file_storage()->get_file(
            $context->id,
            'mod_scaffold',
            'media',
            $activity->id,
            '/nested/',
            'image.png',
        ));

        assign_capability(
            'mod/scaffold:view',
            CAP_PROHIBIT,
            $studentroleid,
            $context->id,
            true,
        );
        accesslib_clear_all_caches_for_unit_testing();
        $this->assertFalse(mod_scaffold_pluginfile(
            $course,
            $cmrecord,
            $context,
            'media',
            [$activity->id, 'nested', 'image.png'],
            false,
        ));
    }

    /**
     * Creates activity.
     *
     * @param bool $completionenabled Completionenabled.
     * @return array{\stdClass, \stdClass, \cm_info, \context_module}
     */
    private function create_activity(bool $completionenabled = false): array {
        global $CFG, $DB;

        require_once($CFG->dirroot . '/course/lib.php');
        require_once($CFG->dirroot . '/mod/scaffold/lib.php');

        $course = $this->getDataGenerator()->create_course([
            'enablecompletion' => $completionenabled ? 1 : 0,
        ]);
        $activityid = scaffold_add_instance((object) [
            'course' => $course->id,
            'name' => 'Moodle callback fixture',
            'intro' => '',
            'introformat' => FORMAT_HTML,
            'grade' => 100,
            'completionactivitystatus' => $completionenabled ? 1 : 0,
        ]);
        $moduleid = $DB->get_field('modules', 'id', ['name' => 'scaffold'], MUST_EXIST);
        $cmid = $DB->insert_record('course_modules', (object) [
            'course' => $course->id,
            'module' => $moduleid,
            'instance' => $activityid,
            'section' => 0,
            'idnumber' => '',
            'added' => time(),
            'score' => 0,
            'indent' => 0,
            'visible' => 1,
            'visibleold' => 1,
            'groupmode' => 0,
            'groupingid' => 0,
            'completion' => $completionenabled
                ? COMPLETION_TRACKING_AUTOMATIC
                : COMPLETION_TRACKING_NONE,
            'completiongradeitemnumber' => null,
            'completionview' => 0,
            'completionexpected' => 0,
            'completionpassgrade' => 0,
            'showdescription' => 0,
        ]);
        course_add_cm_to_section($course, $cmid, 0);
        rebuild_course_cache((int) $course->id, true);

        return [
            $course,
            $DB->get_record('scaffold', ['id' => $activityid], '*', MUST_EXIST),
            get_fast_modinfo($course)->get_cm($cmid),
            \context_module::instance($cmid),
        ];
    }
}
