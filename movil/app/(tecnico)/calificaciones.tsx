// Ruta móvil de calificaciones. Expo Router la incorpora a la navegación según su ubicación en app/.
import React, { useEffect, useState, useRef, useMemo } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
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
  formatDateDisplay,
} from "@/components/tecnico/Filtros";

// Comunica con el backend mediante API "/calificaciones/mis".
export default function TecnicoCalificacionesScreen() {
  const scrollRef = useRef<ScrollView>(null);
  useScrollTopAlEntrar(scrollRef);
  const insets = useSafeAreaInsets();
  const { idioma } = useIdioma();
  const [data, setData] = useState<any>({});
  const [loading, setLoading] = useState(true);

  const [busqueda, setBusqueda] = useState("");
  const [filtroFecha, setFiltroFecha] = useState("");
  const [showCal, setShowCal] = useState(false);

  const hayFiltros = Boolean(busqueda.trim()) || Boolean(filtroFecha);
  const limpiarFiltros = () => { setBusqueda(""); setFiltroFecha(""); };

  useEffect(() => {
    apiFetch<any>("/calificaciones/mis").then(setData).catch(() => {}).finally(() => setLoading(false));
  }, []);

  if (loading) return <View style={styles.centro}><ActivityIndicator color={C.oro} /><Text style={styles.gris}>Cargando calificaciones...</Text></View>;

  const todas: any[] = data.calificaciones || [];

  const filtradas = useMemo(() => {
    let r = [...todas];
    if (busqueda.trim()) {
      const q = busqueda.trim().toLowerCase();
      r = r.filter((c) => `${c.cliente || ""} ${c.comentario || ""} ${c.servicio || ""}`.toLowerCase().includes(q));
    }
    if (filtroFecha) {
      r = r.filter((c) => (c.created_at || "").slice(0, 10) === filtroFecha);
    }
    return r;
  }, [todas, busqueda, filtroFecha]);

  return (
    <View style={styles.pantalla}>
      <ScrollView ref={scrollRef} contentContainerStyle={[styles.contenido, { paddingBottom: insets.bottom + 72 }]}>
        <Text style={styles.titulo}>Mis Calificaciones</Text>
        {data.promedio != null ? (
          <View style={styles.head}>
            <Text style={styles.prom}>★ {Number(data.promedio).toFixed(1)}</Text>
            <Text style={styles.gris}>{data.total || 0} calificaciones</Text>
          </View>
        ) : (
          <Text style={styles.gris}>Sin calificaciones aún</Text>
        )}

        <SearchBar
          value={busqueda}
          onChange={setBusqueda}
          placeholder="Buscar por cliente, servicio, comentario..."
        />

        <FilterRow>
          <FilterChip
            label={filtroFecha ? formatDateDisplay(filtroFecha) : "Fecha"}
            icon="calendar-days"
            active={Boolean(filtroFecha)}
            onPress={() => setShowCal(true)}
          />
          {hayFiltros ? <ClearFiltersBtn onPress={limpiarFiltros} /> : null}
          {hayFiltros ? (
            <View style={styles.countPill}>
              <Text style={styles.countPillTxt}>{filtradas.length}</Text>
            </View>
          ) : null}
        </FilterRow>

        {hayFiltros ? <Text style={styles.resultInfo}>{filtradas.length} resultado(s) de {todas.length}</Text> : null}

        {todas.length === 0 ? (
          <View style={styles.empty}><FontAwesome6 name="star" size={24} color="#5a5a5a" /><Text style={styles.gris}>Aún no has recibido calificaciones</Text></View>
        ) : filtradas.length === 0 ? (
          <View style={styles.empty}>
            <FontAwesome6 name="magnifying-glass" size={22} color="#5a5a5a" />
            <Text style={styles.emptyTitle}>Sin resultados</Text>
            <Text style={styles.gris}>No hay calificaciones que coincidan con los filtros.</Text>
            <Pressable onPress={limpiarFiltros} style={styles.btnGhostSm}><Text style={styles.btnGhostSmTxt}>Limpiar filtros</Text></Pressable>
          </View>
        ) : filtradas.map((c: any) => (
          <View key={c.id_calificacion} style={styles.card}>
            <Text style={styles.cardTitle}>{c.cliente || "Cliente"}</Text>
            <Text style={{ color: "#ffc94d" }}>{"★".repeat(Math.min(5, Math.max(1, c.calificacion)))} <Text style={styles.gris}>{c.created_at ? new Date(c.created_at).toLocaleDateString(idioma === "en" ? "en-US" : "es-ES") : ""}</Text></Text>
            {c.comentario ? <Text style={styles.gris}>{c.comentario}</Text> : null}
            {c.servicio ? <Text style={styles.grisSmall}>{c.servicio}</Text> : null}
          </View>
        ))}
      </ScrollView>

      <CalendarPicker visible={showCal} value={filtroFecha} onSelect={setFiltroFecha} onClose={() => setShowCal(false)} />
    </View>
  );
}
const styles = StyleSheet.create({
  pantalla: { flex: 1, backgroundColor: "#000" },
  contenido: { padding: 14, gap: 12, paddingBottom: 32 },
  centro: { flex: 1, backgroundColor: "#000", alignItems: "center", justifyContent: "center", gap: 10, paddingTop: 40 },
  gris: { color: "#bdbdbd", fontSize: 12.5, textAlign: "center" },
  grisSmall: { color: "#8a8a8a", fontSize: 11.5 },
  titulo: { color: "#fff", fontSize: 18, fontFamily: FontFamilies.bodyBold },
  head: { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: "#161616", borderWidth: 1, borderColor: "rgba(255,255,255,0.09)", borderRadius: 12, padding: 12 },
  prom: { color: "#ffc94d", fontSize: 20, fontFamily: FontFamilies.bodyBold },
  card: { backgroundColor: "#161616", borderWidth: 1, borderColor: "rgba(255,255,255,0.09)", borderRadius: 12, padding: 12, gap: 4 },
  cardTitle: { color: "#fff", fontSize: 14, fontFamily: FontFamilies.bodyBold },
  empty: { alignItems: "center", paddingVertical: 30, gap: 8 },
  emptyTitle: { color: "#fff", fontSize: 13, fontFamily: FontFamilies.bodyBold },
  resultInfo: { color: "#8a8a8a", fontSize: 12 },
  countPill: { backgroundColor: "#caa24d", borderRadius: 999, paddingHorizontal: 8, paddingVertical: 4, marginLeft: "auto" },
  countPillTxt: { color: "#141414", fontSize: 11, fontFamily: FontFamilies.bodyBold },
  btnGhostSm: { borderWidth: 1, borderColor: "rgba(212,165,75,0.35)", borderRadius: 999, paddingVertical: 7, paddingHorizontal: 14, marginTop: 6 },
  btnGhostSmTxt: { color: "#f0c96f", fontSize: 12, fontFamily: FontFamilies.bodyMedium },
});
