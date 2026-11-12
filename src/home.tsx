// Homepage (EN at /, IT at /it): value prop + how-it-works + privacy pitch,
// with a live fake-data example card (randomized per request via
// /example-card.png). EN/IT share one render function so structure can't drift.
import { Hono } from 'hono'
import { getDict, type Lang } from './i18n'
import { getSessionUserId } from './middleware'
import { PageShell, REPO_ISSUES_URL, type PageShellProps } from './ui/components'
import type { AppEnv } from './types'

function homePage(c: { req: { url: string } }, lang: Lang): PageShellProps {
  const t = getDict(lang);
  const origin = new URL(c.req.url).origin;
  const basePath = lang === "it" ? "/it" : "";

  return {
    title: t.meta.homeTitle,
    description: t.meta.homeDescription,
    lang,
    langToggle: {
      href: lang === "it" ? "/" : "/it",
      lang: lang === "it" ? "en" : "it",
    },
    hreflang: [
      { lang: "en", href: `${origin}/` },
      { lang: "it", href: `${origin}/it` },
    ],
    head: (
      <>
        <meta property="og:title" content={t.meta.homeOgTitle} />
        <meta property="og:description" content={t.meta.homeDescription} />
        <meta property="og:type" content="website" />
        <meta property="og:url" content={`${origin}${basePath || "/"}`} />
        <meta property="og:image" content={`${origin}/example-card.png`} />
      </>
    ),
    children: (
      <>
        <section class="hero">
          <h1>{t.home.heroTitle}</h1>
          <p>
            {t.home.heroLead1} {t.home.heroLead2} <strong>{t.home.heroLead3}</strong>
            {t.home.heroLead4}
          </p>
          <div class="cta">
            <a class="btn btn--primary" href="/auth/login">
              {t.home.ctaLogin}
            </a>
            <a class="btn" href="#example">
              {t.home.ctaSample}
            </a>
          </div>
        </section>

        <h2 class="section-title">{t.home.howTitle}</h2>
        <div class="steps">
          <div class="card step">
            <span class="n">1</span>
            <h3>{t.home.step1Title}</h3>
            <p>{t.home.step1Body}</p>
          </div>
          <div class="card step">
            <span class="n">2</span>
            <h3>{t.home.step2Title}</h3>
            <p>{t.home.step2Body}</p>
          </div>
          <div class="card step">
            <span class="n">3</span>
            <h3>{t.home.step3Title}</h3>
            <p>{t.home.step3Body}</p>
          </div>
        </div>

        <h2 id="example" class="section-title">
          {t.home.sampleTitle}
        </h2>
        <div class="card">
          <img
            src="/example-card.png"
            alt={t.home.sampleTitle}
            width="1200"
            height="630"
          />
          <p class="muted small" style="margin-top: .8rem;">
            {t.home.sampleCaption}
          </p>
        </div>

        <h2 class="section-title">{t.home.privacyTitle}</h2>
        <div class="card">
          <ul class="checklist">
            <li>
              {t.home.privacyItem1a} <strong>{t.home.privacyItem1b}</strong>
              {t.home.privacyItem1c}
            </li>
            <li>
              {t.home.privacyItem2a} <strong>{t.home.privacyItem2b}</strong>
              {t.home.privacyItem2c}
            </li>
            <li>
              {t.home.privacyItem3a} <strong>{t.home.privacyItem3b}</strong>
              {t.home.privacyItem3c}
            </li>
            <li>
              <strong>{t.home.privacyItem4a}</strong> {t.home.privacyItem4b}
            </li>
            <li>{t.home.privacyItem5}</li>
          </ul>
          <p class="muted small" style="margin-top: .8rem;">
            {t.home.privacyMore}{" "}
            <a href={lang === "it" ? "/it/support" : "/support"}>{t.nav.support}</a> ·{" "}
            <a href={REPO_ISSUES_URL} target="_blank" rel="noopener">
              {t.nav.reportIssue}
            </a>
          </p>
        </div>
      </>
    ),
  };
}

export const homeRoutes = new Hono<AppEnv>()

  .get("/", async (c) => {
    const userId = await getSessionUserId(c)
    if (userId) {
      // Authenticated users should never see the landing page again.
      return c.redirect('/dashboard', 302)
    }
    return c.html(<PageShell {...homePage(c, "en")} />)
  })

  .get("/it", async (c) => {
    const userId = await getSessionUserId(c)
    if (userId) {
      // Language-aware: from the IT homepage, logged-in users land on the IT
      // dashboard (logo click from /it/dashboard must round-trip).
      return c.redirect('/it/dashboard', 302)
    }
    return c.html(<PageShell {...homePage(c, "it")} />)
  })
