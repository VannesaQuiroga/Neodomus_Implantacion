// Dashboard Técnico — adaptación móvil de fe/src/pages/tecnico/TechnicianDashboard.tsx
// Mantiene misma identidad, datos reales (/tecnicos/mis-citas, /tecnicos/mis-entregas, etc.),
// estructura, tarjetas, modales y animaciones (press/scale).

import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  Linking,
} from "react-native";
import FontAwesome6 from "@expo/vector-icons/FontAwesome6";
import * as FileSystem from "expo-file-system/legacy";
import * as ImagePicker from "expo-image-picker";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, { FadeInUp, FadeIn } from "react-native-reanimated";

import { FontFamilies, NeodomusColors as C } from "@/constants/theme";
import { useAuth } from "@/contexts/AuthContext";
import { useIdioma } from "@/contexts/IdiomaContext";
import { apiFetch, ApiError } from "@/services/api";
import { useScrollTopAlEntrar } from "@/hooks/useScrollTopAlEntrar";
import { useRouter } from "expo-router";

interface Cita {
  id_cita: number;
  fecha: string;
  hora: string;
  estado: string;
  tipo_servicio: string;
  cliente: string;
  direccion: string;
  telefono?: number | null;
  email?: string | null;
  documento_tipo?: string | null;
  documento_numero?: number | null;
  descripcion?: string | null;
  evidencias?: { id_evidencia: number; url: string; descripcion?: string | null }[];
  calificacion?: { calificacion: number; comentario?: string | null } | null;
}

interface Entrega {
  id_pedido: number;
  cliente: string;
  telefono?: number | null;
  email?: string | null;
  direccion?: string | null;
  fecha_entrega?: string | null;
  hora_entrega?: string | null;
  hora_entrega_fin?: string | null;
  estado_entrega?: string | null;
  evidencias_entrega?: string[];
  productos?: { descripcion: string; cantidad: number; subtotal: number }[];
}

interface Recogida {
  id_devolucion: number;
  id_pedido: number | null;
  producto: string;
  cliente: string;
  direccion: string;
  telefono?: number | null;
  estado_devolucion: string;
  preferencia?: string | null;
  recogida_estado: string;
  motivo?: string | null;
}

const ESTADOS_PROGRAMADA = ["Pendiente", "Confirmada"];
const fechaLocal = () => {
  const hoy = new Date();
  return `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, "0")}-${String(hoy.getDate()).padStart(2, "0")}`;
};

