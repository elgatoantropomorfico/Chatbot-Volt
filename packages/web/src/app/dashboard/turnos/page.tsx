'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';

const STATUS_LABELS: Record<string, string> = {
  pendiente_datos: 'Pendiente datos',
  pendiente_pago: 'Pendiente pago',
  confirmado: 'Confirmado',
  cancelado: 'Cancelado',
  reprogramado: 'Reprogramado',
  completado: 'Completado',
  no_asistio: 'No asistió',
  vencido: 'Vencido',
};

export default function TurnosPage() {
  const [tab, setTab] = useState<'lista' | 'calendario'>('lista');
  const [appointments, setAppointments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('');

  useEffect(() => { load(); }, [filter]);

  async function load() {
    setLoading(true);
    try {
      const params: Record<string, string> = {};
      if (filter) params.status = filter;
      const res = await api.getAppointments(params);
      setAppointments(res.appointments || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  async function updateStatus(id: string, status: string) {
    await api.updateAppointment(id, { status });
    await load();
  }

  return (
    <div style={{ padding: '24px', maxWidth: 1200 }}>
      <h1 style={{ marginBottom: 4 }}>Turnos</h1>
      <p style={{ color: 'var(--color-text-muted)', marginBottom: 20, fontSize: 14 }}>
        Gestión de reservas confirmadas y pendientes
      </p>

      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        <button
          onClick={() => setTab('lista')}
          style={{
            padding: '8px 14px', borderRadius: 6, cursor: 'pointer', fontSize: 13,
            border: '1px solid var(--color-border)',
            background: tab === 'lista' ? 'var(--color-primary)' : 'var(--color-bg-secondary)',
            color: tab === 'lista' ? '#fff' : 'inherit',
          }}
        >Lista</button>
        <button
          onClick={() => setTab('calendario')}
          style={{
            padding: '8px 14px', borderRadius: 6, cursor: 'pointer', fontSize: 13,
            border: '1px solid var(--color-border)',
            background: tab === 'calendario' ? 'var(--color-primary)' : 'var(--color-bg-secondary)',
            color: tab === 'calendario' ? '#fff' : 'inherit',
          }}
        >Calendario</button>
        <select value={filter} onChange={(e) => setFilter(e.target.value)} style={{ marginLeft: 'auto', padding: '6px 10px', borderRadius: 6, border: '1px solid var(--color-border)', background: 'var(--color-bg-secondary)' }}>
          <option value="">Todos los estados</option>
          {Object.entries(STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </div>

      {loading ? (
        <p>Cargando...</p>
      ) : tab === 'calendario' ? (
        <div style={{ display: 'grid', gap: 8 }}>
          {appointments.length === 0 ? <p>Sin turnos</p> : appointments.map((a) => (
            <div key={a.id} style={{ padding: 12, border: '1px solid var(--color-border)', borderRadius: 8, background: 'var(--color-bg-secondary)' }}>
              <strong>{a.appointmentDate?.slice(0, 10)} — {a.appointmentTime}</strong>
              <div style={{ fontSize: 13 }}>{a.customerName || a.lead?.name} · {a.service?.name}</div>
              <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>{STATUS_LABELS[a.status] || a.status}</div>
            </div>
          ))}
        </div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ textAlign: 'left', borderBottom: '1px solid var(--color-border)' }}>
                <th style={{ padding: 8 }}>Fecha</th>
                <th style={{ padding: 8 }}>Hora</th>
                <th style={{ padding: 8 }}>Cliente</th>
                <th style={{ padding: 8 }}>Servicio</th>
                <th style={{ padding: 8 }}>Estado</th>
                <th style={{ padding: 8 }}>Pagado</th>
                <th style={{ padding: 8 }}>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {appointments.map((a) => (
                <tr key={a.id} style={{ borderBottom: '1px solid var(--color-border)' }}>
                  <td style={{ padding: 8 }}>{a.appointmentDate?.slice(0, 10)}</td>
                  <td style={{ padding: 8 }}>{a.appointmentTime}</td>
                  <td style={{ padding: 8 }}>{a.customerName || a.lead?.name || a.customerPhone}</td>
                  <td style={{ padding: 8 }}>{a.service?.name}</td>
                  <td style={{ padding: 8 }}>{STATUS_LABELS[a.status] || a.status}</td>
                  <td style={{ padding: 8 }}>${Number(a.amountPaid || 0).toLocaleString('es-AR')}</td>
                  <td style={{ padding: 8 }}>
                    {a.status === 'confirmado' && (
                      <button onClick={() => updateStatus(a.id, 'completado')} style={{ fontSize: 11, marginRight: 4 }}>Completar</button>
                    )}
                    {!['cancelado', 'completado'].includes(a.status) && (
                      <button onClick={() => updateStatus(a.id, 'cancelado')} style={{ fontSize: 11 }}>Cancelar</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {appointments.length === 0 && <p style={{ padding: 16 }}>No hay turnos todavía</p>}
        </div>
      )}
    </div>
  );
}
