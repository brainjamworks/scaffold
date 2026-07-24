import hashlib
import json
import subprocess
import sys
import tempfile
import unittest
import zipfile
from pathlib import Path


PACKAGE_SCRIPT = Path(__file__).parents[1] / "scripts" / "package.py"
REPOSITORY_ROOT = Path(__file__).parents[3]


class MoodlePackageTest(unittest.TestCase):
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
                self.assertIn("scaffold/version.php", names)
                self.assertIn("scaffold/public/app.js", names)
                self.assertIn("scaffold/amd/build/app.min.js", names)
                self.assertIn("scaffold/LICENSE", names)
                self.assertIn("scaffold/THIRD_PARTY_NOTICES.md", names)
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

    def test_rejects_development_files_from_the_installable_zip(self):
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
