// Support view (presentation only): FAQ, privacy explainer, abuse/takedown
// path. EN/IT share one component so structure can't drift.
import { getDict, type Lang } from "../i18n";
import { REPO_ISSUES_URL, REPO_URL, type PageShellProps } from "./components";

export function supportPage(props: { lang: Lang; origin: string }): PageShellProps {
  const { lang, origin } = props;
  const t = getDict(lang);

  return {
    title: t.meta.supportTitle,
    description: t.meta.supportDescription,
    lang,
    langToggle: {
      href: lang === "it" ? "/support" : "/it/support",
      lang: lang === "it" ? "en" : "it",
    },
    hreflang: [
      { lang: "en", href: `${origin}/support` },
      { lang: "it", href: `${origin}/it/support` },
    ],
    children: (
      <>
        <h1 style="margin-top: 0;">{t.support.title}</h1>

        <div class="card">
          <h2 style="margin-top: 0;">{t.support.howTitle}</h2>
          <p>{t.support.howBody}</p>
        </div>

        <div class="card">
          <h2 style="margin-top: 0;">{t.support.faqTitle}</h2>
          <dl>
            <dt><strong>{t.support.q1}</strong></dt>
            <dd>
              {t.support.a1Before}
              <a href="/dashboard">{t.support.a1Link}</a>
              {t.support.a1After}
            </dd>

            <dt><strong>{t.support.q2}</strong></dt>
            <dd>{t.support.a2}</dd>

            <dt><strong>{t.support.q3}</strong></dt>
            <dd>{t.support.a3}</dd>

            <dt><strong>{t.support.q4}</strong></dt>
            <dd>{t.support.a4}</dd>

            <dt><strong>{t.support.q5}</strong></dt>
            <dd>{t.support.a5}</dd>

            <dt><strong>{t.support.q6}</strong></dt>
            <dd>{t.support.a6}</dd>

            <dt><strong>{t.support.q7}</strong></dt>
            <dd>{t.support.a7}</dd>

            <dt><strong>{t.support.q8}</strong></dt>
            <dd>{t.support.a8}</dd>
          </dl>
        </div>

        <div class="card">
          <h2 style="margin-top: 0;">{t.support.reportTitle}</h2>
          <p>
            {t.support.reportBody}{" "}
            <a href={REPO_ISSUES_URL} target="_blank" rel="noopener">
              {REPO_ISSUES_URL}
            </a>
            .
          </p>
        </div>

        <div class="card">
          <h2 style="margin-top: 0;">{t.support.projectTitle}</h2>
          <p>
            {t.support.projectBody}{" "}
            <a href={REPO_URL} target="_blank" rel="noopener">
              {REPO_URL}
            </a>
            .
          </p>
        </div>
      </>
    ),
  };
}
