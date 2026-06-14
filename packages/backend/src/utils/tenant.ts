export function tenantDisplayName(tenant: { name: string; displayName?: string | null }): string {
  const custom = tenant.displayName?.trim();
  return custom || tenant.name;
}
