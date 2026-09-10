// ─────────────────────────────────────────────────────────────
// Verificación de cuenta — adaptación móvil del VerifyEmail.tsx.
// 6 boxes (OtpInput), código como query param, reenvío con
// cooldown de 30s. Textos literales de la web.
// ─────────────────────────────────────────────────────────────

import React, { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import FontAwesome6 from "@expo/vector-icons/FontAwesome6";

import { NeodomusColors as C, FontFamilies } from "@/constants/theme";
import AuthScreen from "@/components/auth/AuthScreen";
import OtpInput from "@/components/ui/OtpInput";
import { reenviarVerificacion, verificarCorreo } from "@/services/auth.services";
import { ApiError } from "@/services/api";

export default function VerificarCorreoScreen() {
  const { email } = useLocalSearchParams<{ email?: string }>();
  const [codigo, setCodigo] = useState("");
  const [cargando, setCargando] = useState(false);
  const [reenviando, setReenviando] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [esExito, setEsExito] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Cooldown de 30 s para reenviar (igual que la web).
  useEffect(() => {
    if (countdown <= 0) return;
    const temporizador = setTimeout(() => setCountdown((t) => t - 1), 1000);
    return () => clearTimeout(temporizador);
  }, [countdown]);

  const verificar = async () => {
    if (codigo.length !== 6) {
      setError("Por favor ingresa el código completo de 6 dígitos");
      return;
    }

    setCargando(true);
    setError(null);
    setMensaje(null);
    try {
      await verificarCorreo(codigo);
      setEsExito(true);
      setMensaje("¡Email verificado correctamente!");
      setTimeout(() => router.replace("/login"), 2500);
    } catch (e) {
      setEsExito(false);
      setMensaje(null);
      setError(
        e instanceof ApiError ? e.message : "Código inválido o expirado",
      );
      setCodigo("");
    } finally {
      setCargando(false);
    }
  };

  const reenviar = async () => {
    if (!email || countdown > 0) return;
    setReenviando(true);
    setError(null);
    try {
      await reenviarVerificacion(email);
      setMensaje("Se ha enviado un nuevo código a tu correo.");
      setEsExito(false);
      setCountdown(30);
    } catch (e) {
      setError(
        e instanceof ApiError ? e.message : "Error al reenviar el código",
      );
    } finally {
      setReenviando(false);
    }
  };

  if (!email) {
    // Guard igual que la web.
    return (
      <AuthScreen>
        <View style={styles.tarjeta}>
          <Text style={styles.titulo}>Error</Text>
          <Text style={styles.error}>
            No se proporcionó un correo electrónico válido.
          </Text>
          <Pressable
            style={({ pressed }) => [styles.botonSecundario, pressed && styles.presionado]}
            onPress={() => router.replace("/registro")}
          >
            <Text style={styles.textoBotonSecundario}>← Volver a registro</Text>
          </Pressable>
        </View>
      </AuthScreen>
    );
  }

  return (
    <AuthScreen>
      <View style={styles.tarjeta}>
        <Text style={styles.titulo}>Verificación de cuenta</Text>
        <Text style={styles.instruccion}>
          Ingresa el código de 6 dígitos que enviamos a{" "}
          <Text style={styles.correoUsuario}>{email}</Text>
        </Text>

        <View style={styles.zonaCodigo}>
          <OtpInput valor={codigo} onChange={setCodigo} deshabilitado={cargando} error={!!error} />
        </View>

        <View style={styles.expiracionFila}>
          <FontAwesome6 name="clock" size={12} color={C.grisTexto} />
          <Text style={styles.expiracionTexto}>El código expirará en 24 horas</Text>
        </View>

        {mensaje && (
          <Text style={esExito ? styles.exito : styles.info}>{mensaje}</Text>
        )}
        {error && <Text style={styles.error}>{error}</Text>}

        <Pressable
          style={({ pressed }) => [
            styles.boton,
            pressed && styles.presionado,
            cargando && styles.deshabilitado,
          ]}
          onPress={() => void verificar()}
          disabled={cargando}
        >
          <FontAwesome6 name="shield-halved" size={14} color={C.textoSobreOro} />
          <Text style={styles.textoBoton}>
            {cargando ? "Verificando..." : "Verificar cuenta"}
          </Text>
        </Pressable>

        <View style={styles.separador}>
          <View style={styles.lineaSeparador} />
          <Text style={styles.separadorTexto}>¿No recibiste el código?</Text>
          <View style={styles.lineaSeparador} />
        </View>

        <Pressable
          onPress={() => void reenviar()}
          disabled={countdown > 0 || reenviando}
          hitSlop={8}
        >
          <Text
            style={[
              styles.enlaceReenvio,
              countdown > 0 && styles.enlaceReenvioDeshabilitado,
            ]}
          >
            {!reenviando && countdown > 0
              ? `Reenviar en ${countdown}s`
              : "Reenviar código"}
          </Text>
        </Pressable>

        <Pressable
          style={({ pressed }) => [styles.volverLogin, pressed && styles.presionado]}
          onPress={() => router.replace("/login")}
        >
          <Text style={styles.textoVolverLogin}>← Volver al inicio de sesión</Text>
        </Pressable>
      </View>
    </AuthScreen>
  );
}

const styles = StyleSheet.create({
  tarjeta: {
    backgroundColor: "rgba(10,10,14,0.82)",
    borderRadius: 20,
    borderWidth: 1,
    borderColor: C.bordeOro,
    padding: 18,
    gap: 12,
  },

  titulo: {
    color: C.blanco,
    fontSize: 22,
    fontFamily: FontFamilies.bodyBold,
    textAlign: "center",
  },

  instruccion: {
    color: C.grisTexto,
    fontSize: 13.5,
    lineHeight: 20,
    textAlign: "center",
  },

  correoUsuario: {
    color: C.oroSuave,
    fontFamily: FontFamilies.bodyBold,
  },

  zonaCodigo: {
    alignItems: "center",
    paddingVertical: 10,
  },

  expiracionFila: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
  },

  expiracionTexto: {
    color: C.grisTexto,
    fontSize: 12.5,
  },

  mensaje: { textAlign: "center" },

  exito: {
    color: C.verdeExito,
    fontSize: 13,
    textAlign: "center",
    lineHeight: 19,
  },

  info: {
    color: C.oroSuave,
    fontSize: 13,
    textAlign: "center",
    lineHeight: 19,
  },

  error: {
    color: C.rojoError,
    fontSize: 13,
    textAlign: "center",
    lineHeight: 19,
  },

  boton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 9,
    backgroundColor: C.oro,
    borderRadius: 12,
    paddingVertical: 14,
  },

  deshabilitado: { opacity: 0.55 },

  presionado: { opacity: 0.85 },

  textoBoton: {
    color: C.textoSobreOro,
    fontFamily: FontFamilies.button,
    fontSize: 14.5,
  },

  separador: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginTop: 4,
  },

  lineaSeparador: {
    flex: 1,
    height: 1,
    backgroundColor: C.grisBorde,
  },

  separadorTexto: {
    color: C.grisTexto,
    fontSize: 12.5,
  },

  enlaceReenvio: {
    color: C.oroSuave,
    fontSize: 14,
    fontFamily: FontFamilies.bodyBold,
    textAlign: "center",
  },

  enlaceReenvioDeshabilitado: {
    color: C.grisTexto,
  },

  volverLogin: {
    alignItems: "center",
    paddingVertical: 4,
  },

  textoVolverLogin: {
    color: C.grisTexto,
    fontSize: 13,
  },

  botonSecundario: {
    alignSelf: "center",
    borderWidth: 1.5,
    borderColor: C.blanco,
    borderRadius: 4,
    paddingVertical: 10,
    paddingHorizontal: 18,
    marginTop: 6,
  },

  textoBotonSecundario: {
    color: C.blanco,
    fontSize: 13.5,
    fontFamily: FontFamilies.bodyMedium,
  },
});
