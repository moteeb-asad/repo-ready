import type { Group } from "../../types.js";
import { branchProtection } from "./branch-protection.js";

export const branches: Group = { name: "Branches", checks: [branchProtection] };
