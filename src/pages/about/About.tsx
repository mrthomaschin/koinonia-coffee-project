import React, { useState, useEffect } from 'react';
import './About.css';

interface AboutProps {
    availableHeight: number;
}

const About: React.FC<AboutProps> = ({ availableHeight }) => {
    const [screenWidth, setScreenWidth] = useState<number>(window.innerWidth);

    useEffect(() => {
        const handleResize = (): void => setScreenWidth(window.innerWidth);
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    const isMobile: boolean = screenWidth < 768;

    return (
        <div className="about-page">
            {/* Hero Section */}
            <div
                className="about-hero"
                style={{ height: isMobile ? availableHeight * 0.6 : availableHeight * 0.75 }}
            >
                <div className="about-hero-overlay" />
                <div className="about-hero-content">
                    <span className="about-hero-label">OUR STORY</span>
                    <h1 className="about-hero-title">
                        Rooted in fellowship,
                        <br />
                        brewed with intention.
                    </h1>
                </div>
            </div>

            {/* Intro Quote Section */}
            <div className="about-intro">
                <div className="about-intro-inner">
                    <p className="about-intro-quote">
                        Some of the best conversations happen over a good cup of coffee. We're here to make sure that keeps happening.
                    </p>
                </div>
            </div>

            {/* Story Section 1: Image Left, Text Right */}
            <div className={`about-story-block ${isMobile ? 'about-story-mobile' : ''}`}>
                <div className="about-story-image">
                    <div className="about-image-placeholder">
                        <span className="about-placeholder-text">Image Placeholder</span>
                    </div>
                </div>
                <div className="about-story-text">
                    <h2 className="about-section-heading">How It Started</h2>
                    <p className="about-body-text">
                        Koinonia Coffee Project started with a simple idea in the fall of 2025: what if we could create more moments for people to sit down, slow down, and actually connect? In just a few months, that idea became real. Founded by Thomas Chin, Koinonia was born out of a long-held dream of working in coffee. Not just for the craft, but for the conversations that happen around it.
                    </p>
                    <p className="about-body-text">
                        No industry background. No business playbook. Just a genuine love for inviting people to the table and the belief that something good happens when you hand someone a well-made cup of coffee. Every opportunity to serve has been a gift, and honestly, we're just getting started.
                    </p>
                </div>
            </div>

            {/* Story Section 2: Text Left, Image Right */}
            <div className={`about-story-block about-story-reverse ${isMobile ? 'about-story-mobile' : ''}`}>
                <div className="about-story-image">
                    <div className="about-image-placeholder">
                        <span className="about-placeholder-text">Image Placeholder</span>
                    </div>
                </div>
                <div className="about-story-text">
                    <h2 className="about-section-heading">Why "Project"?</h2>
                    <p className="about-body-text">
                        We call it a project because that's exactly what it is: an ongoing experiment in bringing people together. Coffee is the vehicle, but fellowship is the destination. We're not locked into one way of doing things. Pop-ups, events, collaborations, a bag of beans on your doorstep — if it creates space for people to gather, we want to try it.
                    </p>
                    <p className="about-body-text">
                        We also take our craft seriously. From roasting our own beans to dialing in every drink, we're always chasing the best cup we can make. We believe specialty coffee shouldn't feel exclusive or "snobby", we want to make it approachable. The goal is for anyone to sit down, take a sip, and experience something worth noticing. The bright notes, the layered flavors, the care behind it all. Coffee is so much more than caffeine, and we want people to taste that difference.
                    </p>
                    <p className="about-body-text">
                        At the end of the day, the coffee is in service of something bigger. We believe the best things happen when people are together, and we want to be part of making that happen more often.
                    </p>
                </div>
            </div>

            {/* Values Section */}
            <div className="about-values">
                <h2 className="about-values-title">Our Values</h2>
                <div className={`about-values-grid ${isMobile ? 'about-values-mobile' : ''}`}>
                    <div className="about-value-card">
                        <h3 className="about-value-heading">Community</h3>
                        <p className="about-value-text">
                            Coffee is better together. We pop up in neighborhoods, partner with local businesses, and create spaces where strangers become friends and friends become family.
                        </p>
                    </div>
                    <div className="about-value-card">
                        <h3 className="about-value-heading">Craft</h3>
                        <p className="about-value-text">
                            From the roast to the pour, every detail matters. We're always refining our process to make sure every cup is worth your time.
                        </p>
                    </div>
                    <div className="about-value-card">
                        <h3 className="about-value-heading">Care</h3>
                        <p className="about-value-text">
                            Ten percent of all profits go directly to non-profits and community organizations. Good coffee should do some good beyond the cup.
                        </p>
                    </div>
                </div>
            </div>

            {/* Full-Width Image Break */}
            <div className="about-fullwidth-image">
                <div className="about-image-placeholder about-image-placeholder-wide">
                    <span className="about-placeholder-text">Full-Width Image Placeholder</span>
                </div>
            </div>

            {/* Story Section 3: Image Left, Text Right */}
            <div className={`about-story-block ${isMobile ? 'about-story-mobile' : ''}`}>
                <div className="about-story-image">
                    <div className="about-image-placeholder">
                        <span className="about-placeholder-text">Image Placeholder</span>
                    </div>
                </div>
                <div className="about-story-text">
                    <h2 className="about-section-heading">Where We're Going</h2>
                    <p className="about-body-text">
                        We don't have it all figured out, and we're okay with that. Right now, we're focused on showing up well wherever we are: roasting great coffee, popping up in new places, and partnering with people and organizations who share a heart for community.
                    </p>
                    <p className="about-body-text">
                        What comes next? We'll see. We're just as excited for things to come as we are about the journey we're on now. Follow along with us for the journey.
                    </p>
                </div>
            </div>

            {/* Closing CTA Section */}
            <div className="about-cta">
                <h2 className="about-cta-title">Come Say Hello</h2>
                <p className="about-cta-text">
                    We'd love to hear from you — whether you want to collaborate, book us for an event, or just say what's up.
                </p>
                <a href="/contact" className="about-cta-button">GET IN TOUCH</a>
                <p className="about-cta-verse">
                    "And let us consider how to stir up one another to love and good works, not neglecting to meet together, as is the habit of some, but encouraging one another, and all the more as you see the Day drawing near." — Hebrews 10:24-25
                </p>
            </div>
        </div>
    );
};

export default About;