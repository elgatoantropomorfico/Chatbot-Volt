'use client';

import { Zap, ArrowLeft } from 'lucide-react';

export default function PrivacyPage() {
  return (
    <div style={{ minHeight: '100vh', background: 'var(--color-bg)' }}>
      {/* Navbar */}
      <nav style={{
        position: 'sticky', top: 0, zIndex: 100,
        background: 'rgba(6, 6, 12, 0.8)', backdropFilter: 'blur(20px)',
        borderBottom: '1px solid var(--color-border)',
      }}>
        <div style={{
          maxWidth: 800, margin: '0 auto', padding: '0 24px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          height: 64,
        }}>
          <a href="/" style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none' }}>
            <div style={{
              width: 34, height: 34, borderRadius: 10,
              background: 'linear-gradient(135deg, #8b5cf6, #e879f9)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <Zap size={18} color="#fff" />
            </div>
            <span style={{ fontSize: 20, fontWeight: 800, letterSpacing: '-0.03em' }}>
              <span style={{ color: '#fff' }}>Volt</span>
              <span style={{ color: 'var(--color-text-muted)' }}> IA Agents</span>
            </span>
          </a>
          <a href="/" style={{
            display: 'flex', alignItems: 'center', gap: 6,
            color: 'var(--color-text-secondary)', fontSize: 14, fontWeight: 500,
            textDecoration: 'none', transition: 'color 0.15s',
          }}>
            <ArrowLeft size={16} /> Volver al inicio
          </a>
        </div>
      </nav>

      {/* Content */}
      <main style={{ maxWidth: 800, margin: '0 auto', padding: '60px 24px 100px' }}>
        <h1 style={{
          fontSize: 'clamp(28px, 4vw, 40px)', fontWeight: 800, color: '#fff',
          letterSpacing: '-0.03em', marginBottom: 8,
        }}>
          Política de Privacidad
        </h1>
        <p style={{ fontSize: 14, color: 'var(--color-text-muted)', marginBottom: 40 }}>
          Última actualización: {new Date().toLocaleDateString('es-AR', { year: 'numeric', month: 'long', day: 'numeric' })}
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 32 }}>
          <Section title="1. Responsable del tratamiento de datos">
            <p>
              <strong>Volt IA Agents</strong> es una marca operada por <strong>Ignacio Prado</strong>,
              con domicilio en Corrientes, Argentina.
            </p>
            <p>Contacto: <a href="mailto:pradoignacio.utn@icloud.com">pradoignacio.utn@icloud.com</a></p>
          </Section>

          <Section title="2. Datos que recopilamos">
            <p>En el marco del uso de nuestra plataforma, podemos recopilar los siguientes datos:</p>
            <ul>
              <li><strong>Datos de cuenta:</strong> nombre, correo electrónico y contraseña al registrarse en la plataforma.</li>
              <li><strong>Datos de WhatsApp:</strong> número de teléfono, nombre de perfil y mensajes enviados/recibidos a través del chatbot.</li>
              <li><strong>Datos de negocio:</strong> información comercial proporcionada por el usuario para configurar el bot (nombre del negocio, horarios, productos, promociones, etc.).</li>
              <li><strong>Datos técnicos:</strong> dirección IP, tipo de navegador, sistema operativo y datos de uso de la plataforma.</li>
            </ul>
          </Section>

          <Section title="3. Finalidad del tratamiento">
            <p>Los datos recopilados se utilizan exclusivamente para:</p>
            <ul>
              <li>Proveer el servicio de chatbot automatizado por WhatsApp.</li>
              <li>Gestionar conversaciones, leads y ventas dentro de la plataforma.</li>
              <li>Mejorar la calidad del servicio y la experiencia del usuario.</li>
              <li>Enviar comunicaciones relacionadas con el servicio (nunca spam).</li>
            </ul>
          </Section>

          <Section title="4. Uso de inteligencia artificial">
            <p>
              Volt IA Agents utiliza modelos de inteligencia artificial de OpenAI para procesar
              y responder mensajes. Los mensajes son enviados a la API de OpenAI para su
              procesamiento, sujeto a las <a href="https://openai.com/policies/privacy-policy" target="_blank" rel="noopener noreferrer">políticas de privacidad de OpenAI</a>.
            </p>
            <p>No utilizamos los datos de conversaciones para entrenar modelos de IA propios.</p>
          </Section>

          <Section title="5. Integración con WhatsApp (Meta)">
            <p>
              La plataforma se conecta a WhatsApp a través de la API oficial de WhatsApp Cloud
              (Meta Platforms, Inc.). El tratamiento de datos dentro de WhatsApp está sujeto a
              las <a href="https://www.whatsapp.com/legal/privacy-policy" target="_blank" rel="noopener noreferrer">políticas de privacidad de WhatsApp/Meta</a>.
            </p>
          </Section>

          <Section title="6. Almacenamiento y seguridad">
            <p>
              Los datos se almacenan en servidores seguros con cifrado en tránsito (TLS/SSL).
              Implementamos medidas técnicas y organizativas adecuadas para proteger los datos
              personales contra acceso no autorizado, pérdida o destrucción.
            </p>
          </Section>

          <Section title="7. Compartición de datos">
            <p>No vendemos ni compartimos datos personales con terceros, salvo:</p>
            <ul>
              <li>Proveedores de infraestructura necesarios para operar el servicio (hosting, base de datos).</li>
              <li>Cuando sea requerido por ley o autoridad competente.</li>
            </ul>
          </Section>

          <Section title="8. Derechos del usuario">
            <p>Podés ejercer los siguientes derechos contactándonos a <a href="mailto:pradoignacio.utn@icloud.com">pradoignacio.utn@icloud.com</a>:</p>
            <ul>
              <li><strong>Acceso:</strong> solicitar información sobre los datos que tenemos.</li>
              <li><strong>Rectificación:</strong> corregir datos inexactos.</li>
              <li><strong>Supresión:</strong> solicitar la eliminación de tus datos.</li>
              <li><strong>Portabilidad:</strong> recibir tus datos en formato legible.</li>
            </ul>
          </Section>

          <Section title="9. Retención de datos">
            <p>
              Los datos se conservan mientras la cuenta del usuario esté activa. Al solicitar
              la baja, los datos serán eliminados en un plazo máximo de 30 días, salvo
              obligación legal de conservarlos.
            </p>
          </Section>

          <Section title="10. Modificaciones">
            <p>
              Nos reservamos el derecho de modificar esta política. Cualquier cambio será
              notificado a través de la plataforma o por correo electrónico.
            </p>
          </Section>

          <div style={{
            marginTop: 20, padding: '24px 28px', borderRadius: 'var(--radius-lg)',
            background: 'var(--color-surface)', border: '1px solid var(--color-border)',
          }}>
            <p style={{ fontSize: 14, color: 'var(--color-text-secondary)', lineHeight: 1.6 }}>
              <strong style={{ color: '#fff' }}>Ignacio Prado</strong>
              <br />
              Responsable de Volt IA Agents
              <br />
              Corrientes, Argentina
              <br />
              <a href="mailto:pradoignacio.utn@icloud.com">pradoignacio.utn@icloud.com</a>
            </p>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer style={{
        padding: '24px', borderTop: '1px solid var(--color-border)',
        background: 'var(--color-bg-secondary)', textAlign: 'center',
      }}>
        <span style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>
          © {new Date().getFullYear()} Volt IA Agents — Marca operada por Ignacio Prado · Corrientes, Argentina
        </span>
      </footer>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h2 style={{
        fontSize: 18, fontWeight: 700, color: '#fff', marginBottom: 12,
        paddingBottom: 8, borderBottom: '1px solid var(--color-border)',
      }}>
        {title}
      </h2>
      <div style={{
        display: 'flex', flexDirection: 'column', gap: 12,
        fontSize: 14, lineHeight: 1.7, color: 'var(--color-text-secondary)',
      }}>
        {children}
      </div>
      <style>{`
        .privacy-content ul {
          padding-left: 20px;
        }
      `}</style>
    </div>
  );
}
