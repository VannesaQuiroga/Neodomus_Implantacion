// Controla el acceso al contenido reservado a la sesión del técnico.
import React, { type ReactNode } from "react";
import { Pressable, StyleSheet, Text } from "react-native";
import { useRouter } from "expo-router";
import AppScreen from "@/components/app/AppScreen";
import { FontFamilies } from "@/constants/theme";
import { useAuth } from "@/contexts/AuthContext";

export default function GateTecnico({ titulo, children }: { titulo: string; children: ReactNode }) {
  const { cargando, autenticado, rol } = useAuth();
  const router = useRouter();
  const rolNorm = (rol || "").toLowerCase();
  const esTecnico = rolNorm === "tecnico";

  if (cargando) return null;

  if (!autenticado || !esTecnico) {
    return (
      <AppScreen titulo={titulo}>
        <Text style={S.titulo}>Acceso solo para técnicos</Text>
        <Text style={S.texto}>Esta sección es exclusiva para técnicos autenticados de Neodomus.</Text>
        <Pressable style={({ pressed }) => [S.botonOro, pressed && S.presionado]} onPress={() => router.replace("/login" as any)}>
          <Text style={S.textoBotonOro}>Iniciar sesión</Text>
        </Pressable>
      </AppScreen>
    );
  }

  return <>{children}</>;
}

const S = StyleSheet.create({
  titulo: { color: "#ffffff", fontSize: 18, fontFamily: FontFamilies.bodyBold, textAlign: "center" },
  texto: { color: "#bdbdbd", fontSize: 13.5, lineHeight: 20, textAlign: "center", marginBottom: 10 },
  botonOro: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 9,
    backgroundColor: "#caa24d",
    borderRadius: 12,
    minHeight: 48,
    paddingHorizontal: 16,
  },
  textoBotonOro: { color: "#141414", fontFamily: FontFamilies.button, fontSize: 14 },
  presionado: { opacity: 0.85 },
});
