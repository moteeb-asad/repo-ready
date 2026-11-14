import type { Group } from "../../types.js";
import { envExample } from "./env-example.js";
import { envInHistory } from "./env-in-history.js";
import { envTracked } from "./env-tracked.js";
import { secretsInCode } from "./secrets-in-code.js";

export const secrets: Group = {
  name: "Secrets",
  checks: [envTracked, envInHistory, secretsInCode, envExample],
};
