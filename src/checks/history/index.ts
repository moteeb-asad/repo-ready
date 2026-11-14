import type { Group } from "../../types.js";
import { commitMessages } from "./commit-messages.js";
import { directPushes } from "./direct-pushes.js";

export const history: Group = { name: "History", checks: [commitMessages, directPushes] };
