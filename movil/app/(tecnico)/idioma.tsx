// Ruta móvil de idioma. Expo Router la incorpora a la navegación según su ubicación en app/.
import React from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import FontAwesome6 from "@expo/vector-icons/FontAwesome6";
import { FontFamilies, NeodomusColors as C } from "@/constants/theme";
import { useIdioma } from "@/contexts/IdiomaContext";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export default function IdiomaTecnico() {
  const { idioma, setIdioma } = useIdioma();
  const insets = useSafeAreaInsets();

  const opciones: { code: "es" | "en"; label: string; desc: string }[] = [
    { code: "es", label: "Español", desc: "Idioma principal de Neodomus" },
    { code: "en", label: "English", desc: "Neodomus main language" },
  ];

  return (
    <View style={styles.pantalla}>
      <ScrollView contentContainerStyle={[styles.contenido, { paddingBottom: insets.bottom + 72 }]} showsVerticalScrollIndicator={false}>
        <Text style={styles.titulo}>Idioma</Text>
        <Text style={styles.sub}>Selecciona el idioma de la aplicación</Text>

        <View style={styles.card}>
          {opciones.map((op) => {
            const activo = idioma === op.code;
            return (
              <Pressable
                key={op.code}
                onPress={() => setIdioma(op.code)}
                style={[styles.opcion, activo && styles.opcionActiva]}
              >
                <View style={[styles.iconCircle, activo && { backgroundColor: "#caa24d", borderColor: "#caa24d" }]}>
                  <FontAwesome6 name="language" size={14} color={activo ? "#141414" : "#f0c96f"} />
                </View>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={[styles.opLabel, activo && styles.opLabelActiva]}>{op.label}</Text>
                  <Text style={styles.opDesc}>{op.desc}</Text>
                </View>
                <View style={[styles.radio, activo && styles.radioActivo]}>
                  {activo ? <View style={styles.radioDot} /> : null}
                </View>
              </Pressable>
            );
          })}
        </View>

        <View style={styles.nota}>
          <FontAwesome6 name="circle-info" size={12} color={C.oro} />
          <Text style={styles.notaTxt}>El idioma se aplica inmediatamente en toda la app.</Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  pantalla: { flex: 1, backgroundColor: "#000" },
  contenido: { padding: 16, gap: 14 },
  titulo: { color: "#fff", fontSize: 20, fontFamily: FontFamilies.bodyBold },
  sub: { color: "#bdbdbd", fontSize: 13, marginTop: -8 },
  card: { backgroundColor: "#161616", borderWidth: 1, borderColor: "rgba(255,255,255,0.09)", borderRadius: 14, padding: 12, gap: 10 },
  opcion: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.07)",
    borderRadius: 12,
    padding: 14,
  },
  opcionActiva: { backgroundColor: "rgba(212,165,75,0.12)", borderColor: "#caa24d" },
  iconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(212,165,75,0.12)",
    borderWidth: 1,
    borderColor: "rgba(212,165,75,0.22)",
    alignItems: "center",
    justifyContent: "center",
  },
  opLabel: { color: "#fff", fontSize: 14, fontFamily: FontFamilies.bodyBold },
  opLabelActiva: { color: "#f0c96f" },
  opDesc: { color: "#bdbdbd", fontSize: 12 },
  radio: { width: 20, height: 20, borderRadius: 10, borderWidth: 1.5, borderColor: "rgba(255,255,255,0.2)", alignItems: "center", justifyContent: "center" },
  radioActivo: { borderColor: "#caa24d", backgroundColor: "#caa24d" },
  radioDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: "#141414" },
  nota: {
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
});
