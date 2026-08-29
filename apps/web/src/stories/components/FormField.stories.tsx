import React from 'react';
import type { Meta, StoryObj } from '@storybook/react';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Button } from '../../components/ui/button';

const meta: Meta = {
    title: 'Components/FormField',
};

export default meta;

export const Default = () => (
    <div className="space-y-3 w-80">
        <div className="space-y-1">
            <Label>Full name</Label>
            <Input placeholder="Jane Doe" />
        </div>
        <div className="space-y-1">
            <Label>Email address</Label>
            <Input placeholder="jane@example.com" />
        </div>
        <div className="pt-2">
            <Button>Submit</Button>
        </div>
    </div>
);
