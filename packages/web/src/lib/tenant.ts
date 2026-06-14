export interface TenantNameFields {
  name: string;
  displayName?: string | null;
}

/** Nombre visible para el tenant (el que editan en Configuración). */
export function getTenantDisplayName(tenant?: TenantNameFields | null): string {
  if (!tenant) return '';
  const custom = tenant.displayName?.trim();
  if (custom) return custom;
  return tenant.name?.trim() || '';
}

/** Nombre interno que ve el superadmin al crear/gestionar el tenant. */
export function getTenantAdminName(tenant?: TenantNameFields | null): string {
  return tenant?.name?.trim() || '';
}
