// Ruta móvil de historial. Expo Router la incorpora a la navegación según su ubicación en app/.
import React, { useEffect, useState, useRef, useMemo } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, Text, View, Pressable } from "react-native";
import FontAwesome6 from "@expo/vector-icons/FontAwesome6";
import { NeodomusColors as C, FontFamilies } from "@/constants/theme";
import { apiFetch } from "@/services/api";
import { useScrollTopAlEntrar } from "@/hooks/useScrollTopAlEntrar";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useIdioma } from "@/contexts/IdiomaContext";
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

const ESTADOS_HISTORIAL = ["Finalizada", "Cancelada"];

const TIPO_SERVICIO: Record<string, string> = {
  instalacion: "Instalación",
  reparacion: "Reparación",
  mantenimiento: "Mantenimiento",
  revision: "Revisión técnica",
  soporte: "Soporte",
};

const ESTADO_CITAS_OPS = [
  { label: "Todas", value: "todas" },
  { label: "Finalizada", value: "Finalizada" },
  { label: "Cancelada", value: "Cancelada" },
];

const ESTADO_ENTREGAS_OPS = [
  { label: "Todas", value: "todas" },
  { label: "Recogido", value: "Recogido" },
  { label: "En camino", value: "En camino" },
  { label: "Entregado", value: "Entregado" },
];

