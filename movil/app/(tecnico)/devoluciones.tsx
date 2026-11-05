// Ruta móvil de devoluciones. Expo Router la incorpora a la navegación según su ubicación en app/.
import React, { useEffect, useState, useRef, useMemo } from "react";
import { useIdioma } from "@/contexts/IdiomaContext";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View, Modal } from "react-native";
import FontAwesome6 from "@expo/vector-icons/FontAwesome6";
import * as ImagePicker from "expo-image-picker";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { NeodomusColors as C, FontFamilies } from "@/constants/theme";
import { apiFetch } from "@/services/api";
import { useScrollTopAlEntrar } from "@/hooks/useScrollTopAlEntrar";
import {
  SearchBar,
  Tabs,
  FilterChip,
  FilterRow,
  ClearFiltersBtn,
  CalendarPicker,
  PickerModal,
  formatDateDisplay,
  HORAS_OPCIONES_12H,
} from "@/components/tecnico/Filtros";

const ESTADO_OPCIONES_DEV_HIST = [
  { label: "Todas", value: "todas" },
  { label: "Finalizadas", value: "finalizadas" },
  { label: "Canceladas", value: "canceladas" },
];

function matchEstadoDevolucion(item: any, filtro: string): boolean {
  if (filtro === "todas") return true;
  if (filtro === "finalizadas") {
    // recogida completada
    return item.recogida_estado === "Recogida";
  }
  if (filtro === "canceladas") {
    const e = (item.estado_devolucion || "").toLowerCase();
    return e === "rechazada" || e === "cancelada" || e === "rechazado";
  }
  return true;
}

