// ─────────────────────────────────────────────────────────────
// Novedades — panel de incidencias del técnico.
// Flujo: Buscar cliente → Seleccionar pedido/cita → Registrar → Evidencia
// ─────────────────────────────────────────────────────────────

import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import FontAwesome6 from "@expo/vector-icons/FontAwesome6";
import * as ImagePicker from "expo-image-picker";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { NeodomusColors as C, FontFamilies } from "@/constants/theme";
import { useScrollTopAlEntrar } from "@/hooks/useScrollTopAlEntrar";
import {
  SearchBar,
  FilterChip,
  FilterRow,
  ClearFiltersBtn,
  PickerModal,
  Tabs,
} from "@/components/tecnico/Filtros";
import {
  Novedad,
  NovedadDetalle,
  TIPOS_NOVEDAD,
  ESTADOS_NOVEDAD,
  PRIORIDADES,
  ClienteBusqueda,
  PedidoCliente,
  CitaCliente,
  EvidenciaNovedad,
  crearNovedad,
  listarMisNovedades,
  obtenerNovedad,
  buscarClientes,
  pedidosCliente,
  citasCliente,
  subirEvidencia,
} from "@/services/novedades.service";

// ── Colores de estado y prioridad ────────────────────────────

const COLOR_ESTADO: Record<string, { bg: string; border: string }> = {
  Pendiente: { bg: "rgba(246,195,68,0.12)", border: "rgba(246,195,68,0.25)" },
  "En revisión": { bg: "rgba(131,165,233,0.12)", border: "rgba(131,165,233,0.25)" },
  Aprobada: { bg: "rgba(126,226,154,0.12)", border: "rgba(126,226,154,0.25)" },
  Resuelta: { bg: "rgba(126,226,154,0.15)", border: "rgba(126,226,154,0.3)" },
  Cerrada: { bg: "rgba(255,255,255,0.06)", border: "rgba(255,255,255,0.1)" },
  Rechazada: { bg: "rgba(240,133,138,0.12)", border: "rgba(240,133,138,0.25)" },
};

const COLOR_PRIORIDAD: Record<string, string> = {
  baja: "#8a8a8a",
  normal: "#f0c96f",
  alta: "#e88a3a",
  urgente: "#e5484d",
};

const ICONO_TIPO: Record<string, string> = {
  "Retraso en entrega": "clock",
  "Cliente ausente": "user-slash",
  "Cliente no recibió el pedido": "user-xmark",
  "Dirección incorrecta": "map-pin",
  "Producto dañado": "triangle-exclamation",
  "Producto faltante": "box-open",
  "Producto equivocado": "arrows-rotate",
  "Pérdida de producto": "magnifying-glass",
  "Robo de productos": "shield-halved",
  Accidente: "car-burst",
  "Problema con el vehículo/transporte": "truck",
  "Problema técnico": "wrench",
  "Problema durante una cita": "calendar-xmark",
  "Cita no realizada": "calendar-xmark",
  "Cita reprogramada": "calendar-plus",
  "Cliente solicita reprogramación": "calendar-day",
  "Problema con instalación": "screwdriver-wrench",
  "Retraso que afecta cita": "clock",
  Otro: "ellipsis",
};

