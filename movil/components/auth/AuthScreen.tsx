// ─────────────────────────────────────────────────────────────
// Contenedor MODAL de las pantallas de autenticación.
//
// Se presenta como transparentModal de expo-router: la pantalla
// pública queda MONTADA detrás y el contenido se muestra como una
// hoja inferior (bottom sheet) con la identidad Neodomus.
// La X (y el toque en el fondo oscurecido) hacen router.back() →
// el usuario vuelve EXACTAMENTE a donde estaba.
// ─────────────────────────────────────────────────────────────

import React, { type ReactNode } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { BlurView } from "expo-blur";
import { router } from "expo-router";
import FontAwesome6 from "@expo/vector-icons/FontAwesome6";

import { NeodomusColors as C, FontFamilies } from "@/constants/theme";

interface AuthScreenProps {
  children: ReactNode;
}

export default function AuthScreen({ children }: AuthScreenProps) {
  const cerrar = () => {
    if (router.canDismiss()) {
      router.back();
    } else {
      router.replace("/(tabs)");
    }
  };

  return (
    <View style={styles.raiz}>
      {/* Fondo DESENFOCIDO (BlurView) + overlay sutil: la pantalla pública
          sigue visible detrás pero el foco visual es el modal. */}
      <BlurView
        intensity={80}
        tint="dark"
        blurMethod="dimezisBlurView"
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />
      <Pressable
        style={styles.backdrop}
        onPress={cerrar}
        accessibilityLabel="Cerrar"
      />

      {/* Centrado VERTICAL real: el KAV ocupa todo y centra su hijo.
          Con teclado abierto (iOS padding / Android resize) la tarjeta
          sigue utilizable sin quedar fuera de pantalla. */}
      <KeyboardAvoidingView
        style={styles.centrador}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        pointerEvents="box-none"
      >
        <View style={styles.hoja}>
          <View style={styles.lineaOro} />

          {/* Cabecera compacta del modal */}
          <View style={styles.cabecera}>
            <Text style={styles.marca}>NEODOMUS</Text>
            <Pressable
              onPress={cerrar}
              style={({ pressed }) => [
                styles.botonCerrar,
                pressed && styles.presionado,
              ]}
              accessibilityLabel="Cerrar"
              accessibilityRole="button"
              hitSlop={8}
            >
              <FontAwesome6 name="xmark" size={15} color={C.blanco} />
            </Pressable>
          </View>

          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.contenidoScroll}
            keyboardShouldPersistTaps="handled"
            bounces={false}
          >
            {children}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  raiz: {
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: 16,
  },

  // Contenedor que CENTRA la tarjeta; deja espacio superior para que
  // el navbar/status bar se perciban detrás del overlay.
  centrador: {
    flex: 1,
    justifyContent: "center",
    paddingTop: 60,
  },

  // Overlay oscurecido sobre el blur (contraste para el modal).
  backdrop: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0,0,0,0.7)",
  },

  hoja: {
    maxHeight: "84%",
    borderRadius: 24,
    borderWidth: 1,
    borderColor: C.bordeOro,
    backgroundColor: "#0a0a0e",
    overflow: "hidden",
    alignSelf: "stretch",
  },

  lineaOro: {
    height: 3,
    backgroundColor: C.oroClaro,
  },

  cabecera: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 18,
    paddingTop: 14,
    paddingBottom: 4,
  },

  marca: {
    color: C.oroSuave,
    fontSize: 13,
    fontFamily: FontFamilies.bodyBlack,
    letterSpacing: 2,
  },

  botonCerrar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 1,
    borderColor: C.grisBorde,
    backgroundColor: "rgba(255,255,255,0.05)",
    alignItems: "center",
    justifyContent: "center",
  },

  scroll: {
    flexGrow: 0,
  },

  contenidoScroll: {
    paddingHorizontal: 18,
    paddingTop: 8,
    paddingBottom: 30,
  },

  presionado: { opacity: 0.7 },
});
