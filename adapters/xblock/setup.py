from setuptools import setup


setup(
    name="scaffold-xblock",
    version="0.0.0",
    description="Open edX XBlock adapter for Scaffold.",
    license="AGPL-3.0-only",
    packages=["scaffold_xblock", "scaffold_xblock.validation"],
    include_package_data=True,
    package_data={
        "scaffold_xblock": [
            "static/*.js",
            "static/*.css",
            "public/*.js",
            "public/*.css",
            "public/*.html",
            "public/assets/*",
            "validation/fixtures/*.json",
            "validation/schemas/*.json",
        ],
    },
    entry_points={
        "xblock.v1": [
            "scaffold = scaffold_xblock:ScaffoldXBlock",
        ],
    },
)
