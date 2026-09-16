/**
 * Minimal ambient types for `node:sqlite` (@types/node here predates the module).
 * Only the surface src/db/driver.ts uses is declared — kept deliberately narrow.
 * At app runtime the Metro resolver swaps this specifier for a throwing stub
 * (metro.config.js), so these types never describe RN-side behaviour.
 */

declare module 'node:sqlite' {
  export interface StatementSync {
    run(...params: unknown[]): { lastInsertRowid: number | bigint; changes: number | bigint };
    get(...params: unknown[]): unknown;
    all(...params: unknown[]): unknown[];
  }
  export class DatabaseSync {
    constructor(path: string);
    prepare(sql: string): StatementSync;
    exec(sql: string): void;
    close(): void;
  }
}
