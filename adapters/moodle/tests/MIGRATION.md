# Moodle Standalone Test Migration Ledger

This ledger tracks the temporary standalone PHP scripts while their behaviour
is moved to Moodle's component PHPUnit suite. A call-site count is an inventory
control, not a claim that one call site represents one runtime case: loops and
data sets are expanded in the detailed rows when their owning batch is
migrated.

Allowed states are `pending`, `native-existing`, `native-migrated`,
`repository-owned`, and `obsolete-with-proof`. No standalone source may be
deleted while one of its detailed rows is `pending`.

## Complete Script Inventory

| Standalone source | Assertion or guard call sites | Target owner | State |
| --- | ---: | --- | --- |
| `assessment_contract_test.php` | 36 | Native contract tests and artifact checks | Detailed below |
| `assessment_grade_projection_test.php` | 39 | Native grade projector test | Detailed below |
| `assessment_projection_test.php` | 49 | Native projection and content-service tests | `pending` |
| `assessment_quiz_external_test.php` | 21 | Native external API test | `pending` |
| `assessment_quiz_test.php` | 68 | Native quiz test and frontend port test | Detailed below |
| `assessment_state_test.php` | 166 | Native repository and assessment-service tests | `pending` |
| `branding_test.php` | 5 | Native callback test and repository SVG check | `pending` |
| `cm_info_contract_test.php` | 9 | Native callback test | `pending` |
| `custom_completion_test.php` | 20 | Native custom-completion test | `pending` |
| `external_method_parity_test.php` | 3 | Frontend bridge protocol test | `pending` |
| `grade_publisher_test.php` | 38 | Native grade-publisher test | `pending` |
| `grade_reconciler_test.php` | 10 | Native reconciler and publication-repository tests | `pending` |
| `grader_test.php` | 18 | Native grader test | Detailed below |
| `grading_conformance_test.php` | 10 | Native grader corpus provider and artifact check | Detailed below |
| `learner_activity_api_test.php` | 63 | Native external API and learner-activity service tests | `pending` |
| `learner_activity_contract_test.php` | 22 | Native learner-activity contract test | Detailed below |
| `learner_activity_state_test.php` | 48 | Native learner-activity service and deletion tests | `pending` |
| `media_service_test.php` | 26 | Native media-service test using Moodle File API | `pending` |
| `payload_test.php` | 14 | Native content-service and external API tests | `pending` |
| `pluginfile_contract_test.php` | 3 | Native callback or repository callback contract | `pending` |
| **Total** | **668** | | |

The unresolved scripts above are inventoried by file and call-site count now.
Their assertion messages and loop cases must be expanded into detailed rows in
their owning migration task before their state can change or their source can
be removed.

## Pure Contract Batch

Each semicolon-delimited numbered clause in the **Source assertion or case**
column is a separately tracked assertion. Repeated inputs shown in braces are a
single parameterized row only where the destination uses those same named data
set keys.

