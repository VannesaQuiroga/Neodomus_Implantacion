// Ruta móvil de citas. Expo Router la incorpora a la navegación según su ubicación en app/.
import React, { useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import FontAwesome6 from "@expo/vector-icons/FontAwesome6";
import { NeodomusColors as C, FontFamilies } from "@/constants/theme";
import { apiFetch } from "@/services/api";
import { useScrollTopAlEntrar } from "@/hooks/useScrollTopAlEntrar";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useIdioma } from "@/contexts/IdiomaContext";
import {
  SearchBar,
  FilterChip,
  FilterRow,
  ClearFiltersBtn,
  CalendarPicker,
  PickerModal,
  formatDateDisplay,
  HORAS_OPCIONES_12H,
} from "@/components/tecnico/Filtros";

const ESTADOS_ACTIVAS = ["Pendiente", "Confirmada"];

const TIPO_SERVICIO: Record<string, string> = {
  instalacion: "Instalación",
  reparacion: "Reparación",
  mantenimiento: "Mantenimiento",
  revision: "Revisión técnica",
  soporte: "Soporte",
};

function formatFechaLarga(fecha: string, idioma: string) {
  try {
    const d = new Date(`${fecha}T00:00:00`);
    return d.toLocaleDateString(idioma === "en" ? "en-US" : "es-ES", {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  } catch {
    return fecha;
  }
}

// Comunica con el backend mediante API "/tecnicos/mis-citas", API `/tecnicos/citas/${id}/estado`.
export default function TecnicoCitasScreen() {
  const scrollRef = useRef<ScrollView>(null);
  const { t, idioma } = useIdioma();
  useScrollTopAlEntrar(scrollRef);
  const insets = useSafeAreaInsets();
  const [citas, setCitas] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<any>(null);
  const [modal, setModal] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  // filtros
  const [busqueda, setBusqueda] = useState("");
  const [fechaFiltro, setFechaFiltro] = useState("");
  const [horaFiltro, setHoraFiltro] = useState("");
  const [showCal, setShowCal] = useState(false);
  const [showHora, setShowHora] = useState(false);

  const hayFiltros = Boolean(busqueda.trim()) || Boolean(fechaFiltro) || Boolean(horaFiltro);

  const limpiarFiltros = () => {
    setBusqueda("");
    setFechaFiltro("");
    setHoraFiltro("");
  };

  // Comunica con el backend mediante API "/tecnicos/mis-citas".
  const fetchCitas = async () => {
    try {
      const res = await apiFetch<any[]>("/tecnicos/mis-citas");
      setCitas(res || []);
    } catch {}
    setLoading(false);
  };
  useEffect(() => { fetchCitas(); }, []);
  useEffect(() => { if (!toast) return; const tm = setTimeout(() => setToast(null), 2500); return () => clearTimeout(tm); }, [toast]);

  // Comunica con el backend mediante API `/tecnicos/citas/${id}/estado`.
  const actualizarEstado = async (id: number, estado: string) => {
    try {
      await apiFetch(`/tecnicos/citas/${id}/estado`, { method: "PUT", body: JSON.stringify({ estado }) });
      setToast("Estado actualizado");
      setModal(false);
      fetchCitas();
    } catch (e: any) { setToast(e.message || "Error"); }
  };

  const citasFiltradas = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return citas
      .filter((c) => ESTADOS_ACTIVAS.includes(c.estado))
      .filter((c) => {
        if (fechaFiltro && c.fecha !== fechaFiltro) return false;
        if (horaFiltro && (c.hora || "").slice(0, 5) !== horaFiltro) return false;
        if (!q) return true;
        const servicioLabel = TIPO_SERVICIO[c.tipo_servicio] || c.tipo_servicio || "";
        const campos = [
          c.cliente || "",
          c.documento_numero?.toString() || "",
          c.telefono?.toString() || "",
          c.email || "",
          servicioLabel,
          formatFechaLarga(c.fecha || "", idioma),
          c.fecha || "",
          c.hora || "",
          c.direccion || "",
          c.nombre_tecnico || "",
          c.nombre_tecnico_2 || "",
          c.estado || "",
          c.descripcion || "",
        ];
        return campos.some((v) => v.toLowerCase().includes(q));
      })
      .sort((a, b) => (a.fecha + a.hora).localeCompare(b.fecha + b.hora));
  }, [citas, busqueda, fechaFiltro, horaFiltro, idioma]);

  const sinResultados = citasFiltradas.length === 0 && citas.filter((c) => ESTADOS_ACTIVAS.includes(c.estado)).length > 0 && hayFiltros;

  if (loading) return <View style={styles.centro}><ActivityIndicator color={C.oro} /><Text style={styles.gris}>{t("common.cargando")}</Text></View>;

  return (
    <View style={styles.pantalla}>
      <ScrollView ref={scrollRef} contentContainerStyle={[styles.contenido, { paddingBottom: insets.bottom + 72 }]} showsVerticalScrollIndicator={false}>
        <Text style={styles.titulo}>{t("tecnico.proximasCitas")}</Text>
        <Text style={styles.sub}>{t("tecnico.resumenJornada")}</Text>

        {/* ── Barra de búsqueda ── */}
        <SearchBar
          value={busqueda}
          onChange={setBusqueda}
          placeholder={t("tecnico.buscarPlaceholder") || "Buscar por cliente, dirección, servicio..."}
        />

        {/* ── Fila de filtros ── */}
        <FilterRow>
          <FilterChip
            label={fechaFiltro ? formatDateDisplay(fechaFiltro) : "Fecha"}
            icon="calendar-days"
            active={Boolean(fechaFiltro)}
            onPress={() => setShowCal(true)}
          />
          <FilterChip
            label={horaFiltro || "Hora"}
            icon="clock"
            active={Boolean(horaFiltro)}
            onPress={() => setShowHora(true)}
          />
          {hayFiltros ? <ClearFiltersBtn onPress={limpiarFiltros} /> : null}
          {hayFiltros ? (
            <View style={styles.countPill}>
              <Text style={styles.countPillTxt}>{citasFiltradas.length}</Text>
            </View>
          ) : (
            <View style={styles.countPillGhost}>
              <Text style={styles.countPillGhostTxt}>{citasFiltradas.length} citas</Text>
            </View>
          )}
        </FilterRow>

        {/* ── Lista ── */}
        {citas.filter((c) => ESTADOS_ACTIVAS.includes(c.estado)).length === 0 ? (
          <View style={styles.empty}><FontAwesome6 name="calendar-check" size={24} color="#5a5a5a" /><Text style={styles.emptyTxt}>{t("tecnico.sinCitasHoy")}</Text></View>
        ) : sinResultados || citasFiltradas.length === 0 ? (
          <View style={styles.empty}>
            <FontAwesome6 name="magnifying-glass" size={22} color="#5a5a5a" />
            <Text style={styles.emptyTxt}>Sin resultados</Text>
            <Text style={styles.emptyHint}>No hay citas que coincidan con los filtros.</Text>
            <Pressable onPress={limpiarFiltros} style={styles.btnGhostSm}><Text style={styles.btnGhostSmTxt}>Limpiar filtros</Text></Pressable>
          </View>
        ) : (
          citasFiltradas.map((c) => (
            <Pressable key={c.id_cita} onPress={() => { setSelected(c); setModal(true); }} style={({ pressed }) => [styles.card, pressed && { opacity: 0.85 }]}>
              <View style={styles.cardHead}>
                <Text style={styles.cardCliente}>{c.cliente}</Text>
                <View style={[styles.badge, c.estado === "Finalizada" ? styles.bOk : c.estado === "Cancelada" ? styles.bErr : styles.bInfo]}><Text style={styles.badgeTxt}>{c.estado}</Text></View>
              </View>
              <Text style={styles.cardSub}>{TIPO_SERVICIO[c.tipo_servicio] || c.tipo_servicio} · {c.fecha} {c.hora}</Text>
              <Text style={styles.cardSub}>{c.direccion}</Text>
              {c.descripcion ? <Text style={styles.cardSub} numberOfLines={1}>{c.descripcion}</Text> : null}
            </Pressable>
          ))
        )}
      </ScrollView>

      <CalendarPicker visible={showCal} value={fechaFiltro} onSelect={setFechaFiltro} onClose={() => setShowCal(false)} />
      <PickerModal
        visible={showHora}
        title="Filtrar por hora"
        options={HORAS_OPCIONES_12H}
        value={horaFiltro}
        onSelect={setHoraFiltro}
        onClose={() => setShowHora(false)}
      />

      <Modal visible={modal} transparent animationType="fade" onRequestClose={() => setModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHead}>
              <Text style={styles.modalTitle}>Detalle cita #{selected?.id_cita}</Text>
              <Pressable onPress={() => setModal(false)} style={styles.modalClose}><FontAwesome6 name="xmark" size={14} color="#fff" /></Pressable>
            </View>
            {selected && (
              <ScrollView style={{ maxHeight: 380 }}>
                <View style={{ gap: 8 }}>
                  <Text style={styles.label}>{t("tecnico.cliente")}</Text><Text style={styles.value}>{selected.cliente}</Text>
                  <Text style={styles.label}>{t("tecnico.servicio")}</Text><Text style={styles.value}>{TIPO_SERVICIO[selected.tipo_servicio] || selected.tipo_servicio}</Text>
                  <Text style={styles.label}>{t("tecnico.fechaHora")}</Text><Text style={styles.value}>{selected.fecha} · {selected.hora}</Text>
                  <Text style={styles.label}>Dirección</Text><Text style={styles.value}>{selected.direccion}</Text>
                  {selected.telefono ? <><Text style={styles.label}>Teléfono</Text><Text style={styles.value}>{selected.telefono}</Text></> : null}
                  {selected.descripcion ? <><Text style={styles.label}>Descripción</Text><Text style={styles.value}>{selected.descripcion}</Text></> : null}
                  <View style={{ flexDirection: "row", gap: 8, marginTop: 10 }}>
                    {selected.estado !== "Finalizada" && (
                      <Pressable onPress={() => actualizarEstado(selected.id_cita, "Finalizada")} style={styles.btnPrimary}><Text style={styles.btnPrimaryTxt}>Finalizar</Text></Pressable>
                    )}
                    <Pressable onPress={() => setModal(false)} style={styles.btnGhost}><Text style={styles.btnGhostTxt}>Cerrar</Text></Pressable>
                  </View>
                </View>
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>

      {toast && <View style={styles.toastWrap} pointerEvents="none"><View style={styles.toast}><Text style={styles.toastTxt}>{toast}</Text></View></View>}
    </View>
  );
}

const styles = StyleSheet.create({
  pantalla: { flex: 1, backgroundColor: "#000" },
  contenido: { padding: 14, gap: 12, paddingBottom: 32 },
  centro: { flex: 1, backgroundColor: "#000", alignItems: "center", justifyContent: "center", gap: 10, paddingTop: 40 },
  gris: { color: "#bdbdbd", fontSize: 12.5 },
  titulo: { color: "#fff", fontSize: 18, fontFamily: FontFamilies.bodyBold },
  sub: { color: "#bdbdbd", fontSize: 13, marginTop: -8 },
  countPill: { backgroundColor: "#caa24d", borderRadius: 999, paddingHorizontal: 8, paddingVertical: 4, marginLeft: "auto" },
  countPillTxt: { color: "#141414", fontSize: 11, fontFamily: FontFamilies.bodyBold },
  countPillGhost: { marginLeft: "auto", backgroundColor: "rgba(255,255,255,0.06)", borderRadius: 999, paddingHorizontal: 8, paddingVertical: 4, borderWidth: 1, borderColor: "rgba(255,255,255,0.07)" },
  countPillGhostTxt: { color: "#bdbdbd", fontSize: 11, fontFamily: FontFamilies.bodyMedium },
  card: { backgroundColor: "#161616", borderWidth: 1, borderColor: "rgba(255,255,255,0.09)", borderRadius: 12, padding: 12, gap: 4 },
  cardHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  cardCliente: { color: "#fff", fontSize: 14, fontFamily: FontFamilies.bodyBold, flex: 1 },
  cardSub: { color: "#bdbdbd", fontSize: 12 },
  badge: { borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2, borderWidth: 1 },
  bOk: { backgroundColor: "rgba(126,226,154,0.15)", borderColor: "rgba(126,226,154,0.3)" },
  bInfo: { backgroundColor: "rgba(212,165,75,0.12)", borderColor: "rgba(212,165,75,0.25)" },
  bErr: { backgroundColor: "rgba(240,133,138,0.12)", borderColor: "rgba(240,133,138,0.25)" },
  badgeTxt: { color: "#fff", fontSize: 10, fontFamily: FontFamilies.bodyBold },
  empty: { alignItems: "center", paddingVertical: 30, gap: 8 },
  emptyTxt: { color: "#8a8a8a", fontSize: 13, fontFamily: FontFamilies.bodyBold },
  emptyHint: { color: "#6b6b6b", fontSize: 12, textAlign: "center" },
  btnGhostSm: { marginTop: 6, borderWidth: 1, borderColor: "rgba(212,165,75,0.35)", borderRadius: 999, paddingVertical: 7, paddingHorizontal: 14 },
  btnGhostSmTxt: { color: "#f0c96f", fontSize: 12, fontFamily: FontFamilies.bodyMedium },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.72)", justifyContent: "center", padding: 16 },
  modalCard: { backgroundColor: "#121212", borderRadius: 16, borderWidth: 1, borderColor: "rgba(212,165,75,0.28)", padding: 16, gap: 10, maxHeight: "85%" },
  modalHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  modalTitle: { color: "#fff", fontSize: 16, fontFamily: FontFamilies.bodyBold },
  modalClose: { width: 28, height: 28, borderRadius: 14, borderWidth: 1, borderColor: "rgba(255,255,255,0.09)", alignItems: "center", justifyContent: "center" },
  label: { color: "#f0c96f", fontSize: 11, fontFamily: FontFamilies.bodyBold, textTransform: "uppercase" },
  value: { color: "#fff", fontSize: 13 },
  btnPrimary: { backgroundColor: "#caa24d", borderRadius: 10, paddingVertical: 11, paddingHorizontal: 14, alignItems: "center", flex: 1 },
  btnPrimaryTxt: { color: "#141414", fontFamily: FontFamilies.button, fontSize: 13 },
  btnGhost: { borderRadius: 10, borderWidth: 1, borderColor: "rgba(212,165,75,0.35)", paddingVertical: 11, paddingHorizontal: 14, alignItems: "center", flex: 1 },
  btnGhostTxt: { color: "#f0c96f", fontFamily: FontFamilies.button, fontSize: 13 },
  toastWrap: { position: "absolute", left: 0, right: 0, bottom: 90, alignItems: "center" },
  toast: { backgroundColor: "rgba(0,0,0,0.92)", borderWidth: 1, borderColor: "#c9a227", borderRadius: 40, paddingVertical: 9, paddingHorizontal: 16 },
  toastTxt: { color: "#f0c96f", fontSize: 12.5 },
});
