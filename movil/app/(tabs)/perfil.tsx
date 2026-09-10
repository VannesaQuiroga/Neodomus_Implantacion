// ─────────────────────────────────────────────────────────────
// Mi perfil — flujo (replicando el comportamiento de la WEB como
// referencia; cambios SOLO en móvil):
//   Ver datos → [Editar perfil] → confirmación
//   "¿Estás seguro que quieres editar tu información?"
//   Aceptar → campos habilitados → modifica → [Guardar cambios].
// Cambio de correo: al guardar un correo diferente NO se actualiza la
// BD: se envía un código de verificación AL CORREO ACTUAL (ANTIGUO);
// solo tras verificarlo el backend aplica el cambio
// (request-email-change + verify-email-change, cooldown 30 s).
// Inhabilitar cuenta = solicitud al administrador (nunca directo).
// Sin menú "Secciones": esas opciones viven en el menú de herramientas
// del navbar.
// ─────────────────────────────────────────────────────────────

import React, { useEffect, useRef, useState } from "react";
import {
  Image,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import * as ImagePicker from "expo-image-picker";

import { FontFamilies } from "@/constants/theme";
import AppScreen from "@/components/app/AppScreen";
import { useAuth } from "@/contexts/AuthContext";
import { useIdioma } from "@/contexts/IdiomaContext";
import { ApiError } from "@/services/api";
import { apiFetch } from "@/services/api";
import {
  actualizarPerfilCliente,
  crearSolicitudInhabilitar,
  obtenerPerfilCliente,
  obtenerSolicitudCuenta,
  solicitarCambioCorreo,
  verificarCambioCorreo,
} from "@/services/cliente.services";

const EMAIL_VALIDO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function PerfilScreen() {
  const { usuario, avatar, setAvatar, actualizarUsuario } = useAuth();
  const { t } = useIdioma();
  const [perfil, setPerfil] = useState({
    first_name: "",
    last_name: "",
    email: "",
    id_tipo_documento_c: null as number | null,
    documento_cliente: "" as string,
    telefono_cliente: "" as string,
    address: "",
  });
  // Correo cargado originalmente: permite detectar si el usuario lo cambió.
  const [emailOriginal, setEmailOriginal] = useState("");
  const [editando, setEditando] = useState(false);
  const [, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [exito, setExito] = useState<string | null>(null);
  // Confirmación para ENTRAR a modo edición (punto de partida del flujo).
  const [confirmarEdicionVisible, setConfirmarEdicionVisible] = useState(false);

  // Cambio de correo
  const [codigoCorreo, setCodigoCorreo] = useState("");
  const [correoVerificadoPendiente, setCorreoVerificadoPendiente] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const codigoTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  // Inhabilitar cuenta
  const [estadoSolicitud, setEstadoSolicitud] = useState<string | null>(null);
  const [motivoInhabilitar, setMotivoInhabilitar] = useState("");
  const [inhabilitarVisible, setInhabilitarVisible] = useState(false);

  useEffect(() => {
    let activo = true;
    obtenerPerfilCliente()
      .then((p) => {
        if (!activo) return;
        setPerfil({
          first_name: p.first_name ?? "",
          last_name: p.last_name ?? "",
          email: p.email ?? usuario?.correo ?? "",
          id_tipo_documento_c: p.id_tipo_documento_c ?? null,
          documento_cliente: p.documento_cliente ? String(p.documento_cliente) : "",
          telefono_cliente: p.telefono_cliente ? String(p.telefono_cliente) : "",
          address: p.address ?? "",
        });
        setEmailOriginal((p.email ?? usuario?.correo ?? "").trim().toLowerCase());
      })
      .catch(() => {})
      .finally(() => activo && setCargando(false));

    obtenerSolicitudCuenta()
      .then((s) => activo && setEstadoSolicitud(s.estado ?? null))
      .catch(() => {});

    return () => {
      activo = false;
      if (codigoTimer.current) clearInterval(codigoTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (cooldown <= 0) return;
    codigoTimer.current = setInterval(() => setCooldown((c) => c - 1), 1000);
    return () => {
      if (codigoTimer.current) clearInterval(codigoTimer.current);
    };
  }, [cooldown]);

  const cambiarFoto = async () => {
    const permiso = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permiso.granted) return;
    const resultado = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      quality: 0.7,
      allowsEditing: true,
      aspect: [1, 1],
    });
    if (resultado.canceled || !resultado.assets[0]) return;
    const asset = resultado.assets[0];
    if ((asset.fileSize ?? 0) > 5 * 1024 * 1024) {
      setError("La imagen supera los 5 MB.");
      return;
    }
    try {
      const formData = new FormData();
      const ext = (asset.mimeType?.split("/")[1] ?? "jpg").replace("jpeg", "jpg");
      formData.append("archivo", {
        uri: asset.uri,
        name: `perfil.${ext}`,
        type: asset.mimeType || "image/jpeg",
      } as any);
      const actualizado = await apiFetch<any>("/clients/me/foto", {
        method: "POST",
        body: formData,
        headers: { "Content-Type": "multipart/form-data" },
      });
      if (actualizado?.foto_url) {
        setAvatar(actualizado.foto_url);
      }
      await actualizarUsuario();
    } catch {
      setError("No se pudo subir la foto");
    }
  };

  /** El correo del formulario es diferente al original (cambio real). */
  const correoCambiado =
    perfil.email.trim().toLowerCase() !== emailOriginal;

  /** Enviar código de verificación AL CORREO ACTUAL (antiguo). */
  const enviarCodigoCorreo = async () => {
    try {
      await solicitarCambioCorreo(perfil.email.trim());
      setCorreoVerificadoPendiente(true);
      setExito(t("perfil.correoCodigoEnviado"));
      setCooldown(30); // mismo cooldown que la web
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "No se pudo enviar el código");
    }
  };

  /**
   * Guardar cambios: valida y, si hay cambio de correo sin verificar,
   * NO guarda todavía: envía el código al correo antiguo y muestra la caja
   * de verificación. El guardado final ocurre tras verificar el código.
   */
  const pedirGuardarCambios = () => {
    setError(null);
    if (!perfil.first_name.trim() || !perfil.last_name.trim()) {
      setError("Completa nombres y apellidos.");
      return;
    }
    if (perfil.telefono_cliente && perfil.telefono_cliente.length !== 10) {
      setError(t("perfil.telefonoInvalido"));
      return;
    }
    if (correoCambiado && !EMAIL_VALIDO.test(perfil.email.trim())) {
      setError("Ingresa un correo electrónico válido.");
      return;
    }
    // La web bloquea guardar si hay un correo cambiado sin verificar.
    if (correoVerificadoPendiente) {
      setError(
        "Para cambiar tu correo debes verificar el código enviado a tu correo actual",
      );
      return;
    }
    if (correoCambiado) {
      // PASO OBLIGATORIO: código al correo ANTIGUO antes de tocar la BD.
      void enviarCodigoCorreo();
      return;
    }
    void guardarCambios();
  };

  const guardarCambios = async () => {
    setGuardando(true);
    setError(null);
    try {
      await actualizarPerfilCliente({
        email: perfil.email.trim(),
        first_name: perfil.first_name.trim(),
        last_name: perfil.last_name.trim(),
        id_tipo_documento_c: perfil.id_tipo_documento_c,
        documento_cliente: perfil.documento_cliente
          ? parseInt(perfil.documento_cliente, 10)
          : null,
        telefono_cliente: perfil.telefono_cliente
          ? parseInt(perfil.telefono_cliente, 10)
          : null,
        address: perfil.address.trim(),
      });
      // Única fuente de verdad BD → backend → estado → NAVBAR:
      // reconsulta el perfil y refresca el estado global para que el
      // navbar muestre el nombre/correo nuevos inmediatamente.
      await actualizarUsuario();
      setEmailOriginal(perfil.email.trim().toLowerCase());
      setExito(t("perfil.guardadoOk"));
      setEditando(false);
      setTimeout(() => setExito(null), 4000);
    } catch (e) {
      setError(
        e instanceof ApiError ? e.message : "No se pudo guardar el perfil.",
      );
    } finally {
      setGuardando(false);
    }
  };

  const verificarCodigoCorreo = async () => {
    try {
      await verificarCambioCorreo(codigoCorreo.trim(), perfil.email.trim());
      setCorreoVerificadoPendiente(false);
      setCodigoCorreo("");
      setEmailOriginal(perfil.email.trim().toLowerCase());
      // Verificación exitosa: el backend ya aplicó el correo nuevo;
      // se persisten también los demás campos modificados.
      await guardarCambios();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "";
      setError(
        /expira|expirad/i.test(msg)
          ? t("perfil.codigoExpirado")
          : t("perfil.codigoIncorrecto"),
      );
    }
  };

  const enviarInhabilitacion = async () => {
    if (!motivoInhabilitar.trim()) {
      setError("Debes indicar el motivo de la inhabilitación");
      return;
    }
    try {
      await crearSolicitudInhabilitar(motivoInhabilitar.trim());
      setEstadoSolicitud("pendiente");
      setInhabilitarVisible(false);
      setMotivoInhabilitar("");
      setExito(t("perfil.solicitudEnviada"));
    } catch (e) {
      setError(
        e instanceof ApiError
          ? e.message
          : "No se pudo enviar la solicitud",
      );
    }
  };

  const iniciales = (
    `${usuario?.nombre ?? "U"}`.trim().slice(0, 2) || "U"
  ).toUpperCase();

  return (
    <AppScreen titulo={t("perfil.titulo")}>
      {/* Avatar */}
      <View style={styles.avatarFila}>
        {avatar ? (
          <Image source={{ uri: avatar }} style={styles.avatar} />
        ) : (
          <View style={[styles.avatar, styles.avatarIniciales]}>
            <Text style={styles.avatarTexto}>{iniciales}</Text>
          </View>
        )}
        <View style={{ gap: 6 }}>
          <Pressable style={styles.botonSecundario} onPress={cambiarFoto}>
            <Text style={styles.textoBotonSecundario}>
              {t("perfil.cambiarFoto")}
            </Text>
          </Pressable>
          {avatar && (
            <Pressable onPress={() => setAvatar(null)} hitSlop={6}>
              <Text style={styles.enlaceEliminar}>
                {t("perfil.eliminarFoto")}
              </Text>
            </Pressable>
          )}
        </View>
      </View>

      {/* Datos */}
      <Text style={styles.label}>{t("perfil.nombres")} *</Text>
      <TextInput
        style={estilosInput(!editando)}
        value={perfil.first_name}
        onChangeText={(v) => setPerfil({ ...perfil, first_name: v })}
        editable={editando}
      />

      <Text style={styles.label}>{t("perfil.apellidos")} *</Text>
      <TextInput
        style={estilosInput(!editando)}
        value={perfil.last_name}
        onChangeText={(v) => setPerfil({ ...perfil, last_name: v })}
        editable={editando}
      />

      <Text style={styles.label}>{t("perfil.correo")} *</Text>
      <TextInput
        style={estilosInput(!editando)}
        value={perfil.email}
        onChangeText={(v) =>
          setPerfil({ ...perfil, email: v.replace(/\s/g, "") })
        }
        editable={editando}
        autoCapitalize="none"
        keyboardType="email-address"
      />
      {/* Solicitud de código manual (paridad con WEB): visible cuando el
          correo cambió y aún no se ha pedido/verificado el código. */}
      {editando && correoCambiado && !correoVerificadoPendiente && (
        <>
          <Text style={styles.hintAviso}>
            Para cambiar tu correo verificaremos tu identidad con un código
            enviado a tu correo actual.
          </Text>
          {cooldown <= 0 && (
            <Pressable
              style={({ pressed }) => [
                styles.botonFantasmaPeque,
                pressed && styles.presionado,
              ]}
              onPress={() => void enviarCodigoCorreo()}
            >
              <Text style={styles.textoFantasma}>
                Solicitar código de verificación
              </Text>
            </Pressable>
          )}
        </>
      )}
      {editando && correoVerificadoPendiente && (
        <View style={styles.cajaCodigo}>
          <Text style={styles.hintAviso}>{t("perfil.correoCodigoEnviado")}</Text>
          <TextInput
            style={styles.input}
            placeholder="000000"
            placeholderTextColor="#8a8a8a"
            keyboardType="number-pad"
            maxLength={6}
            value={codigoCorreo}
            onChangeText={(v) => setCodigoCorreo(v.replace(/\D/g, "").slice(0, 6))}
          />
          <View style={{ flexDirection: "row", gap: 10 }}>
            <Pressable
              style={({ pressed }) => [
                styles.botonPrimarioPeque,
                pressed && styles.presionado,
                codigoCorreo.length !== 6 && styles.deshabilitado,
              ]}
              disabled={codigoCorreo.length !== 6}
              onPress={() => void verificarCodigoCorreo()}
            >
              <Text style={styles.textoBotonPrimario}>Verificar</Text>
            </Pressable>
            <Pressable
              style={({ pressed }) => [
                styles.botonFantasmaPeque,
                pressed && styles.presionado,
                cooldown > 0 && styles.deshabilitado,
              ]}
              disabled={cooldown > 0}
              onPress={() => void enviarCodigoCorreo()}
            >
              <Text style={styles.textoFantasma}>
                {cooldown > 0 ? `Reenviar en ${cooldown}s` : t("common.reenviar")}
              </Text>
            </Pressable>
          </View>
        </View>
      )}

      {/* Tipo de documento y documento: se conservan en el PUT pero NO se
          muestran en la interfaz móvil (decisión de UX, como se pidió). */}

      <Text style={styles.label}>{t("perfil.telefono")}</Text>
      <TextInput
        style={estilosInput(!editando)}
        value={perfil.telefono_cliente}
        onChangeText={(v) =>
          setPerfil({
            ...perfil,
            telefono_cliente: v.replace(/\D/g, "").slice(0, 10),
          })
        }
        editable={editando}
        keyboardType="numeric"
      />

      <Text style={styles.label}>{t("perfil.direccion")}</Text>
      <TextInput
        style={[styles.input, styles.textarea]}
        value={perfil.address}
        onChangeText={(v) => setPerfil({ ...perfil, address: v })}
        editable={editando}
        multiline
        textAlignVertical="top"
      />

      {error && <Text style={styles.error}>{error}</Text>}
      {exito && <Text style={styles.exito}>{exito}</Text>}

      {!editando ? (
        /* Botón INICIAL: Editar perfil (no habilita edición directamente:
           primero pasa por la confirmación). */
        <Pressable
          style={({ pressed }) => [styles.botonPrimario, pressed && styles.presionado]}
          onPress={() => {
            setError(null);
            setConfirmarEdicionVisible(true);
          }}
        >
          <Text style={styles.textoBotonPrimario}>{t("perfil.editar")}</Text>
        </Pressable>
      ) : (
        <Pressable
          style={({ pressed }) => [
            styles.botonPrimario,
            pressed && styles.presionado,
            guardando && styles.deshabilitado,
          ]}
          onPress={pedirGuardarCambios}
          disabled={guardando}
        >
          <Text style={styles.textoBotonPrimario}>
            {guardando ? t("common.guardando") : t("perfil.guardar")}
          </Text>
        </Pressable>
      )}

      {/* Confirmación ANTES de habilitar la edición */}
      <Modal transparent visible={confirmarEdicionVisible} animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalTarjeta}>
            <Text style={styles.avisoTitulo}>{t("perfil.confirmarTitulo")}</Text>
            <Text style={styles.avisoTexto}>{t("perfil.confirmarBody")}</Text>
            <View style={{ flexDirection: "row", gap: 10, marginTop: 14 }}>
              <Pressable
                style={({ pressed }) => [
                  styles.botonFantasmaPeque,
                  { flex: 1 },
                  pressed && styles.presionado,
                ]}
                onPress={() => setConfirmarEdicionVisible(false)}
              >
                <Text style={styles.textoFantasma}>{t("perfil.rechazar")}</Text>
              </Pressable>
              <Pressable
                style={({ pressed }) => [
                  styles.botonPrimarioPeque,
                  { flex: 1 },
                  pressed && styles.presionado,
                ]}
                onPress={() => {
                  setConfirmarEdicionVisible(false);
                  setEditando(true); // Aceptar → habilita edición
                }}
              >
                <Text style={styles.textoBotonPrimario}>
                  {t("perfil.aceptar")}
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* Inhabilitar cuenta — solicitud al administrador (nunca directo) */}
      <Modal transparent visible={inhabilitarVisible} animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalTarjeta}>
            <Text style={styles.avisoTitulo}>{t("perfil.inhabilitar")}</Text>
            <Text style={styles.avisoTexto}>{t("perfil.inhabilitarMensaje")}</Text>
            <TextInput
              style={[styles.input, styles.textarea]}
              placeholder={t("perfil.inhabilitarMotivo")}
              placeholderTextColor="#8a8a8a"
              value={motivoInhabilitar}
              onChangeText={setMotivoInhabilitar}
              multiline
              textAlignVertical="top"
            />
            <View style={{ flexDirection: "row", gap: 10, marginTop: 12 }}>
              <Pressable
                style={({ pressed }) => [
                  styles.botonFantasmaPeque,
                  { flex: 1 },
                  pressed && styles.presionado,
                ]}
                onPress={() => setInhabilitarVisible(false)}
              >
                <Text style={styles.textoFantasma}>{t("common.cancelar")}</Text>
              </Pressable>
              <Pressable
                style={({ pressed }) => [
                  styles.botonPeligro,
                  { flex: 1 },
                  pressed && styles.presionado,
                ]}
                onPress={() => void enviarInhabilitacion()}
              >
                <Text style={styles.textoBotonPrimario}>
                  {t("perfil.enviarSolicitud")}
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* Inhabilitar cuenta — solicitud al administrador (nunca directo).
          Sin título "Zona de riesgo": sección limpia y sencilla. */}
      <View style={styles.zonaPeligro}>
        {estadoSolicitud === "pendiente" ? (
          <Text style={styles.hintAviso}>{t("perfil.solicitudPendiente")}</Text>
        ) : estadoSolicitud === "rechazada" ? (
          <Text style={styles.hintAviso}>{t("perfil.solicitudRechazada")}</Text>
        ) : null}
        <Pressable
          style={({ pressed }) => [
            styles.botonPeligro,
            pressed && styles.presionado,
            estadoSolicitud === "pendiente" && styles.deshabilitado,
          ]}
          disabled={estadoSolicitud === "pendiente"}
          onPress={() => setInhabilitarVisible(true)}
        >
          <Text style={styles.textoBotonPrimario}>{t("perfil.inhabilitar")}</Text>
        </Pressable>
      </View>
    </AppScreen>
  );
}

