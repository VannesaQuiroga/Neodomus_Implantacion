// ─────────────────────────────────────────────────────────────
// Recuperar contraseña — adaptación móvil del ForgotPassword.tsx.
// Mismos textos, validación de correo y flujo: el backend envía
// el código REAL al correo y pasa a código-seguridad.
// ─────────────────────────────────────────────────────────────

import React, { useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { router } from "expo-router";

import { NeodomusColors as C, FontFamilies } from "@/constants/theme";
import AuthScreen from "@/components/auth/AuthScreen";
import { solicitarRecuperacionPassword } from "@/services/auth.services";
import { ApiError } from "@/services/api";
import { esEmailValido } from "@/utils/validaciones";

export default function RecuperarPasswordScreen() {
  const [email, setEmail] = useState("");
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const enviar = async () => {
    if (!esEmailValido(email.trim())) {
      setError("Correo electrónico inválido");
      return;
    }

    setCargando(true);
    setError(null);
    try {
      await solicitarRecuperacionPassword(email.trim());
      router.replace({
        pathname: "/codigo-seguridad",
        params: { email: email.trim() },
      });
    } catch (e) {
      setError(
        e instanceof ApiError ? e.message : "Error al enviar la solicitud",
      );
    } finally {
      setCargando(false);
    }
  };

  return (
    <AuthScreen>
      <View style={styles.tarjeta}>
        <Text style={styles.titulo}>Recuperar contraseña</Text>
        <Text style={styles.instruccion}>
          Ingresa tu correo electrónico y te enviaremos un{" "}
          <Text style={styles.dorado}>código</Text> para restablecer tu
          contraseña.
        </Text>

        <Text style={styles.label}>Correo electrónico</Text>
        <TextInput
          style={styles.input}
          placeholder="Tu correo electrónico"
          placeholderTextColor="#8a8a8a"
          keyboardType="email-address"
          autoCapitalize="none"
          value={email}
          onChangeText={(valor) => {
            setEmail(valor);
            if (error) setError(null);
          }}
          editable={!cargando}
        />

        {error && <Text style={styles.error}>{error}</Text>}

        <Pressable
          style={({ pressed }) => [
            styles.boton,
            pressed && styles.presionado,
            cargando && styles.deshabilitado,
          ]}
          onPress={() => void enviar()}
          disabled={cargando}
        >
          <Text style={styles.textoBoton}>
            {cargando ? "Enviando..." : "Enviar código"}
          </Text>
        </Pressable>

        <Text style={styles.aviso}>
          Te enviaremos un <Text style={styles.dorado}>código seguro</Text> a
          tu correo.
        </Text>

        <Pressable
          style={({ pressed }) => [
            styles.volverLogin,
            pressed && styles.presionado,
          ]}
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
    gap: 10,
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
    lineHeight: 21,
    textAlign: "center",
    marginBottom: 6,
  },

  dorado: {
    color: C.oroSuave,
    fontFamily: FontFamilies.bodyBold,
  },

  label: {
    color: C.blanco,
    fontSize: 13,
    fontFamily: FontFamilies.bodyMedium,
    marginTop: 4,
    marginBottom: -3,
  },

  input: {
    backgroundColor: C.inputFondo,
    borderWidth: 1,
    borderColor: C.grisBorde,
    borderRadius: 12,
    color: C.blanco,
    paddingHorizontal: 13,
    paddingVertical: 11,
    fontSize: 14.5,
    minHeight: 46,
  },

  error: {
    color: C.rojoError,
    fontSize: 13,
    textAlign: "center",
  },

  boton: {
    backgroundColor: C.oro,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
  },

  deshabilitado: { opacity: 0.55 },

  presionado: { opacity: 0.85 },

  textoBoton: {
    color: C.textoSobreOro,
    fontFamily: FontFamilies.button,
    fontSize: 14.5,
  },

  aviso: {
    color: C.grisTexto,
    fontSize: 12.5,
    textAlign: "center",
  },

  volverLogin: {
    alignItems: "center",
    paddingVertical: 4,
    marginTop: 4,
  },

  textoVolverLogin: {
    color: C.grisTexto,
    fontSize: 13,
  },
});
