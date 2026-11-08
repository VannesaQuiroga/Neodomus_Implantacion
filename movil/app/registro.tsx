// ─────────────────────────────────────────────────────────────
// Registro — adaptación móvil del Register.tsx de la WEB.
// Campos, orden, validaciones, checklist de contraseña,
// checkboxes legales y mensajes: LITERALES de la web.
// Al éxito → verificar-correo (el backend envía el código real).
// ─────────────────────────────────────────────────────────────

import React, { useState } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { router } from "expo-router";
import FontAwesome6 from "@expo/vector-icons/FontAwesome6";

import { NeodomusColors as C, FontFamilies } from "@/constants/theme";
import AuthScreen from "@/components/auth/AuthScreen";
import PasswordChecklist from "@/components/auth/PasswordChecklist";
import PasswordInput from "@/components/auth/PasswordInput";
import { registrarCliente } from "@/services/auth.services";
import { ApiError } from "@/services/api";
import {
  REGIONES_COLOMBIA,
  TIPOS_DOCUMENTO,
  contrasenaValida,
  evaluarContrasena,
  limpiarNumerico,
} from "@/utils/validaciones";

export default function RegistroScreen() {
  const [nombre, setNombre] = useState("");
  const [apellido, setApellido] = useState("");
  const [tipoDocumento, setTipoDocumento] = useState("1");
  const [documento, setDocumento] = useState("");
  const [ciudad, setCiudad] = useState("");
  const [municipio, setMunicipio] = useState("");
  const [direccion, setDireccion] = useState("");
  const [telefono, setTelefono] = useState("");
  const [correo, setCorreo] = useState("");
  const [confirmCorreo, setConfirmCorreo] = useState("");
  const [contrasena, setContrasena] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [mostrarPassword, setMostrarPassword] = useState(false);
  const [aceptaTerminos, setAceptaTerminos] = useState(false);
  const [aceptaPrivacidad, setAceptaPrivacidad] = useState(false);
  const [aceptaCookies, setAceptaCookies] = useState(false);

  const [requisitos, setRequisitos] = useState(evaluarContrasena(""));
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const formularioCompleto =
    nombre.trim() &&
    apellido.trim() &&
    documento &&
    ciudad &&
    municipio &&
    direccion.trim() &&
    telefono &&
    correo &&
    confirmCorreo &&
    contrasena &&
    confirmPassword &&
    aceptaTerminos &&
    aceptaPrivacidad &&
    aceptaCookies;

  const registrarse = async () => {
    // Orden de validaciones EXACTO de la web.
    if (!contrasenaValida(requisitos)) {
      setError("La contraseña no cumple los requisitos.");
      programarLimpiezaError();
      return;
    }
    if (correo !== confirmCorreo) {
      setError("Los correos no coinciden.");
      programarLimpiezaError();
      return;
    }
    if (contrasena !== confirmPassword) {
      setError("Las contraseñas no coinciden.");
      programarLimpiezaError();
      return;
    }

    setCargando(true);
    setError(null);
    try {
      await registrarCliente({
        first_name: nombre.trim(),
        last_name: apellido.trim(),
        email: correo.trim(),
        password: contrasena,
        id_tipo_documento_c: Number.parseInt(tipoDocumento, 10),
        documento_cliente: Number.parseInt(documento, 10),
        telefono_cliente: Number.parseInt(telefono, 10),
        city: municipio,
        address: direccion.trim(),
      });
      // El backend crea pending_registration y ENVÍA el código real al correo.
      router.replace({
        pathname: "/verificar-correo",
        params: { email: correo.trim() },
      });
    } catch (e) {
      setError(
        e instanceof ApiError ? e.message : "Error al registrarse",
      );
      programarLimpiezaError();
    } finally {
      setCargando(false);
    }
  };

  const programarLimpiezaError = () => {
    // La web limpia el error a los 5000 ms.
    setTimeout(() => setError(null), 5000);
  };

  return (
    <AuthScreen>
      <View style={styles.tarjeta}>
        <Text style={styles.titulo}>Crear cuenta</Text>

        <Campo label="Nombres" placeholder="Ingresa tus nombres" valor={nombre} onChange={setNombre} />
        <Campo label="Apellidos" placeholder="Ingresa tus apellidos" valor={apellido} onChange={setApellido} />

        {/* Tipo documento */}
        <Text style={styles.label}>Tipo documento</Text>
        <View style={styles.filaOpciones}>
          {TIPOS_DOCUMENTO.map((tipo) => (
            <Pressable
              key={tipo.valor}
              onPress={() => setTipoDocumento(tipo.valor)}
              style={[styles.opcion, tipoDocumento === tipo.valor && styles.opcionActiva]}
            >
              <Text
                style={[
                  styles.textoOpcion,
                  tipoDocumento === tipo.valor && styles.textoOpcionActiva,
                ]}
              >
                {tipo.label}
              </Text>
            </Pressable>
          ))}
        </View>

        <Campo
          label="Documento"
          placeholder="Ingresa tu número de documento"
          valor={documento}
          onChange={(valor) => setDocumento(limpiarNumerico(valor))}
          keyboardType="numeric"
          maxLength={10}
        />

        {/* Ciudad / Municipio (hardcodeado igual que la web) */}
        <Text style={styles.label}>Ciudad</Text>
        <View style={styles.filaOpciones}>
          {Object.keys(REGIONES_COLOMBIA).map((ciudadClave) => (
            <Pressable
              key={ciudadClave}
              onPress={() => {
                setCiudad(ciudadClave);
                setMunicipio(""); // la web resetea el municipio al cambiar ciudad
              }}
              style={[styles.opcion, ciudad === ciudadClave && styles.opcionActiva]}
            >
              <Text
                style={[
                  styles.textoOpcion,
                  ciudad === ciudadClave && styles.textoOpcionActiva,
                ]}
              >
                {ciudadClave}
              </Text>
            </Pressable>
          ))}
        </View>

        <Text style={styles.label}>Municipio</Text>
        <View style={styles.filaOpciones}>
          {(REGIONES_COLOMBIA[ciudad] ?? []).map((municipioClave) => (
            <Pressable
              key={municipioClave}
              disabled={!ciudad}
              onPress={() => setMunicipio(municipioClave)}
              style={[
                styles.opcion,
                !ciudad && styles.opcionDeshabilitada,
                municipio === municipioClave && styles.opcionActiva,
              ]}
            >
              <Text
                style={[
                  styles.textoOpcion,
                  municipio === municipioClave && styles.textoOpcionActiva,
                ]}
              >
                {municipioClave}
              </Text>
            </Pressable>
          ))}
          {!ciudad && (
            <Text style={styles.hintDeshabilitado}>
              Selecciona tu municipio
            </Text>
          )}
        </View>

        <Campo label="Dirección" placeholder="Ingresa tu dirección" valor={direccion} onChange={setDireccion} />
        <Campo
          label="Teléfono"
          placeholder="Ingresa tu número telefónico"
          valor={telefono}
          onChange={(valor) => setTelefono(limpiarNumerico(valor))}
          keyboardType="numeric"
          maxLength={10}
        />
        <Campo
          label="Correo"
          placeholder="Ingresa tu correo"
          valor={correo}
          onChange={setCorreo}
          keyboardType="email-address"
          autoCapitalize="none"
        />

        {/* Confirmación de correo: SIN pegar (igual que la web) */}
        <Campo
          label="Confirmación de correo"
          placeholder="Confirma tu correo"
          valor={confirmCorreo}
          onChange={setConfirmCorreo}
          keyboardType="email-address"
          autoCapitalize="none"
        />

        {/* Contraseña + confirmación comparten un solo toggle (igual que la web) */}
        <Text style={styles.label}>Contraseña</Text>
        <PasswordInput
          placeholder="Ingresa tu contraseña"
          value={contrasena}
          onChangeText={(valor) => {
            setContrasena(valor);
            setRequisitos(evaluarContrasena(valor));
          }}
          visible={mostrarPassword}
          onToggleVisible={() => setMostrarPassword(!mostrarPassword)}
          editable={!cargando}
        />

        {contrasena.length > 0 && <PasswordChecklist requisitos={requisitos} />}

        {/* Confirmación de contraseña: SIN pegar (igual que la web) */}
        <Text style={styles.label}>Confirmación de contraseña</Text>
        <PasswordInput
          placeholder="Confirma tu contraseña"
          value={confirmPassword}
          onChangeText={setConfirmPassword}
          visible={mostrarPassword}
          onToggleVisible={() => setMostrarPassword(!mostrarPassword)}
          editable={!cargando}
        />

        {/* Checkboxes legales obligatorios */}
        <CheckLegal
          texto="Acepto los Términos de uso"
          marcado={aceptaTerminos}
          onToggle={() => setAceptaTerminos(!aceptaTerminos)}
        />
        <CheckLegal
          texto="Acepto la Política de privacidad"
          marcado={aceptaPrivacidad}
          onToggle={() => setAceptaPrivacidad(!aceptaPrivacidad)}
        />
        <CheckLegal
          texto="Acepto la Política de cookies"
          marcado={aceptaCookies}
          onToggle={() => setAceptaCookies(!aceptaCookies)}
        />

        {error && <Text style={styles.error}>{error}</Text>}

        <Pressable
          style={({ pressed }) => [
            styles.boton,
            pressed && styles.presionado,
            (!formularioCompleto || cargando) && styles.deshabilitado,
          ]}
          onPress={() => void registrarse()}
          disabled={!formularioCompleto || cargando}
        >
          <Text style={styles.textoBoton}>{cargando ? "Registrando..." : "Registrarse"}</Text>
        </Pressable>

        <View style={styles.filaRegistro}>
          <Text style={styles.textoRegistro}>¿Ya tienes una cuenta?</Text>
          <Pressable onPress={() => router.replace("/login")}>
            <Text style={styles.enlaceRegistro}>Iniciar Sesión</Text>
          </Pressable>
        </View>
      </View>
    </AuthScreen>
  );
}

