// i18n entry point. Translation strings live in en.json / it.json (easy to
// edit and hand off); the Dict type is DERIVED from en.json, so key parity
// between languages stays compile-enforced (it.json is typed as Dict).
import enJson from "./en.json";
import itJson from "./it.json";

export type Lang = "en" | "it";

/** Translation shape — derived from the English JSON file. */
export type Dict = typeof enJson;

export const dictionaries: Record<Lang, Dict> = {
  en: enJson,
  it: itJson as Dict,
};

export function getDict(lang: Lang): Dict {
  return dictionaries[lang];
}

export { enJson, itJson };
