import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const WOO_GUARDRAILS = [
  { id: 'woo_no_invent_products', label: '🛒 No inventar productos ni precios', prompt: 'NUNCA inventes nombres de productos específicos, precios ni disponibilidad de stock. No tenés acceso al inventario.', enabled: true, scope: 'woocommerce' },
  { id: 'woo_no_confirm_purchase', label: '🛒 No confirmar compras', prompt: 'NUNCA confirmes una compra ni digas que un pedido fue realizado. Vos NO procesás compras.', enabled: true, scope: 'woocommerce' },
  { id: 'woo_redirect_search', label: '🛒 Redirigir a búsqueda de productos', prompt: 'Si el cliente pregunta por un producto específico, decile que escriba "Busco [nombre del producto]" para consultar el catálogo. Si quiere comprar, decile que escriba "Quiero comprar" o "Busco [producto]".', enabled: true, scope: 'woocommerce' },
  { id: 'woo_no_fake_cart', label: '🛒 No simular carrito', prompt: 'NUNCA simules un proceso de compra ni menciones un carrito si el cliente no está en modo compra. NUNCA le digas que escriba "Finalizar compra" porque eso es solo para cuando ya tiene productos en el carrito.', enabled: true, scope: 'woocommerce' },
];

async function main() {
  const allSettings = await prisma.botSettings.findMany();
  for (const bs of allSettings) {
    const raw = bs.guardrailsJson;
    const guardrails = Array.isArray(raw) ? raw : [];
    const hasWoo = guardrails.some((g: any) => g.scope === 'woocommerce');
    if (hasWoo) {
      console.log(`⏭️  Tenant ${bs.tenantId} already has WooCommerce guardrails, skipping.`);
      continue;
    }
    const updated = [...guardrails, ...WOO_GUARDRAILS];
    await prisma.botSettings.update({
      where: { tenantId: bs.tenantId },
      data: { guardrailsJson: updated },
    });
    console.log(`✅ Added WooCommerce guardrails to tenant ${bs.tenantId}`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((e) => { console.error(e); process.exit(1); });
