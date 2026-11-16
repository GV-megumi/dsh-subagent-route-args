# Contributing to dsh-subagent-route-args

Thanks for taking a look. This plugin is intentionally small: one normalizer, one
bundle patch, one test file. Keep it that way where possible.

## Ground rules

- **The normalizer only removes empty route strings.** It must never relax upstream
  validation (unknown routes, disabled model selection, incomplete
  `provider`/`model` pairs) and never touch fields outside `provider`, `model` and
  `reasoning_effort`.
- **Scope stays narrow.** `ROUTE_TOOLS` is `subagent` and `list_subagent_models`.
  Adding another tool needs a concrete failing case and a test.
- **No runtime dependencies.** The plugin runs inside the DSH host process; a
  dependency-free `lib/index.js` keeps it loadable and reviewable.
- **Every behavior change ships with a test.** CI runs `npm test` on Node 20, 22
  and 24.

## Development

```bash
git clone https://github.com/GV-megumi/dsh-subagent-route-args.git
cd dsh-subagent-route-args
npm test        # node --test, no install needed
npm run lint    # node --check lib/index.js
```

There is no build step: the package ships the same files that are tested.

### Testing against a real DSH instance

The suite mocks the `tools/execute` waterfall (`test/index.test.js`) and compares
against a copy of upstream's strict validation, so it runs anywhere. To check the
real integration, install the plugin into a profile (see the README) and call
`list_subagent_models` with empty route fields: before the plugin it errors with
`must be non-empty`, after it returns the route list.

## Pull requests

1. One topic per pull request; describe the failing case first (tool call, model
   output, error text), then the fix.
2. Update `CHANGELOG.md` under a new or existing heading.
3. Keep commits focused; a clear subject line and a body that explains *why* is
   enough.
4. If the change touches the bundle patch or the manifest, say which DSH version
   you validated against.
5. `npm test` and `npm run lint` must pass; CI surfaces Node-version differences.

## Reporting issues

Please include:

- DSH version (`app.asar` build or profile version) and platform
- the exact tool call arguments the model produced
- the error text you saw, and whether removing the plugin changes it

## License

By contributing you agree that your contribution is licensed under the
[MIT License](LICENSE).
