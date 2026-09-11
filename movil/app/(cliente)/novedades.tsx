// ─────────────────────────────────────────────────────────────
// Novedades del cliente — solo lectura.
// Muestra las novedades visibles para el cliente, incluyendo
// mensajes y soluciones del administrador.
// ─────────────────────────────────────────────────────────────

import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import FontAwesome6 from "@expo/vector-icons/FontAwesome6";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { NeodomusColors as C, FontFamilies } from "@/constants/theme";
import { useScrollTopAlEntrar } from "@/hooks/useScrollTopAlEntrar";
import {
  Novedad,
  NovedadDetalle,
  TIPOS_NOVEDAD,
  listarNovedadesCliente,
} from "@/services/novedades.service";

const fmtFecha = (f?: string | null) => {
  if (!f) return "—";
  return new Date(f).toLocaleDateString("es-CO", {
    day: "2-digit", month: "short", year: "numeric",
  });
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

const COLOR_ESTADO: Record<string, { bg: string; border: string }> = {
  Pendiente: { bg: "rgba(246,195,68,0.12)", border: "rgba(246,195,68,0.25)" },
  "En revisión": { bg: "rgba(131,165,233,0.12)", border: "rgba(131,165,233,0.25)" },
  Aprobada: { bg: "rgba(126,226,154,0.12)", border: "rgba(126,226,154,0.25)" },
  Resuelta: { bg: "rgba(126,226,154,0.15)", border: "rgba(126,226,154,0.3)" },
  Cerrada: { bg: "rgba(255,255,255,0.06)", border: "rgba(255,255,255,0.1)" },
  Rechazada: { bg: "rgba(240,133,138,0.12)", border: "rgba(240,133,138,0.25)" },
};

export default function NovedadesClienteScreen() {
  const insets = useSafeAreaInsets();
  const scrollRef = useRef(null);
  useScrollTopAlEntrar(scrollRef);

  const [novedades, setNovedades] = useState<Novedad[]>([]);
  const [cargando, setCargando] = useState(true);
  const [toast, setToast] = useState<{ msg: string; tipo: "ok" | "err" } | null>(null);
  const [detalle, setDetalle] = useState<NovedadDetalle | null>(null);
  const [cargandoDetalle, setCargandoDetalle] = useState(false);

  const cargar = useCallback(async (silencioso = false) => {
    if (!silencioso) setCargando(true);
    try {
      const data = await listarNovedadesCliente();
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

  const abrirDetalle = async (id: number) => {
    setCargandoDetalle(true);
    try {
      const { obtenerNovedad } = await import("@/services/novedades.service");
      const data = await obtenerNovedad(id);
      setDetalle(data);
    } catch {
      setToast({ msg: "Error al cargar detalle", tipo: "err" });
    } finally {
      setCargandoDetalle(false);
    }
  };

  return (
    <View style={[s.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={s.header}>
        <Text style={s.headerTitle}>Mis novedades</Text>
        <Text style={s.headerSub}>Seguimiento de incidencias y soluciones</Text>
      </View>

      {/* Toast */}
      {toast && (
        <View style={[s.toast, toast.tipo === "ok" ? s.toastOk : s.toastErr]}>
          <Text style={s.toastText}>{toast.msg}</Text>
        </View>
      )}

      {cargando ? (
        <View style={s.center}>
          <ActivityIndicator size="large" color={C.oro} />
          <Text style={s.centerText}>Cargando novedades...</Text>
        </View>
      ) : novedades.length === 0 ? (
        <View style={s.center}>
          <FontAwesome6 name="shield-halved" size={40} color={C.oro + "50"} />
          <Text style={s.centerTitle}>Sin novedades</Text>
          <Text style={s.centerText}>No hay novedades visibles para tu cuenta</Text>
        </View>
      ) : (
        <ScrollView
          ref={scrollRef}
          style={s.list}
          contentContainerStyle={{ paddingBottom: insets.bottom + 20 }}
        >
          {novedades.map((n) => (
            <Pressable
              key={n.id_novedad}
              style={s.card}
              onPress={() => abrirDetalle(n.id_novedad)}
            >
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
                <View style={[s.prioridadDot, { backgroundColor: C.oro }]} />
              </View>
              {n.evidencias && n.evidencias.length > 0 && (
                <View style={s.evidenciaCount}>
                  <FontAwesome6 name="camera" size={10} color={C.oro} />
                  <Text style={s.evidenciaCountText}>{n.evidencias.length} evidencia(s)</Text>
                </View>
              )}
              {n.mensaje_cliente && (
                <View style={s.cardMensaje}>
                  <FontAwesome6 name="paper-plane" size={10} color="#d4a54b" />
                  <Text style={s.cardMensajeText}>Mensaje del admin</Text>
                </View>
              )}
              {n.solucion_cliente && (
                <View style={s.cardSolucion}>
                  <FontAwesome6 name="check-circle" size={10} color="#46d06f" />
                  <Text style={s.cardSolucionText}>Solución disponible</Text>
                </View>
              )}
            </Pressable>
          ))}
        </ScrollView>
      )}

      {/* Modal de detalle */}
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
              <View style={[s.badgeModal, { backgroundColor: COLOR_ESTADO[detalle.estado_novedad]?.bg || "#222", borderColor: COLOR_ESTADO[detalle.estado_novedad]?.border || "#444" }]}>
                <Text style={[s.badgeText, { color: C.oro }]}>{detalle.estado_novedad}</Text>
              </View>

              <View style={s.detalleGrid}>
                <View style={s.detalleItem}>
                  <Text style={s.detalleLabel}>Tipo</Text>
                  <Text style={s.detalleValue}>{detalle.tipo_novedad}</Text>
                </View>
                <View style={s.detalleItem}>
                  <Text style={s.detalleLabel}>Prioridad</Text>
                  <Text style={[s.detalleValue, { color: C.oro }]}>{detalle.prioridad}</Text>
                </View>
                <View style={s.detalleItem}>
                  <Text style={s.detalleLabel}>Fecha</Text>
                  <Text style={s.detalleValue}>{fmtFecha(detalle.fecha_reporte)}</Text>
                </View>
                {detalle.cliente_info && (
                  <View style={s.detalleItem}>
                    <Text style={s.detalleLabel}>Cliente</Text>
                    <Text style={s.detalleValue}>{detalle.cliente_info.nombre}</Text>
                  </View>
                )}
              </View>

              {detalle.lugar_ocurrencia && (
                <View style={s.detalleItemFull}>
                  <Text style={s.detalleLabel}>Lugar</Text>
                  <Text style={s.detalleValue}>{detalle.lugar_ocurrencia}</Text>
                </View>
              )}

              <View style={s.detalleSection}>
                <Text style={s.detalleSectionTitle}>Descripción</Text>
                <Text style={s.detalleDesc}>{detalle.descripcion_novedad}</Text>
              </View>

              {detalle.mensaje_cliente && (
                <View style={[s.detalleSection, { backgroundColor: "rgba(212,165,75,0.08)", borderRadius: 10, padding: 12 }]}>
                  <Text style={[s.detalleSectionTitle, { color: "#d4a54b" }]}>Mensaje del administrador</Text>
                  <Text style={s.detalleDesc}>{detalle.mensaje_cliente}</Text>
                </View>
              )}

              {detalle.solucion_cliente && (
                <View style={[s.detalleSection, { backgroundColor: "rgba(46,160,67,0.08)", borderRadius: 10, padding: 12 }]}>
                  <Text style={[s.detalleSectionTitle, { color: "#46d06f" }]}>Solución para el cliente</Text>
                  <Text style={s.detalleDesc}>{detalle.solucion_cliente}</Text>
                </View>
              )}

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

              {detalle.historial && detalle.historial.length > 0 && (
                <View style={s.detalleSection}>
                  <Text style={s.detalleSectionTitle}>Historial</Text>
                  {detalle.historial.map((h, idx) => (
                    <View key={h.id_historial} style={[s.historialItem, idx === 0 && s.historialItemActive]}>
                      <View style={[s.historialDot, idx === 0 && { backgroundColor: C.oro }]} />
                      <View style={s.historialContent}>
                        <Text style={s.historialAccion}>{h.accion}</Text>
                        {h.detalle && <Text style={s.historialDetalle}>{h.detalle}</Text>}
                        <Text style={s.historialMeta}>{h.usuario_nombre || "Sistema"} · {fmtFecha(h.fecha)}</Text>
                      </View>
                    </View>
                  ))}
                </View>
              )}
            </ScrollView>
          )}
        </View>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#000" },
  header: { paddingHorizontal: 20, paddingBottom: 12 },
  headerTitle: { fontFamily: FontFamilies.bodyBold, fontSize: 22, color: "#fff" },
  headerSub: { fontFamily: FontFamilies.body, fontSize: 13, color: "#8a8a8a", marginTop: 2 },
  toast: { marginHorizontal: 20, marginBottom: 10, padding: 12, borderRadius: 10 },
  toastOk: { backgroundColor: "rgba(46,160,67,0.15)", borderWidth: 1, borderColor: "rgba(46,160,67,0.4)" },
  toastErr: { backgroundColor: "rgba(229,72,77,0.15)", borderWidth: 1, borderColor: "rgba(229,72,77,0.4)" },
  toastText: { fontFamily: FontFamilies.body, fontSize: 13, color: "#fff", textAlign: "center" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 40 },
  centerTitle: { fontFamily: FontFamilies.bodyBold, fontSize: 16, color: "#fff", marginTop: 12 },
  centerText: { fontFamily: FontFamilies.body, fontSize: 13, color: "#8a8a8a", textAlign: "center", marginTop: 6 },
  list: { flex: 1, paddingHorizontal: 20 },
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
  cardMensaje: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 6 },
  cardMensajeText: { fontFamily: FontFamilies.body, fontSize: 10, color: "#d4a54b" },
  cardSolucion: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 4 },
  cardSolucionText: { fontFamily: FontFamilies.body, fontSize: 10, color: "#46d06f" },
  modal: { flex: 1, backgroundColor: "#0a0a0a" },
  modalHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 20, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: "rgba(255,255,255,0.06)" },
  modalTitle: { fontFamily: FontFamilies.bodyBold, fontSize: 16, color: "#fff" },
  modalBody: { flex: 1, paddingHorizontal: 20, paddingTop: 16 },
  badgeModal: { alignSelf: "flex-start" },
  detalleGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 14, marginBottom: 16 },
  detalleItem: { width: "48%" },
  detalleItemFull: { width: "100%" },
  detalleLabel: { fontFamily: FontFamilies.body, fontSize: 10, color: "#8a8a8a", textTransform: "uppercase", letterSpacing: 0.5 },
  detalleValue: { fontFamily: FontFamilies.bodyBold, fontSize: 13, color: "#fff", marginTop: 2 },
  detalleSection: { marginBottom: 16, padding: 12, backgroundColor: "rgba(255,255,255,0.02)", borderWidth: 1, borderColor: "rgba(255,255,255,0.06)", borderRadius: 12 },
  detalleSectionTitle: { fontFamily: FontFamilies.bodyBold, fontSize: 13, color: C.oro, marginBottom: 8 },
  detalleDesc: { fontFamily: FontFamilies.body, fontSize: 13, color: "#ccc", lineHeight: 20 },
  evidenciasGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  evidenciaThumb: { width: 90, borderRadius: 10, overflow: "hidden", backgroundColor: "#222" },
  evidenciaThumbImg: { width: "100%", height: 90 },
  evidenciaThumbFecha: { fontFamily: FontFamilies.body, fontSize: 9, color: "#8a8a8a", textAlign: "center", padding: 4 },
  historialItem: { flexDirection: "row", gap: 10, padding: 10, borderLeftWidth: 2, borderLeftColor: "rgba(255,255,255,0.08)", marginBottom: 6, borderRadius: 6 },
  historialItemActive: { borderLeftColor: C.oro, backgroundColor: "rgba(212,165,75,0.04)" },
  historialDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: "#555", marginTop: 4 },
  historialContent: { flex: 1 },
  historialAccion: { fontFamily: FontFamilies.bodyBold, fontSize: 12, color: "#fff" },
  historialDetalle: { fontFamily: FontFamilies.body, fontSize: 11, color: "#aaa", marginTop: 2 },
  historialMeta: { fontFamily: FontFamilies.body, fontSize: 10, color: "#666", marginTop: 4 },
});
