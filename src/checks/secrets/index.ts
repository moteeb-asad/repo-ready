import type { Group } from "../../runner.js";
import { envExample } from "./env-example.js";
import { envInHistory } from "./env-in-history.js";
import { envTracked } from "./env-tracked.js";

export const secrets: Group = { name: "Secrets", checks: [envTracked, envInHistory, envExample] };
