// ─────────────────────────────────────────────────────────────
// Luces en perspectiva del hero — PORT de la animación
// `.floor-lights-container` / `.light-track::after` de la WEB.
//
// Web: 4 pistas horizontales dentro de un contenedor sesgado;
// un destello blanco con glow recorre cada pista en loop lineal
// (duraciones 3.2/4.2/4.8/3.6s, delays 0/1.5/0.6/2.2s).
//
// Móvil: mismo efecto con Reanimated — translateX loop + opacidad
// interpolada (fade en extremos). La perspectiva skewX/rotateX de
// CSS se sugiere con rotaciones leves y posiciones escalonadas,
// manteniendo la estética (blanco + glow dorado sobre negro).
// ─────────────────────────────────────────────────────────────

import React, { useEffect } from "react";
import { StyleSheet, View } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";

interface PistaProps {
  /** Posición vertical dentro del contenedor (0-1). */
  top: number;
  /** Posición horizontal inicial (0-1). */
  left: number;
  /** Ancho de la pista (0-1 del contenedor). */
  ancho: number;
  /** Duración del recorrido en ms (como la web). */
  duracion: number;
  /** Retardo antes de iniciar (como la web). */
  delay: number;
}

function PistaDeLuz({ top, left, ancho, duracion, delay }: PistaProps) {
  const progreso = useSharedValue(0);

  useEffect(() => {
    const temporizador = setTimeout(() => {
      progreso.value = withRepeat(
        withTiming(1, { duration: duracion, easing: Easing.linear }),
        -1,
        false,
      );
    }, delay);
    return () => clearTimeout(temporizador);
  }, [progreso, duracion, delay]);

  const estiloDestello = useAnimatedStyle(() => {
    // keyframes web dataStream: 0%→fuera/opacity0 · 15%→1 · 85%→1 · 100%→fuera/0
    const opacidad =
      progreso.value < 0.15
        ? progreso.value / 0.15
        : progreso.value > 0.85
          ? (1 - progreso.value) / 0.15
          : 1;

    return {
      transform: [{ translateX: progreso.value * 340 }],
      opacity: opacidad * 0.9,
    };
  });

  return (
    <View
      style={[
        styles.pista,
        {
          top: `${top * 100}%`,
          left: `${left * 100}%`,
          width: `${ancho * 100}%`,
        },
      ]}
    >
      <Animated.View style={[styles.destello, estiloDestello]} />
    </View>
  );
}

export default function LucesDelPiso() {
  return (
    <View style={styles.contenedor} pointerEvents="none">
      {/* Pistas con los mismos porcentajes que la web */}
      <PistaDeLuz top={0.15} left={0.15} ancho={0.7} duracion={3200} delay={0} />
      <PistaDeLuz top={0.4} left={0.3} ancho={0.55} duracion={4200} delay={1500} />
      <PistaDeLuz top={0.65} left={0.08} ancho={0.75} duracion={4800} delay={600} />
      <PistaDeLuz top={0.85} left={0.45} ancho={0.45} duracion={3600} delay={2200} />
    </View>
  );
}

const styles = StyleSheet.create({
  contenedor: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    opacity: 0.75,
    overflow: "hidden",
    justifyContent: "flex-end",
  },

  pista: {
    position: "absolute",
    height: 2,
    backgroundColor: "rgba(255,255,255,0.10)",
    borderRadius: 1,
  },

  destello: {
    width: 80,
    height: 2,
    borderRadius: 1,
    backgroundColor: "#ffffff",
    shadowColor: "#ffffff",
    shadowOpacity: 0.9,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 0 },
    elevation: 4,
  },
});