export default function TecnicoDashboard() {
  const { usuario } = useAuth();
  const { t } = useIdioma();
  const insets = useSafeAreaInsets();
  const scrollRef = useRef<ScrollView>(null);
  const router = useRouter();
  useScrollTopAlEntrar(scrollRef);

  const [citas, setCitas] = useState<Cita[]>([]);
  const [entregas, setEntregas] = useState<Entrega[]>([]);
  const [recogidas, setRecogidas] = useState<Recogida[]>([]);
  const [calificaciones, setCalificaciones] = useState<any>({});
  const [novedades, setNovedades] = useState<any[]>([]);
  const [notificaciones, setNotificaciones] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCita, setSelectedCita] = useState<Cita | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [updatingId, setUpdatingId] = useState<number | null>(null);
  const [busqueda, setBusqueda] = useState("");
  const [toast, setToast] = useState<string | null>(null);
  const [marcandoLeidas, setMarcandoLeidas] = useState(false);
  const [recogiendoId, setRecogiendoId] = useState<number | null>(null);
  const [confirmRecogida, setConfirmRecogida] = useState<Entrega | null>(null);

  const fetchAll = async () => {
    setLoading(true);
    try {
      const [citasRes, entregasRes, califRes, recogRes, novedRes, notifRes] = await Promise.allSettled([
        apiFetch<Cita[]>("/tecnicos/mis-citas"),
        apiFetch<Entrega[]>("/tecnicos/mis-entregas"),
        apiFetch<any>("/calificaciones/mis"),
        apiFetch<Recogida[]>("/devoluciones/mis-recogidas"),
        apiFetch<any[]>("/novedades/mis-novedades").catch(() => []),
        apiFetch<any[]>("/notificaciones/mias").catch(() => []),
      ]);
      if (citasRes.status === "fulfilled") setCitas(citasRes.value || []);
      if (entregasRes.status === "fulfilled") setEntregas(entregasRes.value || []);
      if (califRes.status === "fulfilled") setCalificaciones(califRes.value || {});
      if (recogRes.status === "fulfilled") setRecogidas((recogRes.value as any) || []);
      if (novedRes.status === "fulfilled") setNovedades((novedRes.value as any) || []);
      if (notifRes.status === "fulfilled") setNotificaciones((notifRes.value as any) || []);
    } catch {}
    setLoading(false);
  };

  useEffect(() => {
    fetchAll();
    const id = setInterval(fetchAll, 60000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(t);
  }, [toast]);

  const hoy = fechaLocal();
  const q = busqueda.trim().toLowerCase();
  const coincide = (c: Cita) => {
    if (!q) return true;
    return [c.cliente, c.direccion, c.tipo_servicio, c.fecha, c.hora, c.estado].some((v) => (v || "").toLowerCase().includes(q));
  };
  const coincideEntrega = (e: Entrega) => {
    if (!q) return true;
    return [e.cliente, String(e.id_pedido), e.direccion || "", e.fecha_entrega || "", e.hora_entrega || ""].some((v) => v.toLowerCase().includes(q));
  };

  const citasHoy = citas.filter((c) => c.fecha === hoy && c.estado !== "Cancelada" && c.estado !== "Finalizada");
  const citasProximas = citas.filter((c) => c.fecha > hoy && ESTADOS_PROGRAMADA.includes(c.estado) && coincide(c));
  const citasAtrasadas = citas.filter((c) => c.fecha < hoy && ESTADOS_PROGRAMADA.includes(c.estado) && coincide(c));
  const citasProgramadas = citas.filter((c) => ESTADOS_PROGRAMADA.includes(c.estado));
  const citasCompletadas = citas.filter((c) => c.estado === "Finalizada");
  const historial = citas.filter((c) => (c.estado === "Finalizada" || c.estado === "Cancelada") && coincide(c)).slice(0, 5);
  const entregasVisibles = entregas.filter((e) => !(e.estado_entrega === "Entregado" && (e.evidencias_entrega || []).length > 0)).filter(coincideEntrega);

  const fechaHoyTexto = new Date().toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  const nombreTecnico = usuario?.nombre?.split(" ")[0] || "Técnico";

  const actualizarEstado = async (id_cita: number, nuevoEstado: string) => {
    setUpdatingId(id_cita);
    try {
      await apiFetch(`/tecnicos/citas/${id_cita}/estado`, { method: "PUT", body: JSON.stringify({ estado: nuevoEstado }) });
      setToast(nuevoEstado === "Finalizada" ? "Cita completada" : "Estado actualizado");
      setModalOpen(false);
      setSelectedCita(null);
      fetchAll();
    } catch (e: any) {
      setToast(e?.message || "Error al actualizar");
    }
    setUpdatingId(null);
  };

  const openModal = (cita: Cita) => {
    setSelectedCita(cita);
    setModalOpen(true);
  };

  const marcarTodasLeidas = async () => {
    if (notificaciones.length === 0 || marcandoLeidas) return;
    setMarcandoLeidas(true);
    try {
      await apiFetch("/notificaciones/leer-todas", { method: "PATCH" });
      setNotificaciones((prev) => prev.map((n: any) => ({ ...n, leida: true, read: true })));
      setToast("Notificaciones marcadas como leídas");
    } catch (e: any) {
      setToast(e?.message || "Error al marcar como leídas");
    }
    setMarcandoLeidas(false);
  };

  const handleYaRecogi = (entrega: Entrega) => {
    setConfirmRecogida(entrega);
  };

  const confirmarRecogida = async () => {
    if (!confirmRecogida) return;
    setRecogiendoId(confirmRecogida.id_pedido);
    try {
      await apiFetch(`/tecnicos/entregas/${confirmRecogida.id_pedido}/estado`, {
        method: "PUT",
        body: JSON.stringify({ estado: "Recogido" }),
      });
      setToast("Entrega marcada como recogida");
      setConfirmRecogida(null);
      fetchAll();
    } catch (e: any) {
      setToast(e?.message || "Error al actualizar entrega");
    }
    setRecogiendoId(null);
  };

  if (loading) {
    return (
      <View style={styles.centro}>
        <ActivityIndicator size="large" color={C.oro} />
        <Text style={styles.cargando}>Cargando dashboard...</Text>
      </View>
    );
  }

  return (
    <View style={styles.pantalla}>
      <ScrollView
        ref={scrollRef}
        style={styles.scroll}
        contentContainerStyle={[styles.contenido, { paddingBottom: insets.bottom + 72 }]}
        showsVerticalScrollIndicator={false}
      >
        <Animated.View entering={FadeInUp.duration(400)} style={styles.header}>
            <Text style={styles.bienvenida}>{t("tecnico.hola", { nombre: nombreTecnico })}</Text>
            <Text style={styles.subtitulo}>{t("tecnico.resumenJornada")}</Text>
            <View style={styles.fechaBadge}>
              <FontAwesome6 name="calendar-check" size={12} color={C.oro} />
              <Text style={styles.fechaTexto}>{fechaHoyTexto}</Text>
            </View>
          </Animated.View>

        {/* Buscador - visible en Inicio, Citas, Entregas */}
        <Animated.View entering={FadeInUp.delay(100).duration(400)} style={styles.searchWrap}>
          <FontAwesome6 name="magnifying-glass" size={13} color="#6b6b6b" />
          <TextInput
            style={styles.searchInput}
            placeholder={t("tecnico.buscarPlaceholder")}
            placeholderTextColor="#6b6b6b"
            value={busqueda}
            onChangeText={setBusqueda}
          />
          {busqueda.length > 0 && (
            <Pressable onPress={() => setBusqueda("")} hitSlop={8}>
              <FontAwesome6 name="xmark" size={14} color="#6b6b6b" />
            </Pressable>
          )}
        </Animated.View>

        {/* Stats 2x2 - solo Inicio */}
        <View style={styles.statsGrid}>
          {[
            { icon: "calendar-check", val: citas.length, label: t("tecnico.citasAsignadas"), hint: t("tecnico.totalAgenda") },
            { icon: "sun", val: citasHoy.length, label: t("tecnico.citasHoy"), hint: t("tecnico.agendaDia") },
            { icon: "clock", val: citasProgramadas.length, label: t("tecnico.pendientes"), hint: t("tecnico.porAtender") },
            { icon: "circle-check", val: citasCompletadas.length, label: t("tecnico.completadas"), hint: t("tecnico.trabajosFinalizados") },
          ].map((s, i) => (
            <Animated.View key={s.label} entering={FadeInUp.delay(150 + i * 80).duration(400)} style={styles.statCard}>
              <View style={styles.statIcon}>
                <FontAwesome6 name={s.icon as any} size={16} color="#141414" />
              </View>
              <Text style={styles.statVal}>{s.val}</Text>
              <Text style={styles.statLabel}>{s.label}</Text>
              <Text style={styles.statHint}>{s.hint}</Text>
            </Animated.View>
          ))}
        </View>

        {/* Citas del día - Inicio y Citas */}
            <Seccion titulo={t("tecnico.citasDia")} icono="calendar-check" count={citasHoy.length}>
              {citasHoy.filter(coincide).length === 0 ? (
                <Empty icon="calendar-check" titulo={t("tecnico.sinCitasHoy")} hint={t("tecnico.sinCitasHoyHint")} />
              ) : (
                citasHoy.filter(coincide).map((c) => <CitaRow key={c.id_cita} cita={c} onVer={() => openModal(c)} />)
              )}
            </Seccion>

            <Seccion titulo={t("tecnico.proximasCitas")} icono="calendar-week" count={citasProximas.length}>
              {citasProximas.length === 0 ? (
                <Empty icon="calendar-week" titulo={t("tecnico.sinProximas")} hint={t("tecnico.sinProximasHint")} />
              ) : (
                citasProximas.slice(0, 5).map((c) => <CitaRow key={c.id_cita} cita={c} onVer={() => openModal(c)} />)
              )}
            </Seccion>

            {citasAtrasadas.length > 0 && (
              <Seccion titulo={t("tecnico.citasAtrasadas")} icono="circle-exclamation" alerta>
                {citasAtrasadas.map((c) => (
                  <CitaRow key={c.id_cita} cita={c} onVer={() => openModal(c)} />
                ))}
              </Seccion>
            )}

            <Seccion titulo={t("tecnico.historialReciente")} icono="clock-rotate-left">
              {historial.length === 0 ? (
                <Text style={styles.gris}>{t("tecnico.sinHistorial")}</Text>
              ) : (
                historial.map((c) => <CitaRow key={c.id_cita} cita={c} onVer={() => openModal(c)} />)
              )}
            </Seccion>

            <Seccion titulo={t("tecnico.misEntregas")} icono="truck-fast" count={entregasVisibles.length}>
          {entregasVisibles.length === 0 ? (
            <Text style={styles.gris}>{t("tecnico.sinEntregas")}</Text>
          ) : (
            entregasVisibles.slice(0, 5).map((e) => (
              <View key={e.id_pedido} style={styles.itemCardColumn}>
                <View style={styles.itemCardRow}>
                  <View style={styles.itemLeft}>
                    <View style={styles.iconCircle}>
                      <FontAwesome6 name="truck-fast" size={14} color="#f0c96f" />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.itemTitulo}>{e.cliente} · Pedido #{e.id_pedido}</Text>
                      <Text style={styles.itemSub}>{e.fecha_entrega || ""} {e.hora_entrega || ""} · {e.direccion || ""}</Text>
                      <Text style={styles.itemSub}>{e.telefono || ""}</Text>
                    </View>
                  </View>
                  <View style={[styles.badge, e.estado_entrega === "Entregado" ? styles.badgeOk : e.estado_entrega === "En camino" ? styles.badgeInfo : styles.badgePend]}>
                    <Text style={styles.badgeTxt}>{e.estado_entrega || "Asignada"}</Text>
                  </View>
                </View>
                {(e.estado_entrega === "Asignada" || !e.estado_entrega) && (
                  <Pressable
                    onPress={() => handleYaRecogi(e)}
                    disabled={recogiendoId === e.id_pedido}
                    style={[styles.btnRecogida, recogiendoId === e.id_pedido && { opacity: 0.6 }]}
                  >
                    <FontAwesome6 name="box-open" size={12} color="#141414" />
                    <Text style={styles.btnRecogidaTxt}>{recogiendoId === e.id_pedido ? t("entregas.actualizando") : t("entregas.yaRecogi")}</Text>
                  </Pressable>
                )}
              </View>
            ))
          )}
        </Seccion>

        <Seccion titulo={t("tecnico.recogidasDevolucion")} icono="box-open" count={recogidas.length}>
          {recogidas.length === 0 ? (
            <Text style={styles.gris}>{t("tecnico.sinRecogidas")}</Text>
          ) : (
            <>
              {recogidas.slice(0, 5).map((r) => (
                <View key={r.id_devolucion} style={styles.itemCard}>
                  <View style={styles.itemLeft}>
                    <View style={styles.iconCircle}>
                      <FontAwesome6 name="truck-fast" size={14} color="#f0c96f" />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.itemTitulo}>{r.producto} · Devolución #{r.id_devolucion}</Text>
                      <Text style={styles.itemSub}>{r.cliente} · {r.direccion}</Text>
                      <Text style={styles.itemSub}>Estado: {r.estado_devolucion} · {r.recogida_estado}</Text>
                    </View>
                  </View>
                </View>
              ))}
              <Pressable onPress={() => router.push("/(tecnico)/devoluciones" as any)} style={styles.verTodasBtn}>
                <Text style={styles.verTodasTxt}>{t("common.verTodas")}</Text>
                <FontAwesome6 name="chevron-right" size={10} color="#f0c96f" />
              </Pressable>
            </>
          )}
        </Seccion>

        <Seccion titulo="Novedades" icono="shield-halved" count={novedades.length}>
          {novedades.length === 0 ? (
            <View style={styles.empty}>
              <FontAwesome6 name="shield-halved" size={22} color="#5a5a5a" />
              <Text style={styles.emptyTitle}>Sin novedades</Text>
              <Text style={styles.emptyHint}>No has reportado incidencias recientes.</Text>
            </View>
          ) : (
            <>
              {novedades.slice(0, 5).map((n: any) => {
                const icono = n.tipo_novedad?.includes("retraso") || n.tipo_novedad?.includes("Retraso") ? "clock"
                  : n.tipo_novedad?.includes("daño") || n.tipo_novedad?.includes("Dañado") ? "triangle-exclamation"
                  : n.tipo_novedad?.includes("robo") || n.tipo_novedad?.includes("Robo") ? "shield-halved"
                  : "clipboard-list";
                const colorEstado = n.estado_novedad === "Pendiente" ? styles.badgePend
                  : n.estado_novedad === "Resuelta" || n.estado_novedad === "Cerrada" ? styles.badgeOk
                  : n.estado_novedad === "Rechazada" ? styles.badgeErr : styles.badgeInfo;
                return (
                  <View key={n.id_novedad} style={styles.itemCard}>
                    <View style={styles.itemLeft}>
                      <View style={styles.iconCircle}>
                        <FontAwesome6 name={icono as any} size={14} color="#f0c96f" />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.itemTitulo}>{n.tipo_novedad}</Text>
                        <Text style={styles.itemSub} numberOfLines={1}>{n.descripcion_novedad}</Text>
                        <Text style={styles.itemSub}>
                          {n.id_pedido ? `Pedido #${n.id_pedido}` : ""}{n.id_cita ? ` · Cita #${n.id_cita}` : ""}
                        </Text>
                      </View>
                    </View>
                    <View style={[styles.badge, colorEstado]}>
                      <Text style={styles.badgeTxt}>{n.estado_novedad}</Text>
                    </View>
                  </View>
                );
              })}
              <Pressable onPress={() => router.push("/(tecnico)/novedades" as any)} style={styles.verTodasBtn}>
                <Text style={styles.verTodasTxt}>Ver todas</Text>
                <FontAwesome6 name="chevron-right" size={10} color="#f0c96f" />
              </Pressable>
            </>
          )}
        </Seccion>

          <Seccion titulo={t("tecnico.misCalificaciones")} icono="star">
          {calificaciones.promedio != null ? (
            <View style={styles.califHead}>
              <Text style={styles.califProm}>★ {Number(calificaciones.promedio).toFixed(1)}</Text>
              <Text style={styles.gris}>{calificaciones.total || 0} calificaciones</Text>
            </View>
          ) : (
            <Text style={styles.gris}>{t("tecnico.sinCalificaciones")}</Text>
          )}
          {(calificaciones.calificaciones || []).slice(0, 3).map((c: any) => (
            <View key={c.id_calificacion} style={styles.itemCard}>
              <Text style={styles.itemTitulo}>{c.cliente || "Cliente"}</Text>
              <Text style={{ color: "#ffc94d" }}>{"★".repeat(c.calificacion)}</Text>
              {c.comentario ? <Text style={styles.gris}>{c.comentario}</Text> : null}
            </View>
          ))}
        </Seccion>

        <Seccion titulo={t("tecnico.notificaciones")} icono="bell" count={notificaciones.filter((n: any) => !n.leida).length}>
          {notificaciones.length === 0 ? (
            <View style={styles.empty}>
              <FontAwesome6 name="bell" size={22} color="#5a5a5a" />
              <Text style={styles.emptyTitle}>{t("tecnico.sinNotificaciones")}</Text>
              <Text style={styles.emptyHint}>{t("tecnico.sinNotificacionesHint")}</Text>
            </View>
          ) : notificaciones.filter((n: any) => !n.leida).length === 0 ? (
            <View style={styles.empty}>
              <FontAwesome6 name="bell-slash" size={22} color="#5a5a5a" />
              <Text style={styles.emptyTitle}>Todo al día</Text>
              <Text style={styles.emptyHint}>No tienes notificaciones sin leer</Text>
            </View>
          ) : (
            <>
              <View style={styles.notifActions}>
                <Pressable
                  onPress={marcarTodasLeidas}
                  disabled={marcandoLeidas || notificaciones.every((n: any) => n.leida)}
                  style={[styles.btnMarcar, (marcandoLeidas || notificaciones.every((n: any) => n.leida)) && { opacity: 0.5 }]}
                >
                  <FontAwesome6 name="check-double" size={11} color="#141414" />
                  <Text style={styles.btnMarcarTxt}>{marcandoLeidas ? t("notificaciones.marcando") : t("notificaciones.marcarLeidas")}</Text>
                </Pressable>
              </View>
              {notificaciones.filter((n: any) => !n.leida).slice(0, 5).map((n: any) => {
                const titulo = n.titulo || n.title || "Notificación";
                const mensaje = n.mensaje || n.message || "";
                const fechaRaw = n.fecha || n.created_at || n.fecha_creacion;
                const fechaTxt = fechaRaw ? new Date(fechaRaw).toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "numeric" }) : "";
                const leida = n.leida !== undefined ? n.leida : n.read !== undefined ? n.read : true;
                return (
                  <View key={n.id || n.id_notificacion} style={styles.notifCard}>
                    <View style={styles.notifLeft}>
                      <View style={[styles.iconCircle, !leida && { backgroundColor: "rgba(212,165,75,0.18)", borderColor: "#caa24d" }]}>
                        <FontAwesome6 name="bell" size={13} color={!leida ? "#f0c96f" : "#bdbdbd"} />
                      </View>
                      <View style={{ flex: 1, gap: 3, minWidth: 0 }}>
                        <Text style={styles.notifTitulo} numberOfLines={2} ellipsizeMode="tail">{titulo}</Text>
                        {mensaje ? <Text style={styles.notifMensaje} numberOfLines={3} ellipsizeMode="tail">{mensaje}</Text> : null}
                        {fechaTxt ? <Text style={styles.notifFecha}>{fechaTxt}</Text> : null}
                      </View>
                    </View>
                    {!leida ? <View style={styles.notifDot} /> : null}
                  </View>
                );
              })}
            </>
          )}
        </Seccion>

        <View style={styles.notaPendientes}>
          <FontAwesome6 name="bell" size={12} color={C.oro} />
          <Text style={styles.notaTxt}>{t("tecnico.citasPendientes", { count: String(citasProgramadas.length) })}</Text>
        </View>
      </ScrollView>

      {/* Modal detalle cita */}
      <Modal visible={modalOpen} transparent animationType="fade" onRequestClose={() => setModalOpen(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHead}>
              <Text style={styles.modalTitle}>{t("tecnico.detalleCita")}</Text>
              <Pressable onPress={() => setModalOpen(false)} hitSlop={8} style={styles.modalClose}>
                <FontAwesome6 name="xmark" size={14} color="#ffffff" />
              </Pressable>
            </View>
            {selectedCita && (
              <ScrollView style={{ maxHeight: 380 }} showsVerticalScrollIndicator={false}>
                <View style={{ gap: 8 }}>
                  <Text style={styles.modalLabel}>{t("tecnico.cliente")}</Text>
                  <Text style={styles.modalValue}>{selectedCita.cliente}</Text>
                  <Text style={styles.modalLabel}>{t("tecnico.servicio")}</Text>
                  <Text style={styles.modalValue}>{selectedCita.tipo_servicio}</Text>
                  <Text style={styles.modalLabel}>{t("tecnico.fechaHora")}</Text>
                  <Text style={styles.modalValue}>{selectedCita.fecha} · {selectedCita.hora}</Text>
                  <Text style={styles.modalLabel}>{t("tecnico.direccion")}</Text>
                  <Text style={styles.modalValue}>{selectedCita.direccion}</Text>
                  {selectedCita.telefono ? (
                    <>
                      <Text style={styles.modalLabel}>{t("tecnico.telefono")}</Text>
                      <Pressable onPress={() => Linking.openURL(`tel:${selectedCita.telefono}`)}>
                        <Text style={[styles.modalValue, { color: C.oro }]}>{selectedCita.telefono}</Text>
                      </Pressable>
                    </>
                  ) : null}
                  {selectedCita.descripcion ? (
                    <>
                      <Text style={styles.modalLabel}>{t("tecnico.descripcion")}</Text>
                      <Text style={styles.gris}>{selectedCita.descripcion}</Text>
                    </>
                  ) : null}
                  <View style={{ flexDirection: "row", gap: 8, marginTop: 8 }}>
                    {selectedCita.estado !== "Finalizada" && (
                      <Pressable
                        disabled={updatingId === selectedCita.id_cita}
                        onPress={() => actualizarEstado(selectedCita.id_cita, "Finalizada")}
                        style={[styles.btnPrimary, updatingId === selectedCita.id_cita && { opacity: 0.5 }]}
                      >
                        <Text style={styles.btnPrimaryTxt}>{updatingId === selectedCita.id_cita ? t("tecnico.guardando") : t("tecnico.marcarFinalizada")}</Text>
                      </Pressable>
                    )}
                    <Pressable onPress={() => setModalOpen(false)} style={styles.btnGhost}>
                      <Text style={styles.btnGhostTxt}>{t("tecnico.cerrar")}</Text>
                    </Pressable>
                  </View>
                </View>
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>

      {/* Modal confirmar recogida */}
      <Modal visible={!!confirmRecogida} transparent animationType="fade" onRequestClose={() => setConfirmRecogida(null)} statusBarTranslucent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHead}>
              <Text style={styles.modalTitle}>{t("entregas.confirmarRecogida")}</Text>
              <Pressable onPress={() => setConfirmRecogida(null)} hitSlop={8} style={styles.modalClose}>
                <FontAwesome6 name="xmark" size={14} color="#ffffff" />
              </Pressable>
            </View>
            <Text style={styles.gris}>{t("entregas.confirmarRecogidaMsg")}</Text>
            {confirmRecogida ? (
              <View style={{ backgroundColor: "rgba(212,165,75,0.08)", borderWidth: 1, borderColor: "rgba(212,165,75,0.18)", borderRadius: 10, padding: 10, marginTop: 6 }}>
                <Text style={styles.modalValue}>Pedido #{confirmRecogida.id_pedido}</Text>
                <Text style={styles.gris}>{confirmRecogida.cliente} · {confirmRecogida.direccion || ""}</Text>
              </View>
            ) : null}
            <View style={{ flexDirection: "row", gap: 10, marginTop: 12 }}>
              <Pressable onPress={() => setConfirmRecogida(null)} style={styles.btnGhost} disabled={!!recogiendoId}>
                <Text style={styles.btnGhostTxt}>{t("common.cancelar")}</Text>
              </Pressable>
              <Pressable onPress={confirmarRecogida} disabled={!!recogiendoId} style={[styles.btnPrimary, !!recogiendoId && { opacity: 0.6 }]}>
                <Text style={styles.btnPrimaryTxt}>{recogiendoId ? t("common.guardando") : t("common.confirmar")}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {toast && (
        <View style={styles.toastWrap} pointerEvents="none">
          <View style={styles.toast}>
            <Text style={styles.toastTxt}>{toast}</Text>
          </View>
        </View>
      )}
    </View>
  );
}

