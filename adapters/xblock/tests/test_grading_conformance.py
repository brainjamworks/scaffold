import importlib
import importlib.resources
import json
import subprocess
import sys
import types
import unittest
from pathlib import Path

from adapters.xblock.tests.artifact_test_support import copied_artifact_workspace


ADAPTER_ROOT = Path(__file__).resolve().parents[1]
REPOSITORY_ROOT = ADAPTER_ROOT.parents[1]
PACKAGE_ROOT = ADAPTER_ROOT / "scaffold_xblock"
SOURCE_CORPUS = (
    REPOSITORY_ROOT / "packages" / "grading" / "fixtures" / "assessment-grading.json"
)
VENDORED_CORPUS = (
    PACKAGE_ROOT / "validation" / "fixtures" / "assessment-grading.json"
)


def load_scaffold_module(module_name):
    if "scaffold_xblock" not in sys.modules:
        package = types.ModuleType("scaffold_xblock")
        package.__path__ = [str(PACKAGE_ROOT)]
        sys.modules["scaffold_xblock"] = package
    if str(ADAPTER_ROOT) not in sys.path:
        sys.path.insert(0, str(ADAPTER_ROOT))
    return importlib.import_module("scaffold_xblock.%s" % module_name)


class GradingConformanceTest(unittest.TestCase):
    def test_every_vendored_corpus_case_matches_the_native_grader(self):
        validation_package = load_scaffold_module("validation")
        grading = load_scaffold_module("grading")
        corpus_text = (
            importlib.resources.files(validation_package)
            .joinpath("fixtures/assessment-grading.json")
            .read_text(encoding="utf-8")
        )
        corpus = json.loads(corpus_text)

        self.assertEqual(len(corpus["cases"]), 21)
        for case in corpus["cases"]:
            with self.subTest(case=case["id"]):
                self.assertEqual(
                    grading.grade_assessment(case["target"], case["response"]),
                    case["expected"],
                )


class GradingCorpusArtifactTest(unittest.TestCase):
    def test_vendored_corpus_is_byte_identical_to_grading_source(self):
        self.assertEqual(VENDORED_CORPUS.read_bytes(), SOURCE_CORPUS.read_bytes())

    def test_sync_check_detects_a_missing_vendored_corpus(self):
        with copied_artifact_workspace() as adapter_root:
            vendored_corpus = (
                adapter_root
                / "scaffold_xblock/validation/fixtures/assessment-grading.json"
            )
            vendored_corpus.unlink()
            result = subprocess.run(
                ["node", "scripts/sync-assessment-artifacts.mjs", "--check"],
                cwd=adapter_root,
                capture_output=True,
                check=False,
                text=True,
            )

        self.assertNotEqual(result.returncode, 0)
        self.assertIn("Missing vendored assessment grading corpus", result.stderr)

    def test_sync_check_detects_a_divergent_vendored_corpus(self):
        with copied_artifact_workspace() as adapter_root:
            vendored_corpus = (
                adapter_root
                / "scaffold_xblock/validation/fixtures/assessment-grading.json"
            )
            vendored_corpus.write_bytes(vendored_corpus.read_bytes() + b" ")
            result = subprocess.run(
                ["node", "scripts/sync-assessment-artifacts.mjs", "--check"],
                cwd=adapter_root,
                capture_output=True,
                check=False,
                text=True,
            )

        self.assertNotEqual(result.returncode, 0)
        self.assertIn("Vendored assessment grading corpus has drifted", result.stderr)

if __name__ == "__main__":
    unittest.main()
