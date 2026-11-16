import type { Group } from "../../types.js";
import { envExample } from "./env/env-example.js";
import { envInHistory } from "./env/env-in-history.js";
import { envTracked } from "./env/env-tracked.js";
import { secretsInCode } from "./leaks/secrets-in-code.js";
import { secretsLogged } from "./leaks/secrets-logged.js";

// env/: .env files (tracked, in history, documented). leaks/: secrets in code and logs.
export const secrets: Group = {
  name: "Secrets",
  checks: [envTracked, envInHistory, secretsInCode, secretsLogged, envExample],
};