function Seccion({ titulo, icono, count, children, alerta }: { titulo: string; icono: string; count?: number; children: React.ReactNode; alerta?: boolean }) {
  return (
    <View style={[styles.seccion, alerta && styles.seccionAlerta]}>
      <View style={styles.seccionHead}>
        <FontAwesome6 name={icono as any} size={13} color={alerta ? "#e5484d" : C.oro} />
        <Text style={styles.seccionTitulo}>{titulo}</Text>
        {count !== undefined && <View style={styles.countBadge}><Text style={styles.countTxt}>{count}</Text></View>}
      </View>
      <View style={{ gap: 8 }}>{children}</View>
    </View>
  );
}

function CitaRow({ cita, onVer }: { cita: Cita; onVer: () => void }) {
  const { t } = useIdioma();
  return (
    <Pressable onPress={onVer} style={({ pressed }) => [styles.itemCard, pressed && { opacity: 0.85, transform: [{ scale: 0.98 }] }]}>
      <View style={styles.itemLeft}>
        <View style={styles.iconCircle}>
          <FontAwesome6 name="user-tie" size={14} color="#f0c96f" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.itemTitulo}>{cita.cliente}</Text>
          <Text style={styles.itemSub}>{cita.tipo_servicio} · {cita.direccion}</Text>
          <Text style={styles.itemSub}>{cita.fecha} · {cita.hora}</Text>
        </View>
      </View>
      <View style={{ alignItems: "flex-end", gap: 6 }}>
        <View style={[styles.badge, cita.estado === "Finalizada" ? styles.badgeOk : cita.estado === "Cancelada" ? styles.badgeErr : styles.badgeInfo]}>
          <Text style={styles.badgeTxt}>{cita.estado}</Text>
        </View>
        <Text style={styles.verTxt}>{t("common.ver")}</Text>
      </View>
    </Pressable>
  );
}

