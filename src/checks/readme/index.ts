import type { Group } from "../../types.js";
import { readme } from "./readme.js";

export const readmeGroup: Group = { name: "README", checks: [readme] };
