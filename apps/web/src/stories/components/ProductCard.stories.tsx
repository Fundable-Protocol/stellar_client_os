import React from 'react';
import type { Meta } from '@storybook/react';
import FeatureCard from '../../components/modules/dashboard/FeatureCard';

const meta: Meta = {
    title: 'Components/ProductCard',
    component: FeatureCard as any,
};

export default meta;

export const Default = () => (
    <div style={{ width: 360 }}>
        <FeatureCard
            title="Awesome Product"
            linkText="View Details"
            description="A short description of the product highlighting its main benefits and features."
            link="#"
        />
    </div>
);
