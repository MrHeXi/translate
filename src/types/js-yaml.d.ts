declare module 'js-yaml' {
  export interface LoadOptions {
    schema?: unknown;
    json?: boolean;
    listener?: (event: 'open' | 'close', state: unknown) => void;
  }

  export interface DumpOptions {
    schema?: unknown;
    indent?: number;
    noArrayIndent?: boolean;
    skipInvalid?: boolean;
    flowLevel?: number;
    sortKeys?: boolean | ((left: string, right: string) => number);
    lineWidth?: number;
    noRefs?: boolean;
    noCompatMode?: boolean;
    quotingType?: "'" | '"';
    forceQuotes?: boolean;
  }

  export const JSON_SCHEMA: unknown;

  export function load(input: string, options?: LoadOptions): unknown;
  export function dump(input: unknown, options?: DumpOptions): string;
}
