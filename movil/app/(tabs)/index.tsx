// ─────────────────────────────────────────────────────────────
// Tab Inicio — adaptación móvil de la Home pública WEB (Home.tsx).
//
// Tipografía según el breakpoint móvil de la web (home.css ≤768px):
// título 36px · eslogan 1.1rem · párrafo 0.95rem/1.5.
//
// Animaciones portadas de la WEB (Reanimated):
// - slideLine 0.8s: barra dorada del título escala 0→1.
// - dataStream: luces en perspectiva (LucesDelPiso).
// ─────────────────────────────────────────────────────────────

import {
  ImageBackground,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import React, { useRef } from "react";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import type { ScrollViewInstance } from "react-native";

import { NeodomusColors as C, FontFamilies } from "@/constants/theme";
import PublicScreen from "@/components/public/PublicScreen";
import LucesDelPiso from "@/components/home/LucesDelPiso";
import { useScrollTopAlEntrar } from "@/hooks/useScrollTopAlEntrar";

export default function HomeScreen() {
  const { height: altoVentana } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const scrollRef = useRef<ScrollViewInstance | null>(null);
  useScrollTopAlEntrar(scrollRef);

  // Animación slideLine (web): la barra dorada se dibuja 0→1 en 800ms.
  const anchoBarra = useSharedValue(0);
  const barraAnimada = useAnimatedStyle(() => ({
    transform: [{ scaleX: anchoBarra.value }],
    opacity: anchoBarra.value,
  }));

  React.useEffect(() => {
    anchoBarra.value = withTiming(1, {
      duration: 800,
      easing: Easing.out(Easing.quad),
    });
  }, [anchoBarra]);

  // El hero llena la primera pantalla completa (navbar + tab bar):
  // el footer queda después del contenido y solo se ve al hacer scroll.
  const alturaHero = Math.max(480, altoVentana - insets.top - 130);

  return (
    <PublicScreen scrollRef={scrollRef}>
      <ImageBackground
        source={require("@/assets/images/FONDO.png")}
        style={[styles.hero, { minHeight: alturaHero }]}
        resizeMode="cover"
      >
        <View style={styles.overlay}>
          <LucesDelPiso />

          <View style={styles.titleContainer}>
            <Animated.View style={[styles.goldLine, barraAnimada]} />
            <Text style={styles.title}>NEODOMUS</Text>
          </View>

          <Text style={styles.slogan}>
            &quot;NEODOMUS más que tecnología, una evolución.&quot;
          </Text>

          <Text style={styles.description}>
            En NEODOMUS ofrecemos soluciones integrales en tecnología,
            innovación y gestión de servicios, diseñadas para mejorar la
            seguridad, eficiencia y confianza de nuestros clientes.
          </Text>

          <Pressable
            style={({ pressed }) => [
              styles.botonContinuar,
              pressed && styles.presionado,
            ]}
            onPress={() => {
              try {
                // Ruta registrada como app/(tabs)/info.tsx → URL /info (grupo tabs no va en URL).
                // Se intenta /info primero y / (tabs)/info como fallback para compatibilidad.
                router.push("/info" as never);
              } catch (e) {
                console.log("[Home] error navegando a Sobre Nosotros:", e);
                try {
                  router.push("/(tabs)/info" as never);
                } catch (e2) {
                  console.log("[Home] fallback también falló:", e2);
                }
              }
            }}
          >
            <View style={styles.circuloIcono}>
              <Text style={styles.flecha}>{">"}</Text>
            </View>
            <Text style={styles.textoBoton}>CONTINUAR</Text>
          </Pressable>
        </View>
      </ImageBackground>
    </PublicScreen>
  );
}

const styles = StyleSheet.create({
  hero: {
    width: "100%",
    backgroundColor: C.negro,
  },

  overlay: {
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: 28,
    paddingVertical: 56,
    backgroundColor: C.overlayHero,
  },

  titleContainer: {
    position: "relative",
    alignSelf: "flex-start",
    marginBottom: 14,
  },

  goldLine: {
    position: "absolute",
    left: 0,
    bottom: 6,
    width: 132,
    height: 16,
    backgroundColor: C.oro,
    zIndex: 0,
    transformOrigin: "left center",
  },

  title: {
    color: C.blanco,
    fontSize: 36,
    fontFamily: FontFamilies.bodyBlack,
    letterSpacing: -1,
    lineHeight: 44,
    zIndex: 1,
  },

  slogan: {
    color: C.oro,
    fontSize: 17,
    lineHeight: 24,
    fontFamily: FontFamilies.bodyBold,
    letterSpacing: 0.5,
    marginTop: 18,
    marginBottom: 12,
  },

  description: {
    color: C.blanco,
    fontSize: 15,
    lineHeight: 23,
    fontFamily: FontFamilies.bodyMedium,
    marginBottom: 30,
  },

  botonContinuar: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    borderWidth: 2,
    borderColor: C.blanco,
    borderRadius: 0,
    paddingVertical: 10,
    paddingLeft: 9,
    paddingRight: 15,
    gap: 9,
  },

  circuloIcono: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1.5,
    borderColor: C.blanco,
    alignItems: "center",
    justifyContent: "center",
  },

  flecha: {
    color: C.blanco,
    fontWeight: "bold",
    fontSize: 11,
  },

  textoBoton: {
    color: C.blanco,
    fontFamily: FontFamilies.button,
    fontSize: 12.5,
    letterSpacing: 2,
  },

  presionado: { opacity: 0.75 },
});
