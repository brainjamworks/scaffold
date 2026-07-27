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
 * English language strings for the Scaffold activity module.
 *
 * Defines the translatable text owned by the plugin.
 *
 * @package    mod_scaffold
 * @copyright  2026 Rizvan Ali
 * @license    https://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */

defined('MOODLE_INTERNAL') || die();

$string['answerrevealdisabled'] = 'Answer reveal is disabled.';
$string['answerrevealunavailable'] = 'The answer is not available to reveal.';
$string['artifactmodeinvalid'] = 'The Scaffold artifact mode is invalid.';
$string['assessmenthintcontentnotfound'] = 'Assessment hint content was not found.';
$string['assessmentresponseungradable'] = 'The assessment response cannot be graded.';
$string['assessmentstatelockfailed'] = 'Could not acquire the assessment state lock.';
$string['checkrequiresimmediatefeedback'] = 'Checking is available only for immediate feedback.';
$string['completionactivitystatus'] = 'Learner must complete the Scaffold assessment';
$string['completiondetail:activitystatus'] = 'Complete the Scaffold assessment';
$string['editscaffoldcontent'] = 'Edit Scaffold content';
$string['eventstatementreceived'] = 'xAPI statement received';
$string['grade'] = 'Maximum grade';
$string['grade_help'] = 'Maximum grade for this Scaffold activity.';
$string['gradestatus'] = 'Grade publication status';
$string['gradestatusactivityitem'] = 'Activity item';
$string['gradestatuscode'] = 'Code';
$string['gradestatusconfirm'] = 'I confirm the gradebook issue has been corrected';
$string['gradestatusdefinitionversion'] = 'Definition version';
$string['gradestatusnextaction'] = 'Next action';
$string['gradestatusrequeue'] = 'Requeue publication';
$string['gradestatusretries'] = 'Retries';
$string['gradestatusscope'] = 'Scope';
$string['gradestatusstaterevision'] = 'State revision';
$string['gradestatusstatus'] = 'Status';
$string['gradestatususerid'] = 'User ID';
$string['gradestatusversion'] = 'Version';
$string['hintreveallimitexceeded'] = 'The hint reveal limit has been exceeded.';
$string['learneractivitystatelockfailed'] = 'Could not acquire the learner activity state lock.';
$string['loaderror'] = 'Scaffold could not be loaded.';
$string['maximumattemptsexceeded'] = 'The maximum number of attempts has been exceeded.';
$string['medianotfound'] = 'Media was not found.';
$string['modulename'] = 'Scaffold';
$string['modulename_help'] = 'Create and deliver a Scaffold learning activity.';
$string['modulenameplural'] = 'Scaffold activities';
$string['pluginadministration'] = 'Scaffold administration';
$string['pluginname'] = 'Scaffold';
$string['privacy:metadata:scaffold_assessment_state'] = 'Stores canonical learner assessment state for Scaffold activities.';
$string['privacy:metadata:scaffold_assessment_state:nextquizexpiry'] = 'The next scheduled quiz expiry in the assessment state.';
$string['privacy:metadata:scaffold_assessment_state:scaffoldid'] = 'The Scaffold activity that owns the assessment state.';
$string['privacy:metadata:scaffold_assessment_state:snapshotjson'] = 'The learner assessment snapshot.';
$string['privacy:metadata:scaffold_assessment_state:staterevision'] = 'The revision of the learner assessment state.';
$string['privacy:metadata:scaffold_assessment_state:timecreated'] = 'When the learner assessment state was created.';
$string['privacy:metadata:scaffold_assessment_state:timemodified'] = 'When the learner assessment state was last changed.';
$string['privacy:metadata:scaffold_assessment_state:userid'] = 'The learner who owns the assessment state.';
$string['privacy:metadata:scaffold_grade_publications'] = 'Stores learner-specific grade publication diagnostics for Scaffold activities.';
$string['privacy:metadata:scaffold_grade_publications:definitionversion'] = 'The assessment definition version used for publication.';
$string['privacy:metadata:scaffold_grade_publications:failurecode'] = 'The privacy-safe code describing the last publication failure.';
$string['privacy:metadata:scaffold_grade_publications:retryafter'] = 'When publication may next be retried.';
$string['privacy:metadata:scaffold_grade_publications:retrycount'] = 'The number of publication attempts for this state.';
$string['privacy:metadata:scaffold_grade_publications:scaffoldid'] = 'The Scaffold activity that owns the publication diagnostics.';
$string['privacy:metadata:scaffold_grade_publications:staterevision'] = 'The learner assessment state revision used for publication.';
$string['privacy:metadata:scaffold_grade_publications:status'] = 'The current publication status for the learner state.';
$string['privacy:metadata:scaffold_grade_publications:timecreated'] = 'When the publication diagnostics were created.';
$string['privacy:metadata:scaffold_grade_publications:timemodified'] = 'When the publication diagnostics were last changed.';
$string['privacy:metadata:scaffold_grade_publications:userid'] = 'The learner who owns the publication diagnostics.';
$string['privacy:metadata:scaffold_learner_activity'] = 'Stores canonical learner progress for Scaffold activity blocks.';
$string['privacy:metadata:scaffold_learner_activity:scaffoldid'] = 'The Scaffold activity that owns the learner progress.';
$string['privacy:metadata:scaffold_learner_activity:snapshotjson'] = 'The learner activity progress snapshot.';
$string['privacy:metadata:scaffold_learner_activity:timecreated'] = 'When the learner activity progress was created.';
$string['privacy:metadata:scaffold_learner_activity:timemodified'] = 'When the learner activity progress was last changed.';
$string['privacy:metadata:scaffold_learner_activity:userid'] = 'The learner who owns the activity progress.';
$string['problemnotfound'] = 'The assessment problem was not found.';
$string['quizanswerreviewdisabled'] = 'Quiz answer review is disabled.';
$string['quizattemptnotcomplete'] = 'The Quiz attempt is not complete.';
$string['quizattemptnotlatest'] = 'The Quiz attempt is not the latest attempt.';
$string['quizcurrentquestion'] = 'The current Quiz question is {$a}.';
$string['quizfinishtiminginvalid'] = 'The Quiz can be finished only after the Quiz or when the attempt has expired.';
$string['quizgroupnotfound'] = 'The Quiz group was not found.';
$string['quizquestionsubmissiontiminginvalid'] = 'Quiz questions can be submitted only with after-each-answer feedback.';
$string['quiztargetrequiresquizattempt'] = 'Quiz target requires a Quiz attempt';
$string['scaffold:addinstance'] = 'Add a Scaffold activity';
$string['scaffold:editcontent'] = 'Edit Scaffold content';
$string['scaffold:submit'] = 'Submit Scaffold responses';
$string['scaffold:view'] = 'View Scaffold content';
$string['scaffold:viewgradestatus'] = 'View Scaffold grade publication status';
$string['taskreconcileassessmentgrades'] = 'Reconcile Scaffold assessment grades';
$string['taskreconcilequizexpiry'] = 'Reconcile expired Scaffold quizzes';
