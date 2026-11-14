import type { Group } from "../../types.js";
import { ciOnPr } from "./ci-on-pr.js";

export const ci: Group = { name: "CI", checks: [ciOnPr] };
