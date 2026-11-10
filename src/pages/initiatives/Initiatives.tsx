import React from "react";
import { Link } from "react-router-dom";
import "./Initiatives.css";
import SEO from "../../components/SEO";
import { Eyebrow } from "../../components/ui/Typography";
import Button from "../../components/ui/Button";
import {
  HERO_IMAGE,
  Initiative,
  buildStructuredData,
  initiatives,
  initiativesPage,
} from "./initiativesData";

const InitiativeLink: React.FC<{ link: NonNullable<Initiative["link"]> }> = ({
  link,
}) =>
  link.href.startsWith("/") ? (
    <Button as={Link} variant="text" to={link.href}>
      {link.label}
    </Button>
  ) : (
    <Button
      as="a"
      variant="text"
      href={link.href}
      target="_blank"
      rel="noopener noreferrer"
    >
      {link.label}
    </Button>
  );

const Initiatives: React.FC = () => {
  const structuredData = React.useMemo(buildStructuredData, []);

  return (
    <main className="initiatives-page">
      <SEO
        title={initiativesPage.seoTitle}
        description={initiativesPage.description}
        path={initiativesPage.path}
        image={HERO_IMAGE}
        structuredData={structuredData}
      />

      <section className="initiatives-hero">
        <div className="initiatives-hero-title">
          <Eyebrow>OUR INITIATIVES</Eyebrow>
          <h1>Community, beyond the cup.</h1>
        </div>
        <div className="initiatives-hero-copy">
          <p>
            When you look at most coffee shops, coffee is often associated with
            community. But what does that truly mean, and how does it actually
            play out? Is it simply just a “third space” for people to hang out,
            or can there be more avenues beyond the space itself?
          </p>
          <p>
            At Koinonia, we believe that community is the destination and coffee
            is the road to get there. Part of the fun of why we do what we do is
            to explore new avenues to bring people together.
          </p>
          <p>Take a look at some of the ways we love to give back.</p>
        </div>
      </section>

      <section
        className="initiatives-list"
        aria-labelledby="initiatives-list-title"
      >
        {initiatives.map((initiative, index) => (
          <article
            className={`initiative-row${index % 2 === 1 ? " initiative-row--reverse" : ""}`}
            id={initiative.slug}
            key={initiative.slug}
            aria-labelledby={`${initiative.slug}-title`}
          >
            <div className="initiative-image">
              <img
                src={initiative.image.src}
                alt={initiative.image.alt}
                loading={index === 0 ? "eager" : "lazy"}
                decoding="async"
              />
            </div>
            <div className="initiative-copy">
              <Eyebrow>{`${String(index + 1).padStart(2, "0")} / ${initiative.eyebrow}`}</Eyebrow>
              <h3 id={`${initiative.slug}-title`}>{initiative.title}</h3>
              <p>{initiative.summary}</p>
              {initiative.link && <InitiativeLink link={initiative.link} />}
            </div>
          </article>
        ))}
      </section>
    </main>
  );
};

export default Initiatives;
