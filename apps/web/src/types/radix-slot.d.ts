declare module '@radix-ui/react-slot' {
  import * as React from 'react';

  export interface SlotProps {
    children?: React.ReactNode;
    [key: string]: any;
  }

  export const Slot: React.ElementType<SlotProps>;
}
