// Ruta móvil de clientes. Expo Router la incorpora a la navegación según su ubicación en app/.
import React, { useEffect, useState, useRef, useMemo } from "react";
import { ActivityIndicator, Linking, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import FontAwesome6 from "@expo/vector-icons/FontAwesome6";
import { NeodomusColors as C, FontFamilies } from "@/constants/theme";
import { apiFetch } from "@/services/api";
import { useScrollTopAlEntrar } from "@/hooks/useScrollTopAlEntrar";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useIdioma } from "@/contexts/IdiomaContext";
import { SearchBar } from "@/components/tecnico/Filtros";

// Comunica con el backend mediante API "/tecnicos/mis-clientes".
export default function TecnicoClientesScreen() {
  const scrollRef = useRef<ScrollView>(null);
  useScrollTopAlEntrar(scrollRef);
  const insets = useSafeAreaInsets();
  const { t } = useIdioma();
  const [clientes, setClientes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [busqueda, setBusqueda] = useState("");

  useEffect(() => {
    apiFetch<any[]>("/tecnicos/mis-clientes").then(setClientes).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const filtrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    if (!q) return clientes;
    return clientes.filter((c) =>
      [c.nombre || "", c.email || "", c.telefono?.toString() || "", c.direccion || "", String(c.documento || ""), String(c.id_cliente || "")]
        .some((v) => v.toLowerCase().includes(q))
    );
  }, [clientes, busqueda]);

  if (loading) return <View style={styles.centro}><ActivityIndicator color={C.oro} /><Text style={styles.gris}>Cargando clientes...</Text></View>;
  return (
    <View style={styles.pantalla}>
      <ScrollView ref={scrollRef} contentContainerStyle={[styles.contenido, { paddingBottom: insets.bottom + 72 }]}>
        <Text style={styles.titulo}>Clientes</Text>
        <Text style={styles.sub}>Clientes con los que has trabajado</Text>

        <SearchBar
          value={busqueda}
          onChange={setBusqueda}
          placeholder="Buscar por nombre, correo, teléfono..."
        />

        {busqueda.trim() ? (
          <Text style={styles.resultInfo}>{filtrados.length} resultado(s) de {clientes.length}</Text>
        ) : (
          <Text style={styles.resultInfo}>{clientes.length} cliente(s)</Text>
        )}

        {clientes.length === 0 ? (
          <View style={styles.empty}><FontAwesome6 name="users" size={24} color="#5a5a5a" /><Text style={styles.gris}>Sin clientes aún</Text></View>
        ) : filtrados.length === 0 ? (
          <View style={styles.empty}>
            <FontAwesome6 name="magnifying-glass" size={22} color="#5a5a5a" />
            <Text style={styles.emptyTitle}>Sin resultados</Text>
            <Text style={styles.gris}>No hay clientes que coincidan con “{busqueda.trim()}”.</Text>
            <Pressable onPress={() => setBusqueda("")} style={styles.btnGhostSm}><Text style={styles.btnGhostSmTxt}>Limpiar búsqueda</Text></Pressable>
          </View>
        ) : filtrados.map((c) => (
          <View key={c.id_cliente} style={styles.card}>
            <Text style={styles.cardTitle}>{c.nombre}</Text>
            {c.email ? <Text style={styles.cardSub}>{c.email}</Text> : null}
            {c.telefono ? <Text style={styles.cardSub}>Tel: {c.telefono}</Text> : null}
            {c.direccion ? <Text style={styles.cardSub} numberOfLines={1}>{c.direccion}</Text> : null}
            <Text style={styles.cardSub}>{c.citas_count} cita(s)</Text>
            <View style={{ flexDirection: "row", gap: 8, marginTop: 6 }}>
              {c.telefono ? (
                <Pressable onPress={() => Linking.openURL(`tel:${c.telefono}`)} style={styles.btn}><FontAwesome6 name="phone" size={12} color="#141414" /><Text style={styles.btnTxt}>Llamar</Text></Pressable>
              ) : null}
              {c.telefono ? (
                <Pressable onPress={() => Linking.openURL(`https://wa.me/57${String(c.telefono).replace(/\D/g, "")}`)} style={styles.btnOutline}><FontAwesome6 name="whatsapp" size={12} color="#f0c96f" /><Text style={styles.btnOutlineTxt}>WhatsApp</Text></Pressable>
              ) : null}
            </View>
          </View>
        ))}
      </ScrollView>
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
  resultInfo: { color: "#8a8a8a", fontSize: 12 },
  card: { backgroundColor: "#161616", borderWidth: 1, borderColor: "rgba(255,255,255,0.09)", borderRadius: 12, padding: 12, gap: 4 },
  cardTitle: { color: "#fff", fontSize: 14, fontFamily: FontFamilies.bodyBold },
  cardSub: { color: "#bdbdbd", fontSize: 12 },
  empty: { alignItems: "center", paddingVertical: 30, gap: 8 },
  emptyTitle: { color: "#fff", fontSize: 13, fontFamily: FontFamilies.bodyBold },
  btn: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "#caa24d", borderRadius: 8, paddingVertical: 7, paddingHorizontal: 10 },
  btnTxt: { color: "#141414", fontFamily: FontFamilies.button, fontSize: 12 },
  btnOutline: { flexDirection: "row", alignItems: "center", gap: 6, borderWidth: 1, borderColor: "rgba(212,165,75,0.45)", borderRadius: 8, paddingVertical: 7, paddingHorizontal: 10 },
  btnOutlineTxt: { color: "#f0c96f", fontFamily: FontFamilies.button, fontSize: 12 },
  btnGhostSm: { borderWidth: 1, borderColor: "rgba(212,165,75,0.35)", borderRadius: 999, paddingVertical: 7, paddingHorizontal: 14, marginTop: 6 },
  btnGhostSmTxt: { color: "#f0c96f", fontSize: 12, fontFamily: FontFamilies.bodyMedium },
});
