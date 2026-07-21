<?php
// This file is part of Scaffold - https://scaffold.ac/
//
// Scaffold is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, version 3 of the License.

namespace mod_scaffold\local;

defined('MOODLE_INTERNAL') || die();

class grader {
    public static function grade_assessment(?array $target, ?array $response): array {
        if (!$target || !$response) {
            return self::empty_result();
        }

        $assessment = self::assoc($target['assessment'] ?? null);
        $interaction = self::assoc($target['interaction'] ?? null);
        if (!$assessment || !$interaction || ($response['kind'] ?? null) !== ($assessment['kind'] ?? null)) {
            return self::empty_result();
        }

        return match ($assessment['kind'] ?? '') {
            'single-select' => self::grade_single_select($interaction, $assessment, $response),
            'multi-select' => self::grade_multi_select($interaction, $assessment, $response),
            'sequence' => self::grade_sequence($assessment, $response),
            'match' => self::grade_pairs(
                self::list($assessment['correctPairs'] ?? null),
                self::list($response['pairs'] ?? null),
                'targetId',
                self::summary_feedback($assessment),
                self::assoc($assessment['feedbackByItemId'] ?? null) ?? [],
            ),
            'classify' => self::grade_pairs(
                self::list($assessment['correctPlacements'] ?? null),
                self::list($response['placements'] ?? null),
                'categoryId',
                self::summary_feedback($assessment),
                self::assoc($assessment['feedbackByItemId'] ?? null) ?? [],
            ),
            'fill-blanks' => self::grade_fill_blanks($assessment, $response),
            'spatial-hotspot' => self::grade_hotspot($interaction, $assessment, $response),
            default => self::empty_result(),
        };
    }

    private static function grade_single_select(array $interaction, array $assessment, array $response): array {
        $correctid = is_string($assessment['correctOptionId'] ?? null) ? $assessment['correctOptionId'] : null;
        $given = is_string($response['optionId'] ?? null) ? $response['optionId'] : null;
        $iscorrect = $correctid !== null && $given === $correctid;
        $feedback = self::assoc($assessment['feedbackByOptionId'] ?? null) ?? [];
        $items = [];

        foreach (self::list($interaction['options'] ?? null) as $option) {
            $option = self::assoc($option);
            if (!$option || !is_string($option['id'] ?? null)) {
                continue;
            }
            $optionid = $option['id'];
            $expected = $optionid === $correctid;
            $selected = $optionid === $given;
            $item = [
                'correct' => $selected && $expected,
                'expected' => $expected,
                'given' => $selected,
            ];
            if (array_key_exists($optionid, $feedback)) {
                $item['feedback'] = $feedback[$optionid];
            }
            $items[$optionid] = $item;
        }

        return [
            'isCorrect' => $iscorrect,
            'score' => $iscorrect ? 1 : 0,
            'maxScore' => 1,
            'feedback' => self::summary_feedback($assessment),
            'items' => $items,
        ];
    }

    private static function grade_multi_select(array $interaction, array $assessment, array $response): array {
        $expected = self::string_set($assessment['correctOptionIds'] ?? null);
        $selected = self::string_set($response['optionIds'] ?? null);
        $feedback = self::assoc($assessment['feedbackByOptionId'] ?? null) ?? [];
        $items = [];

        foreach (self::list($interaction['options'] ?? null) as $option) {
            $option = self::assoc($option);
            if (!$option || !is_string($option['id'] ?? null)) {
                continue;
            }
            $optionid = $option['id'];
            $isexpected = isset($expected[$optionid]);
            $wasselected = isset($selected[$optionid]);
            $item = [
                'correct' => $isexpected === $wasselected,
                'expected' => $isexpected,
                'given' => $wasselected,
            ];
            if (array_key_exists($optionid, $feedback)) {
                $item['feedback'] = $feedback[$optionid];
            }
            $items[$optionid] = $item;
        }

        if (!$expected) {
            return [
                'isCorrect' => false,
                'score' => 0,
                'maxScore' => 1,
                'feedback' => self::summary_feedback($assessment),
                'items' => $items,
            ];
        }

        if (count($expected) === count($selected) && !array_diff_key($expected, $selected)) {
            return [
                'isCorrect' => true,
                'score' => 1,
                'maxScore' => 1,
                'feedback' => self::summary_feedback($assessment),
                'items' => $items,
            ];
        }

        $correctpicks = count(array_intersect_key($selected, $expected));
        $wrongpicks = count(array_diff_key($selected, $expected));
        $percorrect = 1 / count($expected);
        $score = max(0, ($correctpicks * $percorrect) - ($wrongpicks * $percorrect));

        return [
            'isCorrect' => false,
            'score' => $score,
            'maxScore' => 1,
            'feedback' => self::summary_feedback($assessment),
            'items' => $items,
        ];
    }

