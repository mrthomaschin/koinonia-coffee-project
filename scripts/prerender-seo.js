// Post-build SEO step:
// 1. Writes a copy of build/index.html for each catering route, /initiatives, and
//    the static routes below with that page's title, description, canonical,
//    social tags, and JSON-LD already in <head>, so crawlers and link previews
//    (iMessage, Slack) that don't run JavaScript see the right metadata. Firebase serves them via "cleanUrls" (e.g.
//    /catering/torrance -> build/catering/torrance.html); every other route
//    still falls through to the SPA rewrite.
// 2. Writes build/sitemap.xml, using each page's last git commit date as lastmod.
const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const ts = require("typescript");

const root = path.join(__dirname, "..");
const buildDir = path.join(root, "build");
const cateringSource = path.join(root, "src/pages/catering/cateringPages.ts");
const initiativesSource = path.join(root, "src/pages/initiatives/initiativesData.ts");

const loadModule = (source) => {
  const { outputText } = ts.transpileModule(
    fs.readFileSync(source, "utf8"),
    {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2019,
      },
    },
  );
  const module = { exports: {} };
  new Function("module", "exports", outputText)(module, module.exports);
  return module.exports;
};

const escapeHtml = (value) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

const managedTags =
  /<meta\s[^>]*(?:name|property)="(?:description|robots|og:[^"]*|twitter:[^"]*)"[^>]*>|<link\s[^>]*rel="canonical"[^>]*>|<title>[\s\S]*?<\/title>/g;

// Pages without HERO_IMAGE get no og:image, so link previews show the small site icon.
const renderHead = (page, { SITE_URL, HERO_IMAGE, buildStructuredData }, { preloadHero = true } = {}) => {
  const url = `${SITE_URL}${page.path}`;
  const title = escapeHtml(page.seoTitle);
  const description = escapeHtml(page.description);
  const jsonLd =
    buildStructuredData &&
    JSON.stringify(buildStructuredData(page)).replace(/</g, "\\u003c");
  return [
    `<title>${title}</title>`,
    `<meta name="description" content="${description}"/>`,
    `<meta name="robots" content="index, follow"/>`,
    `<link rel="canonical" href="${url}"/>`,
    `<meta property="og:title" content="${title}"/>`,
    `<meta property="og:description" content="${description}"/>`,
    `<meta property="og:type" content="website"/>`,
    `<meta property="og:url" content="${url}"/>`,
    HERO_IMAGE ? `<meta property="og:image" content="${HERO_IMAGE}"/>` : "",
    `<meta name="twitter:card" content="${HERO_IMAGE ? "summary_large_image" : "summary"}"/>`,
    `<meta name="twitter:title" content="${title}"/>`,
    `<meta name="twitter:description" content="${description}"/>`,
    HERO_IMAGE ? `<meta name="twitter:image" content="${HERO_IMAGE}"/>` : "",
    jsonLd
      ? `<script type="application/ld+json" data-koinonia-seo-jsonld="true">${jsonLd}</script>`
      : "",
    // The hero photo is the largest paint; start fetching it before the JS bundle renders it.
    preloadHero && HERO_IMAGE
      ? `<link rel="preload" as="image" href="${new URL(HERO_IMAGE).pathname}" fetchpriority="high"/>`
      : "",
  ].join("");
};

// Indexable routes outside /catering, with the source that drives lastmod.
// seoTitle/description/image mirror each page's <SEO> props; keep them in sync.
// /initiatives is prerendered from its data module instead; product pages are
// served by the shopPageMeta function.
const staticRoutes = [
  // "/" keeps build/index.html's tags, since that file is also the SPA fallback for every route.
  { path: "/", source: "src/pages/homepage" },
  {
    path: "/about",
    source: "src/pages/about",
    seoTitle: "About Koinonia Coffee Project",
    description: "Learn how Koinonia Coffee Project uses specialty coffee to create spaces for meaningful connection.",
  },
  {
    path: "/shop/coffee",
    source: "src/pages/shop",
    seoTitle: "Specialty Coffee Beans | Koinonia Coffee Project",
    description: "Shop specialty coffee from Koinonia Coffee Project, roasted fresh for brewing at home.",
  },
  {
    path: "/shop/merch",
    source: "src/pages/shop",
    seoTitle: "Apparel, Stickers & Merch | Koinonia Coffee Project",
    description: "Shop apparel, drinkware, stickers, and more from Koinonia Coffee Project.",
  },
  {
    path: "/menu",
    source: "src/pages/menu",
    seoTitle: "Koinonia Coffee Project | Menu",
    description: "Explore the Koinonia Coffee Project menu, from espresso drinks to thoughtfully prepared coffee.",
  },
  {
    path: "/calendar",
    source: "src/pages/calendar",
    seoTitle: "Koinonia Coffee Project | Events Calendar",
    description: "Find Koinonia Coffee Project at upcoming pop-ups, markets, and community gatherings.",
  },
  {
    path: "/church-partnership",
    source: "src/pages/church-partnership",
    seoTitle: "Church Coffee Ministry Partnership | Koinonia Coffee Project",
    description: "Wholesale coffee, barista training, and a custom coffee ministry playbook for churches and ministries in Los Angeles, Orange County, and the Inland Empire.",
    image: "/assets/images/koinonia-53.jpg",
  },
  { path: "/initiatives", source: "src/pages/initiatives" },
  {
    path: "/contact",
    source: "src/pages/contact",
    seoTitle: "Contact Koinonia Coffee Project",
    description: "Get in touch with Koinonia Coffee Project about coffee, collaborations, and event bookings.",
  },
];

const lastModified = (source) => {
  try {
    const date = execFileSync("git", ["log", "-1", "--format=%cs", "--", source], {
      cwd: root,
      encoding: "utf8",
    }).trim();
    if (date) return date;
  } catch {
    // Not a git checkout; fall back to the build date.
  }
  return new Date().toISOString().slice(0, 10);
};

const writeSitemap = (SITE_URL, cateringPaths) => {
  const cateringLastmod = lastModified("src/pages/catering");
  const entries = [
    ...staticRoutes.map(({ path: route, source }) => ({
      route,
      lastmod: lastModified(source),
    })),
    ...cateringPaths.map((route) => ({ route, lastmod: cateringLastmod })),
  ];
  const urls = entries
    .map(
      ({ route, lastmod }) =>
        `  <url><loc>${SITE_URL}${route}</loc><lastmod>${lastmod}</lastmod></url>`,
    )
    .join("\n");
  fs.writeFileSync(
    path.join(buildDir, "sitemap.xml"),
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`,
  );
  return entries.length;
};

const main = () => {
  const template = fs.readFileSync(path.join(buildDir, "index.html"), "utf8");
  const data = loadModule(cateringSource);
  const pages = [data.hubPage, ...data.cateringPages];
  const initiativesData = loadModule(initiativesSource);

  const writePage = (page, pageData, options) => {
    const html = template
      .replace(managedTags, "")
      .replace("</head>", `${renderHead(page, pageData, options)}</head>`);
    const outFile = path.join(buildDir, `${page.path.replace(/^\//, "")}.html`);
    fs.mkdirSync(path.dirname(outFile), { recursive: true });
    fs.writeFileSync(outFile, html);
  };

  pages.forEach((page) => writePage(page, data));
  // /initiatives has a text-only hero; its HERO_IMAGE is the social share image only.
  writePage(initiativesData.initiativesPage, initiativesData, { preloadHero: false });
  const staticPages = staticRoutes.filter((route) => route.seoTitle);
  staticPages.forEach((page) =>
    writePage(
      page,
      {
        SITE_URL: data.SITE_URL,
        HERO_IMAGE: page.image && `${data.SITE_URL}${page.image}`,
      },
      // These pages render their own hero; only the social tags are needed here.
      { preloadHero: false },
    ),
  );

  const urlCount = writeSitemap(
    data.SITE_URL,
    pages.map((page) => page.path),
  );

  console.log(
    `Prerendered SEO head tags for ${pages.length} catering pages, /initiatives, and ${staticPages.length} static pages; wrote sitemap with ${urlCount} URLs.`,
  );
};

main();
