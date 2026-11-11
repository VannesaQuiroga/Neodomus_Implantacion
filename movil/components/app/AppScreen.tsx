// ─────────────────────────────────────────────────────────────
// Contenedor (AuthenticatedLayout) de pantallas del usuario:
//
//   ┌ PublicNavbar  ← SIEMPRE (global, no por pantalla)
//   ├ Sub-cabecera: Volver + título
//   ├ Contenido scroll
//   └ Tab bar inferior ← lo aporta el grupo (tabs) nativo
//
// Las pantallas autenticadas viven DENTRO del grupo (tabs), por lo
// que navbar+tabs permanecen montados en toda la navegación.
// ─────────────────────────────────────────────────────────────

import React, { type ReactNode, useRef } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import type { ScrollViewInstance, TextInputInstance } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import FontAwesome6 from "@expo/vector-icons/FontAwesome6";

import { FontFamilies } from "@/constants/theme";
import PublicNavbar from "@/components/public/PublicNavbar";
import { useScrollTopAlEntrar } from "@/hooks/useScrollTopAlEntrar";

interface AppScreenProps {
  titulo: string;
  children: ReactNode;
  /** En tabs raíz no hay historial que "volver". */
  ocultarVolver?: boolean;
}

export default function AppScreen({
  titulo,
  ocultarVolver = false,
  children,
}: AppScreenProps) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const scrollRef = useRef<ScrollViewInstance | null>(null);
  useScrollTopAlEntrar(scrollRef);

  return (
    <View style={styles.pantalla}>
      {/* NAVBAR GLOBAL — presente en todas las pantallas autenticadas */}
      <PublicNavbar />

      <View style={styles.subcabecera}>
        {!ocultarVolver && (
          <Pressable
            style={({ pressed }) => [
              styles.volver,
              pressed && styles.presionado,
            ]}
            onPress={() => router.back()}
            hitSlop={6}
            accessibilityLabel="Volver"
          >
            <FontAwesome6 name="chevron-left" size={13} color="#f0c96f" />
          </Pressable>
        )}
        <Text style={styles.titulo} numberOfLines={1}>
          {titulo}
        </Text>
        <View style={styles.espacioDerecho} />
      </View>

      <ScrollView
        ref={scrollRef}
        style={styles.scroll}
        contentContainerStyle={[
          styles.contenido,
          { paddingBottom: insets.bottom + 32 },
        ]}
        keyboardShouldPersistTaps="handled"
      >
        {children}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  pantalla: {
    flex: 1,
    backgroundColor: "#000000",
  },

  subcabecera: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 14,
    paddingTop: 8,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(212,165,75,0.28)",
    backgroundColor: "#000000",
  },

  volver: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 1,
    borderColor: "rgba(212,165,75,0.35)",
    alignItems: "center",
    justifyContent: "center",
  },

  presionado: { opacity: 0.7 },

  titulo: {
    flex: 1,
    color: "#ffffff",
    fontSize: 18,
    fontFamily: FontFamilies.bodyBold,
  },

  espacioDerecho: { width: 34 },

  scroll: { flex: 1 },

  contenido: {
    padding: 16,
    gap: 14,
  },
});
