// Support view (presentation only): FAQ, privacy explainer, abuse/takedown
// path. EN/IT share one component so structure can't drift.
import { getDict, type Lang } from "../i18n";
import { repoLinks, type PageShellProps } from "./components";

export function supportPage(props: { lang: Lang; origin: string; repoUrl?: string }): PageShellProps {
  const { lang, origin, repoUrl } = props;
  const t = getDict(lang);
  const links = repoLinks(repoUrl);

  return {
    title: t.meta.supportTitle,
    description: t.meta.supportDescription,
    lang,
    repoUrl,
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
            <a href={links.privateReport} target="_blank" rel="noopener">
              {t.support.reportPrivateLink}
            </a>
            .
          </p>
          <p>
            {t.support.reportBugsBody}{" "}
            <a href={links.report} target="_blank" rel="noopener">
              {t.nav.reportIssue}
            </a>
            .
          </p>
        </div>

        <div class="card">
          <h2 style="margin-top: 0;">{t.support.projectTitle}</h2>
          <p>
            {t.support.projectBody}{" "}
            <a href={links.repo} target="_blank" rel="noopener">
              {links.repo}
            </a>
            .
          </p>
        </div>
      </>
    ),
  };
}
