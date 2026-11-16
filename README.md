# dsh-subagent-route-args

[English](README.md) | [中文](README.zh-CN.md)

[![CI](https://github.com/GV-megumi/dsh-subagent-route-args/actions/workflows/ci.yml/badge.svg)](https://github.com/GV-megumi/dsh-subagent-route-args/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![DSH](https://img.shields.io/badge/DSH-0.2.x-1f6feb.svg)](https://github.com/deepseek-ai)

> Fix `Error: child LLM \`provider\` must be non-empty` when a model fills optional model-route tool arguments with `""`.

The `subagent` and `list_subagent_models` tools in DeepSeek Harness declare
`provider`, `model` and `reasoning_effort` as **optional** — omitting them means
"inherit the default route". Many models still send `"provider": ""` (or a
whitespace string) to say "no value here", and the strict 0.2.2 validation
rejects that as invalid.

## The problem

`list_subagent_models(provider: "")` fails instead of listing routes:

```
Error: child LLM `provider` must be non-empty
Error: `provider` must be non-empty
Error: `model` must be non-empty
```

Creating a subagent fails the same way whenever the model pads the optional
route fields with empty strings, which also wastes a tool call cycle.

## What this plugin does

It listens on the Cordis `tools/execute` waterfall and, for those two tools only,
deletes `provider` / `model` / `reasoning_effort` when the value is an empty or
whitespace-only string. Real values and every strict check stay as they are:

| Input | After the plugin | Result |
| --- | --- | --- |
| `provider:"", model:"", reasoning_effort:""` | all three removed | default route, no error |
| `provider:"", model:"gpt-6-astra"` | `model:"gpt-6-astra"` | upstream `` `model` requires `provider` `` — strictness kept |
| `provider:"codex", model:"gpt-6-astra", effort:""` | `effort` removed | real route still passes the allow-list check |
| any other tool, or non-object arguments | unchanged | unchanged |

It never relaxes validation: unknown routes, disabled model selection and
incomplete `provider`/`model` pairs still fail exactly as upstream. It also never
strips empty strings from other fields — `write` with `content: ""` still means
"empty file".

## Install

### Requirements

- DeepSeek Harness 0.2.2+ (desktop or web profile with Cordis bundle support)
- Node.js 20+ only for running the tests; DSH ships its own runtime

### 1) Put the package where the profile can resolve it

Windows (PowerShell):

```powershell
$Target = Join-Path $env:USERPROFILE '.dsh\custom-bundles\dsh-subagent-route-args'
git clone https://github.com/GV-megumi/dsh-subagent-route-args.git $Target
```

macOS / Linux:

```bash
git clone https://github.com/GV-megumi/dsh-subagent-route-args.git ~/.dsh/custom-bundles/dsh-subagent-route-args
```

### 2) Link it into the active profile

A profile resolves bundle packages from `<profile>/node_modules`.

Windows (junction, no admin rights needed):

```powershell
$ProfileDir = Join-Path $env:USERPROFILE '.dsh\profiles\desktop'
New-Item -ItemType Junction `
  -Path (Join-Path $ProfileDir 'node_modules\dsh-subagent-route-args') `
  -Target $Target
```

macOS / Linux:

```bash
ln -s ~/.dsh/custom-bundles/dsh-subagent-route-args \
      ~/.dsh/profiles/desktop/node_modules/dsh-subagent-route-args
```

### 3) Register the bundle in the profile manifest

Edit `<profile>/package.json` so it lists the dependency and the bundle:

```json
{
  "dependencies": {
    "dsh-subagent-route-args": "link:/absolute/path/to/dsh-subagent-route-args"
  },
  "dsh": {
    "profile": {
      "bundles": ["dsh-subagent-route-args"]
    }
  }
}
```

Add the bundles entry next to your existing bundle names; the position does not
matter. **Do not** paste the `insert:` block from `cordis.patch.yml` into the
profile's `cordis.patch.yml`: the bundle patch is applied automatically, and
duplicating the row id stops Settings from saving.

### 4) Restart DSH completely

Quit the desktop process (not only the window) and start it again — bundles load
at boot.

### Verify

Ask the agent to call `list_subagent_models` with all three fields empty:
`provider: "", model: "", reasoning_effort: ""`.

Before the plugin this prints a red `must be non-empty` error; after it the tool
returns its normal route list.

### Uninstall

Remove the bundle name from `dsh.profile.bundles`, remove the dependency from
`dependencies`, delete the junction/symlink, then restart DSH.

## How it works

- `tools/execute` is the Cordis waterfall around the tool body
  (`@deepseek-ai/dsh-tools/lib/pipeline.js`); listeners receive `(exec, next)`
  and run before dispatch.
- DSH deep-freezes the arguments snapshot, but the execution record itself is a
  plain object, so the plugin swaps `exec.arguments` for a frozen normalized
  copy and then calls `next()`.
- The rewrite is skipped when nothing changes, so real arguments keep their
  object identity.
- Only `subagent` and `list_subagent_models` are touched, and only the three
  route fields. No configuration, no dependencies, no runtime patches.

## Compatibility

- Tested with DSH 0.2.2-rc.2 and 0.2.2-rc.3 (desktop, Windows). It should work on
  any 0.2.x build that emits `tools/execute`.
- The manifest deliberately declares **no** `engines.dsh` and **no**
  `peerDependencies`: DSH's compatibility preflight only denies rows with unmet
  requirements, so leaving them out keeps the plugin loadable across 0.2.x.
  Adding a hard `engines.dsh` range would make DSH disable the plugin whenever
  the range stops matching.
- The desktop build now ships as a single `app.asar`, so patching installed
  files is fragile and is undone by every update. This plugin lives in your
  profile and survives DSH upgrades.

## Troubleshooting

| Symptom | Check |
| --- | --- |
| Error is unchanged after restart | Is the bundle name in `dsh.profile.bundles`? Does `<profile>/node_modules/dsh-subagent-route-args` exist and resolve? |
| DSH fails to start after install | Remove the bundles entry and dependency, restart, then open an issue with the startup error |
| Settings cannot save | Was the `insert:` block copied into the profile `cordis.patch.yml` by mistake? Remove it |

## Development

```bash
npm test        # node --test, no dependencies
npm run lint    # node --check lib/index.js
```

Layout:

| Path | Purpose |
| --- | --- |
| `lib/index.js` | plugin entry (`name` + `apply`) |
| `cordis.patch.yml` | bundle patch that inserts the plugin row |
| `test/index.test.js` | `node:test` suite with a mini `tools/execute` waterfall |

Contributions are welcome — see [CONTRIBUTING.md](CONTRIBUTING.md).

## License

[MIT](LICENSE)