function formatFechaLarga(fecha: string, idioma: string) {
  try {
    const d = new Date(`${fecha}T00:00:00`);
    return d.toLocaleDateString(idioma === "en" ? "en-US" : "es-ES", {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  } catch { return fecha; }
}

// Comunica con el backend mediante API "/tecnicos/mis-citas", API "/tecnicos/entregas", API "/tecnicos/mis-entregas"; programa una actualización periódica.
export default function TecnicoHistorialScreen() {
  const scrollRef = useRef<ScrollView>(null);
  useScrollTopAlEntrar(scrollRef);
  const insets = useSafeAreaInsets();
  const { t, idioma } = useIdioma();

  const [vista, setVista] = useState<"citas" | "entregas">("citas");
  const [citas, setCitas] = useState<any[]>([]);
  const [entregas, setEntregas] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const [busqueda, setBusqueda] = useState("");
  const [filtroCitas, setFiltroCitas] = useState("todas");
  const [filtroEntrega, setFiltroEntrega] = useState("todas");
  const [filtroFecha, setFiltroFecha] = useState("");
  const [filtroHora, setFiltroHora] = useState("");

  const [showCal, setShowCal] = useState(false);
  const [showHora, setShowHora] = useState(false);
  const [showEstado, setShowEstado] = useState(false);

  const hayFiltros =
    Boolean(busqueda.trim()) ||
    (vista === "citas" ? filtroCitas !== "todas" : filtroEntrega !== "todas") ||
    Boolean(filtroFecha) ||
    Boolean(filtroHora);

  const limpiarFiltros = () => {
    setBusqueda("");
    setFiltroCitas("todas");
    setFiltroEntrega("todas");
    setFiltroFecha("");
    setFiltroHora("");
  };

  // reset estado filter when switching tabs
  useEffect(() => {
    setFiltroCitas("todas");
    setFiltroEntrega("todas");
  }, [vista]);

  // Comunica con el backend mediante API "/tecnicos/mis-citas".
  const fetchCitas = async () => {
    try {
      const res = await apiFetch<any[]>("/tecnicos/mis-citas");
      setCitas(Array.isArray(res) ? res : []);
    } catch {}
    setLoading(false);
  };

  useEffect(() => {
    fetchCitas();
    const interval = setInterval(fetchCitas, 60000);
    return () => clearInterval(interval);
  }, []);

  // lazy load entregas
  useEffect(() => {
    if (vista !== "entregas" || entregas.length > 0) return;
    let activo = true;
    // Comunica con el backend mediante API "/tecnicos/entregas", API "/tecnicos/mis-entregas".
    const cargar = async () => {
      try {
        const res = await apiFetch<any[]>("/tecnicos/entregas").catch(() => apiFetch<any[]>("/tecnicos/mis-entregas"));
        if (activo) setEntregas(Array.isArray(res) ? res : []);
      } catch {}
    };
    cargar();
    return () => { activo = false; };
  }, [vista, entregas.length]);

  const historialCitas = useMemo(() =>
    citas.filter((c) => ESTADOS_HISTORIAL.includes(c.estado)).sort((a, b) => (b.fecha + b.hora).localeCompare(a.fecha + a.hora)),
  [citas]);

  const entregasHistorial = useMemo(() =>
    entregas
      .filter((e) => e.estado_entrega === "Entregado")
      .sort((a, b) => (b.fecha_entrega || "").localeCompare(a.fecha_entrega || "")),
  [entregas]);

  const q = busqueda.trim().toLowerCase();

  const citasVisibles = useMemo(() => historialCitas.filter((c) => {
    if (filtroCitas !== "todas" && c.estado !== filtroCitas) return false;
    if (filtroFecha && c.fecha !== filtroFecha) return false;
    if (filtroHora && (c.hora || "").slice(0,5) !== filtroHora) return false;
    if (!q) return true;
    const campos = [
      c.cliente || "",
      c.telefono?.toString() || "",
      formatFechaLarga(c.fecha || "", idioma),
      c.fecha || "",
      c.hora || "",
      TIPO_SERVICIO[c.tipo_servicio] || c.tipo_servicio || "",
      c.descripcion || "",
      c.direccion || "",
      c.nombre_tecnico || "",
      c.nombre_tecnico_2 || "",
      c.estado || "",
    ];
    return campos.some((v) => v.toLowerCase().includes(q));
  }), [historialCitas, filtroCitas, filtroFecha, filtroHora, q, idioma]);

  const entregasVisibles = useMemo(() => entregasHistorial.filter((e) => {
    if (filtroEntrega !== "todas" && e.estado_entrega !== filtroEntrega) return false;
    if (filtroFecha && (e.fecha_entrega || "") !== filtroFecha) return false;
    if (filtroHora && (e.hora_entrega || "").slice(0,5) !== filtroHora) return false;
    if (!q) return true;
    const campos = [
      e.cliente || "",
      String(e.id_pedido || ""),
      e.fecha_entrega || "",
      e.hora_entrega || "",
    ];
    return campos.some((v) => v.toLowerCase().includes(q));
  }), [entregasHistorial, filtroEntrega, filtroFecha, filtroHora, q]);

  const estadoLabelCitas = ESTADO_CITAS_OPS.find((o) => o.value === filtroCitas)?.label || "Estado";
  const estadoLabelEntregas = ESTADO_ENTREGAS_OPS.find((o) => o.value === filtroEntrega)?.label || "Estado";
  const estadoLabel = vista === "citas" ? estadoLabelCitas : estadoLabelEntregas;

  const estadoOps = vista === "citas" ? ESTADO_CITAS_OPS : ESTADO_ENTREGAS_OPS;
  const estadoValor = vista === "citas" ? filtroCitas : filtroEntrega;
  const setEstadoValor = (v: string) => {
    if (vista === "citas") setFiltroCitas(v);
    else setFiltroEntrega(v);
  };

  if (loading) return <View style={styles.centro}><ActivityIndicator color={C.oro} /><Text style={styles.gris}>Cargando historial...</Text></View>;

  const listaVacia = vista === "citas" ? historialCitas.length === 0 : entregasHistorial.length === 0;
  const sinResultados = vista === "citas" ? (citasVisibles.length === 0 && !listaVacia) : (entregasVisibles.length === 0 && !listaVacia);

  return (
    <View style={styles.pantalla}>
      <ScrollView ref={scrollRef} contentContainerStyle={[styles.contenido, { paddingBottom: insets.bottom + 72 }]} showsVerticalScrollIndicator={false}>
        <Text style={styles.titulo}>Historial</Text>
        <Text style={styles.sub}>{vista === "citas" ? "Citas finalizadas y canceladas" : "Entregas completadas"}</Text>

        <Tabs
          tabs={[
            { key: "citas", label: "Citas", icon: "screwdriver-wrench", count: historialCitas.length },
            { key: "entregas", label: "Entregas", icon: "truck-fast", count: entregasHistorial.length },
          ]}
          active={vista}
          onChange={(k) => setVista(k as any)}
        />

        <SearchBar
          value={busqueda}
          onChange={setBusqueda}
          placeholder={vista === "citas" ? "Buscar por cliente, dirección, servicio..." : "Buscar por cliente, pedido..."}
        />

        <FilterRow>
          <FilterChip
            label={estadoLabel}
            icon="filter"
            active={estadoValor !== "todas"}
            onPress={() => setShowEstado(true)}
          />
          <FilterChip
            label={filtroFecha ? formatDateDisplay(filtroFecha) : "Fecha"}
            icon="calendar-days"
            active={Boolean(filtroFecha)}
            onPress={() => setShowCal(true)}
          />
          <FilterChip
            label={filtroHora || "Hora"}
            icon="clock"
            active={Boolean(filtroHora)}
            onPress={() => setShowHora(true)}
          />
          {hayFiltros ? <ClearFiltersBtn onPress={limpiarFiltros} /> : null}
        </FilterRow>

        {hayFiltros ? (
          <Text style={styles.resultInfo}>
            {vista === "citas" ? citasVisibles.length : entregasVisibles.length} resultado(s)
          </Text>
        ) : null}

        {listaVacia ? (
          <View style={styles.empty}><FontAwesome6 name={vista === "citas" ? "clock-rotate-left" : "truck-fast"} size={24} color="#5a5a5a" /><Text style={styles.gris}>{vista === "citas" ? "Sin historial" : "No tienes entregas completadas todavía."}</Text></View>
        ) : sinResultados ? (
          <View style={styles.empty}>
            <FontAwesome6 name="magnifying-glass" size={22} color="#5a5a5a" />
            <Text style={styles.emptyTitle}>Sin resultados</Text>
            <Text style={styles.gris}>No hay registros que coincidan con los filtros.</Text>
            <Pressable onPress={limpiarFiltros} style={styles.btnGhostSm}><Text style={styles.btnGhostSmTxt}>Limpiar filtros</Text></Pressable>
          </View>
        ) : vista === "citas" ? (
          citasVisibles.map((c) => (
            <View key={c.id_cita} style={styles.card}>
              <View style={styles.cardHead}>
                <Text style={styles.cardTitle}>{c.cliente} · {TIPO_SERVICIO[c.tipo_servicio] || c.tipo_servicio}</Text>
                <View style={[styles.badge, c.estado === "Finalizada" ? styles.bOk : styles.bErr]}><Text style={styles.badgeTxt}>{c.estado}</Text></View>
              </View>
              <Text style={styles.cardSub}><FontAwesome6 name="calendar-days" size={10} color="#8a8a8a" /> {c.fecha} · {c.hora}</Text>
              <Text style={styles.cardSub}>{c.direccion}</Text>
              {c.descripcion ? <Text style={styles.cardSubSmall}>{c.descripcion}</Text> : null}
            </View>
          ))
        ) : (
          entregasVisibles.map((e) => (
            <View key={e.id_pedido} style={styles.card}>
              <View style={styles.cardHead}>
                <Text style={styles.cardTitle}>{e.cliente} · Pedido #{e.id_pedido}</Text>
                <View style={[styles.badge, styles.bOk]}><Text style={styles.badgeTxt}>{e.estado_entrega}</Text></View>
              </View>
              <Text style={styles.cardSub}>{e.fecha_entrega || "—"} {e.hora_entrega ? `· ${e.hora_entrega}` : ""}{e.hora_entrega_fin ? ` - ${e.hora_entrega_fin}` : ""}</Text>
              {(e.productos || []).slice(0, 3).map((p: any, i: number) => (
                <Text key={i} style={styles.cardSubSmall}>× {p.cantidad} {p.descripcion}</Text>
              ))}
              {(e.productos || []).length > 3 ? <Text style={styles.cardSubSmall}>+{(e.productos || []).length - 3} más</Text> : null}
            </View>
          ))
        )}
      </ScrollView>

      <CalendarPicker visible={showCal} value={filtroFecha} onSelect={setFiltroFecha} onClose={() => setShowCal(false)} />
      <PickerModal
        visible={showHora}
        title="Filtrar por hora"
        options={HORAS_OPCIONES_12H}
        value={filtroHora}
        onSelect={setFiltroHora}
        onClose={() => setShowHora(false)}
      />
      <PickerModal
        visible={showEstado}
        title={vista === "citas" ? "Filtrar por estado" : "Filtrar por estado de entrega"}
        options={estadoOps}
        value={estadoValor}
        onSelect={setEstadoValor}
        onClose={() => setShowEstado(false)}
      />
    </View>
  );
}
const styles = StyleSheet.create({
  pantalla: { flex: 1, backgroundColor: "#000" },
  contenido: { padding: 14, gap: 12, paddingBottom: 32 },
  centro: { flex: 1, backgroundColor: "#000", alignItems: "center", justifyContent: "center", gap: 10, paddingTop: 40 },
  gris: { color: "#bdbdbd", fontSize: 12.5, textAlign: "center" },
  titulo: { color: "#fff", fontSize: 18, fontFamily: FontFamilies.bodyBold },
  sub: { color: "#bdbdbd", fontSize: 13, marginTop: -8 },
  card: { backgroundColor: "#161616", borderWidth: 1, borderColor: "rgba(255,255,255,0.09)", borderRadius: 12, padding: 12, gap: 4 },
  cardHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 8 },
  cardTitle: { color: "#fff", fontSize: 14, fontFamily: FontFamilies.bodyBold, flex: 1 },
  cardSub: { color: "#bdbdbd", fontSize: 12 },
  cardSubSmall: { color: "#8a8a8a", fontSize: 11.5 },
  badge: { borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2, borderWidth: 1 },
  bOk: { backgroundColor: "rgba(126,226,154,0.15)", borderColor: "rgba(126,226,154,0.3)" },
  bErr: { backgroundColor: "rgba(240,133,138,0.12)", borderColor: "rgba(240,133,138,0.25)" },
  badgeTxt: { color: "#fff", fontSize: 10, fontFamily: FontFamilies.bodyBold },
  empty: { alignItems: "center", paddingVertical: 30, gap: 8 },
  emptyTitle: { color: "#fff", fontSize: 13, fontFamily: FontFamilies.bodyBold },
  resultInfo: { color: "#8a8a8a", fontSize: 12 },
  btnGhostSm: { borderWidth: 1, borderColor: "rgba(212,165,75,0.35)", borderRadius: 999, paddingVertical: 7, paddingHorizontal: 14, marginTop: 6 },
  btnGhostSmTxt: { color: "#f0c96f", fontSize: 12, fontFamily: FontFamilies.bodyMedium },
});
