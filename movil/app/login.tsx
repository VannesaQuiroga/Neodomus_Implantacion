// ─────────────────────────────────────────────────────────────
// Login — adaptación móvil del Login.tsx de la WEB, presentado
// como MODAL sobre la pantalla pública actual.
// Mismos mensajes (401 fijo, 403 por substring inhabilitada/
// verificado), "Recordarme", solicitar habilitación y recuperar
// contraseña. Sesión persistente real contra el backend.
// ─────────────────────────────────────────────────────────────

import React, { useEffect, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { router, useLocalSearchParams, type Href } from "expo-router";
import FontAwesome6 from "@expo/vector-icons/FontAwesome6";

import { NeodomusColors as C, FontFamilies } from "@/constants/theme";
import AuthScreen from "@/components/auth/AuthScreen";
import PasswordInput from "@/components/auth/PasswordInput";
import { useAuth } from "@/contexts/AuthContext";
import { ApiError } from "@/services/api";
import { solicitarHabilitacion } from "@/services/auth.services";

const CLAVE_RECORDAR = "neodomus_remembered_email";

export default function LoginScreen() {
  const { redirigirA } = useLocalSearchParams<{ redirigirA?: string }>();
  const { iniciarSesion } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [recordarme, setRecordarme] = useState(false);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [cuentaInhabilitada, setCuentaInhabilitada] = useState(false);
  const [emailSinVerificar, setEmailSinVerificar] = useState(false);
  const [enviandoHabilitacion, setEnviandoHabilitacion] = useState(false);
  const [mensajeHabilitacion, setMensajeHabilitacion] = useState<string | null>(null);

  // Cargar email recordado (igual que la web: solo el email).
  useEffect(() => {
    AsyncStorage.getItem(CLAVE_RECORDAR)
      .then((guardado) => {
        if (guardado) {
          setEmail(guardado);
          setRecordarme(true);
        }
      })
      .catch(() => {});
  }, []);

  const ingresar = async () => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email.trim())) {
      setError("Ingresa un correo electrónico válido");
      return;
    }

    setCargando(true);
    setError(null);
    setCuentaInhabilitada(false);
    setEmailSinVerificar(false);
    setMensajeHabilitacion(null);
    try {
      await iniciarSesion(email.trim(), password);

      // Recordarme: guarda SOLO el email (nunca la contraseña).
      if (recordarme) {
        AsyncStorage.setItem(CLAVE_RECORDAR, email.trim()).catch(() => {});
      } else {
        AsyncStorage.removeItem(CLAVE_RECORDAR).catch(() => {});
      }

      // Redirección por rol (igual que web RoleRoute)
      const { obtenerSesion } = await import("@/services/storage");
      const sesion = await obtenerSesion();
      const rol = (sesion?.rol || "").toLowerCase();
      if (rol === "tecnico") {
        router.replace("/(tecnico)" as Href);
      } else if (rol === "admin" || rol === "administrador") {
        // Admin sigue en flujo cliente por ahora (podría ir a /admin)
        router.replace((redirigirA ?? "/(tabs)/productos") as Href);
      } else {
        router.replace((redirigirA ?? "/(tabs)/productos") as Href);
      }
    } catch (e) {
      const status = e instanceof ApiError ? e.status : 0;
      const detail =
        e instanceof Error ? e.message : "Error al iniciar sesión";

      if (status === 403 && detail.toLowerCase().includes("inhabilitada")) {
        setCuentaInhabilitada(true);
        setError(detail);
      } else if (status === 403 && detail.toLowerCase().includes("verificado")) {
        setEmailSinVerificar(true);
        setError(detail);
      } else if (status === 401) {
        setError(
          "Correo o contraseña incorrectos. Verifica tus datos e inténtalo de nuevo.",
        );
      } else {
        setError(detail);
      }
    } finally {
      setCargando(false);
    }
  };

  const pedirHabilitacion = async () => {
    setEnviandoHabilitacion(true);
    try {
      await solicitarHabilitacion(email.trim(), password);
      setMensajeHabilitacion(
        "Solicitud de habilitación enviada. El administrador revisará tu caso y, si la aprueba, podrás iniciar sesión nuevamente.",
      );
      setCuentaInhabilitada(false);
    } catch (e) {
      setError(
        e instanceof ApiError ? e.message : "No se pudo enviar la solicitud",
      );
    } finally {
      setEnviandoHabilitacion(false);
    }
  };

  return (
    <AuthScreen>
      <Text style={styles.titulo}>Iniciar sesión</Text>
      <Text style={styles.bienvenida}>
        Bienvenido de nuevo a{" "}
        <Text style={styles.marcaDorada}>NEODOMUS</Text>
      </Text>

      <Text style={styles.label}>Correo electrónico</Text>
      <TextInput
        style={styles.input}
        placeholder="Correo electrónico"
        placeholderTextColor="#8a8a8a"
        keyboardType="email-address"
        autoCapitalize="none"
        value={email}
        onChangeText={setEmail}
        editable={!cargando}
      />

      <Text style={styles.label}>Contraseña</Text>
      <PasswordInput
        placeholder="Contraseña"
        value={password}
        onChangeText={setPassword}
        editable={!cargando}
        onSubmitEditing={() => void ingresar()}
      />

      {/* Recordarme + Olvidé mi contraseña */}
      <View style={styles.filaOpciones}>
        <Pressable
          style={styles.checkFila}
          onPress={() => setRecordarme(!recordarme)}
          hitSlop={6}
        >
          <FontAwesome6
            name={recordarme ? "square-check" : "square"}
            size={16}
            color={recordarme ? C.oroClaro : "#6b6b6b"}
          />
          <Text style={styles.checkTexto}>Recordarme</Text>
        </Pressable>

        <Pressable
          onPress={() => router.push("/recuperar-password")}
          disabled={cargando}
          hitSlop={6}
        >
          <Text style={styles.enlaceOlvido}>¿Olvidaste tu contraseña?</Text>
        </Pressable>
      </View>

      {error && <Text style={styles.error}>{error}</Text>}

      {/* Cuenta inhabilitada → solicitar habilitación */}
      {cuentaInhabilitada && !mensajeHabilitacion && (
        <View style={styles.cajaAviso}>
          <FontAwesome6 name="circle-exclamation" size={14} color={C.oroSuave} />
          <Text style={styles.avisoTexto}>
            Tu cuenta está inhabilitada por un administrador. Puedes
            solicitar que sea habilitada nuevamente.
          </Text>
          <Pressable
            style={({ pressed }) => [
              styles.botonAviso,
              pressed && styles.presionado,
              enviandoHabilitacion && styles.deshabilitado,
            ]}
            onPress={() => void pedirHabilitacion()}
            disabled={enviandoHabilitacion || !password}
          >
            <Text style={styles.textoBotonAviso}>
              {enviandoHabilitacion
                ? "Enviando..."
                : "Solicitar habilitación de la cuenta"}
            </Text>
          </Pressable>
        </View>
      )}

      {mensajeHabilitacion && (
        <View style={[styles.cajaAviso, styles.cajaExito]}>
          <FontAwesome6 name="circle-check" size={14} color={C.verdeExito} />
          <Text style={styles.avisoTextoExito}>{mensajeHabilitacion}</Text>
        </View>
      )}

      {/* Correo sin verificar → ir a verificación */}
      {emailSinVerificar && (
        <View style={styles.cajaAviso}>
          <FontAwesome6 name="circle-exclamation" size={14} color={C.oroSuave} />
          <Text style={styles.avisoTexto}>
            Tu correo aún no ha sido verificado. Debes ingresar el código de
            verificación para poder iniciar sesión.
          </Text>
          <Pressable
            style={({ pressed }) => [styles.botonAviso, pressed && styles.presionado]}
            onPress={() =>
              router.replace({
                pathname: "/verificar-correo",
                params: { email: email.trim() },
              })
            }
          >
            <Text style={styles.textoBotonAviso}>Verificar mi correo</Text>
          </Pressable>
        </View>
      )}

      <View style={styles.filaRegistro}>
        <Text style={styles.textoRegistro}>¿No tienes una cuenta?</Text>
        <Pressable onPress={() => router.push("/registro")} hitSlop={6}>
          <Text style={styles.enlaceRegistro}>Registrarse</Text>
        </Pressable>
      </View>

      <Pressable
        style={({ pressed }) => [
          styles.boton,
          pressed && styles.presionado,
          cargando && styles.deshabilitado,
        ]}
        onPress={() => void ingresar()}
        disabled={cargando}
      >
        <Text style={styles.textoBoton}>{cargando ? "Ingresando..." : "Iniciar sesión"}</Text>
      </Pressable>
    </AuthScreen>
  );
}

