import React, { useMemo } from "react";
import { Link } from "react-router-dom";
import "./Homepage.css";
import SEO from "../../components/SEO";
import { Eyebrow } from "../../components/ui/Typography";
import Button from "../../components/ui/Button";
import { useInventory } from "../../contexts/InventoryContext";
import {
  Item,
  ItemType,
  getThumbnailUrl,
  isConsumerVisible,
} from "../shop/item/ItemModel";
import { CoffeeBagItem } from "../shop/item/coffee_bag/CoffeeBagItem";
import { generateSlug } from "../shop/shopData";

// Products featured on the homepage, in display order (Notion SKUs).
const FEATURED_SKUS = ["B-KOIN", "B-ETH-W", "M-SIGTEE", "M-STCK-PCK"];

const ITEM_TYPE_LABELS: Record<ItemType, string> = {
  [ItemType.accessories]: "Accessories",
  [ItemType.apparel]: "Apparel",
  [ItemType.brewTools]: "Brew tools",
  [ItemType.coffee]: "Coffee",
  [ItemType.drinkware]: "Drinkware",
  [ItemType.stickers]: "Stickers",
};

const featuredDetails = (item: Item): string =>
  item.itemType === ItemType.coffee
    ? ((item as CoffeeBagItem).tastingNotes || []).join(" · ")
    : ITEM_TYPE_LABELS[item.itemType];

interface HomepageProps {
  availableHeight: number;
}

const Homepage: React.FC<HomepageProps> = ({
  availableHeight: _availableHeight,
}) => {
  const { items } = useInventory();
  const featuredItems = useMemo(
    () =>
      FEATURED_SKUS.map((sku) => items.find((item) => item.sku === sku)).filter(
        (item): item is Item => !!item && isConsumerVisible(item),
      ),
    [items],
  );

  const scrollToContent = () => {
    const target = document.getElementById("homepage-content");
    if (!target) return;
    const barBottom =
      document.querySelector(".app-bar")?.getBoundingClientRect().bottom ?? 0;
    window.scrollTo({
      top: target.getBoundingClientRect().top + window.scrollY - barBottom,
      behavior: "smooth",
    });
  };

  return (
    <main className="homepage">
      <SEO
        title="Koinonia Coffee Project | Specialty Coffee & Coffee Cart Catering in LA"
        description="Specialty coffee roasted for community, plus mobile coffee cart catering for weddings and events across Los Angeles, Orange County, and the Inland Empire."
        path="/"
        structuredData={{
          "@context": "https://schema.org",
          "@type": "Organization",
          name: "Koinonia Coffee Project",
          url: "https://koinoniacoffeeproject.com/",
          logo: "https://koinoniacoffeeproject.com/assets/logos/logo_square.png",
          sameAs: ["https://www.instagram.com/koinoniacoffeeproject"],
        }}
      />
      <section className="homepage-hero">
        <video
          className="homepage-hero-video"
          autoPlay
          muted
          loop
          playsInline
          preload="metadata"
          aria-hidden="true"
        >
          <source src="/assets/images/Banner.mp4" type="video/mp4" />
        </video>
        <div className="homepage-hero-overlay" />
        <div className="homepage-hero-copy">
          <img
            className="homepage-hero-logo"
            src="/assets/logos/koinoniacp_logomark-black.svg"
            alt="Koinonia Coffee Project"
          />
          <h1>
            <span className="hero-nowrap">Cultivating community,</span> <br />
            one cup at a time.
          </h1>
          <Button onClick={scrollToContent}>EXPLORE KOINONIA</Button>
        </div>
      </section>

      <section className="homepage-about" id="homepage-content">
        <div className="about-art">
          <img
            src="/assets/images/koinonia-49-1.png"
            alt="Koinonia coffee and community"
          />
        </div>
        <div className="about-copy">
          <div className="word-note">
            <strong className="word-note-term">κοινωνία</strong>
            <span className="word-note-details">[koy-nohn-ee'-ah]</span>
            <strong className="word-note-definition">
              <em>(n.) communion, fellowship</em>
            </strong>
          </div>
          <p className="mission-copy">
            Koinonia Coffee Project exists to promote and cultivate the joys of
            community through the love of good coffee.
          </p>
          <Button as={Link} to="/about" variant="text">
            LEARN MORE ABOUT KOINONIA
          </Button>
        </div>
      </section>

      <section className="homepage-pillars">
        <article className="pillar">
          <Eyebrow>01 / CATERING</Eyebrow>
          <h2>Plan your next event with Koinonia.</h2>
          <p>
            Bring our mobile coffee cart and friendly baristas to your next
            gathering.
          </p>
          <Button as={Link} to="/catering" variant="text">
            BOOK NOW
          </Button>
        </article>
        <article className="pillar">
          <Eyebrow>02 / COFFEE</Eyebrow>
          <h2>Bring tasty coffee back home.</h2>
          <p>
            Specialty coffee, roasted fresh with the love of the craft. Click on
            the button below to view our current offerings.
          </p>
          <Button as={Link} to="/shop" variant="text">
            SHOP COFFEE
          </Button>
        </article>
        <article className="pillar">
          <Eyebrow>03 / CALENDAR</Eyebrow>
          <h2>Find us at our next gathering.</h2>
          <p>View our calendar for upcoming events and announcements.</p>
          <Button as={Link} to="/calendar" variant="text">
            SEE THE CALENDAR
          </Button>
        </article>
      </section>

      {featuredItems.length > 0 && (
        <section className="homepage-featured">
          <div className="featured-intro">
            <div>
              <Eyebrow>SHOP</Eyebrow>
              <h2>Featured items</h2>
            </div>
            <Button as={Link} to="/shop" variant="text">
              SHOP ALL
            </Button>
          </div>
          <div className="featured-grid">
            {featuredItems.map((item) => (
              <Link
                key={item.sku}
                to={`/shop/${generateSlug(item.name)}`}
                className="featured-card"
              >
                <span className="featured-card-image">
                  <img
                    src={getThumbnailUrl(item)}
                    alt={item.name}
                    loading="lazy"
                  />
                  {item.itemType === ItemType.coffee && (
                    <span className="featured-card-tag">
                      Subscribe and save!
                    </span>
                  )}
                </span>
                <span className="featured-card-copy">
                  <strong>{item.name}</strong>
                  {featuredDetails(item) && (
                    <small>{featuredDetails(item)}</small>
                  )}
                  <span className="featured-card-price">
                    ${item.price.toFixed(2)}
                  </span>
                </span>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* <section className="homepage-catering">
        <div className="catering-intro"><p className="eyebrow">COME SAY HELLO</p><h2>Meet us around<br />town.</h2><p>Find the cart at our next pop-up, market, or community gathering.</p></div>
        <div className="catering-list"><div className="catering-row"><span>SEP 14</span><strong>Sunday Market</strong><span>TORONTO, CA</span></div><div className="catering-row"><span>SEP 21</span><strong>Community Coffee</strong><span>TORONTO, CA</span></div><div className="catering-row"><span>OCT 04</span><strong>Fall Gathering</strong><span>TORONTO, CA</span></div><Link to="/catering" className="text-link">VIEW CATERING</Link></div>
      </section> */}
    </main>
  );
};

export default Homepage;
