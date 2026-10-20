import React from "react";
import "./About.css";
import SEO from "../../components/SEO";
import { ICONS } from "../../util/constants";

interface AboutProps {
  availableHeight: number;
}

const About: React.FC<AboutProps> = () => {
  return (
    <div className="about-page">
      <SEO
        title="About Koinonia Coffee Project"
        description="Learn how Koinonia Coffee Project uses specialty coffee to create spaces for meaningful connection."
        path="/about"
      />
      <section className="about-hero">
        <div className="about-hero-image">
          <img
            src="/assets/images/koinonia-49.jpg"
            alt="Koinonia baristas pouring drinks at the espresso machine"
          />
        </div>
        <div className="about-hero-copy">
          <span className="about-eyebrow">OUR STORY</span>
          <h1>Why Koinonia Coffee Project?</h1>
          <p>
            Some of the best conversations happen over a good cup of coffee.
            We’re here to make sure that keeps happening.
          </p>
        </div>
      </section>
      <section className="about-story about-story-intro">
        <figure className="about-story-image">
          <img
            src="/assets/images/IMG_5011.jpg"
            alt="Koinonia Coffee Project"
          />
          <figcaption className="about-image-caption">
            2/27/26 - KOINONIA'S DEBUT!
          </figcaption>
        </figure>
        <div className="about-story-copy">
          <span className="about-eyebrow">HOW IT STARTED</span>
          <h2>"Sooo ... why not just do it?"</h2>
          <p>
            Koinonia Coffee Project started in the fall of 2025 with a simple
            question: "So why not just do it?"
          </p>
          <p>
            Founded by Thomas Chin, Koinonia was born out of a long-held dream
            of working in coffee. Not just for the craft, but for the
            conversations that happen around it. Coming from an unconventional
            background in software engineering, Thomas had no experience in the
            coffee industry, but through several pop-ups and opportunities to
            serve coffee at church events, the seed was planted.
          </p>
          <p>"Hm...why not?"</p>
          <p>
            The simple question grew into thoughts of a business, and the
            business grew into a project. Within a month, a cart was born.
            Koinonia Coffee Project has had the privilege of being able to live
            out that dream since, and we're excited for what's in store next.
          </p>
        </div>
      </section>
      <section className="about-values">
        <div className="about-values-header">
          <div>
            <span className="about-eyebrow">OUR PILLARS</span>
            <h2>Our values</h2>
          </div>
        </div>
        <div className="about-values-grid">
          <article className="about-value-card">
            <span>01 / KOINONIA</span>
            <h3>Fellowship first.</h3>
            <p>
              We believe coffee is the journey and community is the destination.
              Our aim in our decisions and actions is to support and foster
              meaningful connections and relationships.
            </p>
          </article>
          <article className="about-value-card">
            <span>02 / COFFEE</span>
            <h3>For the love of the craft.</h3>
            <p>
              We strive to bring the best coffee experience to our guests, from
              our hand-crafted drinks to our speciality coffee beans.
            </p>
          </article>
          <article className="about-value-card">
            <span>03 / PROJECT</span>
            <h3>Always be curious.</h3>
            <p>
              We aim to explore and find unique ways through coffee to support
              community and fellowship beyond the norm.
            </p>
          </article>
        </div>
      </section>
      <section className="about-pillar about-pillar--koinonia">
        <div className="about-pillar-image">
          <img
            src="/assets/images/koinonia-84.jpg"
            alt="Guests holding Koinonia iced lattes while talking together"
          />
        </div>
        <div className="about-pillar-copy">
          <span className="about-eyebrow">01 / KOINONIA</span>
          <h2>Why Koinonia?</h2>
          <p>
            Koinonia (κοινωνία) is a Greek word for communion and fellowship: a
            life shared with one another. Based on Hebrews 10, our relationships
            with one another are one of the best and most important things in
            life.
          </p>
          <p>
            That’s the heart behind everything. "Koinonia" is the perfect word
            that embodies our ventures; why we've done what we've done, why we
            do what we do, and why we will continue to do what we do.
          </p>
        </div>
      </section>
      <section className="about-pillar about-pillar--coffee about-pillar--reverse">
        <div className="about-pillar-image">
          <img
            src="/assets/images/DSC_0393.jpeg"
            alt="A latte with latte art"
          />
        </div>
        <div className="about-pillar-copy">
          <span className="about-eyebrow">02 / COFFEE</span>
          <h2>Why Coffee?</h2>
          <p>
            We believe coffee is more than just a cup of caffeine. Whether it's
            a slow morning pour-over ritual or a café run with our friends,
            we've been the benefactors of the joy and care that comes with
            specialty coffee.
          </p>
          <p>
            No "snobbery" allowed here. Our goal is to make specialty coffee
            approachable and accessible to everyone, meeting people where
            they're at, and to create a space where people can enjoy it
            together. We love hearing about our customers' coffee adventures and
            love to be part of it!
          </p>
          <p></p>
        </div>
      </section>
      <section className="about-pillar about-pillar--project">
        <div className="about-pillar-image">
          <img
            src="/assets/images/DSC_0532.jpeg"
            alt="Friends serving coffee together at the Koinonia cart"
          />
        </div>
        <div className="about-pillar-copy">
          <span className="about-eyebrow">03 / PROJECT</span>
          <h2>Why Project?</h2>
          <p>
            We call it a project because that’s exactly what it is: an ongoing
            experiment in bringing people together.
          </p>
          <p>
            It is how we innovate and grow. We're always looking for new avenues
            of coffee to explore, new ways to serve our community, and new
            opportunities to create spaces for meaningful connection.
          </p>
          <p>
            We believe that there's always more to learn, always more to
            explore, and always more to love others through coffee. We hope
            you'll join us on the journey.
          </p>
        </div>
      </section>
      <section className="about-future">
        <div className="about-future-copy">
          <span className="about-eyebrow">WHERE WE’RE GOING</span>
          <h2>So what's next?</h2>
          <p>To be honest, we don't know!</p>
          <p>
            We've got big plans and big dreams and we're ready to chase them
            head on. The journey has been a blast and we're excited to serve you
            in the many opportunities to come. Join us along our journey, we're
            excited to have you :)
          </p>
          <span
            className="about-future-mark"
            aria-hidden="true"
            style={
              {
                "--about-mark": `url(${ICONS.logoMark})`,
              } as React.CSSProperties
            }
          />
        </div>
      </section>
      <section className="about-cta">
        <h2>Come say hello.</h2>
        <p>We'd love to chat! Click the button below to send us a message.</p>
        <a href="/contact">GET IN TOUCH</a>
        <p className="about-cta-verse">
          &quot;And let us consider how to stir up one another to love and good
          works, not neglecting to meet together, as is the habit of some, but
          encouraging one another, and all the more as you see the Day drawing
          near.&quot; — Hebrews 10:24-25
        </p>
      </section>
    </div>
  );
};

export default About;
