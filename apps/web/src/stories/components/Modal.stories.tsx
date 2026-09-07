import React, { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogTrigger,
    DialogClose,
} from '../../components/ui/dialog';
import { Button } from '../../components/ui/button';

const meta: Meta = {
    title: 'Components/Modal',
};

export default meta;

export const Default = () => {
    const [open, setOpen] = useState(false);
    return (
        <div>
            <Button onClick={() => setOpen(true)}>Open Modal</Button>
            <Dialog open={open} onOpenChange={setOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Example Modal</DialogTitle>
                        <DialogDescription>This is a simple modal example for Storybook.</DialogDescription>
                    </DialogHeader>
                    <div className="py-4">Modal body content goes here.</div>
                    <div className="flex gap-2 justify-end">
                        <DialogClose asChild>
                            <Button variant="outline">Close</Button>
                        </DialogClose>
                        <Button>Confirm</Button>
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    );
};
