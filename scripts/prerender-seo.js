// Post-build SEO step:
// 1. Writes a copy of build/index.html for each catering route with that page's
//    title, description, canonical, social tags, and JSON-LD already in <head>,
//    so crawlers that don't run JavaScript (and Google's first pass) see the
//    right metadata. Firebase serves them via "cleanUrls" (e.g.
//    /catering/torrance -> build/catering/torrance.html); every other route
//    still falls through to the SPA rewrite.
// 2. Writes build/sitemap.xml, using each page's last git commit date as lastmod.
const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const ts = require("typescript");

const root = path.join(__dirname, "..");
const buildDir = path.join(root, "build");
const pagesSource = path.join(root, "src/pages/catering/cateringPages.ts");

const loadCateringPages = () => {
  const { outputText } = ts.transpileModule(
    fs.readFileSync(pagesSource, "utf8"),
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

const renderHead = (page, { SITE_URL, HERO_IMAGE, buildStructuredData }) => {
  const url = `${SITE_URL}${page.path}`;
  const title = escapeHtml(page.seoTitle);
  const description = escapeHtml(page.description);
  const jsonLd = JSON.stringify(buildStructuredData(page)).replace(
    /</g,
    "\\u003c",
  );
  return [
    `<title>${title}</title>`,
    `<meta name="description" content="${description}"/>`,
    `<meta name="robots" content="index, follow"/>`,
    `<link rel="canonical" href="${url}"/>`,
    `<meta property="og:title" content="${title}"/>`,
    `<meta property="og:description" content="${description}"/>`,
    `<meta property="og:type" content="website"/>`,
    `<meta property="og:url" content="${url}"/>`,
    `<meta property="og:image" content="${HERO_IMAGE}"/>`,
    `<meta name="twitter:card" content="summary_large_image"/>`,
    `<meta name="twitter:title" content="${title}"/>`,
    `<meta name="twitter:description" content="${description}"/>`,
    `<meta name="twitter:image" content="${HERO_IMAGE}"/>`,
    `<script type="application/ld+json" data-koinonia-seo-jsonld="true">${jsonLd}</script>`,
  ].join("");
};

// Indexable routes outside /catering, with the source that drives lastmod.
const staticRoutes = [
  { path: "/", source: "src/pages/homepage" },
  { path: "/about", source: "src/pages/about" },
  { path: "/shop", source: "src/pages/shop" },
  { path: "/menu", source: "src/pages/menu" },
  { path: "/gallery", source: "public/assets/images/gallery" },
  { path: "/calendar", source: "src/pages/calendar" },
  { path: "/church-partnership", source: "src/pages/church-partnership" },
  { path: "/contact", source: "src/pages/contact" },
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
  const data = loadCateringPages();
  const pages = [data.hubPage, ...data.cateringPages];

  for (const page of pages) {
    const html = template
      .replace(managedTags, "")
      .replace("</head>", `${renderHead(page, data)}</head>`);
    const outFile = path.join(buildDir, `${page.path.replace(/^\//, "")}.html`);
    fs.mkdirSync(path.dirname(outFile), { recursive: true });
    fs.writeFileSync(outFile, html);
  }

  const urlCount = writeSitemap(
    data.SITE_URL,
    pages.map((page) => page.path),
  );

  console.log(
    `Prerendered SEO head tags for ${pages.length} catering pages; wrote sitemap with ${urlCount} URLs.`,
  );
};

main();
