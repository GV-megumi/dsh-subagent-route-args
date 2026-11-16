/**
 * dsh-subagent-route-args
 *
 * Treat empty-string model-route tool arguments as "field omitted" for the
 * DeepSeek Harness `subagent` and `list_subagent_models` tools.
 *
 * Why: DSH >= 0.2.2 validates `provider` / `model` / `reasoning_effort` strictly
 * ("child LLM `provider` must be non-empty") although all three are optional and
 * documented as "omit rather than send empty". Models that fill optional tool
 * arguments with `""` therefore fail while clearly meaning "inherit the default
 * route". This plugin only drops empty (or whitespace-only) strings; non-empty
 * values, allow-list checks, the disabled-policy check and "both provider and
 * model are required together" all keep behaving exactly as upstream.
 *
 * Hook: `tools/execute` is the waterfall that wraps the tool body
 * (@deepseek-ai/dsh-tools/lib/pipeline.js). The arguments value is a deep-frozen
 * snapshot, but the execution record itself is a plain object, so the plugin
 * replaces `exec.arguments` with a normalized copy before calling `next()`.
 */
export const name = "subagent-route-args";

/** Tools whose optional model-route fields are normalized. */
const ROUTE_TOOLS = new Set(["subagent", "list_subagent_models"]);

/** Optional model-route fields that must never be sent as empty strings. */
const ROUTE_FIELDS = ["provider", "model", "reasoning_effort"];

/**
 * Whether a value is a plain object (not null, not an array, not a class instance).
 * @param value - Candidate tool arguments.
 * @returns True for object literals and null-prototype objects.
 */
function isPlainObject(value) {
	if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
	const prototype = Object.getPrototypeOf(value);
	return prototype === Object.prototype || prototype === null;
}

/**
 * Drop empty-string model-route fields from tool arguments.
 * @param args - Tool arguments exactly as the model sent them.
 * @returns A frozen normalized copy, or `undefined` when nothing changed.
 */
export function normalizeRouteArguments(args) {
	if (!isPlainObject(args)) return undefined;
	let changed = false;
	const normalized = { ...args };
	for (const field of ROUTE_FIELDS) {
		const value = normalized[field];
		if (typeof value === "string" && value.trim().length === 0) {
			delete normalized[field];
			changed = true;
		}
	}
	return changed ? Object.freeze(normalized) : undefined;
}

/**
 * Install the argument normalizer on the tool pipeline.
 * @param ctx - Plugin context supplied by Cordis.
 */
export function apply(ctx) {
	ctx.on("tools/execute", (exec, next) => {
		if (!ROUTE_TOOLS.has(exec?.name)) return next();
		const normalized = normalizeRouteArguments(exec.arguments);
		if (normalized === undefined) return next();
		exec.arguments = normalized;
		return next();
	});
}
