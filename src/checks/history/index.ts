import type { Group } from "../../types.js";
import { commitMessages } from "./commit-messages.js";

export const history: Group = { name: "History", checks: [commitMessages] };