| Source | Source assertion or case | Behaviour owner | Destination and method | State | Evidence |
| --- | --- | --- | --- | --- | --- |
| `assessment_contract_test.php` | 1. `test` command checks artifacts first; 2. `build` command checks artifacts first | Adapter package contract | Artifact command itself plus `@scaffold/adapter-moodle#test` and `#build` | `repository-owned` | Both commands execute `check:artifacts` before their work |
| `assessment_contract_test.php` | 1. artifact command covers assessment artifacts; 2. artifact command covers learner activity; 3. complete `verify` command exists | Adapter package contract | `package.json` command contract | `repository-owned` | `#verify` invokes artifact, lint, test, and build checks |
| `assessment_contract_test.php` | assessment sync diagnostics `{missing packaged, modified packaged, repair command}` | Artifact synchronizer | `sync-assessment-artifacts.mjs --check` | `repository-owned` | `#check:assessment-artifacts` exercises the diagnostic owner |
| `assessment_contract_test.php` | native testcase files `{activity_access, activity_deletion, assessment_definition, assessment_service, backup, content_service, grade_item_publisher, grade_publication_repository, grade_publisher, grade_reconciler_task, grade_status_report, learner_activity_service, privacy_provider, quiz_expiry_task, quiz_expiry, restore}` exist | Moodle component suite | Moodle PHPUnit suite discovery | `native-existing` | Task 1 CI ran `mod_scaffold_testsuite` in both environments |
| `assessment_contract_test.php` | vendored assessment schema bytes equal canonical schema | Artifact synchronizer | `sync-assessment-artifacts.mjs --check` | `repository-owned` | `#check:assessment-artifacts` compares bytes |
| `assessment_contract_test.php` | canonical target accepted | Assessment schema | `assessment_contract_test::test_target_contract_accepts_canonical_target` | `native-migrated` | Native assertion |
| `assessment_contract_test.php` | target rejects `{removed setting, unknown target field, unknown interaction field, unknown option field, unknown answer field, answer-kind mismatch}` | Assessment schema | `assessment_contract_test::test_target_contract_rejects_invalid_shape` with matching provider IDs | `native-migrated` | Six native provider cases |
| `assessment_contract_test.php` | 1. canonical quiz group accepted; 2. duplicate group target IDs rejected | Assessment schema | `assessment_contract_test::test_group_contract_accepts_canonical_group_and_rejects_duplicates` | `native-migrated` | Two native assertions |
| `assessment_contract_test.php` | 1. response object accepted; 2. response list rejected | Assessment schema | `assessment_contract_test::test_response_contract_requires_an_object` | `native-migrated` | Two native assertions |
| `assessment_contract_test.php` | canonical result accepted | Assessment schema | `assessment_contract_test::test_result_contract_accepts_canonical_result` | `native-migrated` | Native assertion |
| `assessment_contract_test.php` | result score rejects `{INF, NAN}` | Assessment schema | `assessment_contract_test::test_result_contract_rejects_nonfinite_score` with matching provider IDs | `native-migrated` | Two native provider cases |
| `assessment_contract_test.php` | 1. canonical grade projection accepted; 2. graded/null mismatch rejected; 3. noncanonical timestamp rejected | Assessment schema | `assessment_contract_test::test_grade_projection_contract_couples_status_score_and_timestamp` | `native-migrated` | Three native assertions |
| `assessment_contract_test.php` | 1. canonical empty problem accepted; 2. submitted-without-result rejected | Assessment schema | `assessment_contract_test::test_problem_contract_couples_submission_and_result` | `native-migrated` | Two native assertions |
| `assessment_contract_test.php` | 1. canonical quiz snapshot accepted; 2. score/max mismatch rejected; 3. duplicate submitted target IDs rejected | Assessment schema | `assessment_contract_test::test_quiz_snapshot_contract_couples_score_and_unique_targets` | `native-migrated` | Three native assertions |
| `assessment_contract_test.php` | 1. canonical learner snapshot accepted; 2. composite problem key rejected; 3. stored group ID rejected | Assessment schema | `assessment_contract_test::test_learner_snapshot_uses_local_identity_free_keys` | `native-migrated` | Three native assertions |
| `assessment_contract_test.php` | schema resource rejects `{unsupported keyword, invalid JSON}` | Schema loader | `assessment_contract_test::test_schema_loader_rejects_invalid_resources` with matching provider IDs | `native-migrated` | Two native provider cases |
| `assessment_contract_test.php` | missing schema rejects without leaking a PHP warning | Schema loader | `assessment_contract_test::test_schema_loader_rejects_missing_resource_without_warning` | `native-migrated` | Native filesystem assertion |
| `assessment_contract_test.php` | unknown definition rejected | Schema loader | `assessment_contract_test::test_schema_validator_rejects_unknown_definition` | `native-migrated` | Native expected exception |
| `assessment_contract_test.php` | 1. target boundary preserves values; 2. duplicate target ID rejected | Target validator | `assessment_contract_test::test_target_boundary_preserves_values_and_rejects_duplicate_id` | `native-migrated` | Two native assertions |
| `assessment_contract_test.php` | 1. group boundary preserves values; 2. duplicate group ID rejected; 3. missing target rejected; 4. overlapping quiz ownership rejected | Group validator | `assessment_contract_test::test_group_boundary_preserves_values_and_rejects_invalid_ownership` | `native-migrated` | Four native assertions |
| `assessment_grade_projection_test.php` | 1. weighted score is 0.8; 2. activity completed; 3. grading status graded; 4. change time retained; 5. exactly four contract fields; 6. scale 20 maps to 16; 7. repeated scale mapping stable; 8. scale 100 maps to 80 | Grade projector | `assessment_grade_projector_test::test_weighted_projection_and_moodle_scale_mapping` | `native-migrated` | Eight native assertions |
| `assessment_grade_projection_test.php` | standalone policy `{not started, started without result, provisional numeric}` × `{activity status, grading status, fixed-denominator score}`; provisional publication maps to 4 | Grade projector | `assessment_grade_projector_test::test_standalone_state_policy` with matching provider IDs | `native-migrated` | Ten native provider assertions |
| `assessment_grade_projection_test.php` | quiz policy `{in progress, completed, expired}` × `{activity status, terminal-only score}` | Grade projector | `assessment_grade_projector_test::test_quiz_state_policy` with matching provider IDs | `native-migrated` | Six native provider assertions |
| `assessment_grade_projection_test.php` | 1. legacy standalone quiz problem gives no credit; 2. it does not complete quiz | Grade projector | `assessment_grade_projector_test::test_legacy_standalone_quiz_problem_is_not_grade_credit` | `native-migrated` | Two native assertions |
| `assessment_grade_projection_test.php` | 1. ungraded activity has no score; 2. completes; 3. remains not ready; 4. suppresses Moodle update | Grade projector | `assessment_grade_projector_test::test_ungraded_activity_completes_without_grade` | `native-migrated` | Four native assertions |
| `assessment_grade_projection_test.php` | 1. unfinished practice keeps activity in progress; 2. only graded work scores; 3. all authored terminal work completes; 4. practice does not change score | Grade projector | `assessment_grade_projector_test::test_all_authored_work_controls_completion_but_only_graded_work_scores` | `native-migrated` | Four native assertions |
| `assessment_grade_projection_test.php` | 1. terminal ungraded quiz completes; 2. contributes no score; 3. remains not ready | Grade projector | `assessment_grade_projector_test::test_ungraded_quiz_completes_without_grade` | `native-migrated` | Three native assertions |
| `assessment_grade_projection_test.php` | 1. mixed work completes only when terminal; 2. weighted score is 0.625; 3. grading status is graded | Grade projector | `assessment_grade_projector_test::test_mixed_quiz_and_standalone_work_share_authored_weighting` | `native-migrated` | Three native assertions |
| `assessment_grade_projection_test.php` | 1. no graded targets gives no grade; 2. null Moodle maximum suppresses grade; 3. zero maximum suppresses grade | Grade projector | `assessment_grade_projector_test::test_unbound_moodle_grade_scale_suppresses_grade` | `native-migrated` | Three native assertions |
| `assessment_grade_projection_test.php` | invalid Moodle maximum `{negative, INF, NAN, boolean, string}` rejected | Grade projector | `assessment_grade_projector_test::test_invalid_moodle_maximum_is_rejected` with matching provider IDs | `native-migrated` | Five native provider cases |
| `assessment_grade_projection_test.php` | invalid contract timestamp rejected | Grade projector | `assessment_grade_projector_test::test_build_validates_contract_owned_projection` | `native-migrated` | Native expected exception |
| `grader_test.php` | single select: 1. correct; 2. score 1; 3. max 1; 4. summary feedback complete; 5. selected item correct | Grader | `grader_test::test_single_select_result_includes_feedback_and_item_outcome` | `native-migrated` | Five native assertions |
| `grader_test.php` | multi select: 1. partial selection incorrect; 2. wrong pick offsets correct pick | Grader | `grader_test::test_multi_select_applies_wrong_pick_penalty` | `native-migrated` | Two native assertions |
| `grader_test.php` | fill blanks: 1. case/space normalization correct; 2. score 1 | Grader | `grader_test::test_fill_blanks_normalises_case_and_whitespace` | `native-migrated` | Two native assertions |
| `grader_test.php` | empty result: 1. feedback explicit null; 2. items serialize as object | Grader | `grader_test::test_empty_result_preserves_contract_object_shape` | `native-migrated` | Two native assertions |
| `grader_test.php` | empty rich-text feedback retained | Grader | `grader_test::test_empty_rich_text_feedback_is_not_omitted` | `native-migrated` | Native assertion |
| `grader_test.php` | targets `{2-point graded, 8-point ungraded}` × `{score unit, maximum unit, no points field, no isGraded field}` | Grader | `grader_test::test_results_remain_unweighted_units` | `native-migrated` | Eight native loop assertions |
| `grader_test.php` | 1. valid stored result accepted; 2. missing max rejected; 3. list-shaped items rejected | Result schema | `grader_test::test_stored_result_contract_rejects_malformed_shapes` | `native-migrated` | Three native assertions |
| `grading_conformance_test.php` | 1. native corpus exists; 2. corpus shape valid; 3. exactly 21 cases; 4. each case has ID, target, response, expected object | Canonical grading corpus loader | `grader_test::grading_case_provider` | `native-migrated` | Provider fails closed before cases run |
| `grading_conformance_test.php` | canonical bytes equal source bytes | Artifact synchronizer | `sync-assessment-artifacts.mjs --check` | `repository-owned` | `#check:assessment-artifacts` byte comparison |
| `grading_conformance_test.php` | corpus cases `{single-select-happy, single-select-fail, single-select-empty-answer, multi-select-happy, multi-select-wrong-pick-penalty, multi-select-empty-answer, sequence-happy, sequence-partial-missing-selection, sequence-empty-answer, match-happy, match-partial-missing-pair, match-empty-answer, classify-happy, classify-partial-wrong-placement, classify-empty-answer, fill-blanks-happy-normalized, fill-blanks-partial-normalization-flags, fill-blanks-empty-answer, spatial-hotspot-partial-credit-happy, spatial-hotspot-all-or-nothing-fail, spatial-hotspot-empty-answer}` × `{result schema, integer max 1, numeric score, normalized range, actual items object, expected items object, normalized result equality}` | Grader | `grader_test::test_canonical_grading_case` with identical corpus IDs | `native-migrated` | 21 native provider cases, seven assertions per case |
| `learner_activity_contract_test.php` | 1. vendored schema bytes equal canonical; 2. drift diagnostics `{missing, modified, repair command}`; 3. native service test exists | Artifact and suite contracts | Learner artifact check and Moodle suite discovery | `repository-owned` | `#check:learner-activity-artifact`; Task 1 native CI |
| `learner_activity_contract_test.php` | 1. canonical record accepted; 2. canonical snapshot accepted | Learner schema | `learner_activity_contract_test::test_valid_record_and_snapshot_are_accepted` | `native-migrated` | Two native assertions |
| `learner_activity_contract_test.php` | blank identity `{empty, whitespace}` × `{artifact ID rejected, activity kind rejected}` | Learner schema | `learner_activity_contract_test::test_blank_artifact_identity_and_activity_kind_are_rejected` with matching provider IDs | `native-migrated` | Four native provider assertions |
| `learner_activity_contract_test.php` | snapshot rejects 1. blank block ID; 2. composite runtime key; 3. future version; 4. malformed envelope; 5. extra field | Learner schema | `learner_activity_contract_test::test_snapshot_rejects_invalid_identity_and_envelope_shapes` | `native-migrated` | Five native assertions |
| `learner_activity_contract_test.php` | record rejects 1. assessment field; 2. list root data; 3. recursively nonfinite value | Learner schema | `learner_activity_contract_test::test_record_rejects_assessment_fields_and_invalid_data` | `native-migrated` | Three native assertions |
| `learner_activity_contract_test.php` | timestamp rejects `{missing timezone, invalid date}` | Learner schema | `learner_activity_contract_test::test_invalid_updated_at_is_rejected` with matching provider IDs | `native-migrated` | Two native provider cases |
| `learner_activity_contract_test.php` | unsupported schema keyword rejected | Schema loader | `learner_activity_contract_test::test_schema_loader_rejects_unsupported_keywords` | `native-migrated` | Native filesystem assertion |
| `learner_activity_contract_test.php` | 1. assessment validator accepts assessment snapshot; 2. learner validator rejects assessment snapshot; 3. assessment validator rejects learner snapshot; 4. assessment validator does not expose learner definition; 5. learner validator does not expose assessment definition | Validator ownership boundary | `learner_activity_contract_test::test_assessment_and_learner_activity_validators_are_isolated` | `native-migrated` | Five native assertions |
| `assessment_quiz_test.php` | dependency guard detects `{require, import, name, call}` and ignores comments; quiz source readable and contains no public-projection reference | Quiz dependency boundary | `assessment_quiz_test::{test_dependency_guard_detects_public_projection_reference,test_dependency_guard_ignores_comments,test_quiz_does_not_depend_on_public_projection}` | `native-migrated` | Seven native assertions |
| `assessment_quiz_test.php` | result-only projection: 1. no item outcomes; 2. default feedback null; 3. authorized feedback preserved | Result projection | `assessment_quiz_test::test_result_only_projection_redacts_reconstructable_outcomes` | `native-migrated` | Three native assertions |
| `assessment_quiz_test.php` | repository methods `{start, submit_question, finish, reveal}` absent | Quiz state ownership | `assessment_quiz_test::test_quiz_exposes_only_caller_owned_state_transitions` | `native-migrated` | Four native loop assertions |
| `assessment_quiz_test.php` | start/retry lifecycle: 1. in progress; 2. first target; 3. identity free; 4. retry remains current; 5. attempt consumed; 6. stale returns canonical; 7. stale preserves state; 8. stale does not grade; 9. future sequence rejected; 10. rejection does not grade; 11. correct advances; 12. target becomes terminal; 13. final completes; 14. score 2; 15. max 2; 16. no current target; 17. review authorized; 18. reveal authorized | Quiz state machine | `assessment_quiz_test::test_after_each_answer_state_transitions_are_idempotent` | `native-migrated` | Eighteen native assertions |
| `assessment_quiz_test.php` | expired finish: 1. status; 2. zero score; 3. denominator retained; 4. no grading; 5. no late results; 6. no problem; 7. duplicate canonical; 8. state preserved; 9. still no grading | Quiz state machine | `assessment_quiz_test::test_expired_finish_ignores_late_payload_and_is_idempotent` | `native-migrated` | Nine native assertions |
| `assessment_quiz_test.php` | in-progress review `{none, result_only, full_review}` × `{authorization policy, full storage, permitted public shape, no public answer/feedback material}` | Quiz public projection | `assessment_quiz_test::test_in_progress_review_policy_never_exposes_answer_material` with matching provider IDs | `native-migrated` | Three native provider cases |
| `assessment_quiz_test.php` | terminal review `{none, result_only, full_review}` × `{authorization policy, full storage, permitted result/problem detail, reveal permission, reveal does not mutate}` | Quiz public projection | `assessment_quiz_test::test_terminal_review_policy_exposes_only_authorized_detail` with matching provider IDs | `native-migrated` | Three native provider cases |
| `assessment_quiz_test.php` | 1. public quiz snapshot identity free; 2. public snapshot matches learner contract | Public projection | `assessment_quiz_test::test_public_snapshot_is_identity_free_and_matches_contract` | `native-migrated` | Two native assertions |
| `assessment_quiz_test.php` | legacy reveal: 1. authorizes response; 2. exposes expected answer; 3. exposes feedback; 4. does not mutate stored authorization/detail | Quiz public projection | `assessment_quiz_test::test_legacy_full_review_reveal_is_state_only` | `native-migrated` | Four native assertions |
| `assessment_quiz_test.php` | expiry reconciliation: 1. both due IDs returned; 2. first expires; 3. second expires; 4. future stays active; 5. server timestamp used; 6. repeat is idempotent; 7. invalid deadline rejected | Quiz state machine | `assessment_quiz_test::test_expiry_reconciliation_finalizes_every_due_quiz_idempotently` | `native-migrated` | Seven native assertions |
| `assessment_quiz_test.php` | service registry exposes `{start, submit question, finish, reveal}` quiz methods | Moodle service registry | `assessment_quiz_test::test_external_service_registry_exposes_quiz_lifecycle` | `native-migrated` | Four native assertions |
| `assessment_quiz_test.php` | frontend implements quiz port and validates command outcome | Frontend Moodle port | `frontend/src/ports.test.ts::forwards and validates the complete Quiz lifecycle` | `repository-owned` | Vitest covers all four calls and parsed outcomes |

## Batch Gate

The detailed pure rows may be considered migrated only after:

1. The retained standalone scripts pass with the moved fixture.
2. Artifact byte checks and PHP syntax checks pass.
3. `mod_scaffold_testsuite` passes on Moodle 4.5/PHP 8.1/MySQL and Moodle
   5.2/PHP 8.3/PostgreSQL for the migration commit.
