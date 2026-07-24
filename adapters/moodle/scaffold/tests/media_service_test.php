<?php
// This file is part of Scaffold - https://scaffold.ac/
//
// Scaffold is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, version 3 of the License.

namespace mod_scaffold;

use mod_scaffold\local\media_service;

defined('MOODLE_INTERNAL') || die();

/**
 * Tests managed media against Moodle's File API.
 *
 * @covers \mod_scaffold\local\media_service
 */
final class media_service_test extends \advanced_testcase {
    public function test_valid_uploads_use_moodle_file_api(): void {
        $this->resetAfterTest(true);
        [$activity, $cm, $context] = $this->create_activity();
        $png = self::valid_png();
        $pdf = "%PDF-1.4\n1 0 obj\n<<>>\nendobj\n%%EOF\n";
        $markdown = "# Scaffold\n\nManaged media.\n";
        $csv = "name,score\nAda,100\n";
        $wav = self::valid_wav();
        $cases = [
            'image' => [
                'image',
                '../cover image.PNG',
                'image/jpeg',
                'image/png',
                'image/png',
                $png,
                '/^scaffold-[a-f0-9]{16}-cover-image\.PNG$/',
            ],
            'pdf' => [
                'pdf',
                'guide.pdf',
                'application/pdf',
                'application/pdf',
                'application/pdf',
                $pdf,
                '/^scaffold-[a-f0-9]{16}-guide\.pdf$/',
            ],
            'text' => [
                'text',
                'notes.md',
                'text/markdown',
                'text/markdown',
                'text/plain',
                $markdown,
                '/^scaffold-[a-f0-9]{16}-notes\.md$/',
            ],
            'spreadsheet' => [
                'spreadsheet',
                'marks.csv',
                'text/plain',
                'text/plain',
                'text/csv',
                $csv,
                '/^scaffold-[a-f0-9]{16}-marks\.csv$/',
            ],
            'audio' => [
                'audio',
                'sample.wav',
                'audio/x-wav',
                'audio/wav',
                'audio/wav',
                $wav,
                '/^scaffold-[a-f0-9]{16}-sample\.wav$/',
            ],
            'generic MIME hints' => [
                'image',
                'generic.png',
                'application/octet-stream',
                'application/octet-stream',
                'image/png',
                $png,
                '/^scaffold-[a-f0-9]{16}-generic\.png$/',
            ],
        ];
        $uploads = [];

        foreach ($cases as $case => [
            $mediatype,
            $filename,
            $contenttype,
            $dataurltype,
            $expectedmimetype,
            $payload,
            $filenamepattern,
        ]) {
            $result = media_service::upload_media(
                $activity,
                $cm,
                $context,
                $mediatype,
                $filename,
                $contenttype,
                self::data_url($dataurltype, $payload),
            );
            $file = get_file_storage()->get_file(
                $context->id,
                'mod_scaffold',
                'media',
                $activity->id,
                '/',
                $result['mediaId'],
            );

            $this->assertNotFalse($file, $case);
            $this->assertSame($expectedmimetype, $file->get_mimetype(), $case);
            $this->assertSame($payload, $file->get_content(), $case);
            $this->assertMatchesRegularExpression(
                $filenamepattern,
                $file->get_filename(),
                $case,
            );
            $this->assertSame((int) $context->id, (int) $file->get_contextid(), $case);
            $this->assertSame('mod_scaffold', $file->get_component(), $case);
            $this->assertSame('media', $file->get_filearea(), $case);
            $this->assertSame((int) $activity->id, (int) $file->get_itemid(), $case);
            $this->assertSame('/', $file->get_filepath(), $case);
            $this->assertStringContainsString($file->get_filename(), $result['url'], $case);
            $uploads[$case] = $result;
        }

        $this->assertCount(6, get_file_storage()->get_area_files(
            $context->id,
            'mod_scaffold',
            'media',
            $activity->id,
            'id',
            false,
        ));
        $this->assertCount(3, media_service::list_media(
            $activity,
            $context,
            'media',
            null,
        ));
        $this->assertCount(3, media_service::list_media(
            $activity,
            $context,
            'documents',
            null,
        ));
        $this->assertCount(2, media_service::list_media(
            $activity,
            $context,
            null,
            'image',
        ));
        $this->assertSame(
            $uploads['image'],
            media_service::resolve_media(
                $activity,
                $context,
                $uploads['image']['mediaId'],
            ),
        );
    }

