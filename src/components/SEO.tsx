import { useEffect } from "react";

export const SITE_URL = "https://koinoniacoffeeproject.com";

interface SEOProps {
  title: string;
  description: string;
  path?: string;
  image?: string;
  noIndex?: boolean;
  structuredData?: Record<string, unknown> | Record<string, unknown>[];
}

const upsertMeta = (
  attribute: "name" | "property",
  key: string,
  content: string,
): void => {
  let element = document.head.querySelector<HTMLMetaElement>(
    `meta[${attribute}="${key}"]`,
  );
  if (!element) {
    element = document.createElement("meta");
    element.setAttribute(attribute, key);
    document.head.appendChild(element);
  }
  element.content = content;
};

const upsertLink = (rel: string, href: string): void => {
  let element = document.head.querySelector<HTMLLinkElement>(
    `link[rel="${rel}"]`,
  );
  if (!element) {
    element = document.createElement("link");
    element.rel = rel;
    document.head.appendChild(element);
  }
  element.href = href;
};

export const SEO: React.FC<SEOProps> = ({
  title,
  description,
  path = "/",
  // Without an image, link previews (e.g. iMessage) fall back to the small site icon.
  image,
  noIndex = false,
  structuredData,
}) => {
  useEffect(() => {
    const canonicalUrl = `${SITE_URL}${path === "/" ? "/" : path.replace(/\/$/, "")}`;
    document.title = title;
    upsertMeta("name", "description", description);
    upsertMeta(
      "name",
      "robots",
      noIndex ? "noindex, nofollow" : "index, follow",
    );
    upsertMeta("property", "og:title", title);
    upsertMeta("property", "og:description", description);
    upsertMeta("property", "og:type", "website");
    upsertMeta("property", "og:url", canonicalUrl);
    upsertMeta("name", "twitter:card", image ? "summary_large_image" : "summary");
    upsertMeta("name", "twitter:title", title);
    upsertMeta("name", "twitter:description", description);
    if (image) {
      upsertMeta("property", "og:image", image);
      upsertMeta("name", "twitter:image", image);
    } else {
      document.head.querySelector('meta[property="og:image"]')?.remove();
      document.head.querySelector('meta[name="twitter:image"]')?.remove();
    }
    if (noIndex) {
      document.head.querySelector('link[rel="canonical"]')?.remove();
    } else {
      upsertLink("canonical", canonicalUrl);
    }

    document.head.querySelector("script[data-koinonia-seo-jsonld]")?.remove();
    if (structuredData) {
      const jsonLd = document.createElement("script");
      jsonLd.type = "application/ld+json";
      jsonLd.dataset.koinoniaSeoJsonld = "true";
      jsonLd.textContent = JSON.stringify(structuredData);
      document.head.appendChild(jsonLd);
    }
  }, [description, image, noIndex, path, structuredData, title]);

  return null;
};

export default SEO;
