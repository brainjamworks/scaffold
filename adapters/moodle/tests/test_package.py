import hashlib
import json
import re
import subprocess
import sys
import tempfile
import unittest
import zipfile
from pathlib import Path


PACKAGE_SCRIPT = Path(__file__).parents[1] / "scripts" / "package.py"
REPOSITORY_ROOT = Path(__file__).parents[3]


class MoodlePackageTest(unittest.TestCase):
    def test_plugin_php_does_not_access_request_superglobals_directly(self):
        plugin_root = REPOSITORY_ROOT / "adapters" / "moodle" / "scaffold"
        request_superglobal = re.compile(
            r"\$_(?:GET|POST|REQUEST|SERVER|COOKIE|FILES)\b",
        )
        failures = []

        for source_file in plugin_root.rglob("*.php"):
            source = source_file.read_text(encoding="utf8")
            for match in request_superglobal.finditer(source):
                failures.append(
                    f"{source_file.relative_to(plugin_root)}:"
                    f"{source.count(chr(10), 0, match.start()) + 1} uses "
                    f"{match.group(0)}",
                )

        self.assertEqual(failures, [])

    def test_plugin_english_language_strings_are_alphabetically_sorted(self):
        language_file = (
            REPOSITORY_ROOT
            / "adapters"
            / "moodle"
            / "scaffold"
            / "lang"
            / "en"
            / "scaffold.php"
        )
        string_keys = re.findall(
            r"(?m)^\$string\['([^']+)'\]\s*=",
            language_file.read_text(encoding="utf8"),
        )

        self.assertTrue(string_keys)
        self.assertEqual(string_keys, sorted(string_keys))

    def test_plugin_owned_user_text_uses_moodle_language_identifiers(self):
        plugin_root = REPOSITORY_ROOT / "adapters" / "moodle" / "scaffold"
        language_source = (
            plugin_root / "lang" / "en" / "scaffold.php"
        ).read_text(encoding="utf8")
        language_keys = set(
            re.findall(r"(?m)^\$string\['([^']+)'\]\s*=", language_source),
        )
        failures = []

        for source_file in plugin_root.rglob("*.php"):
            source = source_file.read_text(encoding="utf8")
            for match in re.finditer(
                r"new\s+\\?moodle_exception\(\s*'(?P<errorcode>[^']+)'"
                r"(?P<arguments>[^;\n]*)",
                source,
            ):
                errorcode = match.group("errorcode")
                arguments = match.group("arguments")
                component = re.search(r",\s*'([^']+)'", arguments)
                component_name = component.group(1) if component else None
                line = source.count("\n", 0, match.start()) + 1
                location = f"{source_file.relative_to(plugin_root)}:{line}"

                if component_name == "error" and errorcode == "confirmationnotenabled":
                    continue
                if component_name != "scaffold":
                    failures.append(
                        f"{location} must identify the scaffold language component",
                    )
                    continue
                if not re.fullmatch(r"[a-z][a-z0-9_:]*", errorcode):
                    failures.append(
                        f"{location} uses non-identifier error code {errorcode!r}",
                    )
                elif errorcode not in language_keys:
                    failures.append(
                        f"{location} has no scaffold language string for {errorcode!r}",
                    )

        grade_status = (plugin_root / "grade_status.php").read_text(encoding="utf8")
        for literal in (
            "Activity item",
            "Code",
            "Definition version",
            "Next action",
            "Retries",
            "Scope",
            "State revision",
            "Status",
            "User ID",
            "Version",
        ):
            if f"'{literal}'" in grade_status:
                failures.append(
                    f"grade_status.php contains user-visible literal {literal!r}",
                )

        bootstrap = (
            plugin_root / "amd" / "src" / "bootstrap.js"
        ).read_text(encoding="utf8")
        if 'alert.textContent = "Scaffold could not be loaded."' in bootstrap:
            failures.append("amd/src/bootstrap.js contains a user-visible load error")
        for page_name in ("author.php", "view.php"):
            page = (plugin_root / page_name).read_text(encoding="utf8")
            if "'loadError' => get_string('loaderror', 'scaffold')" not in page:
                failures.append(
                    f"{page_name} does not pass the translated load error",
                )

        self.assertEqual(failures, [])

    def test_plugin_php_class_files_follow_moodle_file_conventions(self):
        plugin_root = REPOSITORY_ROOT / "adapters" / "moodle" / "scaffold"
        named_class_pattern = re.compile(
            r"(?m)^(?:abstract |final )?class (?P<name>[a-z0-9_]+)",
        )
        failures = []

        for source_file in plugin_root.rglob("*.php"):
            source = source_file.read_text(encoding="utf8")
            relative_path = source_file.relative_to(plugin_root)
            class_names = [
                match.group("name")
                for match in named_class_pattern.finditer(source)
            ]

            if len(class_names) > 1:
                failures.append(
                    f"{relative_path} contains multiple named classes: "
                    f"{', '.join(class_names)}",
                )
                continue

            if not class_names:
                continue

            is_autoloaded_class = relative_path.parts[0] == "classes"
            is_testcase = (
                relative_path.parts[0] == "tests"
                and relative_path.name.endswith("_test.php")
            )
            if (is_autoloaded_class or is_testcase) and (
                source_file.stem != class_names[0]
            ):
                failures.append(
                    f"{relative_path} must be named {class_names[0]}.php",
                )

        self.assertEqual(failures, [])

    def test_plugin_php_members_and_callables_have_moodle_docblocks(self):
        plugin_root = REPOSITORY_ROOT / "adapters" / "moodle" / "scaffold"
        declaration_patterns = {
            "constant": re.compile(
                r"(?m)^[ \t]*(?:(?:public|protected|private)\s+)?"
                r"const\s+[A-Z][A-Z0-9_]*\s*=",
            ),
            "function": re.compile(
                r"(?m)^[ \t]*(?:(?:final|abstract|public|protected|private|"
                r"static)\s+)*function\s+&?\s*"
                r"(?P<name>[a-zA-Z_][a-zA-Z0-9_]*)\s*\(",
            ),
            "property": re.compile(
                r"(?m)^[ \t]+(?:public|protected|private)[ \t]+"
                r"(?:(?:static|readonly)[ \t]+)*"
                r"(?:(?:[?\\a-zA-Z_][\\a-zA-Z0-9_|?]*)[ \t]+)?"
                r"\$[a-zA-Z_][a-zA-Z0-9_]*(?:[ \t]*=|[ \t]*[,;])",
            ),
        }
        failures = []

        def closing_parenthesis(source, opening_parenthesis):
            depth = 0
            for index in range(opening_parenthesis, len(source)):
                if source[index] == "(":
                    depth += 1
                elif source[index] == ")":
                    depth -= 1
                    if depth == 0:
                        return index
            self.fail(f"unclosed function parameters at offset {opening_parenthesis}")

        for source_file in plugin_root.rglob("*.php"):
            source = source_file.read_text(encoding="utf8")
            relative_path = source_file.relative_to(plugin_root)
            if re.search(
                r"(?m)^\s*\*\s+@(?:param|return|var)\s+\?",
                source,
            ):
                failures.append(
                    f"{relative_path} uses nullable PHP syntax in a PHPDoc type",
                )
            for declaration_kind, pattern in declaration_patterns.items():
                for declaration in pattern.finditer(source):
                    prefix = source[: declaration.start()].rstrip()
                    if (
                        declaration_kind == "function"
                        and prefix.endswith("#[\\Override]")
                    ):
                        continue

                    is_undocumented_test_method = (
                        declaration_kind == "function"
                        and "tests" in relative_path.parts
                        and declaration.group("name").startswith("test_")
                        and not prefix.endswith("*/")
                    )
                    if is_undocumented_test_method:
                        continue

                    if not prefix.endswith("*/"):
                        failures.append(
                            f"{relative_path}:{source.count(chr(10), 0, declaration.start()) + 1} "
                            f"missing {declaration_kind} docblock",
                        )
                        continue

                    docblock = prefix[prefix.rfind("/**") :]
                    if declaration_kind == "property":
                        if "@var " not in docblock:
                            failures.append(
                                f"{relative_path}:{source.count(chr(10), 0, declaration.start()) + 1} "
                                "missing property @var tag",
                            )
                        continue

                    description_lines = []
                    for line in docblock.splitlines():
                        line = line.strip()
                        if line in {"/**", "*/"}:
                            continue
                        line = line.removeprefix("*").strip()
                        if line and not line.startswith("@"):
                            description_lines.append(line)
                    if not description_lines:
                        failures.append(
                            f"{relative_path}:{source.count(chr(10), 0, declaration.start()) + 1} "
                            f"missing {declaration_kind} description",
                        )
                    if declaration_kind != "function":
                        continue

                    opening_parenthesis = source.find("(", declaration.start())
                    closing = closing_parenthesis(source, opening_parenthesis)
                    parameters = source[opening_parenthesis + 1 : closing]
                    parameter_names = re.findall(
                        r"\$([a-zA-Z_][a-zA-Z0-9_]*)",
                        parameters,
                    )
                    for parameter_name in parameter_names:
                        if not re.search(
                            rf"(?m)^\s*\*\s+@param\s+\S+\s+\${parameter_name}\b",
                            docblock,
                        ):
                            failures.append(
                                f"{relative_path}:{source.count(chr(10), 0, declaration.start()) + 1} "
                                f"missing @param for ${parameter_name}",
                            )

                    return_type = re.match(
                        r"\s*:\s*([^;{]+)",
                        source[closing + 1 :],
                    )
                    if (
                        return_type
                        and return_type.group(1).strip() != "void"
                        and "@return " not in docblock
                    ):
                        failures.append(
                            f"{relative_path}:{source.count(chr(10), 0, declaration.start()) + 1} "
                            "missing @return tag",
                        )

        self.assertEqual(failures, [])

    def test_plugin_php_files_use_moodles_top_level_metadata(self):
        plugin_root = REPOSITORY_ROOT / "adapters" / "moodle" / "scaffold"
        metadata_tags = (
            "@package    mod_scaffold",
            "@copyright  2026 Rizvan Ali",
            "@license    https://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later",
        )
        class_pattern = re.compile(r"(?m)^(?:abstract |final )?class [a-z0-9_]+")
        documented_class_pattern = re.compile(
            r"(?ms)(/\*\*.*?\*/)\n(?:abstract |final )?class [a-z0-9_]+",
        )
        boilerplate_end = (
            "// along with Moodle.  If not, see <https://www.gnu.org/licenses/>."
        )

        for source_file in plugin_root.rglob("*.php"):
            source = source_file.read_text(encoding="utf8")
            relative_path = source_file.relative_to(plugin_root)
            docblocks = re.findall(r"(?ms)/\*\*.*?\*/", source)
            metadata_blocks = [
                docblock
                for docblock in docblocks
                if all(tag in docblock for tag in metadata_tags)
            ]
            classes = class_pattern.findall(source)
            documented_classes = documented_class_pattern.findall(source)

            with self.subTest(source_file=relative_path):
                self.assertEqual(len(metadata_blocks), 1)
                self.assertEqual(len(documented_classes), len(classes))
                if len(classes) == 1:
                    self.assertIn(metadata_blocks[0], documented_classes)
                else:
                    self.assertIn(
                        f"{boilerplate_end}\n\n{metadata_blocks[0]}",
                        source,
                    )

    def test_plugin_sources_use_moodles_gpl_boilerplate(self):
        plugin_root = REPOSITORY_ROOT / "adapters" / "moodle" / "scaffold"
        expected_notice_lines = [
            "Scaffold is free software: you can redistribute it and/or modify",
            "it under the terms of the GNU General Public License as published by",
            "the Free Software Foundation, either version 3 of the License, or",
            "(at your option) any later version.",
            "Scaffold is distributed in the hope that it will be useful,",
            "but WITHOUT ANY WARRANTY; without even the implied warranty of",
            "MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the",
            "GNU General Public License for more details.",
            "You should have received a copy of the GNU General Public License",
            "along with Moodle.  If not, see <https://www.gnu.org/licenses/>.",
        ]
        expected_slash_boilerplate = "\n".join(
            [
                "// Scaffold is free software: you can redistribute it and/or modify",
                "// it under the terms of the GNU General Public License as published by",
                "// the Free Software Foundation, either version 3 of the License, or",
                "// (at your option) any later version.",
                "//",
                "// Scaffold is distributed in the hope that it will be useful,",
                "// but WITHOUT ANY WARRANTY; without even the implied warranty of",
                "// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the",
                "// GNU General Public License for more details.",
                "//",
                "// You should have received a copy of the GNU General Public License",
                "// along with Moodle.  If not, see <https://www.gnu.org/licenses/>.",
            ],
        )
        slash_comment_sources = list(plugin_root.rglob("*.php"))
        slash_comment_sources.extend((plugin_root / "amd" / "src").rglob("*.js"))

        self.assertTrue(slash_comment_sources)
        for source_file in slash_comment_sources:
            with self.subTest(source_file=source_file.relative_to(plugin_root)):
                self.assertIn(
                    expected_slash_boilerplate,
                    source_file.read_text(encoding="utf8"),
                )

        other_owned_sources = (
            plugin_root / "styles.css",
            plugin_root / "db" / "install.xml",
            plugin_root / "pix" / "monologo.svg",
        )
        for source_file in other_owned_sources:
            source = source_file.read_text(encoding="utf8")
            with self.subTest(source_file=source_file.relative_to(plugin_root)):
                for notice_line in expected_notice_lines:
                    self.assertIn(notice_line, source)
                self.assertIn("@copyright  2026 Rizvan Ali", source)
                self.assertIn(
                    "@license    https://www.gnu.org/copyleft/gpl.html "
                    "GNU GPL v3 or later",
                    source,
                )

        amd_source = (plugin_root / "amd" / "src" / "bootstrap.js").read_text(
            encoding="utf8",
        )
        self.assertIn("@module     mod_scaffold/bootstrap", amd_source)
        self.assertIn("@copyright  2026 Rizvan Ali", amd_source)
        self.assertIn(
            "@license    https://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later",
            amd_source,
        )

    def test_repository_admin_guide_has_versioned_install_and_verification_paths(self):
        guide = (
            REPOSITORY_ROOT / "adapters" / "moodle" / "scaffold" / "README.md"
        ).read_text(encoding="utf8")

        self.assertIn(
            "releases/download/v0.1.0/mod_scaffold-0.1.0.zip",
            guide,
        )
        self.assertIn("Plugins overview", guide)
        self.assertIn("releases/tag/v0.1.0", guide)
        self.assertIn("Moodle 4.5", guide)

    def test_builds_a_reproducible_single_root_installable_zip(self):
        with tempfile.TemporaryDirectory() as temporary_directory:
            repository_root = Path(temporary_directory)
            self.create_repository(repository_root)

            first = self.run_packager(repository_root)
            self.assertEqual(first.returncode, 0, first.stderr)

            archive = repository_root / "dist" / "release" / "1.2.3" / (
                "mod_scaffold-1.2.3.zip"
            )
            checksum = archive.with_suffix(".zip.sha256")
            self.assertTrue(archive.is_file())
            self.assertTrue(checksum.is_file())
            with zipfile.ZipFile(archive) as packaged:
                names = packaged.namelist()
                self.assertTrue(names)
                self.assertTrue(all(name.startswith("scaffold/") for name in names))
                self.assertEqual(names.count("scaffold/LICENSE"), 1)
                self.assertIn("scaffold/version.php", names)
                self.assertIn("scaffold/public/app.js", names)
                self.assertIn("scaffold/amd/build/app.min.js", names)
                self.assertIn("scaffold/amd/build/app.min.js.map", names)
                self.assertIn("scaffold/LICENSE", names)
                self.assertIn("scaffold/THIRD_PARTY_NOTICES.md", names)
                self.assertEqual(
                    packaged.read("scaffold/LICENSE"),
                    b"GPLv3-or-later licence\n",
                )
                self.assertTrue(
                    all((entry.external_attr >> 16) == 0o100644 for entry in packaged.infolist()),
                )

            first_bytes = archive.read_bytes()
            second = self.run_packager(repository_root)
            self.assertEqual(second.returncode, 0, second.stderr)
            self.assertEqual(archive.read_bytes(), first_bytes)
            self.assertEqual(
                checksum.read_text(encoding="utf8"),
                f"{hashlib.sha256(first_bytes).hexdigest()}  {archive.name}\n",
            )

    def test_rejects_a_moodle_release_that_differs_from_the_product_version(self):
        with tempfile.TemporaryDirectory() as temporary_directory:
            repository_root = Path(temporary_directory)
            self.create_repository(repository_root, moodle_release="1.2.2")

            result = self.run_packager(repository_root)

            self.assertNotEqual(result.returncode, 0)
            self.assertIn(
                "Moodle release 1.2.2 does not match root product version 1.2.3",
                result.stderr,
            )
            self.assertNotIn("Traceback", result.stderr)

    def test_rejects_non_moodle_source_maps_from_the_installable_zip(self):
        with tempfile.TemporaryDirectory() as temporary_directory:
            repository_root = Path(temporary_directory)
            self.create_repository(repository_root)
            plugin_root = repository_root / "adapters" / "moodle" / "scaffold"
            (plugin_root / "public" / "app.js.map").write_text("{}", encoding="utf8")

            result = self.run_packager(repository_root)

            self.assertNotEqual(result.returncode, 0)
            self.assertIn(
                "Moodle package contains an excluded file: public/app.js.map",
                result.stderr,
            )

    def test_rejects_a_package_without_admin_installation_guidance(self):
        with tempfile.TemporaryDirectory() as temporary_directory:
            repository_root = Path(temporary_directory)
            self.create_repository(repository_root)
            plugin_root = repository_root / "adapters" / "moodle" / "scaffold"
            (plugin_root / "README.md").write_text(
                "# Developer build notes\n",
                encoding="utf8",
            )

            result = self.run_packager(repository_root)

            self.assertNotEqual(result.returncode, 0)
            self.assertIn("administrator installation guide", result.stderr)

    def create_repository(self, repository_root, moodle_release="1.2.3"):
        plugin_root = repository_root / "adapters" / "moodle" / "scaffold"
        (plugin_root / "public").mkdir(parents=True)
        (plugin_root / "amd" / "build").mkdir(parents=True)
        (repository_root / "package.json").write_text(
            json.dumps({"version": "1.2.3"}),
            encoding="utf8",
        )
        (repository_root / "LICENSE").write_text("AGPL licence\n", encoding="utf8")
        (repository_root / "THIRD_PARTY_NOTICES.md").write_text(
            "# Third-Party Notices\n",
            encoding="utf8",
        )
        (plugin_root / "LICENSE").write_text(
            "GPLv3-or-later licence\n",
            encoding="utf8",
        )
        (plugin_root / "version.php").write_text(
            "\n".join(
                [
                    "<?php",
                    "$plugin->component = 'mod_scaffold';",
                    "$plugin->version = 2026072400;",
                    f"$plugin->release = '{moodle_release}';",
                ],
            ),
            encoding="utf8",
        )
        (plugin_root / "CHANGES.md").write_text(
            f"## {moodle_release} - 2026-07-24\n\nInitial release.\n",
            encoding="utf8",
        )
        (plugin_root / "README.md").write_text(
            "\n".join(
                [
                    "# Scaffold",
                    "",
                    "Install https://example.test/releases/download/v1.2.3/mod_scaffold-1.2.3.zip.",
                    "Check the installed release in Plugins overview.",
                    "See https://example.test/releases/tag/v1.2.3 for tested Moodle 4.5 hosts.",
                    "",
                ],
            ),
            encoding="utf8",
        )
        (plugin_root / "index.php").write_text("<?php\n", encoding="utf8")
        (plugin_root / "public" / "app.js").write_text("export {};\n", encoding="utf8")
        (plugin_root / "amd" / "build" / "app.min.js").write_text(
            "define([]);\n",
            encoding="utf8",
        )
        (plugin_root / "amd" / "build" / "app.min.js.map").write_text(
            json.dumps(
                {
                    "version": 3,
                    "file": "app.min.js",
                    "sources": ["../src/app.js"],
                    "names": [],
                    "mappings": "",
                },
            ),
            encoding="utf8",
        )

    def run_packager(self, repository_root):
        return subprocess.run(
            [
                sys.executable,
                str(PACKAGE_SCRIPT),
                "--repository-root",
                str(repository_root),
            ],
            capture_output=True,
            check=False,
            text=True,
        )


if __name__ == "__main__":
    unittest.main()