    private static function grade_sequence(array $assessment, array $response): array {
        $expected = self::string_list($assessment['correctOrder'] ?? null);
        $given = self::string_list($response['orderedItemIds'] ?? null);
        $feedback = self::assoc($assessment['feedbackByItemId'] ?? null) ?? [];
        $items = [];

        if (!$expected) {
            return self::empty_result(self::summary_feedback($assessment));
        }

        $givenindex = [];
        foreach ($given as $index => $itemid) {
            if (!array_key_exists($itemid, $givenindex)) {
                $givenindex[$itemid] = $index;
            }
        }

        $correctcount = 0;
        foreach ($expected as $expectedindex => $itemid) {
            $actualindex = $givenindex[$itemid] ?? null;
            $correct = $actualindex === $expectedindex;
            if ($correct) {
                $correctcount++;
            }
            $item = [
                'correct' => $correct,
                'expected' => $expectedindex,
            ];
            if ($actualindex !== null) {
                $item['given'] = $actualindex;
            }
            if (array_key_exists($itemid, $feedback)) {
                $item['feedback'] = $feedback[$itemid];
            }
            $items[$itemid] = $item;
        }

        $sameset = count($expected) === count($given)
            && count(array_diff($expected, $given)) === 0
            && count(array_diff($given, $expected)) === 0;
        $iscorrect = $sameset && $correctcount === count($expected);

        return [
            'isCorrect' => $iscorrect,
            'score' => $iscorrect ? 1 : $correctcount / count($expected),
            'maxScore' => 1,
            'feedback' => self::summary_feedback($assessment),
            'items' => $items,
        ];
    }

    private static function grade_pairs(
        array $expectedpairs,
        array $givenpairs,
        string $expectedkey,
        mixed $feedback,
        array $feedbackbyitem,
    ): array {
        $givenbyitem = [];
        foreach ($givenpairs as $pair) {
            $pair = self::assoc($pair);
            if (
                $pair
                && is_string($pair['itemId'] ?? null)
                && is_string($pair[$expectedkey] ?? null)
            ) {
                $givenbyitem[$pair['itemId']] = $pair[$expectedkey];
            }
        }

        if (!$expectedpairs) {
            return self::empty_result($feedback);
        }

        $items = [];
        $correctcount = 0;
        foreach ($expectedpairs as $pair) {
            $pair = self::assoc($pair);
            if (
                !$pair
                || !is_string($pair['itemId'] ?? null)
                || !is_string($pair[$expectedkey] ?? null)
            ) {
                continue;
            }
            $itemid = $pair['itemId'];
            $expected = $pair[$expectedkey];
            $given = $givenbyitem[$itemid] ?? null;
            $correct = $given === $expected;
            if ($correct) {
                $correctcount++;
            }
            $item = [
                'correct' => $correct,
                'expected' => $expected,
            ];
            if ($given !== null) {
                $item['given'] = $given;
            }
            if (array_key_exists($itemid, $feedbackbyitem)) {
                $item['feedback'] = $feedbackbyitem[$itemid];
            }
            $items[$itemid] = $item;
        }

        $total = count($items);
        if ($total === 0) {
            return self::empty_result($feedback);
        }

        return [
            'isCorrect' => $correctcount === $total,
            'score' => $correctcount / $total,
            'maxScore' => 1,
            'feedback' => $feedback,
            'items' => $items,
        ];
    }

