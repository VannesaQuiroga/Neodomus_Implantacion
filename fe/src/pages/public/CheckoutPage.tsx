import { CardPaymentInput } from '@components/common/CardPaymentInput';
// Pantalla CheckoutPage de Neodomus. Reúne el estado y las acciones de su vista.
import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  FaArrowLeft,
  FaCreditCard,
  FaBuildingColumns,
  FaPaypal,
  FaStore,
  FaTrashCan,
  FaCircleCheck,
  FaExclamation,
  FaEnvelope,
  FaSpinner,
  FaPlus,
  FaLocationDot,
  FaFlask,
  FaXmark,
  FaFilePdf,
  FaUsers,
  FaTag,
} from 'react-icons/fa6';
import api, { descargarFactura } from '@services/api';
import { useCart } from '@contexts/CartContext';
import { useAuth } from '@contexts/AuthContext';
import { useIdioma } from '@i18n/IdiomaContext';
import { PF_REDIRECT_AFTER_LOGIN_KEY } from '@utils/profileStorage';
import { subtotalLinea } from '@utils/productoPrecio';
import { esDomingo } from '@utils/fechas';
import SelectorBanco from '@components/common/SelectorBanco';
import '@styles/checkout.css';
import '@styles/citas.css';

type Metodo = 'tarjeta_debito' | 'tarjeta_credito' | 'pse' | 'paypal' | 'punto_pago';

const METODOS: { codigo: Metodo; clave: string; icono: any }[] = [
  { codigo: 'tarjeta_debito', clave: 'citas.tarjetaDebito', icono: FaCreditCard },
  { codigo: 'tarjeta_credito', clave: 'citas.tarjetaCredito', icono: FaCreditCard },
  { codigo: 'pse', clave: 'checkout.pago.pse', icono: FaBuildingColumns },
  { codigo: 'paypal', clave: 'checkout.pago.paypal', icono: FaPaypal },
  { codigo: 'punto_pago', clave: 'checkout.pago.puntoPagoEfecty', icono: FaStore },
];

const TIPOS_SERVICIO: { tipo: string; precio: number; clave: string }[] = [
  { tipo: 'Instalación', precio: 120000, clave: 'citas.instalacion' },
  { tipo: 'Mantenimiento', precio: 80000, clave: 'citas.mantenimiento' },
  { tipo: 'Reparación', precio: 90000, clave: 'citas.reparacion' },
  { tipo: 'Revisión', precio: 60000, clave: 'checkout.entrega.tipoRevision' },
  { tipo: 'Soporte técnico', precio: 70000, clave: 'citas.soporte' },
];

const claveServicio = (tipo: string) =>
  TIPOS_SERVICIO.find((servicio) => servicio.tipo === tipo)?.clave ?? tipo;

interface LineaServicio {
  id: number;
  tipo: string;
  nombre: string;
  precio: number;
  fecha?: string;
  hora?: string;
  id_tecnico?: number | null;
  id_tecnico_2?: number | null;
  id_tecnico_3?: number | null;
  modo_tecnico?: 'auto' | 'lista';
}

interface TecnicoCheckout {
  id_tecnico: number;
  first_name?: string;
  last_name?: string;
  telefono?: string | null;
  foto_url?: string | null;
  disponible?: boolean;
  calificacion?: number | null;
}

interface OrdenInstalacion {
  id_cita: number;
  id_tecnico?: number | null;
  nombre_tecnico?: string | null;
  id_tecnico_2?: number | null;
  nombre_tecnico_2?: string | null;
  tipo_servicio?: string;
  fecha?: string | null;
  hora?: string;
  direccion?: string;
  estado?: string;
}

interface TecnicoSugerido {
  id_tecnico: number;
  nombre: string;
  cubiertas: number;
  total_requeridas: number;
  cubre_todo: boolean;
}

interface Recomendacion {
  tiempo_total_horas: number;
  horas_por_tecnico?: number;
  tecnicos_necesarios: number;
  especializaciones_requeridas: { id_especializacion: number; nombre: string }[];
  tecnicos_sugeridos: TecnicoSugerido[];
}

interface ResultadoCheckout {
  tipo: 'aprobado' | 'rechazado' | 'pendiente';
  pedido?: any;
  pago?: any;
  factura?: any;
  pdf_url?: string;
  mensaje?: string;
  ordenes_instalacion?: OrdenInstalacion[];
  entrega?: any;
}

interface CuponDisponible {
  id_cupon: number;
  codigo: string;
  tipo_descuento: string;
  valor_descuento: number;
  fecha_vencimiento: string | null;
  compra_minima: number;
  usos_maximos: number;
  usos_realizados: number;
}

