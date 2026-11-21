import React from "react";
import { useSearchParams } from "react-router-dom";
import "./Partners.css";
import SEO from "../../components/SEO";
import { Eyebrow } from "../../components/ui/Typography";
import Button from "../../components/ui/Button";
import {
  PARTNER_CATEGORIES,
  PartnerCategory,
  isPartnerCategory,
  partners,
  partnersPage,
} from "./partnersData";

// Filter and search live in the URL (?type=coffee-exporter&q=honduras) so
// other pages can link straight to a filtered view and the back button works.
const TYPE_PARAM = "type";
const QUERY_PARAM = "q";

const CATEGORY_KEYS = Object.keys(PARTNER_CATEGORIES) as PartnerCategory[];

const normalize = (value: string): string =>
  value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");

const Partners: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const typeParam = searchParams.get(TYPE_PARAM);
  const activeType = isPartnerCategory(typeParam) ? typeParam : null;
  const query = searchParams.get(QUERY_PARAM) ?? "";

  const updateParams = (key: string, value: string | null) => {
    const next = new URLSearchParams(searchParams);
    if (value) next.set(key, value);
    else next.delete(key);
    // Typing shouldn't stack a history entry per keystroke.
    setSearchParams(next, { replace: key === QUERY_PARAM });
  };

  const visiblePartners = React.useMemo(() => {
    const terms = normalize(query).split(/\s+/).filter(Boolean);
    return partners.filter((partner) => {
      if (activeType && partner.category !== activeType) return false;
      if (terms.length === 0) return true;
      const haystack = normalize(
        [
          partner.name,
          partner.blurb,
          PARTNER_CATEGORIES[partner.category].label,
        ].join(" "),
      );
      return terms.every((term) => haystack.includes(term));
    });
  }, [activeType, query]);

  const filters: { key: PartnerCategory | null; label: string }[] = [
    { key: null, label: "All" },
    ...CATEGORY_KEYS.map((key) => ({
      key,
      label: PARTNER_CATEGORIES[key].plural,
    })),
  ];

  return (
    <main className="partners-page">
      <SEO
        title={partnersPage.seoTitle}
        description={partnersPage.description}
        path={partnersPage.path}
      />

      <section className="partners-hero">
        <div className="partners-hero-title">
          <Eyebrow>OUR PARTNERS</Eyebrow>
          <h1>The people at our table.</h1>
        </div>
        <div className="partners-hero-copy">
          <p>
            Every cup we pour passes through a lot of hands. Here are the
            non-profits we give back to and the coffee exporters who connect
            us with the farms our coffee comes from.
          </p>
        </div>
      </section>

      <section className="partners-list" aria-label="Partners">
        <div className="partners-controls">
          <div
            className="partners-filters"
            role="group"
            aria-label="Filter by partner type"
          >
            {filters.map(({ key, label }) => (
              <button
                key={label}
                type="button"
                className="partners-filter"
                aria-pressed={activeType === key}
                onClick={() => updateParams(TYPE_PARAM, key)}
              >
                {label}
              </button>
            ))}
          </div>
          <label className="partners-search">
            <input
              type="search"
              aria-label="Search partners"
              placeholder="Search partners"
              value={query}
              onChange={(event) => updateParams(QUERY_PARAM, event.target.value)}
            />
          </label>
        </div>

        <p className="partners-count" aria-live="polite">
          {visiblePartners.length === 1
            ? "1 partner"
            : `${visiblePartners.length} partners`}
        </p>

        {visiblePartners.length === 0 ? (
          <div className="partners-empty">
            <p>
              {query
                ? `No partners match “${query}”.`
                : activeType
                  ? `We'll add our ${PARTNER_CATEGORIES[activeType].plural.toLowerCase()} here soon.`
                  : "We'll add our partners here soon."}
            </p>
            {(query || activeType) && (
              <Button
                variant="text"
                onClick={() => setSearchParams(new URLSearchParams())}
              >
                SHOW ALL PARTNERS
              </Button>
            )}
          </div>
        ) : (
          <ul className="partners-rows">
            {visiblePartners.map((partner) => (
              <li
                className="partner-row"
                id={partner.slug}
                key={partner.slug}
              >
                <div
                  className={`partner-image partner-image--${partner.image.fit ?? "cover"}`}
                >
                  <img
                    src={partner.image.src}
                    alt={partner.image.alt}
                    loading="lazy"
                    decoding="async"
                  />
                </div>
                <div className="partner-copy">
                  <Eyebrow>{PARTNER_CATEGORIES[partner.category].label}</Eyebrow>
                  <h2>{partner.name}</h2>
                  <p>{partner.blurb}</p>
                  {partner.website && (
                    <Button
                      as="a"
                      variant="text"
                      href={partner.website}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      VISIT WEBSITE
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
};

export default Partners;
