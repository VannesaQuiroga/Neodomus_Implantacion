import LocalizedNotificationText from "@/components/common/LocalizedNotificationText";
// ─────────────────────────────────────────────────────────────
// Contacto — pantalla pública apilada (Stack raíz).
//
// Vive FUERA del grupo de tabs para que el botón Atrás del sistema
// haga pop real al punto de origen (Productos → Contacto → Atrás →
// Productos). Reutiliza los mismos datos/componentes del tab Ayuda.
// ─────────────────────────────────────────────────────────────

import React, { useEffect, useState } from "react";
import {
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import FontAwesome6 from "@expo/vector-icons/FontAwesome6";

import { NeodomusColors as C, FontFamilies } from "@/constants/theme";
import { useIdioma } from "@/contexts/IdiomaContext";
import PublicNavbar from "@/components/public/PublicNavbar";
import FormularioContacto from "@/components/public/FormularioContacto";
import AsistenteFlotante from "@/components/public/AsistenteFlotante";
import {
  CANALES_ADICIONALES,
  INFO_CONTACTO,
} from "@/data/contactoInfo";

const TAB_BAR_ESTIMADO = 66;

export default function ContactoScreen() {
  const { t } = useIdioma();
  const insets = useSafeAreaInsets();
  const [toast, setToast] = useState<{ msg: string; tipo: "success" | "error" } | null>(
    null,
  );

  useEffect(() => {
    if (!toast) return;
    const temporizador = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(temporizador);
  }, [toast]);

  return (
    <View style={styles.pantalla}>
      <PublicNavbar />

      <Pressable
        style={styles.volver}
        onPress={() => router.back()}
        hitSlop={8}
        accessibilityLabel={t("publico.volver")}
      >
        <FontAwesome6 name="chevron-left" size={14} color={C.oroSuave} />
        <Text style={styles.volverTexto}>{t("publico.volver")}</Text>
      </Pressable>

      <PublicScreenScroll insetsBottom={insets.bottom}>
        <Text style={styles.titulo}>{t("publico.contacto")}</Text>
        <Text style={styles.subtitulo}>
          {t("contacto.descripcion")}
        </Text>

        {INFO_CONTACTO.map((item) => (
          <Pressable
            key={item.tituloClave}
            disabled={!item.enlace}
            onPress={() =>
              item.enlace && Linking.openURL(item.enlace).catch(() => {})
            }
            style={styles.tarjeta}
          >
            <View style={styles.iconoWrap}>
              <FontAwesome6
                name={(item.icono as never) || "circle-info"}
                size={15}
                color={C.textoSobreOro}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.tarjetaTitulo}>{t(item.tituloClave)}</Text>
              <Text style={styles.tarjetaValor}>
                {item.valorClave ? t(item.valorClave) : item.valor}
              </Text>
              <Text style={styles.tarjetaDetalle}>{t(item.detalleClave)}</Text>
            </View>
            {!!item.enlace && (
              <FontAwesome6
                name="arrow-up-right-from-square"
                size={12}
                color={C.grisTexto}
              />
            )}
          </Pressable>
        ))}

        <View style={styles.canales}>
          <Text style={styles.canalesTitulo}>{t("publico.canalesAdicionales")}</Text>
          {CANALES_ADICIONALES.map((canalClave) => (
            <Text key={canalClave} style={styles.canalLinea}>
              {canalClave === "contacto.whatsapp"
                ? `${t(canalClave)}: +57 300 123 4567`
                : canalClave === "contacto.redes"
                  ? `${t(canalClave)}: @NeodomusOficial`
                  : t(canalClave)}
            </Text>
          ))}
        </View>

        <FormularioContacto
          alEnviado={(msg, tipo) => setToast({ msg, tipo })}
        />
      </PublicScreenScroll>

      {toast && (
        <View
          style={[styles.toastWrap, { bottom: TAB_BAR_ESTIMADO + insets.bottom + 20 }]}
          pointerEvents="none"
        >
          <View
            style={[
              styles.toast,
              toast.tipo === "success" ? styles.toastExito : styles.toastError,
            ]}
          >
            <Text style={styles.toastTexto}><LocalizedNotificationText message={toast.msg} /></Text>
          </View>
        </View>
      )}

      <AsistenteFlotante />
    </View>
  );
}

/** Scroll con padding inferior para no quedar bajo el tab bar. */
function PublicScreenScroll({
  children,
  insetsBottom,
}: {
  children: React.ReactNode;
  insetsBottom: number;
}) {
  return (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={{
        paddingHorizontal: 16,
        paddingBottom: TAB_BAR_ESTIMADO + insetsBottom + 24,
        gap: 12,
      }}
      keyboardShouldPersistTaps="handled"
    >
      {children}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  pantalla: {
    flex: 1,
    backgroundColor: "#000000",
  },

  volver: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    paddingHorizontal: 16,
    paddingTop: 10,
    alignSelf: "flex-start",
  },

  volverTexto: {
    color: C.oroSuave,
    fontSize: 13.5,
    fontFamily: FontFamilies.bodyMedium,
  },

  titulo: {
    color: "#ffffff",
    fontSize: 25,
    fontFamily: FontFamilies.bodyBold,
  },

  subtitulo: {
    color: "#bdbdbd",
    fontSize: 14,
    lineHeight: 21,
    marginTop: -4,
  },

  tarjeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 13,
    backgroundColor: "#161616",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.09)",
    padding: 14,
  },

  iconoWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#d4a54b",
    alignItems: "center",
    justifyContent: "center",
  },

  tarjetaTitulo: {
    color: "#bdbdbd",
    fontSize: 12.5,
  },

  tarjetaValor: {
    color: "#ffffff",
    fontSize: 15,
    fontFamily: FontFamilies.bodyBold,
    marginVertical: 1,
  },

  tarjetaDetalle: {
    color: "#bdbdbd",
    fontSize: 12.5,
  },

  canales: {
    backgroundColor: "rgba(212,165,75,0.07)",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(212,165,75,0.28)",
    padding: 14,
    gap: 5,
  },

  canalesTitulo: {
    color: "#f0c96f",
    fontSize: 13.5,
    fontFamily: FontFamilies.bodyBold,
    marginBottom: 2,
  },

  canalLinea: {
    color: "#ffffff",
    fontSize: 13.5,
    lineHeight: 20,
  },

  toastWrap: {
    position: "absolute",
    left: 16,
    right: 16,
    alignItems: "center",
  },

  toast: {
    borderRadius: 40,
    borderWidth: 1,
    paddingVertical: 10,
    paddingHorizontal: 20,
    maxWidth: "100%",
    backgroundColor: "rgba(0,0,0,0.92)",
  },

  toastExito: { borderColor: "#7ee29a" },

  toastError: { borderColor: "#f0858a" },

  toastTexto: {
    color: "#ffffff",
    fontSize: 13.5,
    textAlign: "center",
  },
});