function estilosInput(deshabilitado: boolean) {
  return {
    backgroundColor: "#0f0f0f",
    borderWidth: 1,
    borderColor: deshabilitado ? "rgba(255,255,255,0.05)" : "rgba(255,255,255,0.09)",
    borderRadius: 12,
    color: "#ffffff",
    paddingHorizontal: 13,
    paddingVertical: 11,
    fontSize: 14.5,
    minHeight: 46,
    opacity: deshabilitado ? 0.65 : 1,
  };
}

const styles = StyleSheet.create({
  avatarFila: { flexDirection: "row", alignItems: "center", gap: 16 },
  avatar: { width: 84, height: 84, borderRadius: 42, borderWidth: 2, borderColor: "#caa24d" },
  avatarIniciales: { backgroundColor: "rgba(212,165,75,0.15)", alignItems: "center", justifyContent: "center" },
  avatarTexto: { color: "#f0c96f", fontSize: 26, fontWeight: "700" },
  botonSecundario: { borderRadius: 10, borderWidth: 1, borderColor: "#d4a54b", paddingVertical: 8, paddingHorizontal: 13 },
  textoBotonSecundario: { color: "#f0c96f", fontSize: 12.5, fontFamily: FontFamilies.button },
  enlaceEliminar: { color: "#f0858a", fontSize: 12, textDecorationLine: "underline" },
  label: { color: "#ffffff", fontSize: 13, fontFamily: FontFamilies.bodyMedium, marginTop: 6, marginBottom: -3 },
  input: { backgroundColor: "#0f0f0f", borderWidth: 1, borderColor: "rgba(255,255,255,0.09)", borderRadius: 12, color: "#ffffff", paddingHorizontal: 13, paddingVertical: 11, fontSize: 14.5, minHeight: 46 },
  textarea: { minHeight: 80, paddingTop: 11 },
  cajaCodigo: { backgroundColor: "rgba(212,165,75,0.07)", borderRadius: 14, borderWidth: 1, borderColor: "rgba(212,165,75,0.35)", padding: 12, gap: 9, marginTop: 6 },
  hintAviso: { color: "#bdbdbd", fontSize: 12.5, lineHeight: 18 },
  error: { color: "#f0858a", fontSize: 13, textAlign: "center", lineHeight: 19 },
  exito: { color: "#7ee29a", fontSize: 13, textAlign: "center", lineHeight: 19 },
  botonPrimario: { backgroundColor: "#caa24d", borderRadius: 12, minHeight: 48, alignItems: "center", justifyContent: "center", marginTop: 12, paddingHorizontal: 16 },
  deshabilitado: { opacity: 0.55 },
  presionado: { opacity: 0.85 },
  textoBotonPrimario: { color: "#141414", fontFamily: FontFamilies.button, fontSize: 14 },
  botonPrimarioPeque: { backgroundColor: "#caa24d", borderRadius: 10, paddingVertical: 9, paddingHorizontal: 13, alignItems: "center" },
  botonFantasmaPeque: { borderRadius: 10, borderWidth: 1, borderColor: "rgba(212,165,75,0.5)", paddingVertical: 9, paddingHorizontal: 13, alignItems: "center" },
  textoFantasma: { color: "#f0c96f", fontSize: 12.5, fontFamily: FontFamilies.button },
  zonaPeligro: { marginTop: 20, borderRadius: 16, borderWidth: 1, borderColor: "rgba(229,72,77,0.45)", backgroundColor: "rgba(229,72,77,0.06)", padding: 14, gap: 10 },
  // Padding interno generoso: el texto nunca queda pegado a los bordes.
  botonPeligro: { backgroundColor: "#e5484d", borderRadius: 12, minHeight: 48, paddingHorizontal: 18, paddingVertical: 12, alignItems: "center", justifyContent: "center" },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.7)", alignItems: "center", justifyContent: "center", padding: 22 },
  modalTarjeta: { width: "100%", maxWidth: 420, backgroundColor: "#121212", borderRadius: 20, borderWidth: 1, borderColor: "rgba(212,165,75,0.28)", padding: 18 },
  avisoTitulo: { color: "#ffffff", fontSize: 17, fontFamily: FontFamilies.bodyBold, textAlign: "center", marginBottom: 6 },
  avisoTexto: { color: "#bdbdbd", fontSize: 13, lineHeight: 19, textAlign: "center" },
});
