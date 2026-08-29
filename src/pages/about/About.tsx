import React from 'react';
import './About.css';
import SEO from '../../components/SEO';

interface AboutProps { availableHeight: number; }

const About: React.FC<AboutProps> = () => {
    return (
        <div className="about-page">
            <SEO title="About Koinonia Coffee Project" description="Learn how Koinonia Coffee Project uses specialty coffee to create spaces for meaningful connection." path="/about" />
            <section className="about-hero">
                <div className="about-hero-copy"><span className="about-eyebrow">OUR STORY</span><h1>Rooted in fellowship,<br />brewed with intention.</h1><p>Some of the best conversations happen over a good cup of coffee. We’re here to make sure that keeps happening.</p></div>
                <div className="about-hero-image"><img src="/assets/images/DSCF3464.jpg" alt="The Koinonia coffee cart ready to serve" /></div><span className="about-image-caption">PEOPLE / PLACE / PURPOSE</span>
            </section>
            <section className="about-story about-story-intro"><div className="about-story-image"><div className="about-image-placeholder"><span>IMAGE PLACEHOLDER</span></div></div><div className="about-story-copy"><span className="about-index">01</span><span className="about-eyebrow">HOW IT STARTED</span><p>Koinonia Coffee Project started in the fall of 2025 with a simple question: what if we could create more moments for people to sit down, slow down, and actually connect?</p><p>Founded by Thomas Chin, Koinonia was born out of a long-held dream of working in coffee—not just for the craft, but for the conversations that happen around it.</p><p>No industry background. No business playbook. Just a genuine love for inviting people to the table.</p></div></section>
            <section className="about-project"><div className="about-project-image"><img src="/assets/images/DSC_0532.jpeg" alt="Friends serving coffee together at the Koinonia cart" /></div><div className="about-project-copy"><span className="about-index">02</span><span className="about-eyebrow">WHY “PROJECT”?</span><p>We call it a project because that’s exactly what it is: an ongoing experiment in bringing people together.</p><p>Pop-ups, events, collaborations, and a bag of beans on your doorstep—if it creates space for people to gather, we want to try it.</p><p>Specialty coffee should never feel exclusive. The goal is for anyone to sit down, take a sip, and experience something worth noticing.</p></div></section>
            <section className="about-values"><div className="about-values-header"><div><span className="about-eyebrow">WHAT GUIDES US</span><h2>Our values</h2></div></div><div className="about-values-grid"><article className="about-value-card"><span>01 / KOINONIA</span><h3>Community first.</h3><p>We believe coffee is the journey and community is the destination. Our aim in our decisions and actions is to support and foster meaningful connections and relationships. </p></article><article className="about-value-card"><span>02 / COFFEE</span><h3>Excellency in our craft.</h3><p>We believe coffee is more than just a cup of caffeine. We strive for excellency in our craft and aim to humbly share our joy with others.</p></article><article className="about-value-card"><span>03 / PROJECT</span><h3>Always be curious.</h3><p>We aim to explore and find unique ways through coffee to support community and fellowship beyond the norm.</p></article></div></section>
            <section className="about-future"><div className="about-future-image"><img src="/assets/images/DSC_0393.jpeg" alt="A latte prepared with care" /></div><div className="about-future-copy"><span className="about-eyebrow">WHERE WE’RE GOING</span><h2>Just getting<br />started.</h2><p>We’re focused on roasting great coffee, popping up in new places, and partnering with people and organizations who share a heart for community.</p><p>We don’t have it all figured out, and we’re okay with that. Follow along for the journey.</p></div></section>
            <section className="about-cta"><h2>Come say hello.</h2><p>Follow along on the journey, find the cart, or get in touch about bringing Koinonia to your next event.</p><a href="/contact">GET IN TOUCH</a><p className="about-cta-verse">&quot;And let us consider how to stir up one another to love and good works, not neglecting to meet together, as is the habit of some, but encouraging one another, and all the more as you see the Day drawing near.&quot; — Hebrews 10:24-25</p></section>
        </div >
    );
};

export default About;
