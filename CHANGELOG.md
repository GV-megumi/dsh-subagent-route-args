# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2026-11-16

### Added

- `tools/execute` normalizer for the `subagent` and `list_subagent_models` tools:
  empty or whitespace-only `provider` / `model` / `reasoning_effort` values are
  treated as omitted fields.
- Bundle patch that inserts the plugin row into a profile.
- `node:test` suite (14 tests) covering normalization, strictness preservation,
  non-object arguments, unrelated tools and idempotence.
- English and Chinese documentation, MIT license, CI workflow.

[0.1.0]: https://github.com/GV-megumi/dsh-subagent-route-args/releases/tag/v0.1.0
