// scripts/check-data-removal.mjs の型（テストから使うため）。
export interface DataFile { path: string; label: string; id: string | null }
export const FILES: DataFile[];
export function allowedRemovals(baseCount: number): number;
export function idsOf(file: DataFile, text: string): Set<string>;
export function compareIds(
  label: string,
  baseIds: Set<string>,
  currentIds: Set<string>
): { label: string; base: number; current: number; added: number; removed: string[]; limit: number; ok: boolean };
export function publishedItemUrls(catalogText: string, series?: unknown[]): Map<string, string>;
export function missingRedirects(baseCatalogText: string, currentCatalogText: string, redirectsText: string, series?: unknown[]): string[];