const formatoPeso = (value: number) =>
  value.toLocaleString('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 });

const PAGO_REINTENTO_KEY = 'checkout_pago_reintento';
const METODOS_TARJETA: Metodo[] = ['tarjeta_debito', 'tarjeta_credito'];

const validarTarjeta = (pago: {
  numero: string;
  titular: string;
  expiracion: string;
  cvv: string;
}): string | null => {
  if (!pago.numero || !pago.titular || !pago.expiracion || !pago.cvv) {
    return 'checkout.validaciones.tarjetaDatos';
  }
  if (!/^\d{13,19}$/.test(pago.numero)) {
    return 'checkout.validaciones.tarjetaNumero';
  }
  const fecha = /^(\d{2})\/(\d{2})$/.exec(pago.expiracion);
  if (!fecha || Number(fecha[1]) < 1 || Number(fecha[1]) > 12) {
    return 'checkout.validaciones.tarjetaExpiracionFormato';
  }
  const ahora = new Date();
  const anio = 2000 + Number(fecha[2]);
  if (anio < ahora.getFullYear() || (anio === ahora.getFullYear() && Number(fecha[1]) < ahora.getMonth() + 1)) {
    return 'checkout.validaciones.tarjetaVencida';
  }
  if (!/^\d{3,4}$/.test(pago.cvv)) {
    return 'checkout.validaciones.cvv';
  }
  return null;
};

// Nunca se persisten el número completo de la tarjeta ni el CVV.
const datosReintento = (metodo: Metodo, pago: Record<string, any>, pedidoId: number) => ({
  metodo,
  pedido_id: pedidoId,
  titular: pago.titular || '',
  expiracion: pago.expiracion || '',
  banco: pago.banco || '',
  correo_paypal: pago.correo_paypal || '',
  punto_pago: pago.punto_pago || '',
  cuotas: pago.cuotas ?? 1,
});

// Elimina de una caché antigua únicamente los campos sensibles (número y CVV).
const limpiarCacheSensible = (datos: Record<string, any>): Record<string, any> => {
  if (datos.numero === undefined && datos.cvv === undefined) return datos;
  const { numero: _numero, cvv: _cvv, ...resto } = datos;
  return resto;
};

// Comunica con el backend mediante GET '/pedidos/metodos-pago', GET '/clients/me', GET `/tecnicos/publicos?${params.toString()}` y otras peticiones de esta vista; accede a sessionStorage para conservar o recuperar datos locales.
const CheckoutPage = () => {
  const navigate = useNavigate();
  const { t } = useIdioma();
  const { items, totalPrice, clearCart } = useCart();
  const { isAuthenticated, rol, loading: authLoading } = useAuth();

  const [metodo, setMetodo] = useState<Metodo>('tarjeta_debito');
  const [pago, setPago] = useState({
    numero: '',
    titular: '',
    expiracion: '',
    cvv: '',
    banco: '',
    correo_paypal: '',
    resultado_simulacion: '',
    punto_pago: '',
    cuotas: 1,
  });
  // Credenciales del último intento rechazado (para reintentar sin reescribir
  // todo). El número completo y el CVV nunca se guardan.
  const [bancos, setBancos] = useState<string[]>([]);
  const listaBancos = bancos.length ? bancos : ['Bancolombia', 'Banco de Bogotá', 'Banco Davivienda'];
  const [metodosDisponibles, setMetodosDisponibles] = useState<Metodo[] | null>(null);
  const [servicios, setServicios] = useState<LineaServicio[]>([]);
  const [procesando, setProcesando] = useState(false);
  const procesandoRef = useRef(false);
  const [reintentoPedidoId, setReintentoPedidoId] = useState<number | null>(null);
  const [error, setError] = useState('');
  const [resultado, setResultado] = useState<ResultadoCheckout | null>(null);
  const [descargando, setDescargando] = useState(false);
  const [direccionCliente, setDireccionCliente] = useState('');
  const [tecnicosMap, setTecnicosMap] = useState<Record<number, TecnicoCheckout[]>>({});
  const [horasPorServicio, setHorasPorServicio] = useState<Record<number, string[]>>({});
  const [cargandoHorasServicio, setCargandoHorasServicio] = useState<Record<number, boolean>>({});
  const [recomendacion, setRecomendacion] = useState<Recomendacion | null>(null);
  const [cuponesDisponibles, setCuponesDisponibles] = useState<CuponDisponible[]>([]);
  const [codigoCupon, setCodigoCupon] = useState('');
  const [cuponAplicado, setCuponAplicado] = useState<CuponDisponible | null>(null);
  const [mensajeCupon, setMensajeCupon] = useState('');
  const [validandoCupon, setValidandoCupon] = useState(false);
  const hoyISO = new Date().toISOString().split('T')[0];

  const totalServicios = servicios.reduce((acc, s) => acc + s.precio, 0);
  const total = totalPrice + totalServicios;
  const descuentoCupon = cuponAplicado
    ? Math.min(total, cuponAplicado.tipo_descuento === 'porcentaje'
      ? Math.round(total * Number(cuponAplicado.valor_descuento) / 100)
      : Number(cuponAplicado.valor_descuento))
    : 0;
  const maxTecnicos = Math.max(1, ...items.map((i) => Number(i.tecnicos_requeridos) || 1));
  const tecnicosNecesarios = recomendacion?.tecnicos_necesarios ?? maxTecnicos;

  useEffect(() => {
    api.get('/pedidos/metodos-pago').then((res) => {
      if (res.data?.bancos) setBancos(res.data.bancos);
      if (res.data?.metodos) {
        setMetodosDisponibles(Object.keys(res.data.metodos) as Metodo[]);
      }
    }).catch(() => undefined);
    api.get('/clients/me').then((res) => {
      setDireccionCliente(res.data?.address || '');
    }).catch(() => undefined);
    api.get<CuponDisponible[]>('/novedades/cliente/mis-cupones')
      .then((res) => setCuponesDisponibles(res.data || []))
      .catch(() => setCuponesDisponibles([]));
  }, []);

  const aplicarCupon = async (codigo = codigoCupon) => {
    const normalizado = codigo.trim().toUpperCase();
    if (!normalizado) {
      setMensajeCupon(t('checkout.errores.cuponVacio'));
      return;
    }
    setValidandoCupon(true);
    setMensajeCupon('');
    try {
      const res = await api.get<CuponDisponible>('/novedades/cupones/validar', { params: { codigo: normalizado } });
      const cupon = res.data;
      if (total < Number(cupon.compra_minima || 0)) {
        setCuponAplicado(null);
        setMensajeCupon(t('checkout.errores.cuponMinimo', { monto: formatoPeso(Number(cupon.compra_minima)) }));
        return;
      }
      setCuponAplicado(cupon);
      setCodigoCupon(cupon.codigo);
      setMensajeCupon(t('checkout.resumen.cuponAplicadoMsg'));
    } catch (err: any) {
      setCuponAplicado(null);
      setMensajeCupon(err.response?.data?.detail || t('checkout.errores.cuponValidar'));
    } finally {
      setValidandoCupon(false);
    }
  };

  const quitarCupon = () => {
    setCuponAplicado(null);
    setCodigoCupon('');
    setMensajeCupon('');
  };

  const firmaServicios = servicios.map((s) => `${s.id}-${s.tipo}-${s.fecha || ''}-${s.hora || ''}`).join('|');
  useEffect(() => {
    if (servicios.length === 0) return;
    const params = new URLSearchParams();
    servicios.forEach((s) => {
      const tipoNorm = s.tipo.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      params.set('tipo_servicio', tipoNorm);
      if (s.fecha) params.set('fecha', s.fecha);
      if (s.hora) params.set('hora', s.hora);
      api.get(`/tecnicos/publicos?${params.toString()}`)
        .then((res) => {
          setTecnicosMap((prev) => {
            if (prev[s.id] === res.data) return prev;
            return { ...prev, [s.id]: res.data || [] };
          });
        })
        .catch(() => undefined);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firmaServicios, servicios.length]);

  useEffect(() => {
    const cancelar: AbortController[] = [];
    servicios.forEach((s) => {
      if (!s.fecha) {
        setHorasPorServicio((prev) => ({ ...prev, [s.id]: [] }));
        return;
      }
      const [año, mes, dia] = s.fecha.split('-').map(Number);
      const diaSemana = año ? new Date(año, mes - 1, dia).getDay() : -1;
      if (diaSemana === 0) {
        setHorasPorServicio((prev) => ({ ...prev, [s.id]: [] }));
        return;
      }
      const ac = new AbortController();
      cancelar.push(ac);
      setCargandoHorasServicio((prev) => ({ ...prev, [s.id]: true }));
      const tipoNorm = s.tipo.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      const params = new URLSearchParams({ fecha: s.fecha, tipo_servicio: tipoNorm });
      api.get<string[]>('/citas/horas-disponibles', { params, signal: ac.signal })
        .then((res) => {
          const libres = Array.isArray(res.data) ? res.data : [];
          setHorasPorServicio((prev) => ({ ...prev, [s.id]: libres }));
          if (s.hora && !libres.includes(s.hora)) {
            actualizarServicio(s.id, 'hora', '');
          }
        })
        .catch(() => {
          if (!ac.signal.aborted) {
            setHorasPorServicio((prev) => ({ ...prev, [s.id]: [] }));
            actualizarServicio(s.id, 'hora', '');
          }
        })
        .finally(() => {
          if (!ac.signal.aborted) setCargandoHorasServicio((prev) => ({ ...prev, [s.id]: false }));
        });
    });
    return () => cancelar.forEach((c) => c.abort());
  }, [servicios.map((s) => `${s.id}-${s.fecha}-${s.tipo}`).join('|')]);

  const firmaItems = items
    .map((i) => `${i.id_producto}-${i.venta_por_metros ? `${i.metros}x${i.cantidad}` : i.cantidad}`)
    .join('|');
  const servicioInstalacion = servicios.find((s) => s.tipo === 'Instalación');
  useEffect(() => {
    if (items.length === 0) {
      setRecomendacion(null);
      return;
    }
    let cancelado = false;
    api
      .post<Recomendacion>('/pedidos/recomendacion-tecnicos', {
        items: items.map((i) => ({
          id_producto: i.id_producto,
          cantidad: i.venta_por_metros ? 1 : i.cantidad,
          metros: i.venta_por_metros ? (i.metros || 0) * (i.cantidad || 1) : undefined,
        })),
        fecha: servicioInstalacion?.fecha || undefined,
        hora: servicioInstalacion?.hora || undefined,
      })
      .then((res) => {
        if (!cancelado) setRecomendacion(res.data);
      })
      .catch(() => undefined);
    return () => {
      cancelado = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firmaItems, servicioInstalacion?.fecha, servicioInstalacion?.hora]);

  const agregarServicio = () => {
    const primero = TIPOS_SERVICIO[0];
    setServicios((prev) => [
      ...prev,
      {
        id: Date.now(),
        tipo: primero.tipo,
        nombre: primero.tipo,
        precio: primero.precio,
        fecha: '',
        hora: '08:00',
        id_tecnico: null,
        id_tecnico_2: null,
        id_tecnico_3: null,
        modo_tecnico: 'auto',
      },
    ]);
  };

  const cambiarTipoServicio = (id: number, tipo: string) => {
    const info = TIPOS_SERVICIO.find((servicio) => servicio.tipo === tipo) || TIPOS_SERVICIO[0];
    setServicios((prev) =>
      prev.map((s) =>
        s.id === id ? { ...s, tipo, nombre: tipo, precio: info.precio, fecha: '', hora: '08:00', id_tecnico: null, id_tecnico_2: null, id_tecnico_3: null, modo_tecnico: 'auto' } : s
      )
    );
  };

  const actualizarServicio = (id: number, campo: keyof LineaServicio, valor: string) => {
    setServicios((prev) =>
      prev.map((s) => (s.id === id ? { ...s, [campo]: valor } : s))
    );
  };

  const quitarServicio = (id: number) => {
    setServicios((prev) => prev.filter((s) => s.id !== id));
  };

  // Al cambiar de método se limpian campos y errores que ya no aplican.
  const cambiarMetodo = (nuevo: Metodo) => {
    if (nuevo === metodo) return;
    setMetodo(nuevo);
    setError('');
    // Al salir de PSE la selección de banco ya no aplica: se limpia con el método.
    setPago((prev) => {
      const siguiente = { ...prev, resultado_simulacion: '' };
      if (!METODOS_TARJETA.includes(nuevo)) {
        siguiente.numero = '';
        siguiente.expiracion = '';
        siguiente.cvv = '';
      }
      if (nuevo !== 'pse') siguiente.banco = '';
      if (nuevo !== 'paypal') siguiente.correo_paypal = '';
      if (nuevo !== 'punto_pago') siguiente.punto_pago = '';
      return siguiente;
    });
  };

  // Comunica con el backend mediante POST '/pedidos'; accede a sessionStorage para conservar o recuperar datos locales.
  const handlePagar = async () => {
    if (procesandoRef.current) return;
    setError('');
    if (items.length === 0 && !reintentoPedidoId) {
      setError(t('checkout.errores.carritoVacio'));
      return;
    }

    const payloadPago: any = { metodo };
    if (pago.resultado_simulacion) payloadPago.resultado_simulacion = pago.resultado_simulacion;
    if (pago.punto_pago) payloadPago.punto_pago = pago.punto_pago;
    payloadPago.cuotas = pago.cuotas;
    if (metodo === 'tarjeta_debito' || metodo === 'tarjeta_credito') {
      payloadPago.numero = pago.numero;
      payloadPago.titular = pago.titular;
      payloadPago.expiracion = pago.expiracion;
      payloadPago.cvv = pago.cvv;
      const errorTarjeta = validarTarjeta(pago);
      if (errorTarjeta) {
        setError(t(errorTarjeta));
        return;
      }
      if (!pago.resultado_simulacion) {
        setError(t('checkout.errores.resultadoSimulacion'));
        return;
      }
    } else if (metodo === 'pse') {
      payloadPago.banco = pago.banco;
      payloadPago.titular = pago.titular;
      if (!pago.banco) {
        setError(t('checkout.errores.bancoPse'));
        return;
      }
      if (!pago.resultado_simulacion) {
        setError(t('checkout.errores.resultadoSimulacionPse'));
        return;
      }
    } else if (metodo === 'paypal') {
      payloadPago.correo_paypal = pago.correo_paypal;
      if (!pago.correo_paypal) {
        setError(t('checkout.errores.correoPaypal'));
        return;
      }
      if (!pago.resultado_simulacion) {
        setError(t('checkout.errores.resultadoSimulacion'));
        return;
      }
    } else if (metodo === 'punto_pago') {
      if (!pago.punto_pago) {
        setError(t('checkout.errores.puntoPago'));
        return;
      }
    }

    for (const s of servicios) {
      if (!s.fecha) {
        setError(t('checkout.validaciones.fechaServicio'));
        return;
      }
      if (esDomingo(s.fecha)) {
        setError(t('citas.domingoNoLaborable'));
        return;
      }
      const fechaHora = new Date(`${s.fecha}T${s.hora || '08:00'}:00`);
      const limite = new Date(Date.now() + 3 * 60 * 60 * 1000);
      if (Number.isNaN(fechaHora.getTime()) || fechaHora < limite) {
        setError(t('checkout.validaciones.anticipacion'));
        return;
      }
      const camposTecnicos: (keyof LineaServicio)[] = ['id_tecnico', 'id_tecnico_2', 'id_tecnico_3'];
      if (s.modo_tecnico === 'lista') {
        for (let i = 0; i < tecnicosNecesarios && i < 3; i++) {
          if (!s[camposTecnicos[i]]) {
            setError(t('checkout.validaciones.tecnico', { n: i + 1 }));
            return;
          }
        }
      }
    }

    procesandoRef.current = true;
    setProcesando(true);
    try {
      const res = await api.post(
        reintentoPedidoId ? `/pedidos/${reintentoPedidoId}/reintentar-pago` : '/pedidos',
        reintentoPedidoId ? payloadPago : {
        items: items.map((i) => ({
          id_producto: i.id_producto,
          cantidad: i.venta_por_metros ? 1 : i.cantidad,
          metros: i.venta_por_metros ? (i.metros || 0) * (i.cantidad || 1) : undefined,
          color: i.color,
          tamaño: i.tamaño,
          id_variante: i.id_variante ?? undefined,
        })),
        servicios: servicios.map((s) => ({
          nombre: s.nombre,
          tipo_servicio: s.tipo,
          precio: s.precio,
          fecha: s.fecha || undefined,
          hora: s.hora || '08:00',
          id_tecnico: s.modo_tecnico === 'lista' ? s.id_tecnico ?? undefined : undefined,
          id_tecnico_2:
            s.modo_tecnico === 'lista' && (s.tipo !== 'Instalación' || tecnicosNecesarios >= 2)
              ? s.id_tecnico_2 ?? undefined
              : undefined,
          id_tecnico_3:
            s.modo_tecnico === 'lista' && s.tipo === 'Instalación' && tecnicosNecesarios >= 3
              ? s.id_tecnico_3 ?? undefined
              : undefined,
        })),
        pago: payloadPago,
        codigo_cupon: cuponAplicado?.codigo,
      });
      const data = res.data;
      if (data.redirect_url) {
        setProcesando(false);
        window.location.href = data.redirect_url;
        return;
      }
      const estadoPago = data.pago?.estado;
      if (estadoPago === 'aprobado') {
        setReintentoPedidoId(null);
        try {
          sessionStorage.removeItem(PAGO_REINTENTO_KEY);
        } catch {
          /* almacenamiento no disponible */
        }
        clearCart();
        window.dispatchEvent(new CustomEvent('notificaciones-refresh'));
        setResultado({
          tipo: 'aprobado',
          pedido: data.pedido,
          pago: data.pago,
          factura: data.factura,
          pdf_url: data.pdf_url,
          ordenes_instalacion: data.ordenes_instalacion || [],
          entrega: data.entrega || undefined,
        });
      } else if (estadoPago === 'pendiente') {
        setResultado({
          tipo: 'pendiente',
          pedido: data.pedido,
          pago: data.pago,
          mensaje:
            t('checkout.exito.pagoPendienteMsg'),
        });
      } else {
        // Pago rechazado: guardar credenciales del intento para el reintento.
        const pedidoId = Number(data.pedido?.id_pedido);
        if (pedidoId) setReintentoPedidoId(pedidoId);
        try {
          sessionStorage.setItem(
            PAGO_REINTENTO_KEY,
            JSON.stringify(datosReintento(metodo, pago, pedidoId)),
          );
        } catch {
          /* almacenamiento no disponible */
        }
        setResultado({
          tipo: 'rechazado',
          pedido: data.pedido,
          pago: data.pago,
          mensaje: t('checkout.exito.pagoRechazadoMsg'),
        });
      }
    } catch (err: any) {
      const detalle = err.response?.data?.detail || err.response?.data?.message || t('checkout.errores.procesarPedido');
      setError(typeof detalle === 'string' ? detalle : t('checkout.errores.procesarPedido'));
    } finally {
      procesandoRef.current = false;
      setProcesando(false);
    }
  };

  // Comunica con el backend mediante POST `/pedidos/${resultado.pedido.id_pedido}/confirmar-pago`.
  const confirmarPago = async () => {
    if (!resultado?.pedido?.id_pedido) return;
    setProcesando(true);
    setError('');
    try {
      const res = await api.post(`/pedidos/${resultado.pedido.id_pedido}/confirmar-pago`);
      const data = res.data;
      clearCart();
      window.dispatchEvent(new CustomEvent('notificaciones-refresh'));
      setResultado({
        tipo: 'aprobado',
        pedido: data.pedido,
        pago: data.pago,
        factura: data.factura,
        pdf_url: data.pdf_url,
        ordenes_instalacion: data.ordenes_instalacion || [],
        entrega: data.entrega || undefined,
      });
    } catch (err: any) {
      const detalle = err.response?.data?.detail || t('checkout.errores.confirmarPago');
      setError(typeof detalle === 'string' ? detalle : t('checkout.errores.confirmarPagoGenerico'));
    } finally {
      setProcesando(false);
    }
  };

  const descargarFacturaPedido = async () => {
    if (!resultado?.pdf_url) return;
    setDescargando(true);
    try {
      await descargarFactura(resultado.pdf_url);
    } finally {
      setDescargando(false);
    }
  };

  // accede a sessionStorage para conservar o recuperar datos locales.
  const reiniciar = () => {
    setResultado(null);
    setReintentoPedidoId(null);
    setError('');
    setServicios([]);
    setPago({ numero: '', titular: '', expiracion: '', cvv: '', banco: '', correo_paypal: '', resultado_simulacion: '', punto_pago: '', cuotas: 1 });
    try {
      sessionStorage.removeItem(PAGO_REINTENTO_KEY);
    } catch {
      /* noop */
    }
  };

  // Volver a intentar tras un rechazo: restaura método y credenciales
  // guardadas del último intento (el CVV se pide de nuevo por seguridad).
  const reintentarPago = () => {
    const pedidoId = Number(resultado?.pedido?.id_pedido) || null;
    try {
      const guardado = sessionStorage.getItem(PAGO_REINTENTO_KEY);
      if (guardado) {
        const datos = limpiarCacheSensible(JSON.parse(guardado));
        sessionStorage.setItem(PAGO_REINTENTO_KEY, JSON.stringify(datos));
        if (datos.metodo) setMetodo(datos.metodo as Metodo);
        setReintentoPedidoId(Number(datos.pedido_id) || pedidoId);
        setPago((prev) => ({
          ...prev,
          titular: datos.titular || '',
          expiracion: datos.expiracion || '',
          numero: '',
          cvv: '',
          banco: datos.banco || '',
          correo_paypal: datos.correo_paypal || '',
          punto_pago: datos.punto_pago || '',
          cuotas: datos.cuotas ?? 1,
          resultado_simulacion: '',
        }));
      } else {
        setReintentoPedidoId(pedidoId);
      }
    } catch {
      /* datos corruptos: se ignora */
    }
    setResultado(null);
    setError('');
  };

  // Si el usuario vuelve a /checkout después de un rechazo, precarga las
  // credenciales guardadas.
  useEffect(() => {
    try {
      const guardado = sessionStorage.getItem(PAGO_REINTENTO_KEY);
      if (!guardado) return;
      const datos = limpiarCacheSensible(JSON.parse(guardado));
      sessionStorage.setItem(PAGO_REINTENTO_KEY, JSON.stringify(datos));
      if (datos.metodo) setMetodo(datos.metodo as Metodo);
      setReintentoPedidoId(Number(datos.pedido_id) || null);
      setPago((prev) => ({
        ...prev,
        numero: '',
        titular: datos.titular || '',
        expiracion: datos.expiracion || '',
        cvv: '',
        banco: datos.banco || '',
        correo_paypal: datos.correo_paypal || '',
        punto_pago: datos.punto_pago || '',
        cuotas: datos.cuotas ?? prev.cuotas,
        resultado_simulacion: '',
      }));
    } catch {
      /* noop */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Pantalla de éxito (modal)
  if (resultado?.tipo === 'aprobado') {
    return (
      <div className="checkout-modal-overlay">
        <main className="checkout-modal app-glass" role="dialog" aria-modal="true" aria-label={t('checkout.exito.confirmacionAria')}>
          <header className="checkout-modal-header">
            <div className="checkout-modal-head-left">
              <div className="checkout-modal-icon">
                <FaCircleCheck />
              </div>
              <div className="checkout-modal-titles">
                <h1>{t('checkout.exito.pagoExitoso')}</h1>
                <p>{t('checkout.exito.pedidoRegistrado')}</p>
              </div>
            </div>
            <button
              type="button"
              className="checkout-modal-close"
              onClick={() => navigate('/productos')}
              aria-label={t('checkout.exito.cerrarConfirmacionAria')}
              title={t('common.cerrar')}
            >
              <FaXmark />
            </button>
          </header>

          <div className="checkout-modal-body">
            {resultado.factura?.enviada_por_correo ? (
              <p className="checkout-correo-ok">
                <FaEnvelope /> {t('checkout.exito.facturaEnviada')}
              </p>
            ) : (
              <p className="checkout-correo-warn">
                {t('checkout.exito.facturaGenerada')}
              </p>
            )}

            <div className="checkout-success-datos">
              <div><span>{t('checkout.resumen.pedido')}</span><strong>#{resultado.pedido?.id_pedido}</strong></div>
              <div><span>{t('checkout.resumen.factura')}</span><strong>{resultado.factura?.numero_factura}</strong></div>
              <div><span>{t('checkout.resumen.total')}</span><strong>{formatoPeso(resultado.pedido?.total || 0)}</strong></div>
              <div><span>{t('checkout.resumen.transaccion')}</span><strong>{resultado.pago?.numero_transaccion}</strong></div>
            </div>

            {resultado.ordenes_instalacion && resultado.ordenes_instalacion.length > 0 && (
              <div className="checkout-ordenes-instalacion">
                <h2>{t('checkout.exito.instalacionAgendada')}</h2>
                {resultado.ordenes_instalacion.map((o, idx) => (
                  <div className="checkout-orden-instalacion" key={idx}>
                    <div><span>{t('checkout.resumen.estado')}</span><strong>{o.estado}</strong></div>
                    <div><span>{t('checkout.resumen.tecnico')}</span><strong>{o.nombre_tecnico || t('checkout.exito.porAsignar')}{o.nombre_tecnico_2 ? t('checkout.exito.yTecnico', { nombre: o.nombre_tecnico_2 }) : ''}</strong></div>
                    <div><span>{t('checkout.resumen.fecha')}</span><strong>{o.fecha ? (() => { const [a, m, d] = o.fecha.split('-').map(Number); return a ? new Date(a, m - 1, d).toLocaleDateString('es-CO') : o.fecha; })() : ''} {o.hora ? ` · ${o.hora}` : ''}</strong></div>
                    <div><span>{t('checkout.resumen.direccion')}</span><strong>{o.direccion || t('checkout.exito.porDefinir')}</strong></div>
                  </div>
                ))}
              </div>
            )}

            {resultado.entrega && (
              <div className="checkout-ordenes-instalacion">
                <h2>{t('checkout.exito.entregaProgramada')}</h2>
                <div className="checkout-entrega-tecnico">
                  {resultado.entrega.foto_tecnico && (
                    <img
                      src={resultado.entrega.foto_tecnico}
                      alt={resultado.entrega.nombre_tecnico || t('tec.tecnico')}
                      className="checkout-entrega-foto"
                      onError={(e) => (e.currentTarget.style.display = 'none')}
                    />
                  )}
                  <div className="checkout-entrega-info">
                    <div><span>{t('checkout.exito.fechaEntrega')}</span><strong>{resultado.entrega.fecha_entrega ? new Date(resultado.entrega.fecha_entrega).toLocaleDateString('es-CO') : ''} · {resultado.entrega.hora_entrega || ''}</strong></div>
                    <div><span>{t('checkout.exito.tecnicoAsignado')}</span><strong>{resultado.entrega.nombre_tecnico || t('checkout.exito.porAsignar')}</strong></div>
                    {resultado.entrega.telefono_tecnico && (
                      <div><span>{t('checkout.exito.telefono')}</span><strong>{resultado.entrega.telefono_tecnico}</strong></div>
                    )}
                  </div>
                </div>
                <p className="checkout-entrega-nota">
                  {t('checkout.exito.entregaNota')}
                </p>
              </div>
            )}
          </div>

          <footer className="checkout-modal-footer">
            <div className="checkout-success-acciones">
              <button type="button" className="checkout-pdf-btn" onClick={() => navigate('/productos')}>
                {t('checkout.exito.seguirComprando')}
              </button>
              {resultado.pdf_url && (
                <button
                  type="button"
                  className="checkout-volver-btn"
                  onClick={descargarFacturaPedido}
                  disabled={descargando}
                >
                  <FaFilePdf /> {descargando ? t('checkout.exito.descargando') : t('checkout.exito.descargarFactura')}
                </button>
              )}
            </div>
          </footer>
        </main>
      </div>
    );
  }

  // Pantalla de pago pendiente
  if (resultado?.tipo === 'pendiente') {
    return (
      <div className="checkout-page app-glass">
        <main className="checkout-main checkout-pendiente">
          <div className="checkout-pendiente-icon"><FaStore /></div>
          <h1>{t('citas.estadoPago.pendiente')}</h1>
          <p>{resultado.mensaje}</p>

          {resultado.pago?.codigo_punto_pago && (
            <div className="checkout-pendiente-codigo">
              <span className="checkout-pendiente-label">{t('checkout.exito.codigoPago')}</span>
              <strong>{resultado.pago?.codigo_punto_pago}</strong>
              <span className="checkout-pendiente-hint">
                {t('checkout.exito.presentaloEn')} <strong>{resultado.pago?.punto_pago || t('checkout.exito.puntoSeleccionado')}</strong> {t('checkout.exito.presentaloPaga', { monto: formatoPeso(resultado.pedido?.total || 0) })}
              </span>
            </div>
          )}

          <div className="checkout-success-datos">
            <div><span>{t('checkout.resumen.pedido')}</span><strong>#{resultado.pedido?.id_pedido}</strong></div>
            <div><span>{t('checkout.resumen.referencia')}</span><strong>{resultado.pago?.referencia_pago || resultado.pago?.numero_transaccion}</strong></div>
            {resultado.pago?.punto_pago && (
              <div><span>{t('checkout.resumen.puntoPago')}</span><strong>{resultado.pago?.punto_pago}</strong></div>
            )}
            <div><span>{t('checkout.resumen.valorPagar')}</span><strong>{formatoPeso(resultado.pedido?.total || 0)}</strong></div>
            {resultado.pago?.fecha_limite && (
              <div><span>{t('checkout.resumen.fechaLimite')}</span><strong>
                {new Date(resultado.pago.fecha_limite).toLocaleDateString('es-CO', { day: 'numeric', month: 'long', year: 'numeric' })}
              </strong></div>
            )}
            <div><span>{t('checkout.resumen.estado')}</span><strong>{t('citas.pendiente')}</strong></div>
          </div>

          <div className="checkout-success-acciones">
            <button type="button" className="checkout-pdf-btn" onClick={confirmarPago} disabled={procesando}>
              {procesando ? <FaSpinner className="spin" /> : <FaCircleCheck />} {t('checkout.exito.confirmarPago')}
            </button>
            <button type="button" className="checkout-volver-btn" onClick={reiniciar}>
              {t('checkout.exito.volverCheckout')}
            </button>
          </div>
        </main>
      </div>
    );
  }

  // Pantalla de pago rechazado
  if (resultado?.tipo === 'rechazado') {
    return (
      <div className="checkout-page app-glass">
        <main className="checkout-main checkout-rechazado">
          <div className="checkout-rechazado-icon"><FaExclamation /></div>
          <h1>{t('citas.estadoPago.rechazado')}</h1>
          <p>{resultado.mensaje}</p>
          <p className="checkout-rechazado-detalle">
            {t('checkout.exito.rechazadoDetalle')}
          </p>
          <div className="checkout-success-acciones">
            <button type="button" className="checkout-pdf-btn" onClick={reintentarPago}>
              <FaArrowLeft /> {t('checkout.exito.reintentarPago')}
            </button>
            <button type="button" className="checkout-volver-btn" onClick={() => navigate('/carrito')}>
              {t('checkout.exito.verCarrito')}
            </button>
          </div>
        </main>
      </div>
    );
  }

  if (authLoading) {
    return <div className="loading">{t('common.cargando')}</div>;
  }

  if (!isAuthenticated || rol !== 'cliente') {
    return (
      <div className="checkout-page app-glass">
        <main className="checkout-main checkout-login">
          <h1>{t('checkout.pasos.loginTitulo')}</h1>
          <p>{t('checkout.pasos.loginDescripcion')}</p>
          <div className="checkout-success-acciones">
            <Link
              to="/login"
              className="checkout-pdf-btn"
              onClick={() => sessionStorage.setItem(PF_REDIRECT_AFTER_LOGIN_KEY, '/checkout')}
            >
              {t('nav.iniciarSesion')}
            </Link>
            <Link to="/register" className="checkout-volver-btn">{t('checkout.pasos.crearCuenta')}</Link>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="checkout-page app-glass">
      {error && <div className="checkout-error"><FaExclamation /> {error}</div>}
      <main className="checkout-main">
        <header className="checkout-header">
          <div>
            <h1>{t('checkout.titulo')}</h1>
            <p>{t('checkout.pasos.descripcion')}</p>
          </div>
          <button type="button" className="checkout-back-btn" onClick={() => navigate('/carrito')}>
            <FaArrowLeft /> {t('checkout.pasos.volverCarrito')}
          </button>
        </header>

        <div className="checkout-layout">
          <div className="checkout-col-izq">
            {/* Servicios opcionales */}
            <section className="checkout-seccion">
              <div className="checkout-seccion-titulo">
                <h2>{t('checkout.entrega.serviciosTitulo')}</h2>
                <button type="button" className="checkout-add-servicio" onClick={agregarServicio}>
                  <FaPlus /> {t('checkout.entrega.agregarServicio')}
                </button>
              </div>
              {servicios.length === 0 ? (
                <p className="checkout-servicios-vacio">
                  {t('checkout.entrega.serviciosVacio')}
                </p>
              ) : (
                <div className="checkout-servicios-lista">
                  {servicios.map((s) => (
                    <div className="checkout-servicio" key={s.id}>
                      <div className="checkout-servicio-fila">
                        <select
                          value={s.tipo}
                          onChange={(e) => cambiarTipoServicio(s.id, e.target.value)}
                        >
                          {TIPOS_SERVICIO.map((tipo) => (
                            <option key={tipo.tipo} value={tipo.tipo}>{t(tipo.clave)}</option>
                          ))}
                        </select>
                        <span className="checkout-servicio-precio">{formatoPeso(s.precio)}</span>
                        <button type="button" onClick={() => quitarServicio(s.id)} aria-label={t('checkout.entrega.quitarServicio')}>
                          <FaTrashCan />
                        </button>
                      </div>
                      <div className="checkout-servicio-detalles">
                          {s.tipo === 'Instalación' && (
                            <>
                              <span className="checkout-tecnicos-aviso">
                                <FaUsers /> {tecnicosNecesarios === 1
                                  ? t('checkout.entrega.requiereUnTecnico')
                                  : t('checkout.entrega.requiereTecnicos', { n: tecnicosNecesarios })}
                                {recomendacion && recomendacion.horas_por_tecnico
                                  ? t('checkout.entrega.horasPorTecnico', { n: recomendacion.horas_por_tecnico })
                                  : ''}
                                .
                              </span>
                              {recomendacion && recomendacion.especializaciones_requeridas.length > 0 && (
                                <span className="checkout-tecnicos-aviso">
                                  {t('checkout.entrega.especializacionesRequeridas')}{' '}
                                  {recomendacion.especializaciones_requeridas.map((e) => e.nombre).join(', ')}.
                                </span>
                              )}
                            </>
                          )}
                          <input
                            type="date"
                            value={s.fecha || ''}
                            min={hoyISO}
                            onChange={(e) => {
                              const valor = e.target.value;
                              if (esDomingo(valor)) {
                                setError(t('citas.domingoNoLaborable'));
                                return;
                              }
                              actualizarServicio(s.id, 'fecha', valor);
                            }}
                          />
                          {!s.fecha ? (
                            <span className="checkout-hora-placeholder">{t('checkout.entrega.seleccionaFecha')}</span>
                          ) : cargandoHorasServicio[s.id] ? (
                            <span className="checkout-hora-loading"><span className="ap-loader" /></span>
                          ) : (horasPorServicio[s.id] || []).length === 0 ? (
                            <span className="checkout-hora-placeholder">{t('checkout.entrega.sinHorarios')}</span>
                          ) : (
                            <div className="citas-horas-grid">
                              {(horasPorServicio[s.id] || []).map((hora) => (
                                <button
                                  key={hora}
                                  type="button"
                                  className={`citas-hora-btn ${s.hora === hora ? 'selected' : ''}`}
                                  onClick={() => actualizarServicio(s.id, 'hora', hora)}
                                >
                                  {hora}
                                </button>
                              ))}
                            </div>
                          )}
                          {(() => {
                            const esInstalacion = s.tipo === 'Instalación';
                            const totalTecnicos = esInstalacion ? Math.max(1, Math.min(tecnicosNecesarios, 3)) : 1;
                            const campos = ['id_tecnico', 'id_tecnico_2', 'id_tecnico_3'] as const;
                            const elegidos: (number | null | undefined)[] = campos.map((c) => s[c]);
                            // Solo técnicos relacionados con los productos del carrito
                            // (comparten al menos una especialización requerida).
                            const relacionados = new Set(
                              (esInstalacion && recomendacion?.especializaciones_requeridas.length
                                ? recomendacion.tecnicos_sugeridos.filter((ts) => ts.cubiertas > 0)
                                : []
                              ).map((ts) => ts.id_tecnico),
                            );
                            const opciones = (tecnicosMap[s.id] || []).filter(
                              (tec) =>
                                !relacionados.size ||
                                relacionados.has(tec.id_tecnico) ||
                                elegidos.includes(tec.id_tecnico),
                            );
                            return (
                              <>
                                <select
                                  className="checkout-tecnico-modo"
                                  value={s.modo_tecnico || 'auto'}
                                  onChange={(e) => actualizarServicio(s.id, 'modo_tecnico', e.target.value)}
                                >
                                  {esInstalacion && totalTecnicos > 1 ? (
                                    <>
                                      <option value="auto">{t('checkout.entrega.asignacionAutoMulti', { n: totalTecnicos })}</option>
                                      <option value="lista">{t('checkout.entrega.elegirMisTecnicos', { n: totalTecnicos })}</option>
                                    </>
                                  ) : (
                                    <>
                                      <option value="auto">{t('checkout.entrega.asignacionAuto')}</option>
                                      <option value="lista">{t('checkout.entrega.elegirLista')}</option>
                                    </>
                                  )}
                                </select>
                                {s.modo_tecnico === 'lista' &&
                                  Array.from({ length: totalTecnicos }).map((_, i) => {
                                    const campo = campos[i];
                                    return (
                                      <select
                                        key={campo}
                                        className="checkout-tecnico-select"
                                        value={(s[campo] as number | null | undefined) ?? ''}
                                        onChange={(e) =>
                                          actualizarServicio(s.id, campo, e.target.value)
                                        }
                                      >
                                        <option value="">{t('checkout.entrega.tecnicoSelecciona', { n: i + 1 })}</option>
                                        {opciones.map((tec) => {
                                          const tomadoPorOtro = elegidos.some(
                                            (v, j) => j !== i && Number(v) === tec.id_tecnico,
                                          );
                                          return (
                                            <option
                                              key={tec.id_tecnico}
                                              value={tec.id_tecnico}
                                              disabled={tec.disponible === false || tomadoPorOtro}
                                            >
                                              {tec.first_name || ''} {tec.last_name || ''}
                                              {tec.calificacion ? ` (★ ${Number(tec.calificacion).toFixed(1)})` : ''}
                                              {tec.disponible === false ? t('checkout.entrega.ocupadoEseDia') : ''}
                                            </option>
                                          );
                                        })}
                                      </select>
                                    );
                                  })}
                                {!(s.modo_tecnico === 'lista') && esInstalacion && totalTecnicos > 1 && (
                                  <span className="checkout-tecnicos-aviso">
                                    <FaUsers /> {t('checkout.entrega.asignacionAutoNota', { n: totalTecnicos })}
                                  </span>
                                )}
                              </>
                            );
                          })()}
                          {direccionCliente ? (
                            <span className="checkout-servicio-direccion">
                              <FaLocationDot /> {direccionCliente}
                            </span>
                          ) : (
                            <span className="checkout-servicio-direccion checkout-servicio-direccion-warn">
                              <FaLocationDot /> {t('checkout.entrega.direccionFaltante')}
                            </span>
                          )}
                        </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* Método de pago */}
            <section className="checkout-seccion">
              <h2>{t('checkout.pago.metodoTitulo')}</h2>
              <div className="checkout-modo-banner">
                <FaFlask />
                {t('citas.modoSimulador')}
              </div>
              <div className="checkout-metodos">
                {(metodosDisponibles ? METODOS.filter((m) => metodosDisponibles.includes(m.codigo)) : METODOS).map((m) => {
                  const Icono = m.icono;
                  return (
                    <button
                      key={m.codigo}
                      type="button"
                      className={`checkout-metodo ${metodo === m.codigo ? 'activo' : ''}`}
                      onClick={() => cambiarMetodo(m.codigo)}
                    >
                      <Icono /> {t(m.clave)}
                    </button>
                  );
                })}
              </div>

              <div className="checkout-pago-form">
                {(metodo === 'tarjeta_debito' || metodo === 'tarjeta_credito') && (
                  <>
                    <div className="checkout-field">
                      <label htmlFor="nb-fesrcpagespublicCheckoutPagetsx1137">{t('citas.numeroTarjeta')}</label>
                      <CardPaymentInput id="nb-fesrcpagespublicCheckoutPagetsx1137" field="number"
                        placeholder="4242 4242 4242 4242"
                        value={pago.numero}
                        onValueChange={(value) => setPago({ ...pago, numero: value })}
                      />
                    </div>
                    <div className="checkout-field">
                      <label htmlFor="nb-fesrcpagespublicCheckoutPagetsx1145">{t('citas.titularTarjeta')}</label>
                      <input id="nb-fesrcpagespublicCheckoutPagetsx1145"
                        type="text"
                        placeholder={t('citas.placeholderTitular')}
                        value={pago.titular}
                        onChange={(e) => setPago({ ...pago, titular: e.target.value })}
                      />
                    </div>
                    <div className="checkout-field-row">
                      <div className="checkout-field">
                        <label htmlFor="nb-fesrcpagespublicCheckoutPagetsx1155">{t('citas.expiracion')}</label>
                        <CardPaymentInput id="nb-fesrcpagespublicCheckoutPagetsx1155" field="expiry"
                          placeholder={t('checkout.pago.expiracionPlaceholder')}
                          value={pago.expiracion}
                          onValueChange={(value) => setPago({ ...pago, expiracion: value })}
                        />
                      </div>
                      <div className="checkout-field">
                        <label htmlFor="nb-fesrcpagespublicCheckoutPagetsx1163">{t('checkout.pago.cvv')}</label>
                        <CardPaymentInput id="nb-fesrcpagespublicCheckoutPagetsx1163" field="cvv"
                          placeholder="123"
                          value={pago.cvv}
                          onValueChange={(value) => setPago({ ...pago, cvv: value })}
                        />
                      </div>
                    </div>
                    <p className="checkout-nota">
                      {t('checkout.pago.pruebaTarjetas')}
                    </p>
                    <div className="checkout-field">
                      <label htmlFor="nb-fesrcpagespublicCheckoutPagetsx1175">{t('checkout.pago.cuotasLabel')}</label>
                      <select id="nb-fesrcpagespublicCheckoutPagetsx1175"
                        className="checkout-cuotas-select"
                        value={pago.cuotas}
                        onChange={(e) => setPago({ ...pago, cuotas: Number(e.target.value) })}
                      >
                        <option value={1}>{t('checkout.pago.cuotaUnica')}</option>
                        <option value={3}>{t('checkout.pago.cuotasOpcion', { n: 3 })}</option>
                        <option value={6}>{t('checkout.pago.cuotasOpcion', { n: 6 })}</option>
                        <option value={12}>{t('checkout.pago.cuotasOpcion', { n: 12 })}</option>
                      </select>
                    </div>
                  </>
                )}

                {(metodo === 'tarjeta_debito' || metodo === 'tarjeta_credito' || metodo === 'pse' || metodo === 'paypal') && (
                  <div className="checkout-field">
                    <label htmlFor="nb-fesrcpagespublicCheckoutPagetsx1192">{t('citas.resultadoSimulacion')}</label>
                    <select id="nb-fesrcpagespublicCheckoutPagetsx1192"
                      value={pago.resultado_simulacion}
                      onChange={(e) => setPago({ ...pago, resultado_simulacion: e.target.value })}
                    >
                      <option value="">{t('citas.seleccionaResultado')}</option>
                      <option value="aprobado">{t('citas.aprobadoSim')}</option>
                      <option value="rechazado">{t('citas.rechazadoSim')}</option>
                      {metodo === 'pse' && <option value="pendiente">{t('citas.pendienteSim')}</option>}
                    </select>
                  </div>
                )}

                {metodo === 'pse' && (
                  <>
                    <div className="checkout-field">
                      <label htmlFor="nb-fesrcpagespublicCheckoutPagetsx1208">{t('citas.banco')}</label>
                      <SelectorBanco id="nb-fesrcpagespublicCheckoutPagetsx1208"
                        bancos={listaBancos}
                        value={pago.banco}
                        onChange={(banco) => setPago((prev) => ({ ...prev, banco }))}
                        classNameTrigger="checkout-banco-trigger"
                        classNameMenu=""
                        placeholder={t('citas.seleccionaBanco')}
                        ariaLabel={t('citas.banco')}
                      />
                    </div>
                    <div className="checkout-field">
                      <label htmlFor="nb-fesrcpagespublicCheckoutPagetsx1220">{t('citas.titularCuenta')}</label>
                      <input id="nb-fesrcpagespublicCheckoutPagetsx1220"
                        type="text"
                        placeholder={t('checkout.pago.nombreTitular')}
                        value={pago.titular}
                        onChange={(e) => setPago({ ...pago, titular: e.target.value })}
                      />
                    </div>
                  </>
                )}

                {metodo === 'paypal' && (
                  <div className="checkout-field">
                    <label htmlFor="nb-fesrcpagespublicCheckoutPagetsx1233">{t('checkout.pago.correoPaypalLabel')}</label>
                    <input id="nb-fesrcpagespublicCheckoutPagetsx1233"
                      type="email"
                      placeholder={t('checkout.pago.correoPaypalPlaceholder')}
                      value={pago.correo_paypal}
                      onChange={(e) => setPago({ ...pago, correo_paypal: e.target.value })}
                    />
                    <p className="checkout-nota">
                      {t('checkout.pago.paypalNota')}
                    </p>
                  </div>
                )}

                {metodo === 'punto_pago' && (
                  <>
                    <div className="checkout-field">
                      <label htmlFor="nb-fesrcpagespublicCheckoutPagetsx1249">{t('citas.puntoPago')}</label>
                      <select id="nb-fesrcpagespublicCheckoutPagetsx1249"
                        value={pago.punto_pago}
                        onChange={(e) => setPago({ ...pago, punto_pago: e.target.value })}
                      >
                        <option value="">{t('citas.seleccionaPunto')}</option>
                        <option value="Efecty">Efecty</option>
                        <option value="Servientrega">Servientrega</option>
                        <option value="Otro punto de pago">{t('citas.otroPunto')}</option>
                      </select>
                    </div>
                    <p className="checkout-nota">
                      {t('checkout.pago.puntoPagoNota')}
                    </p>
                  </>
                )}
              </div>
            </section>
          </div>

          {/* Resumen */}
          <aside className="checkout-resumen">
            <h2>{t('carrito.resumen')}</h2>
            <div className="checkout-resumen-items">
              {items.map((item) => {
                const totalM = item.venta_por_metros ? (item.metros || 0) * (item.cantidad || 1) : 0;
                const importe = subtotalLinea(
                  item.precio_venta_producto,
                  item.cantidad,
                  item.venta_por_metros ? item.metros || 0 : null,
                );
                const tecnicosReq = Number(item.tecnicos_requeridos) || 0;
                return (
                  <div className="checkout-resumen-item" key={`${item.id_producto}-${item.metros || 0}-${item.cantidad}`}>
                    <span className="checkout-resumen-nombre">
                      {item.nombre_producto}
                      {item.venta_por_metros
                        ? ` · ${item.metros} m × ${item.cantidad} = ${totalM} m`
                        : item.cantidad > 1
                          ? ` × ${item.cantidad}`
                          : ''}
                      {tecnicosReq > 0
                        ? (tecnicosReq === 1 ? t('checkout.resumen.unTecnico') : t('checkout.resumen.tecnicos', { n: tecnicosReq }))
                        : t('checkout.resumen.sinInstalacion')}
                    </span>
                    <span className="checkout-resumen-precio">{formatoPeso(importe)}</span>
                  </div>
                );
              })}
              {servicios.map((s) => (
                <div className="checkout-resumen-item" key={s.id}>
                  <span className="checkout-resumen-nombre">{t(claveServicio(s.tipo))}{t('checkout.resumen.servicio')}</span>
                  <span className="checkout-resumen-precio">{formatoPeso(s.precio)}</span>
                </div>
              ))}
            </div>

            <div className="checkout-resumen-row">
              <span>{t('carrito.subtotal')}</span>
              <span>{formatoPeso(total)}</span>
            </div>
            <section className="checkout-cupon" aria-label={t('checkout.resumen.cuponAria')}>
              <label htmlFor="checkout-cupon-codigo"><FaTag /> {t('checkout.resumen.cuponPregunta')}</label>
              {cuponesDisponibles.length > 0 && (
                <select
                  aria-label={t('checkout.resumen.cuponesDisponiblesAria')}
                  value={cuponesDisponibles.some((c) => c.codigo === codigoCupon) ? codigoCupon : ''}
                  onChange={(e) => {
                    setCodigoCupon(e.target.value);
                    if (e.target.value) void aplicarCupon(e.target.value);
                  }}
                  disabled={Boolean(cuponAplicado)}
                >
                  <option value="">{t('checkout.resumen.elegirCupon')}</option>
                  {cuponesDisponibles.map((cupon) => (
                    <option key={cupon.id_cupon} value={cupon.codigo}>
                      {cupon.codigo} · {cupon.tipo_descuento === 'porcentaje' ? `${cupon.valor_descuento}%` : formatoPeso(Number(cupon.valor_descuento))}
                    </option>
                  ))}
                </select>
              )}
              <div className="checkout-cupon-fila">
                <input
                  id="checkout-cupon-codigo"
                  value={codigoCupon}
                  onChange={(e) => setCodigoCupon(e.target.value.toUpperCase())}
                  placeholder={t('checkout.resumen.cuponPlaceholder')}
                  autoComplete="off"
                  disabled={Boolean(cuponAplicado)}
                />
                {cuponAplicado ? (
                  <button type="button" onClick={quitarCupon}>{t('common.quitar')}</button>
                ) : (
                  <button type="button" onClick={() => void aplicarCupon()} disabled={validandoCupon}>
                    {validandoCupon ? t('checkout.resumen.validandoCupon') : t('checkout.resumen.aplicarCupon')}
                  </button>
                )}
              </div>
              {mensajeCupon && <p className={cuponAplicado ? 'checkout-cupon-ok' : 'checkout-cupon-mensaje'} role="status">{mensajeCupon}</p>}
            </section>
            {descuentoCupon > 0 && (
              <div className="checkout-resumen-row checkout-cupon-descuento">
                <span>{t('checkout.resumen.descuento', { codigo: cuponAplicado?.codigo ?? '' })}</span>
                <span>−{formatoPeso(descuentoCupon)}</span>
              </div>
            )}
            <div className="checkout-resumen-row">
              <span>{t('carrito.envio')}</span>
              <span>{t('checkout.resumen.envioCalculado')}</span>
            </div>
            <div className="checkout-resumen-total">
              <span>{t('citas.totalAPagar')}</span>
              <span>{formatoPeso(total - descuentoCupon)}</span>
            </div>

            <button
              type="button"
              className="checkout-pagar-btn"
              onClick={handlePagar}
              disabled={procesando || (items.length === 0 && !reintentoPedidoId)}
            >
              {procesando ? <FaSpinner className="spin" /> : <FaCreditCard />}
              {procesando ? t('checkout.pago.procesando') : t('checkout.pago.pagarConfirmar')}
            </button>
            <p className="checkout-resumen-hint">
                {t('checkout.resumen.simulacionHint')}
              </p>
          </aside>
        </div>
      </main>
    </div>
  );
};

export default CheckoutPage;

