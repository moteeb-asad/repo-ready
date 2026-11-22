import type { Group } from "../../types.js";
import { agentFiles } from "./env/agent-files.js";
import { pushProtection } from "./push-protection.js";
import { envExample } from "./env/env-example.js";
import { envInHistory } from "./env/env-in-history.js";
import { envTracked } from "./env/env-tracked.js";
import { secretsInCode } from "./leaks/secrets-in-code.js";
import { secretsInHistory } from "./leaks/secrets-in-history.js";
import { secretsLogged } from "./leaks/secrets-logged.js";

// env/: local config files (.env, local AI agent files). leaks/: secrets in code, history and logs.
// push-protection: whether GitHub blocks pushed secrets.
export const secrets: Group = {
  name: "Secrets",
  checks: [envTracked, envInHistory, agentFiles, secretsInCode, secretsInHistory, secretsLogged, envExample, pushProtection],
};