function Campo({
  label,
  placeholder,
  valor,
  onChange,
  keyboardType,
  maxLength,
  autoCapitalize,
}: {
  label: string;
  placeholder: string;
  valor: string;
  onChange: (valor: string) => void;
  keyboardType?: "default" | "numeric" | "email-address";
  maxLength?: number;
  autoCapitalize?: "none" | "sentences" | "words";
}) {
  return (
    <>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        style={styles.input}
        placeholder={placeholder}
        placeholderTextColor="#8a8a8a"
        value={valor}
        onChangeText={onChange}
        keyboardType={keyboardType ?? "default"}
        maxLength={maxLength}
        autoCapitalize={autoCapitalize ?? "sentences"}
      />
    </>
  );
}

function CheckLegal({
  texto,
  marcado,
  onToggle,
}: {
  texto: string;
  marcado: boolean;
  onToggle: () => void;
}) {
  return (
    <Pressable style={styles.checkFila} onPress={onToggle} hitSlop={6}>
      <FontAwesome6
        name={marcado ? "square-check" : "square"}
        size={17}
        color={marcado ? C.oroClaro : "#6b6b6b"}
      />
      <Text style={styles.checkTexto}>{texto}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  tarjeta: {
    backgroundColor: "rgba(10,10,14,0.82)",
    borderRadius: 20,
    borderWidth: 1,
    borderColor: C.bordeOro,
    padding: 18,
    gap: 4,
  },

  titulo: {
    color: C.blanco,
    fontSize: 22,
    fontFamily: FontFamilies.bodyBold,
    textAlign: "center",
    marginBottom: 10,
  },

  label: {
    color: C.blanco,
    fontSize: 13,
    fontFamily: FontFamilies.bodyMedium,
    marginTop: 9,
    marginBottom: 5,
  },

  filaLabel: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
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
    fontFamily: FontFamilies.body,
    minHeight: 46,
  },

  filaOpciones: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    alignItems: "center",
  },

  opcion: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: C.grisBorde,
    backgroundColor: C.inputFondo,
    paddingVertical: 10,
    paddingHorizontal: 16,
  },

  opcionActiva: {
    borderColor: C.oroClaro,
    backgroundColor: "rgba(212,165,75,0.15)",
  },

  opcionDeshabilitada: { opacity: 0.45 },

  textoOpcion: {
    color: C.grisTexto,
    fontSize: 13.5,
    fontFamily: FontFamilies.bodyMedium,
  },

  textoOpcionActiva: {
    color: C.oroSuave,
    fontFamily: FontFamilies.bodyBold,
  },

  hintDeshabilitado: {
    color: "#6b6b6b",
    fontSize: 12.5,
    fontStyle: "italic",
  },

  checkFila: {
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    marginTop: 10,
  },

  checkTexto: {
    color: C.blanco,
    fontSize: 13,
    flex: 1,
  },

  error: {
    color: C.rojoError,
    fontSize: 13,
    lineHeight: 19,
    textAlign: "center",
    marginTop: 12,
  },

  boton: {
    backgroundColor: C.oro,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 16,
  },

  deshabilitado: { opacity: 0.55 },

  presionado: { opacity: 0.85 },

  textoBoton: {
    color: C.textoSobreOro,
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
    color: C.grisTexto,
    fontSize: 13.5,
  },

  enlaceRegistro: {
    color: C.oroSuave,
    fontSize: 13.5,
    fontFamily: FontFamilies.bodyBold,
  },
});