    private static function grade_fill_blanks(array $assessment, array $response): array {
        $givenbyblank = [];
        foreach (self::list($response['blanks'] ?? null) as $blank) {
            $blank = self::assoc($blank);
            if ($blank && is_string($blank['blankId'] ?? null) && is_string($blank['value'] ?? null)) {
                $givenbyblank[$blank['blankId']] = $blank['value'];
            }
        }

        $blanks = self::list($assessment['blanks'] ?? null);
        $feedback = self::assoc($assessment['feedbackByBlankId'] ?? null) ?? [];
        if (!$blanks) {
            return self::empty_result(self::summary_feedback($assessment));
        }

        $items = [];
        $correctcount = 0;
        foreach ($blanks as $blank) {
            $blank = self::assoc($blank);
            if (!$blank || !is_string($blank['blankId'] ?? null)) {
                continue;
            }
            $blankid = $blank['blankId'];
            $accepted = array_values(array_filter(
                self::string_list($blank['acceptedAnswers'] ?? null),
                fn(string $answer): bool => $answer !== '',
            ));
            $given = $givenbyblank[$blankid] ?? '';
            $normalizedgiven = self::normalize_blank($given, $blank);
            $correct = false;
            foreach ($accepted as $answer) {
                if (self::normalize_blank($answer, $blank) === $normalizedgiven) {
                    $correct = true;
                    break;
                }
            }
            if ($correct) {
                $correctcount++;
            }
            $item = [
                'correct' => $correct,
                'expected' => $accepted,
            ];
            if ($given !== '') {
                $item['given'] = $given;
            }
            if (array_key_exists($blankid, $feedback)) {
                $item['feedback'] = $feedback[$blankid];
            }
            $items[$blankid] = $item;
        }

        $total = count($items);
        if ($total === 0) {
            return self::empty_result(self::summary_feedback($assessment));
        }

        return [
            'isCorrect' => $correctcount === $total,
            'score' => $correctcount / $total,
            'maxScore' => 1,
            'feedback' => self::summary_feedback($assessment),
            'items' => $items,
        ];
    }

    private static function grade_hotspot(array $interaction, array $assessment, array $response): array {
        $selected = [];
        foreach (self::list($response['selections'] ?? null) as $selection) {
            $selection = self::assoc($selection);
            if ($selection && is_string($selection['hotspotId'] ?? null) && $selection['hotspotId'] !== '') {
                $selected[$selection['hotspotId']] = true;
            }
        }

        $expected = self::string_set($assessment['correctHotspotIds'] ?? null);
        $feedback = self::assoc($assessment['feedbackByHotspotId'] ?? null) ?? [];
        $hotspotids = [];
        foreach (self::list($interaction['hotspots'] ?? null) as $hotspot) {
            $hotspot = self::assoc($hotspot);
            if ($hotspot && is_string($hotspot['id'] ?? null)) {
                $hotspotids[] = $hotspot['id'];
            }
        }

        if (!$hotspotids) {
            return self::empty_result(self::summary_feedback($assessment));
        }

        $items = [];
        $correctcount = 0;
        foreach ($hotspotids as $hotspotid) {
            $isexpected = isset($expected[$hotspotid]);
            $wasselected = isset($selected[$hotspotid]);
            $correct = $isexpected === $wasselected;
            if ($correct) {
                $correctcount++;
            }
            $item = [
                'correct' => $correct,
                'expected' => $isexpected,
                'given' => $wasselected,
            ];
            if (array_key_exists($hotspotid, $feedback)) {
                $item['feedback'] = $feedback[$hotspotid];
            }
            $items[$hotspotid] = $item;
        }

        $allcorrect = $correctcount === count($hotspotids);
        $score = ($assessment['gradingMode'] ?? null) === 'all-or-nothing'
            ? ($allcorrect ? 1 : 0)
            : $correctcount / count($hotspotids);

        return [
            'isCorrect' => $allcorrect,
            'score' => $score,
            'maxScore' => 1,
            'feedback' => self::summary_feedback($assessment),
            'items' => $items,
        ];
    }

    private static function empty_result(mixed $feedback = null): array {
        return [
            'isCorrect' => false,
            'score' => 0,
            'maxScore' => 1,
            'feedback' => $feedback,
            'items' => new \stdClass(),
        ];
    }

    private static function normalize_blank(string $value, array $meta): string {
        $normalized = ($meta['trimWhitespace'] ?? true) === false ? $value : trim($value);
        return ($meta['caseSensitive'] ?? false) ? $normalized : \core_text::strtolower($normalized);
    }

    private static function summary_feedback(array $assessment): mixed {
        return $assessment['summaryFeedback'] ?? null;
    }

    private static function assoc(mixed $value): ?array {
        return is_array($value) && !array_is_list($value) ? $value : null;
    }

    private static function list(mixed $value): array {
        return is_array($value) && array_is_list($value) ? $value : [];
    }

    private static function string_list(mixed $value): array {
        return array_values(array_filter(
            self::list($value),
            fn(mixed $item): bool => is_string($item),
        ));
    }

    private static function string_set(mixed $value): array {
        $set = [];
        foreach (self::string_list($value) as $item) {
            $set[$item] = true;
        }
        return $set;
    }
}
