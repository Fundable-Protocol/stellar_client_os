import React from 'react';

export const MarketingTemplates: React.FC = () => {
  return (
    <div className="marketing-templates">
      <h2>Campaign Creator Toolkit: Marketing Templates</h2>
      
      <section className="template-section">
        <h3>Email Templates</h3>
        <p>Use these email templates to reach out to potential donors and supporters.</p>
        <ul>
          <li><a href="/templates/email-launch.txt" download>Campaign Launch Email</a></li>
          <li><a href="/templates/email-update.txt" download>Mid-Campaign Update</a></li>
          <li><a href="/templates/email-thankyou.txt" download>Thank You Email</a></li>
        </ul>
      </section>

      <section className="template-section">
        <h3>Social Media Graphics</h3>
        <p>Eye-catching graphics optimized for Twitter, Instagram, and Facebook.</p>
        <ul>
          <li><a href="/templates/social-twitter.zip" download>Twitter Graphics Pack</a></li>
          <li><a href="/templates/social-instagram.zip" download>Instagram Story Templates</a></li>
          <li><a href="/templates/social-facebook.zip" download>Facebook Banner Templates</a></li>
        </ul>
      </section>

      <section className="template-section">
        <h3>Fundraising Pitch Decks</h3>
        <p>Professional presentation templates to pitch major donors or institutional investors.</p>
        <ul>
          <li><a href="/templates/pitch-deck-standard.pptx" download>Standard Pitch Deck (PPTX)</a></li>
          <li><a href="/templates/pitch-deck-short.pdf" download>One-Pager Summary (PDF)</a></li>
        </ul>
      </section>
    </div>
  );
};
