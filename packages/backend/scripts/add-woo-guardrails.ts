import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const WOO_GUARDRAILS = [
  { id: 'woo_no_invent_products', label: '🛒 No inventar productos ni precios', prompt: 'Cuando respondés fuera del modo compra, NUNCA inventes nombres de productos, precios ni disponibilidad. No tenés acceso al inventario. Si el cliente pregunta por algo específico, guialo al catálogo.', enabled: true, scope: 'woocommerce' },
  { id: 'woo_no_confirm_purchase', label: '🛒 No simular ventas ni confirmar pedidos', prompt: 'NUNCA digas que una compra fue realizada ni que un pedido está confirmado. Vos solo respondés consultas; las compras las maneja el sistema de carrito automáticamente.', enabled: true, scope: 'woocommerce' },
  { id: 'woo_redirect_search', label: '🛒 Guiar al cliente al catálogo', prompt: 'Si el cliente quiere ver o comprar un producto, indicale que escriba "Busco [producto]" o "Quiero comprar" para que el sistema le muestre opciones del catálogo real.', enabled: true, scope: 'woocommerce' },
  { id: 'woo_no_fake_cart', label: '🛒 No mencionar carrito fuera del modo compra', prompt: 'No menciones el carrito ni sugieras "Finalizar compra" a menos que el cliente ya esté comprando y tenga productos agregados. Esa función solo existe dentro del modo compra.', enabled: true, scope: 'woocommerce' },
];

async function main() {
  const allSettings = await prisma.botSettings.findMany();
  for (const bs of allSettings) {
    const raw = bs.guardrailsJson;
    const guardrails = Array.isArray(raw) ? raw : [];
    // Remove old WooCommerce guardrails and replace with updated ones
    const withoutWoo = guardrails.filter((g: any) => g.scope !== 'woocommerce');
    const updated = [...withoutWoo, ...WOO_GUARDRAILS];
    await prisma.botSettings.update({
      where: { tenantId: bs.tenantId },
      data: { guardrailsJson: updated },
    });
    console.log(`✅ Updated WooCommerce guardrails for tenant ${bs.tenantId}`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((e) => { console.error(e); process.exit(1); });
