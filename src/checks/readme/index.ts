import type { Group } from "../../runner.js";
import { readme } from "./readme.js";

export const readmeGroup: Group = { name: "README", checks: [readme] };