const styles = StyleSheet.create({
  titulo: {
    color: "#ffffff",
    fontSize: 22,
    fontFamily: FontFamilies.bodyBold,
    textAlign: "center",
  },

  bienvenida: {
    color: "#bdbdbd",
    fontSize: 13.5,
    textAlign: "center",
    marginBottom: 12,
  },

  marcaDorada: {
    color: "#f0c96f",
    fontFamily: FontFamilies.bodyBold,
  },

  label: {
    color: "#ffffff",
    fontSize: 13,
    fontFamily: FontFamilies.bodyMedium,
    marginTop: 10,
    marginBottom: 5,
  },

  input: {
    backgroundColor: "#0f0f0f",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.09)",
    borderRadius: 12,
    color: "#ffffff",
    paddingHorizontal: 13,
    paddingVertical: 11,
    fontSize: 14.5,
    minHeight: 48,
  },

  filaOpciones: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 12,
  },

  checkFila: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
  },

  checkTexto: {
    color: "#ffffff",
    fontSize: 13,
  },

  enlaceOlvido: {
    color: "#f0c96f",
    fontSize: 13,
  },

  error: {
    color: "#f0858a",
    fontSize: 13,
    lineHeight: 19,
    textAlign: "center",
    marginTop: 12,
  },

  cajaAviso: {
    borderWidth: 1,
    borderColor: "rgba(212,165,75,0.28)",
    backgroundColor: "rgba(212,165,75,0.08)",
    borderRadius: 12,
    padding: 12,
    gap: 9,
    marginTop: 12,
  },

  cajaExito: {
    borderColor: "#7ee29a",
    backgroundColor: "rgba(126,226,154,0.08)",
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
  },

  avisoTexto: {
    color: "#ffffff",
    fontSize: 13,
    lineHeight: 19,
  },

  avisoTextoExito: {
    color: "#7ee29a",
    fontSize: 13,
    lineHeight: 19,
    flex: 1,
  },

  botonAviso: {
    backgroundColor: "#caa24d",
    borderRadius: 10,
    paddingVertical: 11,
    alignItems: "center",
  },

  textoBotonAviso: {
    color: "#141414",
    fontFamily: FontFamilies.button,
    fontSize: 13,
  },

  boton: {
    backgroundColor: "#caa24d",
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 16,
  },

  deshabilitado: { opacity: 0.55 },

  presionado: { opacity: 0.85 },

  textoBoton: {
    color: "#141414",
    fontFamily: FontFamilies.button,
    fontSize: 14.5,
  },

  filaRegistro: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 7,
    marginTop: 16,
  },

  textoRegistro: {
    color: "#bdbdbd",
    fontSize: 13.5,
  },

  enlaceRegistro: {
    color: "#f0c96f",
    fontSize: 13.5,
    fontFamily: FontFamilies.bodyBold,
  },
});
