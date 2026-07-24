import hashlib
import json
import subprocess
import sys
import tempfile
import unittest
import zipfile
from pathlib import Path


PACKAGE_SCRIPT = Path(__file__).parents[1] / "scripts" / "package.py"


class MoodlePackageTest(unittest.TestCase):
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

    def create_repository(self, repository_root, moodle_release="1.2.3"):
        plugin_root = repository_root / "adapters" / "moodle" / "scaffold"
        (plugin_root / "public").mkdir(parents=True)
        (plugin_root / "amd" / "build").mkdir(parents=True)
        (repository_root / "package.json").write_text(
            json.dumps({"version": "1.2.3"}),
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
        (plugin_root / "README.md").write_text("# Scaffold\n", encoding="utf8")
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