function Empty({ icon, titulo, hint }: { icon: string; titulo: string; hint: string }) {
  return (
    <View style={styles.empty}>
      <FontAwesome6 name={icon as any} size={22} color="#5a5a5a" />
      <Text style={styles.emptyTitle}>{titulo}</Text>
      <Text style={styles.emptyHint}>{hint}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pantalla: { flex: 1, backgroundColor: "#000000" },
  scroll: { flex: 1 },
  contenido: { padding: 14, gap: 14 },
  tabsBar: {
    flexDirection: "row",
    gap: 6,
    paddingHorizontal: 8,
    paddingVertical: 8,
    backgroundColor: "#0a0a0a",
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.07)",
  },
  tab: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    paddingVertical: 8,
    paddingHorizontal: 6,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.07)",
    backgroundColor: "transparent",
  },
  tabActivo: { backgroundColor: "#caa24d", borderColor: "#caa24d" },
  tabTxt: { color: "#bdbdbd", fontSize: 10, fontFamily: FontFamilies.bodyMedium, textAlign: "center", flexShrink: 1 },
  tabTxtActivo: { color: "#141414", fontFamily: FontFamilies.bodyBold },
  tabBadge: { backgroundColor: "#e5484d", borderRadius: 999, minWidth: 14, height: 14, alignItems: "center", justifyContent: "center", paddingHorizontal: 3, marginLeft: 2 },
  tabBadgeTxt: { color: "#fff", fontSize: 8, fontFamily: FontFamilies.bodyBold },
  centro: { flex: 1, backgroundColor: "#000", alignItems: "center", justifyContent: "center", gap: 12 },
  cargando: { color: "#bdbdbd", fontSize: 13 },
  header: { gap: 4, paddingTop: 2 },
  bienvenida: { color: "#ffffff", fontSize: 20, fontFamily: FontFamilies.bodyBold, flexShrink: 1 },
  subtitulo: { color: "#bdbdbd", fontSize: 13, flexShrink: 1 },
  fechaBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    alignSelf: "flex-start",
    backgroundColor: "rgba(212,165,75,0.12)",
    borderWidth: 1,
    borderColor: "rgba(212,165,75,0.22)",
    borderRadius: 999,
    paddingVertical: 5,
    paddingHorizontal: 10,
    marginTop: 4,
    maxWidth: "100%",
  },
  fechaTexto: { color: "#f0c96f", fontSize: 12, fontFamily: FontFamilies.bodyMedium, textTransform: "capitalize", flexShrink: 1, flexWrap: "wrap" },
  searchWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#0f0f0f",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.09)",
    borderRadius: 12,
    paddingHorizontal: 12,
    height: 44,
    width: "100%",
  },
  searchInput: { flex: 1, color: "#ffffff", fontSize: 13.5, paddingVertical: 0, minWidth: 0 },
  statsGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10, justifyContent: "space-between" },
  statCard: {
    width: "48%",
    flexGrow: 0,
    flexShrink: 0,
    backgroundColor: "#161616",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.09)",
    borderRadius: 14,
    padding: 14,
    gap: 6,
    minHeight: 105,
  },
  statIcon: {
    width: 30,
    height: 30,
    borderRadius: 9,
    backgroundColor: C.oro,
    alignItems: "center",
    justifyContent: "center",
  },
  statVal: { color: "#ffffff", fontSize: 20, fontFamily: FontFamilies.bodyBold },
  statLabel: { color: "#ffffff", fontSize: 12, fontFamily: FontFamilies.bodyMedium },
  statHint: { color: "#8a8a8a", fontSize: 11 },
  seccion: {
    backgroundColor: "#161616",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.09)",
    padding: 14,
    gap: 10,
  },
  seccionAlerta: { borderLeftWidth: 4, borderLeftColor: "#e5484d" },
  seccionHead: { flexDirection: "row", alignItems: "center", gap: 8 },
  seccionTitulo: { color: "#ffffff", fontSize: 14, fontFamily: FontFamilies.bodyBold, flex: 1 },
  countBadge: { backgroundColor: "#caa24d", borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 },
  countTxt: { color: "#141414", fontSize: 11, fontFamily: FontFamilies.bodyBold },
  itemCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.07)",
    borderRadius: 12,
    padding: 12,
    gap: 10,
  },
  itemCardColumn: {
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.07)",
    borderRadius: 12,
    padding: 12,
    gap: 10,
  },
  itemCardRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  itemLeft: { flex: 1, flexDirection: "row", gap: 10, alignItems: "center", minWidth: 0 },
  iconCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "rgba(212,165,75,0.12)",
    borderWidth: 1,
    borderColor: "rgba(212,165,75,0.22)",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  itemTitulo: { color: "#ffffff", fontSize: 13, fontFamily: FontFamilies.bodyBold, flexShrink: 1, flexWrap: "wrap" },
  itemSub: { color: "#bdbdbd", fontSize: 12, lineHeight: 16, flexShrink: 1, flexWrap: "wrap" },
  badge: { borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3 },
  badgeOk: { backgroundColor: "rgba(126,226,154,0.15)", borderWidth: 1, borderColor: "rgba(126,226,154,0.3)" },
  badgeInfo: { backgroundColor: "rgba(212,165,75,0.12)", borderWidth: 1, borderColor: "rgba(212,165,75,0.25)" },
  badgePend: { backgroundColor: "rgba(246,195,68,0.12)", borderWidth: 1, borderColor: "rgba(246,195,68,0.25)" },
  badgeErr: { backgroundColor: "rgba(240,133,138,0.12)", borderWidth: 1, borderColor: "rgba(240,133,138,0.25)" },
  badgeTxt: { color: "#ffffff", fontSize: 10.5, fontFamily: FontFamilies.bodyBold },
  verTxt: { color: C.oro, fontSize: 11, fontFamily: FontFamilies.bodyBold },
  gris: { color: "#bdbdbd", fontSize: 12.5 },
  empty: { alignItems: "center", paddingVertical: 18, gap: 6 },
  emptyTitle: { color: "#ffffff", fontSize: 13, fontFamily: FontFamilies.bodyBold },
  emptyHint: { color: "#8a8a8a", fontSize: 12, textAlign: "center" },
  notifCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.07)",
    borderRadius: 12,
    padding: 12,
    gap: 10,
  },
  notifLeft: { flex: 1, flexDirection: "row", gap: 10, alignItems: "flex-start", minWidth: 0 },
  notifTitulo: { color: "#ffffff", fontSize: 13, fontFamily: FontFamilies.bodyBold, lineHeight: 16 },
  notifMensaje: { color: "#bdbdbd", fontSize: 12, lineHeight: 16 },
  notifFecha: { color: "#8a8a8a", fontSize: 11, marginTop: 2 },
  notifDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: "#f0c96f", marginTop: 6, flexShrink: 0 },
  notifActions: { alignItems: "flex-end", marginBottom: 2 },
  btnMarcar: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "#caa24d", paddingVertical: 6, paddingHorizontal: 10, borderRadius: 8 },
  btnMarcarTxt: { color: "#141414", fontSize: 11, fontFamily: FontFamilies.bodyBold },
  verTodasBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 8,
    marginTop: 4,
  },
  verTodasTxt: { color: "#f0c96f", fontSize: 12, fontFamily: FontFamilies.bodyBold },
  btnRecogida: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: "#caa24d",
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginTop: 4,
  },
  btnRecogidaTxt: { color: "#141414", fontSize: 12, fontFamily: FontFamilies.bodyBold },
  califHead: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 4 },
  califProm: { color: "#ffc94d", fontSize: 16, fontFamily: FontFamilies.bodyBold },
  notaPendientes: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "rgba(212,165,75,0.08)",
    borderWidth: 1,
    borderColor: "rgba(212,165,75,0.18)",
    borderRadius: 12,
    padding: 12,
  },
  notaTxt: { color: "#dcdcdc", fontSize: 12.5, flex: 1 },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.72)", justifyContent: "center", padding: 16 },
  modalCard: {
    backgroundColor: "#121212",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(212,165,75,0.28)",
    padding: 16,
    gap: 10,
    maxHeight: "85%",
  },
  modalHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  modalTitle: { color: "#ffffff", fontSize: 16, fontFamily: FontFamilies.bodyBold },
  modalClose: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.09)",
    alignItems: "center",
    justifyContent: "center",
  },
  modalLabel: { color: "#f0c96f", fontSize: 11, fontFamily: FontFamilies.bodyBold, textTransform: "uppercase", letterSpacing: 0.5 },
  modalValue: { color: "#ffffff", fontSize: 13.5 },
  btnPrimary: {
    backgroundColor: "#caa24d",
    borderRadius: 10,
    paddingVertical: 11,
    paddingHorizontal: 14,
    alignItems: "center",
    flex: 1,
  },
  btnPrimaryTxt: { color: "#141414", fontFamily: FontFamilies.button, fontSize: 13 },
  btnGhost: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "rgba(212,165,75,0.35)",
    paddingVertical: 11,
    paddingHorizontal: 14,
    alignItems: "center",
    flex: 1,
  },
  btnGhostTxt: { color: "#f0c96f", fontFamily: FontFamilies.button, fontSize: 13 },
  toastWrap: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 90,
    alignItems: "center",
  },
  toast: {
    backgroundColor: "rgba(0,0,0,0.92)",
    borderWidth: 1,
    borderColor: "#c9a227",
    borderRadius: 40,
    paddingVertical: 9,
    paddingHorizontal: 16,
  },
  toastTxt: { color: "#f0c96f", fontSize: 12.5, fontFamily: FontFamilies.bodyMedium },
});
