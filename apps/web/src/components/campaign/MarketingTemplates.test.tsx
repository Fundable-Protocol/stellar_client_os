import React from 'react';
import { render, screen } from '@testing-library/react';
import { MarketingTemplates } from './MarketingTemplates';

describe('MarketingTemplates', () => {
  it('renders the toolkit heading', () => {
    render(<MarketingTemplates />);
    expect(screen.getByText('Campaign Creator Toolkit: Marketing Templates')).toBeInTheDocument();
  });

  it('renders email templates section', () => {
    render(<MarketingTemplates />);
    expect(screen.getByText('Email Templates')).toBeInTheDocument();
  });

  it('renders social media graphics section', () => {
    render(<MarketingTemplates />);
    expect(screen.getByText('Social Media Graphics')).toBeInTheDocument();
  });

  it('renders fundraising pitch decks section', () => {
    render(<MarketingTemplates />);
    expect(screen.getByText('Fundraising Pitch Decks')).toBeInTheDocument();
  });
});
