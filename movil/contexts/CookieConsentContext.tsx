// ─────────────────────────────────────────────────────────────
// Consentimiento de cookies — Neodomus.
//
// Categorías = las que la propia WEB declara en su Política de
// Cookies (fe/src/pages/legal/PoliticaCookies.tsx):
//   · Esenciales (siempre activas: sesión, seguridad)
//   · Preferencias (idioma, configuración, opciones)
//   · Análisis (estadísticas anónimas de uso)
//
// - Primera visita → banner inferior hasta que el usuario decida.
// - Aceptar / Rechazar / Guardar configuración → persiste en
//   AsyncStorage ('neodomus_cookie_consent') y el banner no vuelve.
// - Desde Centro de privacidad o footer se puede reabrir la
//   configuración con mostrarConfiguracion().
// ─────────────────────────────────────────────────────────────

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  Linking,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import FontAwesome6 from "@expo/vector-icons/FontAwesome6";

import { NeodomusColors as C, FontFamilies } from "@/constants/theme";

const CLAVE_CONSENTIMIENTO = "neodomus_cookie_consent";

export interface PreferenciasCookies {
  esenciales: true;
  preferencias: boolean;
  analisis: boolean;
  fecha: string;
}

type EstadoConsentimiento =
  | { decidido: false }
  | { decidido: true; preferencias: PreferenciasCookies };

interface CookieConsentContextValue {
  estado: EstadoConsentimiento;
  guardarPreferencias: (
    seleccion: { preferencias: boolean; analisis: boolean },
  ) => Promise<void>;
  mostrarConfiguracion: () => void;
}

const CookieConsentContext = createContext<CookieConsentContextValue | null>(
  null,
);

// accede a AsyncStorage para conservar o recuperar datos locales.
async function cargarConsentimiento(): Promise<EstadoConsentimiento> {
  try {
    const crudo = await AsyncStorage.getItem(CLAVE_CONSENTIMIENTO);
    if (!crudo) return { decidido: false };
    const datos: unknown = JSON.parse(crudo);
    if (
      typeof datos === "object" &&
      datos !== null &&
      "preferencias" in datos &&
      "analisis" in datos
    ) {
      const d = datos as Record<string, unknown>;
      return {
        decidido: true,
        preferencias: {
          esenciales: true,
          preferencias: d.preferencias === true,
          analisis: d.analisis === true,
          fecha: typeof d.fecha === "string" ? d.fecha : "",
        },
      };
    }
    return { decidido: false };
  } catch {
    return { decidido: false };
  }
}

