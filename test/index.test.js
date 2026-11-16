import test from "node:test";
import assert from "node:assert/strict";
import { apply, name, normalizeRouteArguments } from "../lib/index.js";

/**
 * Mount the plugin on a minimal stand-in for the Cordis `tools/execute`
 * waterfall: handlers run outermost-first and each receives `(exec, next)`.
 * @returns A `run(exec, body)` dispatcher plus the recorded listener count.
 */
function harness() {
	const handlers = [];
	apply({
		on(event, handler) {
			assert.equal(event, "tools/execute");
			handlers.push(handler);
		}
	});
	return {
		handlers,
		async run(exec, body = async () => "tool-result") {
			let index = 0;
			const next = async () => {
				const handler = handlers[index++];
				return handler === undefined ? body(exec) : handler(exec, next);
			};
			return next();
		}
	};
}

/**
 * Mirror the route validation of @deepseek-ai/dsh-tool-subagent so tests can
 * prove that normalization only removes empty values and keeps every strict
 * check for real ones.
 * @param args - Arguments the tool body would receive.
 * @throws For an empty route value or an incomplete provider/model pair.
 */
function upstreamValidate(args) {
	for (const field of ["provider", "model", "reasoning_effort"]) {
		if (args[field] !== undefined && String(args[field]).length === 0) {
			throw new Error(`child LLM \`${field}\` must be non-empty`);
		}
	}
	if (args.model !== undefined && args.provider === undefined) throw new Error("`model` requires `provider`");
	if (args.provider !== undefined && args.model === undefined) throw new Error("`provider` requires `model`");
}

test("exports the expected plugin name", () => {
	assert.equal(name, "subagent-route-args");
});

test("installs exactly one tools/execute listener", () => {
	const { handlers } = harness();
	assert.equal(handlers.length, 1);
});

test("removes every empty route field on list_subagent_models", async () => {
	const { run } = harness();
	const exec = { name: "list_subagent_models", arguments: { provider: "", model: "", reasoning_effort: "" } };
	const result = await run(exec, async (current) => {
		assert.deepEqual(current.arguments, {});
		upstreamValidate(current.arguments);
		return "routes";
	});
	assert.equal(result, "routes");
});

test("keeps a real model when only provider is empty, so pairing still fails", async () => {
	const { run } = harness();
	const exec = { name: "list_subagent_models", arguments: { provider: "", model: "gpt-6-astra" } };
	await assert.rejects(
		run(exec, async (current) => {
			assert.deepEqual(current.arguments, { model: "gpt-6-astra" });
			upstreamValidate(current.arguments);
			return "unreachable";
		}),
		/model` requires `provider/
	);
});

test("removes every empty route field on subagent_fork", async () => {
	const { run } = harness();
	const exec = {
		name: "subagent_fork",
		arguments: { provider: "", model: "", reasoning_effort: "", prompt: "fork the task" }
	};
	const seen = await run(exec, async (current) => {
		assert.deepEqual(current.arguments, { prompt: "fork the task" });
		upstreamValidate(current.arguments);
		return current.arguments;
	});
	assert.deepEqual(seen, { prompt: "fork the task" });
	assert.equal(Object.isFrozen(seen), true);
});

test("keeps a real route on subagent_fork untouched", async () => {
	const { run } = harness();
	const original = { provider: "codex", model: "gpt-6-astra", prompt: "fork" };
	const exec = { name: "subagent_fork", arguments: original };
	await run(exec, async (current) => {
		assert.equal(current.arguments, original);
		upstreamValidate(current.arguments);
		return "forked";
	});
});

test("treats whitespace-only values as empty and keeps real neighbours", async () => {
	const { run } = harness();
	const exec = { name: "subagent", arguments: { provider: "   ", model: "   ", reasoning_effort: "\t", prompt: "hi" } };
	const seen = await run(exec, async (current) => current.arguments);
	assert.deepEqual(seen, { prompt: "hi" });
	upstreamValidate(seen);
});

test("leaves a fully specified real route untouched", async () => {
	const { run } = harness();
	const original = { provider: "codex", model: "gpt-6-astra", reasoning_effort: "high" };
	const exec = { name: "subagent", arguments: original };
	const result = await run(exec, async (current) => {
		assert.equal(current.arguments, original);
		return "spawned";
	});
	assert.equal(result, "spawned");
});

test("ignores tools outside the route set", async () => {
	const { run } = harness();
	const original = { content: "", path: "README.md" };
	const exec = { name: "write", arguments: original };
	await run(exec, async (current) => {
		assert.equal(current.arguments, original);
		assert.equal(current.arguments.content, "");
		return "written";
	});
});

test("ignores non-object arguments", async () => {
	for (const args of [undefined, null, "text", 42, ["provider"], new Date(0)]) {
		const { run } = harness();
		const exec = { name: "subagent", arguments: args };
		await run(exec, async (current) => {
			assert.equal(current.arguments, args);
			return "ok";
		});
	}
});

test("replaces the snapshot with a frozen one", async () => {
	const { run } = harness();
	const exec = { name: "subagent", arguments: Object.freeze({ provider: "" }) };
	const seen = await run(exec, async (current) => current.arguments);
	assert.deepEqual(seen, {});
	assert.equal(Object.isFrozen(seen), true);
});

test("calls the tool body exactly once per dispatch", async () => {
	const { run } = harness();
	let calls = 0;
	const exec = { name: "list_subagent_models", arguments: { provider: "" } };
	await run(exec, async () => {
		calls += 1;
		return "done";
	});
	assert.equal(calls, 1);
});

test("passes the tool result and errors through unchanged", async () => {
	const { run } = harness();
	assert.deepEqual(await run({ name: "subagent", arguments: { model: "" } }, async () => ({ ok: true })), { ok: true });
	await assert.rejects(
		run({ name: "subagent", arguments: {} }, async () => {
			throw new Error("tool failed");
		}),
		/tool failed/
	);
});

test("is idempotent across dispatches", async () => {
	const { run } = harness();
	const exec = { name: "subagent", arguments: { provider: "", model: "gpt-6-astra", prompt: "hi" } };
	const first = await run(exec, async (current) => current.arguments);
	const second = await run(exec, async (current) => current.arguments);
	assert.deepEqual(first, { model: "gpt-6-astra", prompt: "hi" });
	assert.deepEqual(second, first);
});

test("normalizeRouteArguments reports no change for a clean object", () => {
	assert.equal(normalizeRouteArguments({ provider: "codex", model: "gpt-6-astra" }), undefined);
	assert.equal(normalizeRouteArguments({}), undefined);
	assert.equal(normalizeRouteArguments(undefined), undefined);
	assert.equal(normalizeRouteArguments(["provider"]), undefined);
});

test("never strips empty values from non-route fields", async () => {
	const { run } = harness();
	const exec = { name: "subagent", arguments: { provider: "", prompt: "" } };
	const seen = await run(exec, async (current) => current.arguments);
	assert.deepEqual(seen, { prompt: "" });
});
