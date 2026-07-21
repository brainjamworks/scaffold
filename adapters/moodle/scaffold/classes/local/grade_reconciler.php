<?php
// This file is part of Scaffold - https://scaffold.ac/
//
// Scaffold is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, version 3 of the License.

namespace mod_scaffold\local;

defined('MOODLE_INTERNAL') || die();

final class grade_reconciler {
    private const MAX_RETRIES = 5;
    private $repository;
    private $itempublisher;
    private $learnerpublisher;
    private readonly \Closure $activityloader;
    private readonly \Closure $clock;

    public function __construct(
        $repository = null,
        $itempublisher = null,
        $learnerpublisher = null,
        ?callable $activityloader = null,
        ?callable $clock = null,
    ) {
        $this->repository = $repository ?? new grade_publication_repository();
        $this->itempublisher = $itempublisher ?? new grade_item_publisher();
        $this->learnerpublisher = $learnerpublisher ?? new grade_publisher();
        $this->activityloader = \Closure::fromCallable($activityloader ?? static function(int $scaffoldid): \stdClass {
            global $DB;
            return $DB->get_record('scaffold', ['id' => $scaffoldid], '*', MUST_EXIST);
        });
        $this->clock = \Closure::fromCallable($clock ?? static fn(): int => time());
    }

    public function reconcile_due(int $limit): \stdClass {
        if ($limit <= 0 || $limit > 1000) {
            throw new \invalid_parameter_exception('Grade reconciliation limit is invalid');
        }

        $now = ($this->clock)();
        $itemids = $this->repository->find_due_item_ids($limit, $now, self::MAX_RETRIES);
        $itemfailures = 0;
        foreach ($itemids as $scaffoldid) {
            try {
                $outcome = $this->itempublisher->publish(($this->activityloader)((int) $scaffoldid));
                if (($outcome->status ?? null) !== 'published') {
                    $itemfailures++;
                }
            } catch (\Throwable) {
                $itemfailures++;
            }
        }

        $sources = $this->repository->find_due_sources($limit, $now, self::MAX_RETRIES);
        $itemsbyactivity = [];
        $published = 0;
        $pending = 0;
        $failed = $itemfailures;
        $skipped = 0;
        foreach ($sources as $source) {
            $scaffoldid = (int) $source->scaffoldid;
            try {
                $activity = ($this->activityloader)($scaffoldid);
                if (!array_key_exists($scaffoldid, $itemsbyactivity)) {
                    $itemsbyactivity[$scaffoldid] = $this->itempublisher->publish($activity);
                }
                $itemoutcome = $itemsbyactivity[$scaffoldid];
                if (($itemoutcome->status ?? null) !== 'published') {
                    $pending++;
                    continue;
                }
                if (($itemoutcome->withdrawn ?? false) === true || (float) ($activity->grade ?? 0) <= 0) {
                    if (method_exists($this->repository, 'delete_for_activity')) {
                        $this->repository->delete_for_activity($scaffoldid);
                    }
                    $skipped++;
                    continue;
                }

                $this->repository->upsert_pending(
                    $scaffoldid,
                    (int) $source->userid,
                    (int) $source->staterevision,
                    (int) $source->definitionversion,
                );
                $outcome = $this->learnerpublisher->publish_user($activity, (int) $source->userid);
                match ($outcome->status ?? 'failed') {
                    'published', 'not_applicable' => $published++,
                    'pending' => $pending++,
                    default => $failed++,
                };
            } catch (\Throwable) {
                $failed++;
            }
        }

        return (object) [
            'items' => count($itemids),
            'itemFailures' => $itemfailures,
            'learners' => count($sources),
            'published' => $published,
            'pending' => $pending,
            'failed' => $failed,
            'skipped' => $skipped,
        ];
    }
}