// accede a AsyncStorage para conservar o recuperar datos locales.
export function CookieConsentProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [estado, setEstado] = useState<EstadoConsentimiento>({
    decidido: false,
  });
  const [listo, setListo] = useState(false);
  const [configAbierta, setConfigAbierta] = useState(false);
  const insets = useSafeAreaInsets();

  // Selección temporal dentro del modal.
  const [selPreferencias, setSelPreferencias] = useState(false);
  const [selAnalisis, setSelAnalisis] = useState(false);

  useEffect(() => {
    let activo = true;
    cargarConsentimiento().then((resultado) => {
      if (!activo) return;
      setEstado(resultado);
      setListo(true);
    });
    return () => {
      activo = false;
    };
  }, []);

  const guardarPreferencias = useCallback<
    CookieConsentContextValue["guardarPreferencias"]
  >(async (seleccion) => {
    const nuevas: PreferenciasCookies = {
      esenciales: true,
      preferencias: seleccion.preferencias,
      analisis: seleccion.analisis,
      fecha: new Date().toISOString(),
    };
    try {
      await AsyncStorage.setItem(
        CLAVE_CONSENTIMIENTO,
        JSON.stringify(nuevas),
      );
    } catch {
      // Sin almacenamiento no se puede recordar; no bloqueamos la app.
    }
    setEstado({ decidido: true, preferencias: nuevas });
    setConfigAbierta(false);
  }, []);

  const mostrarConfiguracion = useCallback(() => {
    const actuales = estado.decidido ? estado.preferencias : null;
    setSelPreferencias(actuales ? actuales.preferencias : false);
    setSelAnalisis(actuales ? actuales.analisis : false);
    setConfigAbierta(true);
  }, [estado]);

  const valor = useMemo<CookieConsentContextValue>(
    () => ({ estado, guardarPreferencias, mostrarConfiguracion }),
    [estado, guardarPreferencias, mostrarConfiguracion],
  );

  const abrirCentroPrivacidad = () => {
    setConfigAbierta(false);
    router.push("/centro-privacidad");
  };

  return (
    <CookieConsentContext.Provider value={valor}>
      {children}

      {/* ── BANNER inferior de cookies (primera visita) ── */}
      {listo && !estado.decidido && !configAbierta && (
        <View
          style={[styles.banner, { paddingBottom: insets.bottom + 74 }]}
          pointerEvents="box-none"
        >
          <View style={styles.bannerTarjeta}>
            <Text style={styles.bannerTitulo}>
              Usamos cookies para mejorar tu experiencia en Neodomus.
            </Text>
            <Text style={styles.bannerTexto}>
              Utilizamos tecnologías esenciales para el funcionamiento y,
              opcionalmente, cookies de preferencias y análisis. Puedes
              cambiar tu decisión cuando quieras desde nuestro{" "}
              <Text
                style={styles.bannerEnlace}
                onPress={abrirCentroPrivacidad}
                suppressHighlighting
              >
                Centro de privacidad
              </Text>
              .
            </Text>

            <View style={styles.bannerBotones}>
              <Pressable
                style={({ pressed }) => [
                  styles.botonSecundario,
                  pressed && styles.presionado,
                ]}
                onPress={() =>
                  void guardarPreferencias({ preferencias: false, analisis: false })
                }
              >
                <Text style={styles.textoSecundario}>Rechazar</Text>
              </Pressable>

              <Pressable
                style={({ pressed }) => [
                  styles.botonFantasma,
                  pressed && styles.presionado,
                ]}
                onPress={mostrarConfiguracion}
              >
                <Text style={styles.textoFantasma}>Configurar cookies</Text>
              </Pressable>

              <Pressable
                style={({ pressed }) => [
                  styles.botonPrimario,
                  pressed && styles.presionado,
                ]}
                onPress={() =>
                  void guardarPreferencias({ preferencias: true, analisis: true })
                }
              >
                <Text style={styles.textoPrimario}>Aceptar cookies</Text>
              </Pressable>
            </View>
          </View>
        </View>
      )}

      {/* ── MODAL Configurar cookies ── */}
      <Modal
        visible={configAbierta}
        transparent
        animationType="fade"
        onRequestClose={() => setConfigAbierta(false)}
      >
        <View style={styles.modalOverlay}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setConfigAbierta(false)} />
          <View style={[styles.modalTarjeta, { marginBottom: insets.bottom + 20 }]}>
            <View style={styles.modalCabecera}>
              <Text style={styles.modalTitulo}>Configurar cookies</Text>
              <Pressable
                onPress={() => setConfigAbierta(false)}
                style={({ pressed }) => [
                  styles.modalCerrar,
                  pressed && styles.presionado,
                ]}
                accessibilityLabel="Cerrar"
                hitSlop={8}
              >
                <FontAwesome6 name="xmark" size={14} color="#ffffff" />
              </Pressable>
            </View>

            <ScrollView
              style={styles.modalScroll}
              contentContainerStyle={styles.modalContenido}
            >
              <Text style={styles.modalDescripcion}>
                Elige qué cookies puede utilizar Neodomus. Las esenciales
                siempre están activas porque son necesarias para el
                funcionamiento de la aplicación (sesión y seguridad).
              </Text>

              {/* Esenciales — fijas */}
              <View style={styles.categoria}>
                <View style={styles.categoriaCabecera}>
                  <Text style={styles.categoriaNombre}>Esenciales</Text>
                  <Switch value disabled thumbTintColor={C.grisTexto} />
                </View>
                <Text style={styles.categoriaTexto}>
                  Necesarias para el funcionamiento básico: gestión de sesión,
                  carrito y seguridad. No pueden desactivarse.
                </Text>
              </View>

              <View style={styles.categoria}>
                <View style={styles.categoriaCabecera}>
                  <Text style={styles.categoriaNombre}>Preferencias</Text>
                  <Switch
                    value={selPreferencias}
                    onValueChange={setSelPreferencias}
                    trackColor={{ true: C.oroClaro }}
                    thumbTintColor={selPreferencias ? "#141414" : undefined}
                  />
                </View>
                <Text style={styles.categoriaTexto}>
                  Recuerdan tus configuraciones y opciones personalizadas dentro
                  de la app.
                </Text>
              </View>

              <View style={styles.categoria}>
                <View style={styles.categoriaCabecera}>
                  <Text style={styles.categoriaNombre}>Análisis</Text>
                  <Switch
                    value={selAnalisis}
                    onValueChange={setSelAnalisis}
                    trackColor={{ true: C.oroClaro }}
                    thumbTintColor={selAnalisis ? "#141414" : undefined}
                  />
                </View>
                <Text style={styles.categoriaTexto}>
                  Recopilan estadísticas anónimas de uso para mejorar nuestros
                  servicios.
                </Text>
              </View>

              <Pressable
                style={({ pressed }) => [
                  styles.linkLegal,
                  pressed && styles.presionado,
                ]}
                onPress={() => Linking.openURL("mailto:soporte@neodomus.com")}
              >
                <Text style={styles.linkLegalTexto}>
                  ¿Dudas? escríbenos a soporte@neodomus.com
                </Text>
              </Pressable>
            </ScrollView>

            <View style={styles.modalPie}>
              <Pressable
                style={({ pressed }) => [
                  styles.botonGuardar,
                  pressed && styles.presionado,
                ]}
                onPress={() =>
                  void guardarPreferencias({
                    preferencias: selPreferencias,
                    analisis: selAnalisis,
                  })
                }
              >
                <Text style={styles.textoGuardar}>Guardar preferencias</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </CookieConsentContext.Provider>
  );
}

