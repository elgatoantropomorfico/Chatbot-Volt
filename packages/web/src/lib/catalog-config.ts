/** Catalog/config layout v2 (Gabinete): precio por servicio, sin recomendador, tabs Catálogo. */
export function isCatalogConfigV2(settings: { catalogConfigV2?: boolean | null } | null | undefined): boolean {
  return !!settings?.catalogConfigV2;
}