    public function test_rejects_oversized_malformed_and_disguised_uploads(): void {
        $this->resetAfterTest(true);
        [$activity, $cm, $context] = $this->create_activity();
        $png = self::valid_png();
        $csv = "name,score\nAda,100\n";

        $this->assert_invalid_upload(
            $activity,
            $cm,
            $context,
            'image',
            'oversized.png',
            'image/png',
            'data:image/png;base64,' . str_repeat('%', 13981017),
            'image upload exceeds the size limit',
        );
        $this->assert_invalid_upload(
            $activity,
            $cm,
            $context,
            'image',
            'invalid.png',
            'image/png',
            'data:image/png;base64,%%%%',
            'dataurl is not valid base64',
        );
        $this->assert_invalid_upload(
            $activity,
            $cm,
            $context,
            'image',
            'oversized.png',
            'image/png',
            self::data_url('image/png', str_repeat('a', 10485761)),
            'image upload exceeds the size limit',
        );
        foreach ([
            'HTML presented as PNG' => [
                'image',
                'disguised.png',
                'image/png',
                self::data_url('image/png', '<!doctype html><script>alert(1)</script>'),
                'file does not match mediatype',
            ],
            'PDF presented as PNG' => [
                'image',
                'disguised.png',
                'application/octet-stream',
                self::data_url('application/octet-stream', "%PDF-1.4\n%%EOF\n"),
                'file does not match mediatype',
            ],
            'PNG presented as PDF' => [
                'pdf',
                'disguised.pdf',
                'application/pdf',
                self::data_url('application/pdf', $png),
                'file does not match mediatype',
            ],
            'wrong extension' => [
                'image',
                'wrong-extension.pdf',
                'image/png',
                self::data_url('image/png', $png),
                'file is not an allowed image upload',
            ],
            'wrong client hint' => [
                'image',
                'wrong-client-hint.png',
                'application/pdf',
                self::data_url('image/png', $png),
                'file does not match mediatype',
            ],
            'wrong data URL hint' => [
                'image',
                'wrong-data-url-hint.png',
                'image/png',
                self::data_url('application/pdf', $png),
                'file does not match mediatype',
            ],
            'not a data URL' => [
                'image',
                'not-a-data-url.png',
                'image/png',
                'not-data:image/png;base64,' . base64_encode($png),
                'dataurl must be a data URL',
            ],
            'plain text as XLSX' => [
                'spreadsheet',
                'disguised.xlsx',
                'text/plain',
                self::data_url('text/plain', $csv),
                'file does not match mediatype',
            ],
            'plain text as ODS' => [
                'spreadsheet',
                'disguised.ods',
                'text/plain',
                self::data_url('text/plain', $csv),
                'file does not match mediatype',
            ],
            'unsupported media type' => [
                'unsupported',
                'sample.bin',
                'application/octet-stream',
                self::data_url('application/octet-stream', ''),
                'mediatype is not supported',
            ],
        ] as $case => [$mediatype, $filename, $contenttype, $dataurl, $message]) {
            $this->assert_invalid_upload(
                $activity,
                $cm,
                $context,
                $mediatype,
                $filename,
                $contenttype,
                $dataurl,
                $message,
                $case,
            );
        }
        $this->assertSame([], get_file_storage()->get_area_files(
            $context->id,
            'mod_scaffold',
            'media',
            $activity->id,
            'id',
            false,
        ));
    }

    private function assert_invalid_upload(
        \stdClass $activity,
        \cm_info $cm,
        \context_module $context,
        string $mediatype,
        string $filename,
        string $contenttype,
        string $dataurl,
        string $expectedmessage,
        string $case = '',
    ): void {
        try {
            media_service::upload_media(
                $activity,
                $cm,
                $context,
                $mediatype,
                $filename,
                $contenttype,
                $dataurl,
            );
            $this->fail('Invalid media upload was accepted: ' . $case);
        } catch (\invalid_parameter_exception $exception) {
            $this->assertSame($expectedmessage, $exception->getMessage(), $case);
        }
    }

    /**
     * @return array{\stdClass, \cm_info, \context_module}
     */
    private function create_activity(): array {
        global $CFG, $DB;

        require_once($CFG->dirroot . '/course/lib.php');
        require_once($CFG->dirroot . '/mod/scaffold/lib.php');

        $course = $this->getDataGenerator()->create_course();
        $activityid = scaffold_add_instance((object) [
            'course' => $course->id,
            'name' => 'Managed media fixture',
            'intro' => '',
            'introformat' => FORMAT_HTML,
            'grade' => 100,
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
            'completion' => COMPLETION_TRACKING_NONE,
            'completiongradeitemnumber' => null,
            'completionview' => 0,
            'completionexpected' => 0,
            'completionpassgrade' => 0,
            'showdescription' => 0,
        ]);
        course_add_cm_to_section($course, $cmid, 0);
        rebuild_course_cache((int) $course->id, true);

        return [
            $DB->get_record('scaffold', ['id' => $activityid], '*', MUST_EXIST),
            get_fast_modinfo($course)->get_cm($cmid),
            \context_module::instance($cmid),
        ];
    }

    private static function data_url(string $mimetype, string $payload): string {
        return 'data:' . $mimetype . ';base64,' . base64_encode($payload);
    }

    private static function valid_png(): string {
        $decoded = base64_decode(
            'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
            true,
        );
        if ($decoded === false) {
            throw new \RuntimeException('PNG fixture must be valid base64');
        }
        return $decoded;
    }

    private static function valid_wav(): string {
        return 'RIFF'
            . pack('V', 37)
            . 'WAVEfmt '
            . pack('VvvVVvv', 16, 1, 1, 8000, 8000, 1, 8)
            . 'data'
            . pack('V', 1)
            . "\x80";
    }
}