export function useCookieConsent(): CookieConsentContextValue {
  const contexto = useContext(CookieConsentContext);
  if (!contexto) {
    throw new Error(
      "useCookieConsent debe usarse dentro de <CookieConsentProvider>",
    );
  }
  return contexto;
}

const styles = StyleSheet.create({
  banner: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 12,
  },

  bannerTarjeta: {
    backgroundColor: "rgba(16,16,16,0.97)",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(212,165,75,0.35)",
    padding: 16,
    gap: 10,
  },

  bannerTitulo: {
    color: "#ffffff",
    fontSize: 14.5,
    fontFamily: FontFamilies.bodyBold,
    lineHeight: 20,
  },

  bannerTexto: {
    color: "#bdbdbd",
    fontSize: 12.5,
    lineHeight: 18,
  },

  bannerEnlace: {
    color: "#f0c96f",
    textDecorationLine: "underline",
  },

  bannerBotones: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 4,
  },

  botonPrimario: {
    backgroundColor: "#caa24d",
    borderRadius: 999,
    paddingVertical: 9,
    paddingHorizontal: 14,
    flexGrow: 1,
    alignItems: "center",
  },

  textoPrimario: {
    color: "#141414",
    fontFamily: FontFamilies.button,
    fontSize: 12.5,
  },

  botonSecundario: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.25)",
    paddingVertical: 9,
    paddingHorizontal: 14,
    alignItems: "center",
  },

  textoSecundario: {
    color: "#ffffff",
    fontFamily: FontFamilies.button,
    fontSize: 12.5,
  },

  botonFantasma: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(212,165,75,0.5)",
    paddingVertical: 9,
    paddingHorizontal: 14,
    alignItems: "center",
  },

  textoFantasma: {
    color: "#f0c96f",
    fontFamily: FontFamilies.button,
    fontSize: 12.5,
  },

  presionado: { opacity: 0.75 },

  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.7)",
    justifyContent: "flex-end",
  },

  modalTarjeta: {
    marginHorizontal: 14,
    maxHeight: "85%",
    backgroundColor: "#121212",
    borderRadius: 22,
    borderWidth: 1,
    borderColor: "rgba(212,165,75,0.28)",
    overflow: "hidden",
  },

  modalCabecera: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
  },

  modalTitulo: {
    color: "#ffffff",
    fontSize: 18,
    fontFamily: FontFamilies.bodyBold,
  },

  modalCerrar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.09)",
    alignItems: "center",
    justifyContent: "center",
  },

  modalScroll: { flexGrow: 0 },

  modalContenido: {
    paddingHorizontal: 16,
    paddingBottom: 8,
    gap: 12,
  },

  modalDescripcion: {
    color: "#bdbdbd",
    fontSize: 13,
    lineHeight: 19,
  },

  categoria: {
    backgroundColor: "#0f0f0f",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.09)",
    padding: 13,
    gap: 6,
  },

  categoriaCabecera: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },

  categoriaNombre: {
    color: "#ffffff",
    fontSize: 14.5,
    fontFamily: FontFamilies.bodyBold,
  },

  categoriaTexto: {
    color: "#bdbdbd",
    fontSize: 12.5,
    lineHeight: 18,
  },

  linkLegal: { alignSelf: "center", paddingVertical: 4 },

  linkLegalTexto: {
    color: "#f0c96f",
    fontSize: 12.5,
    textDecorationLine: "underline",
  },

  modalPie: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 16,
  },

  botonGuardar: {
    backgroundColor: "#caa24d",
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: "center",
  },

  textoGuardar: {
    color: "#141414",
    fontFamily: FontFamilies.button,
    fontSize: 14,
  },
});