// Comunica con el backend mediante API "/devoluciones/mis-recogidas", API "/devoluciones/mis-recogidas?historial=true", API `/devoluciones/${id}/evidencia-recogida`; prepara FormData para enviar campos y archivos.
export default function TecnicoDevolucionesScreen() {
  const scrollRef = useRef<ScrollView>(null);
  const { t } = useIdioma();
  useScrollTopAlEntrar(scrollRef);
  const insets = useSafeAreaInsets();
  const [pendientes, setPendientes] = useState<any[]>([]);
  const [historial, setHistorial] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const [vista, setVista] = useState<"pendientes" | "historial">("pendientes");
  const [busqueda, setBusqueda] = useState("");
  const [estadoFiltro, setEstadoFiltro] = useState("todas");
  const [fechaFiltro, setFechaFiltro] = useState("");
  const [horaFiltro, setHoraFiltro] = useState("");

  const [showCal, setShowCal] = useState(false);
  const [showHora, setShowHora] = useState(false);
  const [showEstado, setShowEstado] = useState(false);

  const [subiendo, setSubiendo] = useState<number | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [selected, setSelected] = useState<any | null>(null);
  const [detalleVisible, setDetalleVisible] = useState(false);

  // Comunica con el backend mediante API "/devoluciones/mis-recogidas", API "/devoluciones/mis-recogidas?historial=true".
  const fetchWithHistorial = async () => {
    setLoading(true);
    try {
      const results = await Promise.allSettled([
        apiFetch<any[]>("/devoluciones/mis-recogidas"),
        apiFetch<any[]>("/devoluciones/mis-recogidas?historial=true"),
      ]);
      const act = results[0].status === "fulfilled" ? (results[0].value as any[]) : [];
      const hist = results[1].status === "fulfilled" ? (results[1].value as any[]) : [];
      setPendientes(Array.isArray(act) ? act : []);
      setHistorial(Array.isArray(hist) ? hist : []);
    } catch {}
    setLoading(false);
  };

  useEffect(() => { fetchWithHistorial(); }, []);
  useEffect(() => { if (!toast) return; const tm = setTimeout(() => setToast(null), 2500); return () => clearTimeout(tm); }, [toast]);

  // Reset filtros al cambiar de vista (opcional: mantener búsqueda pero reset estado/fecha/hora)
  useEffect(() => {
    // keep busqueda, reset other filters to avoid confusion
    // but spec says filters should work combined, so we reset historial-specific filters when switching
    if (vista === "pendientes") {
      setEstadoFiltro("todas");
      setFechaFiltro("");
      setHoraFiltro("");
    }
  }, [vista]);

  const hayFiltrosHist = Boolean(busqueda.trim()) || estadoFiltro !== "todas" || Boolean(fechaFiltro) || Boolean(horaFiltro);
  const hayFiltrosPend = Boolean(busqueda.trim());

  const limpiarHistorial = () => {
    setBusqueda("");
    setEstadoFiltro("todas");
    setFechaFiltro("");
    setHoraFiltro("");
  };
  const limpiarPend = () => setBusqueda("");

  const filtrar = (lista: any[]) => {
    const q = busqueda.trim().toLowerCase();
    return lista.filter((r) => {
      // estado filtro only for historial
      if (vista === "historial" && !matchEstadoDevolucion(r, estadoFiltro)) return false;
      if (vista === "historial" && fechaFiltro) {
        const fechaItem = (r.fecha_solicitud || "").slice(0, 10);
        if (fechaItem !== fechaFiltro) return false;
      }
      if (vista === "historial" && horaFiltro) {
        const horaItem = (r.fecha_solicitud || "").slice(11, 16);
        // Compare only hour (HH) so minutes variations don't block results
        if (horaItem) {
          if (horaItem.slice(0, 2) !== horaFiltro.slice(0, 2)) return false;
        } else {
          // fallback: if no fecha_solicitud, try recogida/historial other date fields empty => filter out
          return false;
        }
      }
      if (!q) return true;
      const campos = [
        r.cliente || "",
        r.producto || "",
        String(r.id_pedido ?? ""),
        String(r.id_devolucion || ""),
        r.direccion || "",
        r.telefono ? String(r.telefono) : "",
        r.motivo || "",
        r.estado_devolucion || "",
        r.recogida_estado || "",
        r.resolucion || "",
        r.fecha_solicitud || "",
      ];
      return campos.some((v) => v.toLowerCase().includes(q));
    });
  };

  const visibles = useMemo(() => {
    const base = vista === "pendientes" ? pendientes : historial;
    return filtrar(base);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendientes, historial, vista, busqueda, estadoFiltro, fechaFiltro, horaFiltro]);

  // Comunica con el backend mediante API `/devoluciones/${id}/evidencia-recogida`; prepara FormData para enviar campos y archivos.
  const subirEvidencia = async (id: number) => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) { setToast("Permiso denegado"); return; }
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.7 });
    if (res.canceled || !res.assets?.[0]) return;
    const asset = res.assets[0];
    setSubiendo(id);
    try {
      const fd = new FormData();
      fd.append("file", { uri: asset.uri, name: "evidencia.jpg", type: "image/jpeg" } as any);
      await apiFetch(`/devoluciones/${id}/evidencia-recogida`, { method: "POST", body: fd, headers: {} as any });
      setToast("Evidencia subida");
      fetchWithHistorial();
    } catch (e: any) { setToast(e.message || "Error"); }
    setSubiendo(null);
  };

  const abrirDetalle = (item: any) => {
    setSelected(item);
    setDetalleVisible(true);
  };

  if (loading) return <View style={styles.centro}><ActivityIndicator color={C.oro} /><Text style={styles.gris}>Cargando...</Text></View>;

  const estadoLabel = ESTADO_OPCIONES_DEV_HIST.find((o) => o.value === estadoFiltro)?.label || "Estado";

  return (
    <View style={styles.pantalla}>
      <ScrollView ref={scrollRef} contentContainerStyle={[styles.contenido, { paddingBottom: insets.bottom + 72 }]} showsVerticalScrollIndicator={false}>
        <Text style={styles.titulo}>{t("devoluciones.titulo")}</Text>
        <Text style={styles.sub}>{t("devoluciones.subtitulo")}</Text>

        <Tabs
          tabs={[
            { key: "pendientes", label: "Pendientes", icon: "box-open", count: pendientes.length },
            { key: "historial", label: "Historial", icon: "clock-rotate-left", count: historial.length },
          ]}
          active={vista}
          onChange={(k) => setVista(k as any)}
        />

        {/* Barra de búsqueda — siempre visible, filtra según vista */}
        <SearchBar
          value={busqueda}
          onChange={setBusqueda}
          placeholder={vista === "pendientes" ? "Buscar devolución, cliente, producto..." : "Buscar en historial..."}
        />

        {/* Filtros solo para historial */}
        {vista === "historial" && (
          <FilterRow>
            <FilterChip
              label={estadoLabel}
              icon="filter"
              active={estadoFiltro !== "todas"}
              onPress={() => setShowEstado(true)}
            />
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
            {hayFiltrosHist ? <ClearFiltersBtn onPress={limpiarHistorial} /> : null}
          </FilterRow>
        )}

        {vista === "pendientes" && hayFiltrosPend ? (
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
            <Text style={styles.resultInfo}>{visibles.length} resultado(s)</Text>
            <Pressable onPress={limpiarPend} style={styles.clearSmall}><Text style={styles.clearSmallTxt}>Limpiar</Text></Pressable>
          </View>
        ) : null}

        {vista === "historial" && hayFiltrosHist ? (
          <View style={styles.resultBar}>
            <Text style={styles.resultInfo}>{visibles.length} resultado(s)</Text>
          </View>
        ) : null}

        {visibles.length === 0 ? (
          <View style={styles.empty}>
            <FontAwesome6 name={busqueda || fechaFiltro || horaFiltro || estadoFiltro !== "todas" ? "magnifying-glass" : "box-open"} size={24} color="#5a5a5a" />
            <Text style={styles.gris}>{busqueda || hayFiltrosHist || hayFiltrosPend ? "Sin resultados" : t("devoluciones.sinDevoluciones")}</Text>
            {(busqueda || hayFiltrosHist) ? (
              <Pressable onPress={vista === "pendientes" ? limpiarPend : limpiarHistorial} style={styles.btnGhostSm}>
                <Text style={styles.btnGhostSmTxt}>Limpiar filtros</Text>
              </Pressable>
            ) : null}
          </View>
        ) : visibles.map((r) => (
          <Pressable key={r.id_devolucion} onPress={() => abrirDetalle(r)} style={({ pressed }) => [styles.card, pressed && { opacity: 0.85 }]}>
            <View style={styles.cardHead}>
              <Text style={styles.cardTitle} numberOfLines={1}>{r.producto} · #{r.id_devolucion}</Text>
              <FontAwesome6 name="chevron-right" size={11} color="#6b6b6b" />
            </View>
            <Text style={styles.cardSub} numberOfLines={1}>{r.cliente} · {r.direccion}</Text>
            <Text style={styles.cardSub}>Estado: {r.estado_devolucion} · {r.recogida_estado}</Text>
            {r.fecha_solicitud ? <Text style={styles.cardSubSmall}>{new Date(r.fecha_solicitud).toLocaleDateString("es-ES")} {new Date(r.fecha_solicitud).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" })}</Text> : null}
            <View style={styles.badge}><Text style={styles.badgeTxt}>{r.recogida_estado || r.estado_devolucion}</Text></View>
          </Pressable>
        ))}
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
      <PickerModal
        visible={showEstado}
        title="Filtrar por estado"
        options={ESTADO_OPCIONES_DEV_HIST}
        value={estadoFiltro}
        onSelect={setEstadoFiltro}
        onClose={() => setShowEstado(false)}
      />

      <Modal visible={detalleVisible} transparent animationType="fade" onRequestClose={() => setDetalleVisible(false)} statusBarTranslucent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHead}>
              <Text style={styles.modalTitle}>Detalle devolución #{selected?.id_devolucion}</Text>
              <Pressable onPress={() => setDetalleVisible(false)} hitSlop={8} style={styles.modalClose}><FontAwesome6 name="xmark" size={14} color="#fff" /></Pressable>
            </View>
            {selected && (
              <View style={{ gap: 8 }}>
                <Text style={styles.label}>Cliente</Text><Text style={styles.value}>{selected.cliente}</Text>
                <Text style={styles.label}>{t("devoluciones.producto")}</Text><Text style={styles.value}>{selected.producto}</Text>
                <Text style={styles.label}>{t("devoluciones.pedido")}</Text><Text style={styles.value}>#{selected.id_pedido || "—"}</Text>
                <Text style={styles.label}>{t("tecnico.direccion")}</Text><Text style={styles.value}>{selected.direccion}</Text>
                {selected.telefono ? <><Text style={styles.label}>{t("tecnico.telefono")}</Text><Text style={styles.value}>{selected.telefono}</Text></> : null}
                <Text style={styles.label}>{t("devoluciones.estadoDevolucion")}</Text><Text style={styles.value}>{selected.estado_devolucion}</Text>
                <Text style={styles.label}>{t("devoluciones.estadoRecogida")}</Text><Text style={styles.value}>{selected.recogida_estado}</Text>
                {selected.motivo ? <><Text style={styles.label}>{t("devoluciones.motivo")}</Text><Text style={styles.gris}>{selected.motivo}</Text></> : null}
                <Text style={styles.label}>{t("devoluciones.preferencia")}</Text><Text style={styles.value}>{selected.preferencia || "No especificada"}</Text>
                {selected.recogida_estado !== "Recogida" && vista === "pendientes" && (
                  <Pressable onPress={() => { setDetalleVisible(false); subirEvidencia(selected.id_devolucion); }} disabled={subiendo === selected.id_devolucion} style={[styles.btn, subiendo === selected.id_devolucion && { opacity: 0.5 }]}>
                    <FontAwesome6 name="camera" size={12} color="#141414" />
                    <Text style={styles.btnTxt}>{subiendo === selected.id_devolucion ? "Subiendo..." : t("devoluciones.subirEvidencia")}</Text>
                  </Pressable>
                )}
                <Pressable onPress={() => setDetalleVisible(false)} style={styles.btnGhost}><Text style={styles.btnGhostTxt}>{t("common.cerrar")}</Text></Pressable>
              </View>
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
  contenido: { padding: 14, gap: 12 },
  centro: { flex: 1, backgroundColor: "#000", alignItems: "center", justifyContent: "center", gap: 10, paddingTop: 40 },
  gris: { color: "#bdbdbd", fontSize: 12.5, textAlign: "center" },
  titulo: { color: "#fff", fontSize: 18, fontFamily: FontFamilies.bodyBold },
  sub: { color: "#bdbdbd", fontSize: 13, marginTop: -8 },
  card: { backgroundColor: "#161616", borderWidth: 1, borderColor: "rgba(255,255,255,0.09)", borderRadius: 12, padding: 12, gap: 6 },
  cardHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 8 },
  cardTitle: { color: "#fff", fontSize: 14, fontFamily: FontFamilies.bodyBold, flex: 1 },
  cardSub: { color: "#bdbdbd", fontSize: 12 },
  cardSubSmall: { color: "#8a8a8a", fontSize: 11 },
  badge: { alignSelf: "flex-start", backgroundColor: "rgba(212,165,75,0.12)", borderWidth: 1, borderColor: "rgba(212,165,75,0.25)", borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2, marginTop: 4 },
  badgeTxt: { color: "#fff", fontSize: 10, fontFamily: FontFamilies.bodyBold },
  empty: { alignItems: "center", paddingVertical: 30, gap: 8 },
  btn: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "#caa24d", borderRadius: 8, paddingVertical: 8, paddingHorizontal: 12, alignSelf: "flex-start", marginTop: 6 },
  btnTxt: { color: "#141414", fontFamily: FontFamilies.button, fontSize: 12 },
  btnGhost: { borderRadius: 10, borderWidth: 1, borderColor: "rgba(212,165,75,0.35)", paddingVertical: 10, alignItems: "center", marginTop: 6 },
  btnGhostTxt: { color: "#f0c96f", fontFamily: FontFamilies.button, fontSize: 13 },
  btnGhostSm: { borderWidth: 1, borderColor: "rgba(212,165,75,0.35)", borderRadius: 999, paddingVertical: 7, paddingHorizontal: 14, marginTop: 6 },
  btnGhostSmTxt: { color: "#f0c96f", fontSize: 12, fontFamily: FontFamilies.bodyMedium },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.72)", justifyContent: "center", padding: 16 },
  modalCard: { backgroundColor: "#121212", borderRadius: 16, borderWidth: 1, borderColor: "rgba(212,165,75,0.28)", padding: 16, gap: 10, maxHeight: "85%" },
  modalHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  modalTitle: { color: "#fff", fontSize: 16, fontFamily: FontFamilies.bodyBold, flex: 1, marginRight: 8 },
  modalClose: { width: 28, height: 28, borderRadius: 14, borderWidth: 1, borderColor: "rgba(255,255,255,0.09)", alignItems: "center", justifyContent: "center" },
  label: { color: "#f0c96f", fontSize: 11, fontFamily: FontFamilies.bodyBold, textTransform: "uppercase" },
  value: { color: "#fff", fontSize: 13 },
  toastWrap: { position: "absolute", left: 0, right: 0, bottom: 90, alignItems: "center" },
  toast: { backgroundColor: "rgba(0,0,0,0.92)", borderWidth: 1, borderColor: "#c9a227", borderRadius: 40, paddingVertical: 9, paddingHorizontal: 16 },
  toastTxt: { color: "#f0c96f", fontSize: 12.5 },
  resultInfo: { color: "#8a8a8a", fontSize: 12 },
  resultBar: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  clearSmall: { borderWidth: 1, borderColor: "rgba(212,165,75,0.35)", borderRadius: 999, paddingVertical: 5, paddingHorizontal: 10 },
  clearSmallTxt: { color: "#f0c96f", fontSize: 11, fontFamily: FontFamilies.bodyMedium },
});
