#!/usr/bin/env python3
"""Shared SpinStage Public version → Android versionCode mapping."""

from __future__ import annotations


def parse_semver(version: str) -> tuple[int, int, int]:
    parts = version.strip().split(".")
    if len(parts) != 3 or not all(p.isdigit() for p in parts):
        raise ValueError(f"Expected semver like 0.3.8, got {version!r}")
    return int(parts[0]), int(parts[1]), int(parts[2])


def version_code_for(version: str) -> int:
    """Android versionCode used across sync, verify, and release tooling."""
    major, minor, patch = parse_semver(version)
    if major != 0:
        return major * 10000 + minor * 100 + patch
    return minor * 100 + patch + 17
