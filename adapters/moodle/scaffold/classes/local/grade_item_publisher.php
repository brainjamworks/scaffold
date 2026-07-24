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

namespace mod_scaffold\local;

defined('MOODLE_INTERNAL') || die();

require_once(__DIR__ . '/assessment_projection.php');

/**
 * Publishes the Scaffold grade item configuration.
 *
 * Keeps the Moodle gradebook item aligned with the activity settings.
 *
 * @package    mod_scaffold
 * @copyright  2026 Rizvan Ali
 * @license    https://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
final class grade_item_publisher {
    /**
     * RETRY DELAY SECONDS.
     */
    private const RETRY_DELAY_SECONDS = 60;
    /**
     * MAX RETRY DELAY SECONDS.
     */
    private const MAX_RETRY_DELAY_SECONDS = 3600;

    /** @var \Closure Activity loading callback. */
    private readonly \Closure $activityloader;
    /** @var \Closure Grade item update callback. */
    private readonly \Closure $itemupdater;
    /** @var \Closure Grade item deletion callback. */
    private readonly \Closure $itemdeleter;
    /** @var \Closure Publication status callback. */
    private readonly \Closure $statuspersister;
    /** @var \Closure Clock callback. */
    private readonly \Closure $clock;

    /**
     * Creates a new grade item publisher instance.
     *
     * @param callable|null $activityloader Activity loading callback.
     * @param callable|null $itemupdater Grade item update callback.
     * @param callable|null $itemdeleter Grade item deletion callback.
     * @param callable|null $statuspersister Publication status callback.
     * @param callable|null $clock Clock callback.
     */
    public function __construct(
        ?callable $activityloader = null,
        ?callable $itemupdater = null,
        ?callable $itemdeleter = null,
        ?callable $statuspersister = null,
        ?callable $clock = null,
    ) {
        $this->activityloader = \Closure::fromCallable($activityloader ?? static function (int $scaffoldid): \stdClass {
            global $DB;
            return $DB->get_record('scaffold', ['id' => $scaffoldid], '*', MUST_EXIST);
        });
        $this->itemupdater = \Closure::fromCallable($itemupdater ?? static function (\stdClass $scaffold): int {
            global $CFG;
            require_once($CFG->dirroot . '/mod/scaffold/lib.php');
            return scaffold_grade_item_apply($scaffold);
        });
        $this->itemdeleter = \Closure::fromCallable($itemdeleter ?? static function (\stdClass $scaffold): int {
            global $CFG;
            require_once($CFG->dirroot . '/mod/scaffold/lib.php');
            return scaffold_grade_item_withdraw($scaffold);
        });
        $this->statuspersister = \Closure::fromCallable(
            $statuspersister ?? static function (\stdClass $loaded, array $status): bool {
                global $DB;
                $current = $DB->get_record('scaffold', ['id' => $loaded->id], '*', MUST_EXIST);
                if ((int) $current->assessmentdefinitionversion !== (int) $loaded->assessmentdefinitionversion) {
                    return false;
                }
                $record = (object) array_merge(['id' => $loaded->id], $status);
                $DB->update_record('scaffold', $record);
                return true;
            },
        );
        $this->clock = \Closure::fromCallable($clock ?? static fn(): int => time());
    }

    /**
     * Publishes the supplied state.
     *
     * @param \stdClass $scaffold Scaffold.
     * @return \stdClass
     */
    public function publish(\stdClass $scaffold): \stdClass {
        $scaffoldid = (int) ($scaffold->id ?? 0);
        if ($scaffoldid <= 0) {
            throw new \invalid_parameter_exception('Grade item publication identity is invalid');
        }

        $current = ($this->activityloader)($scaffoldid);
        $definition = assessment_projection::for_activity($current);
        $withdraw = (float) ($current->grade ?? 0) <= 0
            || !self::has_graded_sources($definition['targets'], $definition['groups']);

        try {
            $status = $withdraw
                ? ($this->itemdeleter)($current)
                : ($this->itemupdater)($current);
        } catch (\Throwable) {
            return $this->persist_failure($current, 'grade_item_update_exception', true);
        }

        return $this->persist_host_status($current, (int) $status, $withdraw);
    }

    /**
     * Persists host status.
     *
     * @param \stdClass $current Current.
     * @param int $hoststatus Hoststatus.
     * @param bool $withdraw Withdraw.
     * @return \stdClass
     */
    private function persist_host_status(\stdClass $current, int $hoststatus, bool $withdraw): \stdClass {
        return match ($hoststatus) {
            GRADE_UPDATE_OK => $this->persist(
                $current,
                [
                    'gradeitemversion' => (int) $current->assessmentdefinitionversion,
                    'gradeitemstatus' => 'published',
                    'gradeitemfailurecode' => null,
                    'gradeitemretrycount' => 0,
                    'gradeitemretryafter' => null,
                ],
                self::outcome('published', null, $withdraw),
            ),
            GRADE_UPDATE_ITEM_LOCKED => $this->persist_failure($current, 'grade_item_locked', false, 'locked'),
            GRADE_UPDATE_MULTIPLE => $this->persist_failure(
                $current,
                'multiple_grade_items',
                false,
                'configuration_error',
            ),
            GRADE_UPDATE_FAILED => $this->persist_failure($current, 'grade_item_update_failed', true),
            default => $this->persist_failure($current, 'unknown_grade_item_update_status', false),
        };
    }

    /**
     * Persists failure.
     *
     * @param \stdClass $current Current.
     * @param string $code Code.
     * @param bool $retryable Retryable.
     * @param string $status Status.
     * @return \stdClass
     */
    private function persist_failure(
        \stdClass $current,
        string $code,
        bool $retryable,
        string $status = 'failed',
    ): \stdClass {
        $retrycount = max(1, (int) ($current->gradeitemretrycount ?? 0) + 1);
        $retryafter = null;
        if ($retryable) {
            $delay = min(
                self::MAX_RETRY_DELAY_SECONDS,
                self::RETRY_DELAY_SECONDS * (2 ** min(10, $retrycount - 1)),
            );
            $retryafter = ($this->clock)() + $delay;
        }
        return $this->persist(
            $current,
            [
                'gradeitemstatus' => $status,
                'gradeitemfailurecode' => $code,
                'gradeitemretrycount' => $retrycount,
                'gradeitemretryafter' => $retryafter,
            ],
            self::outcome($status, $code, false, $retryable, $retryafter),
        );
    }

    /**
     * Persists the publication outcome.
     *
     * @param \stdClass $current Current.
     * @param array $status Status.
     * @param \stdClass $outcome Outcome.
     * @return \stdClass
     */
    private function persist(\stdClass $current, array $status, \stdClass $outcome): \stdClass {
        $status['gradeitemtimemodified'] = ($this->clock)();
        if (!(($this->statuspersister)($current, $status))) {
            return self::outcome('pending');
        }
        return $outcome;
    }

    /**
     * Checks whether graded sources.
     *
     * @param array $targets Targets.
     * @param array $groups Groups.
     * @return bool
     */
    private static function has_graded_sources(array $targets, array $groups): bool {
        $grouppolicy = [];
        foreach ($groups as $group) {
            $settings = is_array($group['settings'] ?? null) ? $group['settings'] : [];
            $isgraded = ($settings['isGraded'] ?? true) === true;
            foreach ($group['targetIds'] ?? [] as $targetid) {
                $grouppolicy[(string) $targetid] ??= false;
                $grouppolicy[(string) $targetid] = $grouppolicy[(string) $targetid] || $isgraded;
            }
        }
        foreach ($targets as $target) {
            $settings = is_array($target['settings'] ?? null) ? $target['settings'] : [];
            $targetid = (string) ($target['targetId'] ?? '');
            if (
                ($settings['isGraded'] ?? true) === true
                && (!array_key_exists($targetid, $grouppolicy) || $grouppolicy[$targetid])
            ) {
                return true;
            }
        }
        return false;
    }

    /**
     * Returns outcome.
     *
     * @param string $status Status.
     * @param string|null $code Code.
     * @param bool $withdrawn Withdrawn.
     * @param bool|null $retryable Retryable.
     * @param int|null $retryafter Retryafter.
     * @return \stdClass
     */
    private static function outcome(
        string $status,
        ?string $code = null,
        bool $withdrawn = false,
        ?bool $retryable = null,
        ?int $retryafter = null,
    ): \stdClass {
        $outcome = (object) ['status' => $status];
        if ($code !== null) {
            $outcome->code = $code;
        }
        if ($withdrawn) {
            $outcome->withdrawn = true;
        }
        if ($retryable !== null) {
            $outcome->retryable = $retryable;
            $outcome->retryAfter = $retryafter;
        }
        return $outcome;
    }
}
