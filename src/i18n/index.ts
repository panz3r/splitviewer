import { en, type Dict } from "./en";
import { it } from "./it";

export type Lang = "en" | "it";

export function getDict(lang: Lang): Dict {
  return lang === "it" ? it : en;
}

export { en, it, type Dict };
