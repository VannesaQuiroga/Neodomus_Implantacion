// Lista los comprobantes de compra y permite consultar sus documentos.
import { useEffect, useState } from 'react';
import { FaFileInvoice, FaFilePdf, FaEnvelope } from 'react-icons/fa6';
import api, { descargarFactura } from '@services/api';
import { useIdioma } from '@i18n/IdiomaContext';
import SectionHeader from './SectionHeader';

interface Factura {
  id_factura: number;
  numero_factura: string;
  monto_total: number;
  enviada_por_correo: boolean;
  pdf_url?: string;
}

interface Pago {
  id_pago: number;
  metodo_pago?: string;
  estado: string;
  numero_transaccion?: string | null;
}

interface Pedido {
  id_pedido: number;
  fecha?: string | null;
  total: number;
  estado: string;
  pago?: Pago | null;
  factura?: Factura | null;
}

const estadoColor: Record<string, string> = {
  Pagado: '#28a745',
  'Pago pendiente': '#d3ac4d',
  'Pago rechazado': '#dc3545',
  Cancelado: '#dc3545',
};

const formatoPeso = (value: number) =>
  value.toLocaleString('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 });

const formatearFecha = (fecha?: string | null) => {
  if (!fecha) return '';
  try {
    return new Date(fecha).toLocaleDateString('es-CO', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return fecha;
  }
};

// Comunica con el backend mediante GET '/pedidos/mis-pedidos'.
const FacturasTab = () => {
  const { t } = useIdioma();
  const [pedidos, setPedidos] = useState<Pedido[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [descargando, setDescargando] = useState<number | null>(null);

  useEffect(() => {
    let activo = true;
    void (async () => {
      try {
        const res = await api.get<Pedido[]>('/pedidos/mis-pedidos');
        if (!activo) return;
        setPedidos(res.data || []);
        setError('');
      } catch (err: any) {
        console.error(err);
        if (!activo) return;
        setError('perfil.facturas.errorCargar');
      } finally {
        if (activo) setLoading(false);
      }
    })();
    return () => {
      activo = false;
    };
  }, []);

  const facturas = pedidos.filter((pedido) => pedido.factura);

  const descargar = async (pedido: Pedido) => {
    if (!pedido.factura?.pdf_url) return;
    setDescargando(pedido.id_pedido);
    try {
      await descargarFactura(pedido.factura.pdf_url);
    } finally {
      setDescargando(null);
    }
  };

  return (
    <div className="pf-tab">
      <SectionHeader
        icon={<FaFileInvoice />}
        title={t('perfil.misFacturas')}
        subtitle={t('perfil.facturas.subtitulo')}
      />

      {loading ? (
        <div className="pf-empty"><p>{t('perfil.facturas.cargando')}</p></div>
      ) : error ? (
        <div className="pf-empty"><p>{t(error)}</p></div>
      ) : facturas.length === 0 ? (
        <div className="pf-empty">
          <span className="pf-empty-icon"><FaFileInvoice /></span>
          <p>{t('perfil.facturas.vacio')}</p>
        </div>
      ) : (
        <div className="pf-orders-list">
          {facturas.map((pedido) => {
            const factura = pedido.factura!;
            const colorEstado = estadoColor[pedido.estado] || '#d3ac4d';
            return (
              <div className="pf-order" key={pedido.id_pedido}>
                <div className="pf-order-top">
                  <div className="pf-order-id-col">
                    <span className="pf-order-id">{factura.numero_factura}</span>
                    <span className="pf-order-folio">
                      {t('perfil.facturas.pedido', { id: pedido.id_pedido })}
                      {pedido.fecha ? ` · ${formatearFecha(pedido.fecha)}` : ''}
                    </span>
                  </div>
                  <div className="pf-order-stats">
                    <span className="pf-status-badge" style={{ background: colorEstado }}>
                      {pedido.estado}
                    </span>
                    <span className="pf-order-total">{formatoPeso(pedido.total)}</span>
                  </div>
                </div>

                <div className="pf-factura-rows">
                  <div className="pf-factura-row">
                    <span>{t('perfil.facturas.valorFacturado')}</span>
                    <strong>{formatoPeso(factura.monto_total ?? pedido.total)}</strong>
                  </div>
                  {pedido.pago?.metodo_pago && (
                    <div className="pf-factura-row">
                      <span>{t('perfil.facturas.metodoPago')}</span>
                      <strong>{pedido.pago.metodo_pago}</strong>
                    </div>
                  )}
                  <div className="pf-factura-row">
                    <span>
                      {factura.enviada_por_correo ? (
                        <>
                          <FaEnvelope /> {t('perfil.facturas.enviadaCorreo')}
                        </>
                      ) : (
                        t('perfil.facturas.disponibleDescarga')
                      )}
                    </span>
                    <strong>{factura.enviada_por_correo ? t('perfil.facturas.si') : '—'}</strong>
                  </div>
                </div>

                {factura.pdf_url && (
                  <div className="pf-factura-acciones">
                    <button
                      type="button"
                      className="pf-order-factura"
                      onClick={() => descargar(pedido)}
                      disabled={descargando === pedido.id_pedido}
                    >
                      <FaFilePdf />
                      {descargando === pedido.id_pedido ? t('perfil.facturas.descargando') : t('perfil.facturas.descargarPdf')}
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default FacturasTab;