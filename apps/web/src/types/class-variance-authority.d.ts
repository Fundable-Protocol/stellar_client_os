declare module 'class-variance-authority' {
  export interface VariantProps<T> {}
  export function cva<T extends string | Record<string, unknown>>(base: T, variants?: any): any;
}