const fmtFecha = (f?: string | null) => {
  if (!f) return "—";
  return new Date(f).toLocaleDateString("es-CO", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
};

const fmtFechaHora = (f?: string | null) => {
  if (!f) return "—";
  return new Date(f).toLocaleString("es-CO", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

type PasoFormulario = "cliente" | "origen" | "detalle" | "evidencia";

export default function NovedadesScreen() {
  const insets = useSafeAreaInsets();
  const scrollRef = useRef(null);
  useScrollTopAlEntrar(scrollRef);

  // ── Estado principal ─────────────────────────────────────
  const [novedades, setNovedades] = useState<Novedad[]>([]);
  const [cargando, setCargando] = useState(true);
  const [toast, setToast] = useState<{ msg: string; tipo: "ok" | "err" } | null>(null);

  // ── Filtros lista ────────────────────────────────────────
  const [busqueda, setBusqueda] = useState("");
  const [filtroEstado, setFiltroEstado] = useState("");
  const [filtroPrioridad, setFiltroPrioridad] = useState("");
  const [filtroTipo, setFiltroTipo] = useState("");

  // ── Formulario crear novedad ─────────────────────────────
  const [mostrarForm, setMostrarForm] = useState(false);
  const [paso, setPaso] = useState<PasoFormulario>("cliente");
  const [enviando, setEnviando] = useState(false);

  // Paso 1: Cliente
  const [clientesBusqueda, setClientesBusqueda] = useState<ClienteBusqueda[]>([]);
  const [clienteSeleccion, setClienteSeleccion] = useState<ClienteBusqueda | null>(null);
  const [textoCliente, setTextoCliente] = useState("");
  const [buscandoClientes, setBuscandoClientes] = useState(false);

  // Paso 2: Origen (pedido/cita)
  const [pedidos, setPedidos] = useState<PedidoCliente[]>([]);
  const [citas, setCitas] = useState<CitaCliente[]>([]);
  const [pedidoSeleccion, setPedidoSeleccion] = useState<PedidoCliente | null>(null);
  const [citaSeleccion, setCitaSeleccion] = useState<CitaCliente | null>(null);
  const [cargandoOrigen, setCargandoOrigen] = useState(false);

  // Paso 3: Detalle
  const [tipoSeleccion, setTipoSeleccion] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [prioridad, setPrioridad] = useState("normal");
  const [lugar, setLugar] = useState("");

  // Paso 4: Evidencia
  const [evidenciaUri, setEvidenciaUri] = useState<string | null>(null);
  const [evidenciaNombre, setEvidenciaNombre] = useState<string>("");
  const [evidenciaTipo, setEvidenciaTipo] = useState<string>("");
  const [subiendoEvidencia, setSubiendoEvidencia] = useState(false);

  // ── Detalle novedad ──────────────────────────────────────
  const [detalle, setDetalle] = useState<NovedadDetalle | null>(null);

  // ── Carga de datos ───────────────────────────────────────

  const cargar = useCallback(async (silencioso = false) => {
    if (!silencioso) setCargando(true);
    try {
      const data = await listarMisNovedades();
      setNovedades(data);
    } catch {
      if (!silencioso) setToast({ msg: "Error al cargar novedades", tipo: "err" });
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    cargar();
    const i = setInterval(() => cargar(true), 30000);
    return () => clearInterval(i);
  }, [cargar]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(t);
  }, [toast]);

  // ── Búsqueda de clientes ─────────────────────────────────

  const onBuscarCliente = async (texto: string) => {
    setTextoCliente(texto);
    if (texto.length < 2) {
      setClientesBusqueda([]);
      return;
    }
    setBuscandoClientes(true);
    try {
      const results = await buscarClientes(texto);
      setClientesBusqueda(results);
    } catch {
      setClientesBusqueda([]);
    } finally {
      setBuscandoClientes(false);
    }
  };

  const seleccionarCliente = async (c: ClienteBusqueda) => {
    setClienteSeleccion(c);
    setTextoCliente(c.nombre);
    setClientesBusqueda([]);
    setPaso("origen");

    // Cargar pedidos y citas del cliente
    setCargandoOrigen(true);
    try {
      const [peds, cits] = await Promise.all([
        pedidosCliente(c.id_cliente),
        citasCliente(c.id_cliente),
      ]);
      setPedidos(peds);
      setCitas(cits);
    } catch {
      setToast({ msg: "Error al cargar pedidos/citas", tipo: "err" });
    } finally {
      setCargandoOrigen(false);
    }
  };

  // ── Selección de origen ──────────────────────────────────

  const seleccionarPedido = (p: PedidoCliente) => {
    setPedidoSeleccion(p);
    if (!citaSeleccion) {
      // Buscar si el pedido tiene una cita relacionada
      const citaRelacionada = citas.find(
        (c) => c.fecha === p.fecha_entrega || c.direccion
      );
      if (citaRelacionada) {
        setCitaSeleccion(citaRelacionada);
      }
    }
    setPaso("detalle");
  };

  const seleccionarCita = (c: CitaCliente) => {
    setCitaSeleccion(c);
    setPaso("detalle");
  };

  const avanzarADetalle = () => {
    if (!pedidoSeleccion && !citaSeleccion) {
      setToast({ msg: "Selecciona al menos un pedido o cita", tipo: "err" });
      return;
    }
    setPaso("detalle");
  };

  // ── Evidencia ────────────────────────────────────────────

  const seleccionarFoto = async () => {
    const permiso = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permiso.granted) {
      Alert.alert("Permiso requerido", "Necesitamos acceso a tu galería para adjuntar evidencia.");
      return;
    }
    const resultado = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      quality: 0.8,
    });
    if (!resultado.canceled && resultado.assets[0]) {
      const asset = resultado.assets[0];
      setEvidenciaUri(asset.uri);
      setEvidenciaNombre(asset.fileName || "evidencia.jpg");
      setEvidenciaTipo(asset.mimeType || "image/jpeg");
    }
  };

  const tomarFoto = async () => {
    const permiso = await ImagePicker.requestCameraPermissionsAsync();
    if (!permiso.granted) {
      Alert.alert("Permiso requerido", "Necesitamos acceso a tu cámara para tomar evidencia.");
      return;
    }
    const resultado = await ImagePicker.launchCameraAsync({
      allowsEditing: true,
      quality: 0.8,
    });
    if (!resultado.canceled && resultado.assets[0]) {
      const asset = resultado.assets[0];
      setEvidenciaUri(asset.uri);
      setEvidenciaNombre(asset.fileName || "foto.jpg");
      setEvidenciaTipo(asset.mimeType || "image/jpeg");
    }
  };

  const eliminarEvidencia = () => {
    setEvidenciaUri(null);
    setEvidenciaNombre("");
    setEvidenciaTipo("");
  };

  // ── Enviar novedad ───────────────────────────────────────

  const enviarNovedad = async () => {
    if (!tipoSeleccion || !descripcion.trim()) {
      setToast({ msg: "Completa el tipo y la descripción", tipo: "err" });
      return;
    }
    if (!pedidoSeleccion && !citaSeleccion) {
      setToast({ msg: "Selecciona al menos un pedido o cita", tipo: "err" });
      return;
    }

    setEnviando(true);
    try {
      const resultado = await crearNovedad({
        tipo_novedad: tipoSeleccion,
        descripcion: descripcion.trim(),
        prioridad,
        id_pedido: pedidoSeleccion?.id_pedido ?? null,
        id_cita: citaSeleccion?.id_cita ?? null,
        id_cliente: clienteSeleccion?.id_cliente ?? null,
        lugar_ocurrencia: lugar.trim() || undefined,
      });

      // Subir evidencia si existe
      if (evidenciaUri && resultado.id_novedad) {
        setSubiendoEvidencia(true);
        try {
          await subirEvidencia(
            resultado.id_novedad,
            { uri: evidenciaUri, name: evidenciaNombre, type: evidenciaTipo },
          );
        } catch (e: any) {
          setToast({ msg: "Novedad creada pero error al subir evidencia", tipo: "err" });
        } finally {
          setSubiendoEvidencia(false);
        }
      }

      setToast({ msg: "Novedad reportada correctamente", tipo: "ok" });
      resetForm();
      await cargar();
    } catch (err: any) {
      setToast({ msg: err?.message || "Error al crear novedad", tipo: "err" });
    } finally {
      setEnviando(false);
    }
  };

  const resetForm = () => {
    setMostrarForm(false);
    setPaso("cliente");
    setClienteSeleccion(null);
    setTextoCliente("");
    setPedidoSeleccion(null);
    setCitaSeleccion(null);
    setPedidos([]);
    setCitas([]);
    setTipoSeleccion("");
    setDescripcion("");
    setPrioridad("normal");
    setLugar("");
    eliminarEvidencia();
  };

  // ── Detalle novedad ──────────────────────────────────────

  const abrirDetalle = async (id: number) => {
    try {
      const data = await obtenerNovedad(id);
      setDetalle(data);
    } catch {
      setToast({ msg: "Error al cargar detalle", tipo: "err" });
    }
  };

  // ── Filtrado ─────────────────────────────────────────────

  const filtradas = novedades.filter((n) => {
    if (filtroEstado && n.estado_novedad !== filtroEstado) return false;
    if (filtroPrioridad && n.prioridad !== filtroPrioridad) return false;
    if (filtroTipo && n.tipo_novedad !== filtroTipo) return false;
    if (busqueda) {
      const q = busqueda.toLowerCase();
      const campos = [
        n.tipo_novedad,
        n.descripcion_novedad,
        n.cliente_nombre,
        n.lugar_ocurrencia,
        n.id_pedido ? `#${n.id_pedido}` : "",
        n.id_cita ? `#${n.id_cita}` : "",
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      if (!campos.includes(q)) return false;
    }
    return true;
  });

  const hayFiltros = busqueda || filtroEstado || filtroPrioridad || filtroTipo;

  const contarPorEstado = novedades.reduce(
    (acc, n) => {
      acc[n.estado_novedad] = (acc[n.estado_novedad] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>,
  );

  // ── Render ───────────────────────────────────────────────

  return (
    <View style={[s.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={s.header}>
        <Text style={s.headerTitle}>Historial de novedades</Text>
        <Text style={s.headerSub}>Consulta y registra novedades</Text>
      </View>

      {/* Toast */}
      {toast && (
        <View style={[s.toast, toast.tipo === "ok" ? s.toastOk : s.toastErr]}>
          <Text style={s.toastText}>{toast.msg}</Text>
        </View>
      )}

      {/* Pills de estado */}
      <View style={s.pillsRow}>
        <Pressable
          style={[s.pill, !filtroEstado && !hayFiltros && s.pillActive]}
          onPress={() => {
            setFiltroEstado("");
            setBusqueda("");
            setFiltroPrioridad("");
            setFiltroTipo("");
          }}
        >
          <Text style={[s.pillText, !filtroEstado && !hayFiltros && s.pillTextActive]}>
            Todas ({novedades.length})
          </Text>
        </Pressable>
        {Object.entries(contarPorEstado).map(([estado, count]) => (
          <Pressable
            key={estado}
            style={[s.pill, filtroEstado === estado && s.pillActive]}
            onPress={() => setFiltroEstado(filtroEstado === estado ? "" : estado)}
          >
            <Text style={[s.pillText, filtroEstado === estado && s.pillTextActive]}>
              {estado} ({count})
            </Text>
          </Pressable>
        ))}
      </View>

      {/* Búsqueda */}
      <View style={s.searchRow}>
                        <SearchBar value={busqueda} onChange={setBusqueda} placeholder="Buscar novedades..." />
      </View>

      {/* Botón nueva novedad */}
      <Pressable
        style={s.btnNueva}
        onPress={() => {
          resetForm();
          setMostrarForm(true);
        }}
      >
        <FontAwesome6 name="plus" size={14} color="#000" />
        <Text style={s.btnNuevaText}>Nueva novedad</Text>
      </Pressable>

      {/* Lista */}
      {cargando ? (
        <View style={s.center}>
          <ActivityIndicator size="large" color={C.oro} />
          <Text style={s.centerText}>Cargando novedades...</Text>
        </View>
      ) : filtradas.length === 0 ? (
        <View style={s.center}>
          <FontAwesome6 name="shield-halved" size={40} color={C.oro + "50"} />
          <Text style={s.centerTitle}>
            {hayFiltros ? "Sin resultados" : "Sin novedades aún"}
          </Text>
          <Text style={s.centerText}>
            {hayFiltros
              ? "Ajusta los filtros para ver resultados"
              : "Usa el botón para crear una novedad"}
          </Text>
        </View>
      ) : (
        <ScrollView
          ref={scrollRef}
          style={s.list}
          contentContainerStyle={{ paddingBottom: insets.bottom + 20 }}
        >
          {filtradas.map((n) => (
            <Pressable key={n.id_novedad} style={s.card} onPress={() => abrirDetalle(n.id_novedad)}>
              <View style={s.cardTop}>
                <Text style={s.cardId}>#{n.id_novedad}</Text>
                <View style={[s.badge, { backgroundColor: COLOR_ESTADO[n.estado_novedad]?.bg || "#222", borderColor: COLOR_ESTADO[n.estado_novedad]?.border || "#444" }]}>
                  <Text style={[s.badgeText, { color: C.oro }]}>{n.estado_novedad}</Text>
                </View>
              </View>
              <Text style={s.cardTipo}>{n.tipo_novedad}</Text>
              <View style={s.cardMeta}>
                {n.cliente_nombre && (
                  <View style={s.cardMetaItem}>
                    <FontAwesome6 name="user" size={10} color="#8a8a8a" />
                    <Text style={s.cardMetaText}>{n.cliente_nombre}</Text>
                  </View>
                )}
                {n.id_pedido && (
                  <View style={s.cardMetaItem}>
                    <FontAwesome6 name="file-invoice" size={10} color="#8a8a8a" />
                    <Text style={s.cardMetaText}>#{n.id_pedido}</Text>
                  </View>
                )}
                {n.id_cita && (
                  <View style={s.cardMetaItem}>
                    <FontAwesome6 name="calendar-check" size={10} color="#8a8a8a" />
                    <Text style={s.cardMetaText}>Cita #{n.id_cita}</Text>
                  </View>
                )}
              </View>
              <View style={s.cardBottom}>
                <Text style={s.cardFecha}>{fmtFecha(n.fecha_reporte)}</Text>
                <View style={[s.prioridadDot, { backgroundColor: COLOR_PRIORIDAD[n.prioridad] || "#8a8a8a" }]} />
              </View>
              {n.evidencias && n.evidencias.length > 0 && (
                <View style={s.evidenciaCount}>
                  <FontAwesome6 name="camera" size={10} color={C.oro} />
                  <Text style={s.evidenciaCountText}>{n.evidencias.length} evidencia(s)</Text>
                </View>
              )}
            </Pressable>
          ))}
        </ScrollView>
      )}

      {/* ── Modal de creación ──────────────────────────────── */}
      <Modal visible={mostrarForm} animationType="slide" onRequestClose={resetForm}>
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <View style={[s.modal, { paddingTop: insets.top + 10 }]}>
            {/* Header del modal */}
            <View style={s.modalHeader}>
              <Pressable onPress={resetForm}>
                <FontAwesome6 name="xmark" size={20} color="#8a8a8a" />
              </Pressable>
              <Text style={s.modalTitle}>Nueva novedad</Text>
              <View style={{ width: 24 }} />
            </View>

            {/* Progreso de pasos */}
            <View style={s.stepsRow}>
              {(["cliente", "origen", "detalle", "evidencia"] as PasoFormulario[]).map((p, i) => (
                <View key={p} style={s.stepContainer}>
                  <View style={[s.stepDot, paso === p && s.stepDotActive, i < ["cliente", "origen", "detalle", "evidencia"].indexOf(paso) && s.stepDotDone]}>
                    <Text style={[s.stepDotText, (paso === p || i < ["cliente", "origen", "detalle", "evidencia"].indexOf(paso)) && s.stepDotTextActive]}>
                      {i + 1}
                    </Text>
                  </View>
                  <Text style={[s.stepLabel, paso === p && s.stepLabelActive]}>
                    {p === "cliente" ? "Cliente" : p === "origen" ? "Origen" : p === "detalle" ? "Detalle" : "Evidencia"}
                  </Text>
                </View>
              ))}
            </View>

            <ScrollView style={s.modalBody} contentContainerStyle={{ paddingBottom: 40 }}>
              {/* PASO 1: Buscar cliente */}
              {paso === "cliente" && (
                <View>
                  <Text style={s.sectionTitle}>Buscar cliente</Text>
                  <Text style={s.sectionSub}>Nombre, documento, email o teléfono</Text>
                  <View style={s.searchInputWrap}>
                    <FontAwesome6 name="magnifying-glass" size={14} color="#8a8a8a" style={{ marginRight: 8 }} />
                    <TextInput
                      style={s.searchInput}
                      placeholder="Escribe para buscar..."
                      placeholderTextColor="#555"
                      value={textoCliente}
                      onChangeText={onBuscarCliente}
                      autoFocus
                    />
                    {buscandoClientes && <ActivityIndicator size="small" color={C.oro} />}
                  </View>

                  {clienteSeleccion && (
                    <View style={s.clienteSeleccionado}>
                      <FontAwesome6 name="check-circle" size={16} color={C.oro} />
                      <View style={{ flex: 1, marginLeft: 8 }}>
                        <Text style={s.clienteNombre}>{clienteSeleccion.nombre}</Text>
                        <Text style={s.clienteDetalle}>
                          {clienteSeleccion.documento ? `Doc: ${clienteSeleccion.documento}` : ""}
                          {clienteSeleccion.telefono ? ` · Tel: ${clienteSeleccion.telefono}` : ""}
                        </Text>
                      </View>
                      <Pressable onPress={() => { setClienteSeleccion(null); setTextoCliente(""); }}>
                        <FontAwesome6 name="xmark" size={14} color="#8a8a8a" />
                      </Pressable>
                    </View>
                  )}

                  {clientesBusqueda.length > 0 && (
                    <View style={s.clientesList}>
                      {clientesBusqueda.map((c) => (
                        <Pressable
                          key={c.id_cliente}
                          style={s.clienteItem}
                          onPress={() => seleccionarCliente(c)}
                        >
                          <View style={s.clienteAvatar}>
                            <Text style={s.clienteAvatarText}>
                              {c.nombre.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase()}
                            </Text>
                          </View>
                          <View style={{ flex: 1 }}>
                            <Text style={s.clienteItemNombre}>{c.nombre}</Text>
                            <Text style={s.clienteItemDetalle}>
                              {c.email || ""}
                              {c.documento ? ` · Doc: ${c.documento}` : ""}
                            </Text>
                          </View>
                          <FontAwesome6 name="chevron-right" size={12} color="#555" />
                        </Pressable>
                      ))}
                    </View>
                  )}

                  {!clienteSeleccion && textoCliente.length >= 2 && clientesBusqueda.length === 0 && !buscandoClientes && (
                    <Text style={s.noResultados}>No se encontraron clientes</Text>
                  )}
                </View>
              )}

              {/* PASO 2: Seleccionar origen */}
              {paso === "origen" && (
                <View>
                  <Text style={s.sectionTitle}>Seleccionar origen</Text>
                  <Text style={s.sectionSub}>
                    Pedidos y citas de {clienteSeleccion?.nombre}
                  </Text>

                  {cargandoOrigen ? (
                    <ActivityIndicator size="large" color={C.oro} style={{ marginTop: 30 }} />
                  ) : (
                    <>
                      {/* Pedidos */}
                      {pedidos.length > 0 && (
                        <>
                          <Text style={s.subsectionTitle}>
                            <FontAwesome6 name="file-invoice" size={12} color={C.oro} /> Pedidos
                          </Text>
                          {pedidos.map((p) => (
                            <Pressable
                              key={p.id_pedido}
                              style={[s.origenCard, pedidoSeleccion?.id_pedido === p.id_pedido && s.origenCardActive]}
                              onPress={() => seleccionarPedido(p)}
                            >
                              <View style={s.origenCardHeader}>
                                <Text style={s.origenCardTitle}>Pedido #{p.id_pedido}</Text>
                                <View style={[s.miniBadge, { backgroundColor: COLOR_ESTADO[p.estado_pedido || ""]?.bg || "#222" }]}>
                                  <Text style={s.miniBadgeText}>{p.estado_pedido || "—"}</Text>
                                </View>
                              </View>
                              <Text style={s.origenCardMeta}>
                                {p.fecha_entrega ? `Entrega: ${fmtFecha(p.fecha_entrega)}` : "Sin fecha de entrega"}
                                {p.hora_entrega ? ` ${p.hora_entrega}` : ""}
                              </Text>
                              {p.detalles.length > 0 && (
                                <Text style={s.origenCardProductos}>
                                  {p.detalles.map((d) => d.producto).filter(Boolean).join(", ").slice(0, 80)}
                                </Text>
                              )}
                              {p.estado_entrega && (
                                <Text style={s.origenCardEstado}>Estado entrega: {p.estado_entrega}</Text>
                              )}
                            </Pressable>
                          ))}
                        </>
                      )}

                      {/* Citas */}
                      {citas.length > 0 && (
                        <>
                          <Text style={[s.subsectionTitle, { marginTop: 16 }]}>
                            <FontAwesome6 name="calendar-check" size={12} color={C.oro} /> Citas
                          </Text>
                          {citas.map((c) => (
                            <Pressable
                              key={c.id_cita}
                              style={[s.origenCard, citaSeleccion?.id_cita === c.id_cita && s.origenCardActive]}
                              onPress={() => seleccionarCita(c)}
                            >
                              <View style={s.origenCardHeader}>
                                <Text style={s.origenCardTitle}>Cita #{c.id_cita}</Text>
                                <View style={[s.miniBadge, { backgroundColor: COLOR_ESTADO[c.estado]?.bg || "#222" }]}>
                                  <Text style={s.miniBadgeText}>{c.estado}</Text>
                                </View>
                              </View>
                              <Text style={s.origenCardMeta}>
                                {fmtFecha(c.fecha)} · {c.hora}
                              </Text>
                              <Text style={s.origenCardProductos}>
                                {c.tipo_servicio}
                                {c.especialidad ? ` · ${c.especialidad}` : ""}
                              </Text>
                              <Text style={s.origenCardDireccion}>{c.direccion}</Text>
                            </Pressable>
                          ))}
                        </>
                      )}

                      {pedidos.length === 0 && citas.length === 0 && (
                        <View style={s.center}>
                          <FontAwesome6 name="inbox" size={32} color="#555" />
                          <Text style={s.centerText}>
                            Este cliente no tiene pedidos ni citas relacionados contigo.
                          </Text>
                        </View>
                      )}

                      {(pedidoSeleccion || citaSeleccion) && (
                        <Pressable style={s.btnSiguiente} onPress={avanzarADetalle}>
                          <Text style={s.btnSiguienteText}>Siguiente</Text>
                          <FontAwesome6 name="arrow-right" size={14} color="#000" />
                        </Pressable>
                      )}
                    </>
                  )}
                </View>
              )}

              {/* PASO 3: Detalle de la novedad */}
              {paso === "detalle" && (
                <View>
                  <Text style={s.sectionTitle}>Detalle de la novedad</Text>

                  {/* Resumen del origen */}
                  <View style={s.resumenOrigen}>
                    {pedidoSeleccion && (
                      <View style={s.resumenItem}>
                        <FontAwesome6 name="file-invoice" size={12} color={C.oro} />
                        <Text style={s.resumenText}>Pedido #{pedidoSeleccion.id_pedido}</Text>
                      </View>
                    )}
                    {citaSeleccion && (
                      <View style={s.resumenItem}>
                        <FontAwesome6 name="calendar-check" size={12} color={C.oro} />
                        <Text style={s.resumenText}>
                          Cita · {fmtFecha(citaSeleccion.fecha)} {citaSeleccion.hora}
                        </Text>
                      </View>
                    )}
                    {clienteSeleccion && (
                      <View style={s.resumenItem}>
                        <FontAwesome6 name="user" size={12} color="#8a8a8a" />
                        <Text style={[s.resumenText, { color: "#8a8a8a" }]}>{clienteSeleccion.nombre}</Text>
                      </View>
                    )}
                  </View>

                  {/* Tipo de novedad */}
                  <Text style={s.fieldLabel}>Tipo de novedad *</Text>
                  <View style={s.tipoGrid}>
                    {TIPOS_NOVEDAD.map((t) => (
                      <Pressable
                        key={t}
                        style={[s.tipoBtn, tipoSeleccion === t && s.tipoBtnActive]}
                        onPress={() => setTipoSeleccion(t)}
                      >
                        <FontAwesome6
                          name={(ICONO_TIPO[t] || "ellipsis") as any}
                          size={12}
                          color={tipoSeleccion === t ? "#000" : C.oro}
                        />
                        <Text style={[s.tipoBtnText, tipoSeleccion === t && s.tipoBtnTextActive]}>
                          {t}
                        </Text>
                      </Pressable>
                    ))}
                  </View>

                  {/* Prioridad */}
                  <Text style={s.fieldLabel}>Prioridad</Text>
                  <View style={s.prioridadRow}>
                    {PRIORIDADES.map((p) => (
                      <Pressable
                        key={p}
                        style={[
                          s.prioridadBtn,
                          { borderColor: COLOR_PRIORIDAD[p] || "#555" },
                          prioridad === p && { backgroundColor: COLOR_PRIORIDAD[p] || "#555" },
                        ]}
                        onPress={() => setPrioridad(p)}
                      >
                        <Text
                          style={[
                            s.prioridadBtnText,
                            { color: prioridad === p ? "#fff" : COLOR_PRIORIDAD[p] || "#aaa" },
                          ]}
                        >
                          {p.charAt(0).toUpperCase() + p.slice(1)}
                        </Text>
                      </Pressable>
                    ))}
                  </View>

                  {/* Descripción */}
                  <Text style={s.fieldLabel}>Descripción *</Text>
                  <TextInput
                    style={s.textArea}
                    placeholder="Describe detalladamente la novedad..."
                    placeholderTextColor="#555"
                    value={descripcion}
                    onChangeText={setDescripcion}
                    multiline
                    numberOfLines={4}
                    textAlignVertical="top"
                  />

                  {/* Lugar */}
                  <Text style={s.fieldLabel}>Lugar de ocurrencia</Text>
                  <TextInput
                    style={s.input}
                    placeholder="Ej: Av. Principal #123"
                    placeholderTextColor="#555"
                    value={lugar}
                    onChangeText={setLugar}
                  />

                  <Pressable
                    style={[s.btnSiguiente, (!tipoSeleccion || !descripcion.trim()) && s.btnDisabled]}
                    disabled={!tipoSeleccion || !descripcion.trim()}
                    onPress={() => setPaso("evidencia")}
                  >
                    <Text style={s.btnSiguienteText}>Siguiente</Text>
                    <FontAwesome6 name="arrow-right" size={14} color="#000" />
                  </Pressable>
                </View>
              )}

              {/* PASO 4: Evidencia */}
              {paso === "evidencia" && (
                <View>
                  <Text style={s.sectionTitle}>Evidencia de la novedad</Text>
                  <Text style={s.sectionSub}>Opcional: adjunta una foto como evidencia</Text>

                  {evidenciaUri ? (
                    <View style={s.evidenciaPreview}>
                      <Image source={{ uri: evidenciaUri }} style={s.evidenciaImg} />
                      <View style={s.evidenciaOverlay}>
                        <Pressable style={s.evidenciaBtn} onPress={tomarFoto}>
                          <FontAwesome6 name="camera" size={16} color="#fff" />
                          <Text style={s.evidenciaBtnText}>Cambiar</Text>
                        </Pressable>
                        <Pressable style={[s.evidenciaBtn, { backgroundColor: "rgba(229,72,77,0.8)" }]} onPress={eliminarEvidencia}>
                          <FontAwesome6 name="trash" size={16} color="#fff" />
                          <Text style={s.evidenciaBtnText}>Eliminar</Text>
                        </Pressable>
                      </View>
                    </View>
                  ) : (
                    <View style={s.evidenciaActions}>
                      <Pressable style={s.evidenciaActionBtn} onPress={tomarFoto}>
                        <View style={s.evidenciaActionIcon}>
                          <FontAwesome6 name="camera" size={24} color={C.oro} />
                        </View>
                        <Text style={s.evidenciaActionTitle}>Tomar foto</Text>
                        <Text style={s.evidenciaActionSub}>Abrir cámara</Text>
                      </Pressable>
                      <Pressable style={s.evidenciaActionBtn} onPress={seleccionarFoto}>
                        <View style={s.evidenciaActionIcon}>
                          <FontAwesome6 name="image" size={24} color={C.oro} />
                        </View>
                        <Text style={s.evidenciaActionTitle}>Galería</Text>
                        <Text style={s.evidenciaActionSub}>Seleccionar foto</Text>
                      </Pressable>
                    </View>
                  )}

                  <View style={{ flexDirection: "row", gap: 10, marginTop: 20 }}>
                    <Pressable style={[s.btnSiguiente, { flex: 1 }]} onPress={() => setPaso("detalle")}>
                      <FontAwesome6 name="arrow-left" size={14} color="#000" />
                      <Text style={s.btnSiguienteText}>Atrás</Text>
                    </Pressable>
                    <Pressable
                      style={[s.btnEnviar, (enviando || subiendoEvidencia) && s.btnDisabled]}
                      disabled={enviando || subiendoEvidencia}
                      onPress={enviarNovedad}
                    >
                      {enviando || subiendoEvidencia ? (
                        <ActivityIndicator size="small" color="#000" />
                      ) : (
                        <FontAwesome6 name="paper-plane" size={14} color="#000" />
                      )}
                      <Text style={s.btnEnviarText}>
                        {subiendoEvidencia ? "Subiendo..." : enviando ? "Enviando..." : "Registrar novedad"}
                      </Text>
                    </Pressable>
                  </View>
                </View>
              )}
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ── Modal de detalle ───────────────────────────────── */}
      <Modal visible={!!detalle} animationType="slide" onRequestClose={() => setDetalle(null)}>
        <View style={[s.modal, { paddingTop: insets.top + 10 }]}>
          <View style={s.modalHeader}>
            <Pressable onPress={() => setDetalle(null)}>
              <FontAwesome6 name="xmark" size={20} color="#8a8a8a" />
            </Pressable>
            <Text style={s.modalTitle}>Novedad #{detalle?.id_novedad}</Text>
            <View style={{ width: 24 }} />
          </View>

          {detalle && (
            <ScrollView style={s.modalBody} contentContainerStyle={{ paddingBottom: 40 }}>
              {/* Estado */}
              <View style={[s.badge, { backgroundColor: COLOR_ESTADO[detalle.estado_novedad]?.bg || "#222", borderColor: COLOR_ESTADO[detalle.estado_novedad]?.border || "#444", alignSelf: "flex-start" }]}>
                <Text style={[s.badgeText, { color: C.oro }]}>{detalle.estado_novedad}</Text>
              </View>

              {/* Info */}
              <View style={s.detalleGrid}>
                <View style={s.detalleItem}>
                  <Text style={s.detalleLabel}>Tipo</Text>
                  <Text style={s.detalleValue}>{detalle.tipo_novedad}</Text>
                </View>
                <View style={s.detalleItem}>
                  <Text style={s.detalleLabel}>Prioridad</Text>
                  <Text style={[s.detalleValue, { color: COLOR_PRIORIDAD[detalle.prioridad] || "#aaa" }]}>
                    {detalle.prioridad}
                  </Text>
                </View>
                {detalle.cliente_info && (
                  <View style={s.detalleItem}>
                    <Text style={s.detalleLabel}>Cliente</Text>
                    <Text style={s.detalleValue}>{detalle.cliente_info.nombre}</Text>
                  </View>
                )}
                {detalle.pedido_info_completo && (
                  <View style={s.detalleItem}>
                    <Text style={s.detalleLabel}>Pedido</Text>
                    <Text style={s.detalleValue}>#{detalle.pedido_info_completo.id_pedido}</Text>
                  </View>
                )}
                {detalle.cita_info_completo && (
                  <View style={s.detalleItem}>
                    <Text style={s.detalleLabel}>Cita</Text>
                    <Text style={s.detalleValue}>
                      {fmtFecha(detalle.cita_info_completo.fecha)} {detalle.cita_info_completo.hora}
                    </Text>
                  </View>
                )}
                <View style={s.detalleItem}>
                  <Text style={s.detalleLabel}>Fecha</Text>
                  <Text style={s.detalleValue}>{fmtFechaHora(detalle.fecha_reporte)}</Text>
                </View>
                {detalle.lugar_ocurrencia && (
                  <View style={s.detalleItemFull}>
                    <Text style={s.detalleLabel}>Lugar</Text>
                    <Text style={s.detalleValue}>{detalle.lugar_ocurrencia}</Text>
                  </View>
                )}
              </View>

              {/* Descripción */}
              <View style={s.detalleSection}>
                <Text style={s.detalleSectionTitle}>Descripción</Text>
                <Text style={s.detalleDesc}>{detalle.descripcion_novedad}</Text>
              </View>

              {/* Evidencias */}
              {detalle.evidencias && detalle.evidencias.length > 0 && (
                <View style={s.detalleSection}>
                  <Text style={s.detalleSectionTitle}>Evidencia</Text>
                  <View style={s.evidenciasGrid}>
                    {detalle.evidencias.map((e) => (
                      <Pressable key={e.id_evidencia_n} style={s.evidenciaThumb}>
                        <Image source={{ uri: e.url }} style={s.evidenciaThumbImg} />
                        {e.fecha_subida && (
                          <Text style={s.evidenciaThumbFecha}>{fmtFecha(e.fecha_subida)}</Text>
                        )}
                      </Pressable>
                    ))}
                  </View>
                </View>
              )}

              {/* Historial */}
              {detalle.historial && detalle.historial.length > 0 && (
                <View style={s.detalleSection}>
                  <Text style={s.detalleSectionTitle}>Historial</Text>
                  {detalle.historial.map((h, idx) => (
                    <View
                      key={h.id_historial}
                      style={[
                        s.historialItem,
                        idx === 0 && s.historialItemActive,
                      ]}
                    >
                      <View style={[s.historialDot, idx === 0 && { backgroundColor: C.oro }]} />
                      <View style={s.historialContent}>
                        <Text style={s.historialAccion}>{h.accion}</Text>
                        {h.detalle && <Text style={s.historialDetalle}>{h.detalle}</Text>}
                        <Text style={s.historialMeta}>
                          {h.usuario_nombre || "Sistema"} · {fmtFechaHora(h.fecha)}
                        </Text>
                      </View>
                    </View>
                  ))}
                </View>
              )}

              {/* Acción admin */}
              {detalle.accion_admin && (
                <View style={[s.detalleSection, { backgroundColor: "rgba(46,160,67,0.08)", borderRadius: 10, padding: 12 }]}>
                  <Text style={[s.detalleSectionTitle, { color: "#46d06f" }]}>Respuesta del admin</Text>
                  <Text style={s.detalleDesc}>{detalle.accion_admin}</Text>
                </View>
              )}
            </ScrollView>
          )}
        </View>
      </Modal>
    </View>
  );
}

// ── Estilos ──────────────────────────────────────────────────

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#000" },
  header: { paddingHorizontal: 20, paddingBottom: 12 },
  headerTitle: { fontFamily: FontFamilies.bodyBold, fontSize: 22, color: "#fff" },
  headerSub: { fontFamily: FontFamilies.body, fontSize: 13, color: "#8a8a8a", marginTop: 2 },

  // Toast
  toast: { marginHorizontal: 20, marginBottom: 10, padding: 12, borderRadius: 10 },
  toastOk: { backgroundColor: "rgba(46,160,67,0.15)", borderWidth: 1, borderColor: "rgba(46,160,67,0.4)" },
  toastErr: { backgroundColor: "rgba(229,72,77,0.15)", borderWidth: 1, borderColor: "rgba(229,72,77,0.4)" },
  toastText: { fontFamily: FontFamilies.body, fontSize: 13, color: "#fff", textAlign: "center" },

  // Pills
  pillsRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, paddingHorizontal: 20, marginBottom: 10 },
  pill: { paddingVertical: 6, paddingHorizontal: 12, borderRadius: 20, backgroundColor: "rgba(255,255,255,0.06)", borderWidth: 1, borderColor: "rgba(255,255,255,0.1)" },
  pillActive: { backgroundColor: C.oro, borderColor: C.oro },
  pillText: { fontFamily: FontFamilies.body, fontSize: 11, color: "#8a8a8a" },
  pillTextActive: { color: "#000", fontFamily: FontFamilies.bodyBold },

  // Search
  searchRow: { paddingHorizontal: 20, marginBottom: 10 },

  // Botón nueva
  btnNueva: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, marginHorizontal: 20, marginBottom: 14, padding: 12, borderRadius: 12, backgroundColor: C.oro },
  btnNuevaText: { fontFamily: FontFamilies.bodyBold, fontSize: 14, color: "#000" },

  // Center states
  center: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 40 },
  centerTitle: { fontFamily: FontFamilies.bodyBold, fontSize: 16, color: "#fff", marginTop: 12 },
  centerText: { fontFamily: FontFamilies.body, fontSize: 13, color: "#8a8a8a", textAlign: "center", marginTop: 6 },

  // Lista
  list: { flex: 1, paddingHorizontal: 20 },

  // Card
  card: { backgroundColor: "rgba(24,24,24,0.9)", borderWidth: 1, borderColor: "rgba(211,172,77,0.2)", borderRadius: 14, padding: 14, marginBottom: 10 },
  cardTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 6 },
  cardId: { fontFamily: FontFamilies.bodyBold, fontSize: 14, color: C.oro },
  badge: { paddingVertical: 3, paddingHorizontal: 10, borderRadius: 20, borderWidth: 1 },
  badgeText: { fontFamily: FontFamilies.bodyBold, fontSize: 10 },
  cardTipo: { fontFamily: FontFamilies.bodyBold, fontSize: 13, color: "#fff", marginBottom: 6 },
  cardMeta: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginBottom: 6 },
  cardMetaItem: { flexDirection: "row", alignItems: "center", gap: 4 },
  cardMetaText: { fontFamily: FontFamilies.body, fontSize: 11, color: "#8a8a8a" },
  cardBottom: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  cardFecha: { fontFamily: FontFamilies.body, fontSize: 11, color: "#666" },
  prioridadDot: { width: 8, height: 8, borderRadius: 4 },
  evidenciaCount: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: "rgba(255,255,255,0.06)" },
  evidenciaCountText: { fontFamily: FontFamilies.body, fontSize: 11, color: C.oro },

  // Modal
  modal: { flex: 1, backgroundColor: "#0a0a0a" },
  modalHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 20, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: "rgba(255,255,255,0.06)" },
  modalTitle: { fontFamily: FontFamilies.bodyBold, fontSize: 16, color: "#fff" },
  modalBody: { flex: 1, paddingHorizontal: 20, paddingTop: 16 },

  // Steps
  stepsRow: { flexDirection: "row", justifyContent: "center", gap: 20, paddingVertical: 14, paddingHorizontal: 20 },
  stepContainer: { alignItems: "center", gap: 4 },
  stepDot: { width: 28, height: 28, borderRadius: 14, backgroundColor: "rgba(255,255,255,0.08)", borderWidth: 1, borderColor: "rgba(255,255,255,0.15)", alignItems: "center", justifyContent: "center" },
  stepDotActive: { backgroundColor: C.oro, borderColor: C.oro },
  stepDotDone: { backgroundColor: "rgba(212,165,75,0.3)", borderColor: C.oro },
  stepDotText: { fontFamily: FontFamilies.bodyBold, fontSize: 11, color: "#555" },
  stepDotTextActive: { color: "#000" },
  stepLabel: { fontFamily: FontFamilies.body, fontSize: 10, color: "#666" },
  stepLabelActive: { color: C.oro, fontFamily: FontFamilies.bodyBold },

  // Section
  sectionTitle: { fontFamily: FontFamilies.bodyBold, fontSize: 16, color: "#fff", marginBottom: 4 },
  sectionSub: { fontFamily: FontFamilies.body, fontSize: 12, color: "#8a8a8a", marginBottom: 14 },
  subsectionTitle: { fontFamily: FontFamilies.bodyBold, fontSize: 13, color: C.oro, marginBottom: 8, marginTop: 4 },

  // Search input
  searchInputWrap: { flexDirection: "row", alignItems: "center", backgroundColor: "#161616", borderWidth: 1, borderColor: "rgba(255,255,255,0.1)", borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, marginBottom: 12 },
  searchInput: { flex: 1, fontFamily: FontFamilies.body, fontSize: 14, color: "#fff" },

  // Clientes
  clientesList: { gap: 6 },
  clienteItem: { flexDirection: "row", alignItems: "center", gap: 10, padding: 12, backgroundColor: "rgba(255,255,255,0.03)", borderWidth: 1, borderColor: "rgba(255,255,255,0.08)", borderRadius: 12 },
  clienteAvatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: "rgba(212,165,75,0.15)", borderWidth: 1, borderColor: "rgba(212,165,75,0.3)", alignItems: "center", justifyContent: "center" },
  clienteAvatarText: { fontFamily: FontFamilies.bodyBold, fontSize: 11, color: C.oro },
  clienteItemNombre: { fontFamily: FontFamilies.bodyBold, fontSize: 13, color: "#fff" },
  clienteItemDetalle: { fontFamily: FontFamilies.body, fontSize: 11, color: "#8a8a8a" },
  clienteSeleccionado: { flexDirection: "row", alignItems: "center", gap: 8, padding: 12, backgroundColor: "rgba(212,165,75,0.08)", borderWidth: 1, borderColor: "rgba(212,165,75,0.3)", borderRadius: 12, marginBottom: 12 },
  clienteNombre: { fontFamily: FontFamilies.bodyBold, fontSize: 13, color: "#fff" },
  clienteDetalle: { fontFamily: FontFamilies.body, fontSize: 11, color: "#8a8a8a" },
  noResultados: { fontFamily: FontFamilies.body, fontSize: 13, color: "#666", textAlign: "center", marginTop: 20 },

  // Origen cards
  origenCard: { padding: 12, backgroundColor: "rgba(255,255,255,0.03)", borderWidth: 1, borderColor: "rgba(255,255,255,0.08)", borderRadius: 12, marginBottom: 8 },
  origenCardActive: { borderColor: C.oro, backgroundColor: "rgba(212,165,75,0.06)" },
  origenCardHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 4 },
  origenCardTitle: { fontFamily: FontFamilies.bodyBold, fontSize: 13, color: "#fff" },
  origenCardMeta: { fontFamily: FontFamilies.body, fontSize: 12, color: "#8a8a8a", marginBottom: 2 },
  origenCardProductos: { fontFamily: FontFamilies.body, fontSize: 11, color: "#666" },
  origenCardEstado: { fontFamily: FontFamilies.body, fontSize: 11, color: "#8a8a8a", marginTop: 2 },
  origenCardDireccion: { fontFamily: FontFamilies.body, fontSize: 11, color: "#666", marginTop: 2 },
  miniBadge: { paddingVertical: 2, paddingHorizontal: 8, borderRadius: 10 },
  miniBadgeText: { fontFamily: FontFamilies.body, fontSize: 10, color: "#ccc" },

  // Resumen origen
  resumenOrigen: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 16, padding: 10, backgroundColor: "rgba(255,255,255,0.03)", borderRadius: 10, borderWidth: 1, borderColor: "rgba(255,255,255,0.06)" },
  resumenItem: { flexDirection: "row", alignItems: "center", gap: 6 },
  resumenText: { fontFamily: FontFamilies.body, fontSize: 12, color: "#ccc" },

  // Tipo
  tipoGrid: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginBottom: 16 },
  tipoBtn: { flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 8, paddingHorizontal: 12, borderRadius: 10, backgroundColor: "rgba(255,255,255,0.04)", borderWidth: 1, borderColor: "rgba(255,255,255,0.08)" },
  tipoBtnActive: { backgroundColor: C.oro, borderColor: C.oro },
  tipoBtnText: { fontFamily: FontFamilies.body, fontSize: 11, color: "#ccc" },
  tipoBtnTextActive: { color: "#000", fontFamily: FontFamilies.bodyBold },

  // Prioridad
  prioridadRow: { flexDirection: "row", gap: 8, marginBottom: 16 },
  prioridadBtn: { flex: 1, paddingVertical: 8, borderRadius: 10, borderWidth: 1, alignItems: "center" },
  prioridadBtnText: { fontFamily: FontFamilies.body, fontSize: 12 },

  // Fields
  fieldLabel: { fontFamily: FontFamilies.bodyBold, fontSize: 12, color: "#ccc", marginBottom: 6, marginTop: 4 },
  input: { backgroundColor: "#161616", borderWidth: 1, borderColor: "rgba(255,255,255,0.1)", borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontFamily: FontFamilies.body, fontSize: 14, color: "#fff", marginBottom: 14 },
  textArea: { backgroundColor: "#161616", borderWidth: 1, borderColor: "rgba(255,255,255,0.1)", borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontFamily: FontFamilies.body, fontSize: 14, color: "#fff", marginBottom: 14, minHeight: 100 },

  // Buttons
  btnSiguiente: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, padding: 14, borderRadius: 12, backgroundColor: C.oro, marginTop: 10 },
  btnSiguienteText: { fontFamily: FontFamilies.bodyBold, fontSize: 14, color: "#000" },
  btnEnviar: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, padding: 14, borderRadius: 12, backgroundColor: C.oro, flex: 2 },
  btnEnviarText: { fontFamily: FontFamilies.bodyBold, fontSize: 14, color: "#000" },
  btnDisabled: { opacity: 0.5 },

  // Evidencia
  evidenciaActions: { flexDirection: "row", gap: 12 },
  evidenciaActionBtn: { flex: 1, alignItems: "center", padding: 20, backgroundColor: "rgba(255,255,255,0.03)", borderWidth: 1, borderColor: "rgba(255,255,255,0.08)", borderRadius: 14 },
  evidenciaActionIcon: { width: 52, height: 52, borderRadius: 26, backgroundColor: "rgba(212,165,75,0.12)", borderWidth: 1, borderColor: "rgba(212,165,75,0.3)", alignItems: "center", justifyContent: "center", marginBottom: 10 },
  evidenciaActionTitle: { fontFamily: FontFamilies.bodyBold, fontSize: 13, color: "#fff" },
  evidenciaActionSub: { fontFamily: FontFamilies.body, fontSize: 11, color: "#8a8a8a", marginTop: 2 },
  evidenciaPreview: { borderRadius: 14, overflow: "hidden", marginBottom: 16 },
  evidenciaImg: { width: "100%", height: 220, borderRadius: 14 },
  evidenciaOverlay: { flexDirection: "row", justifyContent: "center", gap: 12, padding: 10, backgroundColor: "rgba(0,0,0,0.7)" },
  evidenciaBtn: { flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 8, paddingHorizontal: 14, borderRadius: 10, backgroundColor: "rgba(255,255,255,0.15)" },
  evidenciaBtnText: { fontFamily: FontFamilies.body, fontSize: 12, color: "#fff" },

  // Detalle
  detalleGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 14, marginBottom: 16 },
  detalleItem: { width: "48%" },
  detalleItemFull: { width: "100%" },
  detalleLabel: { fontFamily: FontFamilies.body, fontSize: 10, color: "#8a8a8a", textTransform: "uppercase", letterSpacing: 0.5 },
  detalleValue: { fontFamily: FontFamilies.bodyBold, fontSize: 13, color: "#fff", marginTop: 2 },
  detalleSection: { marginBottom: 16, padding: 12, backgroundColor: "rgba(255,255,255,0.02)", borderWidth: 1, borderColor: "rgba(255,255,255,0.06)", borderRadius: 12 },
  detalleSectionTitle: { fontFamily: FontFamilies.bodyBold, fontSize: 13, color: C.oro, marginBottom: 8 },
  detalleDesc: { fontFamily: FontFamilies.body, fontSize: 13, color: "#ccc", lineHeight: 20 },

  // Evidencias grid
  evidenciasGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  evidenciaThumb: { width: 90, borderRadius: 10, overflow: "hidden", backgroundColor: "#222" },
  evidenciaThumbImg: { width: "100%", height: 90 },
  evidenciaThumbFecha: { fontFamily: FontFamilies.body, fontSize: 9, color: "#8a8a8a", textAlign: "center", padding: 4 },

  // Historial
  historialItem: { flexDirection: "row", gap: 10, padding: 10, borderLeftWidth: 2, borderLeftColor: "rgba(255,255,255,0.08)", marginBottom: 6, borderRadius: 6 },
  historialItemActive: { borderLeftColor: C.oro, backgroundColor: "rgba(212,165,75,0.04)" },
  historialDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: "#555", marginTop: 4 },
  historialContent: { flex: 1 },
  historialAccion: { fontFamily: FontFamilies.bodyBold, fontSize: 12, color: "#fff" },
  historialDetalle: { fontFamily: FontFamilies.body, fontSize: 11, color: "#aaa", marginTop: 2 },
  historialMeta: { fontFamily: FontFamilies.body, fontSize: 10, color: "#666", marginTop: 4 },
});
