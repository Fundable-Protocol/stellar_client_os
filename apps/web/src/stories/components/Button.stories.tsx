import React from 'react';
import type { Meta, StoryObj } from '@storybook/react';
import { Button } from '../../components/ui/button';

const meta: Meta<typeof Button> = {
    title: 'Components/Button',
    component: Button,
};

export default meta;

type Story = StoryObj<typeof Button>;

export const Default: Story = {
    render: (args) => <Button {...args}>Click me</Button>,
};

export const Primary: Story = {
    render: (args) => <Button {...args} variant="gradient">Primary</Button>,
};

export const Outline: Story = {
    render: (args) => <Button {...args} variant="outline">Outline</Button>,
};
