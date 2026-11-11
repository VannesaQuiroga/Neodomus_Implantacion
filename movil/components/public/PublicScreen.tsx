// ─────────────────────────────────────────────────────────────
// Wrapper de pantalla pública:
//   Navbar (safe-area) → contenido (scroll natural)
//   + FAB arrastrable del asistente virtual.
//
// NOTA: el FOOTER ya NO va aquí. Es CONTEXTUAL: vive al final de
// la experiencia de Productos (ListFooterComponent), como se pidió.
// ─────────────────────────────────────────────────────────────

import React, { type ReactNode } from "react";
import {
  ScrollView,
  StyleSheet,
  View,
  type ScrollViewProps,
} from "react-native";
import type { ScrollViewInstance, TextInputInstance } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import PublicNavbar from "./PublicNavbar";
import AsistenteFlotante from "./AsistenteFlotante";

const TAB_BAR_ESTIMADO = 66;

interface PublicScreenProps extends ScrollViewProps {
  children: ReactNode;
  /** Ref externo para scroll-to-top al cambiar de sección. */
  scrollRef?: React.RefObject<ScrollViewInstance | null>;
}

export default function PublicScreen({
  children,
  scrollRef,
  ...resto
}: PublicScreenProps) {
  const insets = useSafeAreaInsets();

  return (
    <View style={styles.pantalla}>
      <ScrollView
        ref={scrollRef}
        style={styles.scroll}
        contentContainerStyle={[
          styles.contenido,
          { paddingBottom: TAB_BAR_ESTIMADO + insets.bottom + 24 },
        ]}
        keyboardShouldPersistTaps="handled"
        {...resto}
      >
        <PublicNavbar />
        {children}
      </ScrollView>

      <AsistenteFlotante />
    </View>
  );
}

const styles = StyleSheet.create({
  pantalla: {
    flex: 1,
    backgroundColor: "#000000",
  },

  scroll: { flex: 1 },

  contenido: {
    flexGrow: 1,
  },
});
