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

/**
 * Describes the result of one quiz expiry transition.
 *
 * @package    mod_scaffold
 * @copyright  2026 Rizvan Ali
 * @license    https://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
final class expiry_outcome {
    /** @var bool Whether state changed. */
    public bool $changed;
    /** @var int Persisted state revision. */
    public int $staterevision;
    /** @var string State change timestamp. */
    public string $changedat;
    /** @var array Expired assessment group IDs. */
    public array $expiredgroupids;
    /** @var bool Whether grade publication is required. */
    public bool $graderequired;
    /** @var bool Whether completion updating is required. */
    public bool $completionrequired;
    /** @var \stdClass Canonical assessment snapshot. */
    public \stdClass $snapshot;
    /** @var \stdClass|null Grade publication result. */
    public ?\stdClass $gradepublication;

    /**
     * Creates a new expiry outcome instance.
     *
     * @param bool $changed Whether state changed.
     * @param int $staterevision Persisted state revision.
     * @param string $changedat State change timestamp.
     * @param array $expiredgroupids Expired assessment group IDs.
     * @param bool $graderequired Whether grade publication is required.
     * @param bool $completionrequired Whether completion updating is required.
     * @param \stdClass $snapshot Canonical assessment snapshot.
     * @param \stdClass|null $gradepublication Grade publication result.
     */
    public function __construct(
        bool $changed,
        int $staterevision,
        string $changedat,
        array $expiredgroupids,
        bool $graderequired,
        bool $completionrequired,
        \stdClass $snapshot,
        ?\stdClass $gradepublication = null,
    ) {
        $this->changed = $changed;
        $this->staterevision = $staterevision;
        $this->changedat = $changedat;
        $this->expiredgroupids = $expiredgroupids;
        $this->graderequired = $graderequired;
        $this->completionrequired = $completionrequired;
        $this->snapshot = $snapshot;
        $this->gradepublication = $gradepublication;
    }
}
