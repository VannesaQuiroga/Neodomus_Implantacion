import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import FontAwesome6 from "@expo/vector-icons/FontAwesome6";
import * as ImagePicker from "expo-image-picker";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { NeodomusColors as C, FontFamilies } from "@/constants/theme";
import { useAuth } from "@/contexts/AuthContext";
import { useIdioma } from "@/contexts/IdiomaContext";
import { apiFetch } from "@/services/api";

interface PerfilTecnico {
  first_name: string;
  last_name: string;
  email: string;
  telefono_usuario?: number | null;
  documento_usuario?: number | null;
  certificacion_t?: string | null;
  especializaciones?: { id_especializacion: number; nombre: string }[];
}

export default function TecnicoPerfilScreen() {
  const { usuario, avatar, setAvatar, actualizarUsuario } = useAuth();
  const { t } = useIdioma();
  const insets = useSafeAreaInsets();

  const [cargando, setCargando] = useState(true);
  const [modoEdicion, setModoEdicion] = useState(false);
  const [confirmEditarVisible, setConfirmEditarVisible] = useState(false);
  const [confirmVisible, setConfirmVisible] = useState(false);
  const [confirmEliminarFoto, setConfirmEliminarFoto] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const [nombre, setNombre] = useState("");
  const [apellido, setApellido] = useState("");
  const [telefono, setTelefono] = useState("");
  const [documento, setDocumento] = useState("");
  const [certificacion, setCertificacion] = useState("");
  const [email, setEmail] = useState("");
  const [selectedEspecializaciones, setSelectedEspecializaciones] = useState<number[]>([]);
  const [catalogo, setCatalogo] = useState<{ id: number; nombre: string }[]>([]);
  const [especialidadModal, setEspecialidadModal] = useState(false);

  const [snapshot, setSnapshot] = useState<Record<string, any>>({});

  const nombreCompleto = `${nombre} ${apellido}`.trim() || usuario?.nombre || "Técnico";
  const iniciales = (nombreCompleto.trim().slice(0, 2) || "TE").toUpperCase();

  const mostrarToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2800);
  };

  useEffect(() => {
    const cargar = async () => {
      setCargando(true);
      try {
        const res = await apiFetch<PerfilTecnico>("/users/me");
        const n = res.first_name || "";
        const a = res.last_name || "";
        const tel = res.telefono_usuario ? String(res.telefono_usuario) : "";
        const doc = res.documento_usuario ? String(res.documento_usuario) : "";
        const cert = res.certificacion_t || "";
        const mail = res.email || usuario?.correo || "";
        const espIds = (res.especializaciones || []).map((e) => e.id_especializacion);
        setNombre(n);
        setApellido(a);
        setTelefono(tel);
        setDocumento(doc);
        setCertificacion(cert);
        setSelectedEspecializaciones(espIds);
        setEmail(mail);
        setSnapshot({ nombre: n, apellido: a, telefono: tel, documento: doc, certificacion: cert, selectedEspecializaciones: espIds, email: mail });
      } catch {
        const partes = (usuario?.nombre || "").trim().split(" ");
        setNombre(partes[0] || "");
        setApellido(partes.slice(1).join(" ") || "");
        setEmail(usuario?.correo || "");
      } finally {
        setCargando(false);
      }
    };
    cargar();
  }, [usuario?.nombre, usuario?.correo]);

  useEffect(() => {
    const cargarCatalogo = async () => {
      try {
        const res = await apiFetch<any[]>("/especializaciones");
        const lista = (res || []).map((c: any) => ({ id: c.id_especializacion, nombre: c.nombre }));
        if (lista.length > 0) setCatalogo(lista);
        else throw new Error("vacío");
      } catch {
        setCatalogo([
          { id: 1, nombre: "Audio y video inteligente" },
          { id: 2, nombre: "Automatización de hogares" },
          { id: 3, nombre: "Iluminación inteligente" },
          { id: 4, nombre: "Seguridad inteligente" },
          { id: 5, nombre: "Redes y conectividad" },
          { id: 6, nombre: "Domótica" },
        ]);
      }
    };
    cargarCatalogo();
  }, []);

  const iniciarEdicion = () => {
    setSnapshot({
      nombre,
      apellido,
      telefono,
      documento,
      certificacion,
      selectedEspecializaciones: [...selectedEspecializaciones],
      avatar: avatar ?? null,
    });
    setConfirmEditarVisible(false);
    setModoEdicion(true);
  };

  const cancelarEdicion = () => {
    setNombre(snapshot.nombre || "");
    setApellido(snapshot.apellido || "");
    setTelefono(snapshot.telefono || "");
    setDocumento(snapshot.documento || "");
    setCertificacion(snapshot.certificacion || "");
    setSelectedEspecializaciones(snapshot.selectedEspecializaciones || []);
    // Restaurar foto al estado previo a la edición
    if ("avatar" in snapshot) {
      setAvatar(snapshot.avatar ?? null);
    }
    setModoEdicion(false);
    setConfirmVisible(false);
    setConfirmEditarVisible(false);
    setEspecialidadModal(false);
  };

  const toggleEspecializacion = (id: number) => {
    if (!modoEdicion) return;
    setSelectedEspecializaciones((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const handleGuardar = async () => {
    const telClean = telefono.replace(/\D/g, "");
    if (telClean && telClean.length !== 10) {
      mostrarToast(t("perfil.telefonoInvalido"));
      return;
    }
    if (!nombre.trim() || !apellido.trim()) {
      mostrarToast(t("perfil.nombreRequerido"));
      return;
    }
    setGuardando(true);
    try {
      await apiFetch("/users/me", {
        method: "PUT",
        body: JSON.stringify({
          first_name: nombre.trim(),
          last_name: apellido.trim(),
          telefono_usuario: telClean ? parseInt(telClean, 10) : null,
          documento_usuario: documento.replace(/\D/g, "") ? parseInt(documento.replace(/\D/g, ""), 10) : null,
          certificacion_t: certificacion.trim() || null,
        }),
      });
      // sincronizar especializaciones
      const actuales = snapshot.selectedEspecializaciones || [];
      const agregar = selectedEspecializaciones.filter((id) => !actuales.includes(id));
      const quitar = actuales.filter((id: number) => !selectedEspecializaciones.includes(id));
      for (const id of agregar) {
        await apiFetch(`/tecnicos/mis-especializaciones/${id}`, { method: "POST" }).catch(() => {});
      }
      for (const id of quitar) {
        await apiFetch(`/tecnicos/mis-especializaciones/${id}`, { method: "DELETE" }).catch(() => {});
      }
      await actualizarUsuario();
      setSnapshot({ nombre, apellido, telefono, documento, certificacion, selectedEspecializaciones: [...selectedEspecializaciones], email });
      setModoEdicion(false);
      setConfirmVisible(false);
      mostrarToast(t("perfil.guardadoOk"));
    } catch (e: any) {
      mostrarToast(e?.message || "Error al guardar cambios");
    } finally {
      setGuardando(false);
    }
  };

  const pickImage = async () => {
    if (!modoEdicion) {
      mostrarToast("Presiona Editar perfil para cambiar la foto");
      return;
    }
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      mostrarToast("Permiso denegado para acceder a fotos");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
      base64: false,
    });
    if (!result.canceled && result.assets[0]?.uri) {
      const asset = result.assets[0];
      try {
        const formData = new FormData();
        const ext = (asset.mimeType?.split("/")[1] ?? "jpg").replace("jpeg", "jpg");
        formData.append("archivo", {
          uri: asset.uri,
          name: `perfil.${ext}`,
          type: asset.mimeType || "image/jpeg",
        } as any);
        const actualizado = await apiFetch<any>("/users/me/foto", {
          method: "POST",
          body: formData,
          headers: { "Content-Type": "multipart/form-data" },
        });
        if (actualizado?.foto_url) {
          setAvatar(actualizado.foto_url);
        }
        await actualizarUsuario();
        mostrarToast(t("perfil.fotoActualizada"));
      } catch {
        mostrarToast("No se pudo subir la foto");
      }
    }
  };

  const confirmarEliminarFoto = () => {
    if (!modoEdicion) {
      setConfirmEliminarFoto(false);
      return;
    }
    setAvatar(null);
    setConfirmEliminarFoto(false);
    mostrarToast(t("perfil.fotoEliminada"));
  };

  // Texto del campo desplegable: truncate a "N especialidades seleccionadas" si es muy largo
  const especialidadesTexto = (() => {
    if (selectedEspecializaciones.length === 0) return "";
    const nombres = catalogo.filter((c) => selectedEspecializaciones.includes(c.id)).map((c) => c.nombre);
    if (nombres.length === 0) return "";
    // Si hay más de 2, mostrar resumen para no romper diseño
    if (nombres.length > 2) return `${nombres.length} especialidades seleccionadas`;
    const joined = nombres.join(", ");
    // truncamiento adicional por longitud
    if (joined.length > 38) return `${nombres.length} especialidades seleccionadas`;
    return joined;
  })();

  if (cargando) {
    return (
      <View style={[styles.centro, { paddingTop: insets.top + 20 }]}>
        <ActivityIndicator color={C.oro} />
        <Text style={styles.cargandoTxt}>{t("common.cargando")}</Text>
      </View>
    );
  }

  return (
    <View style={styles.pantalla}>
      <ScrollView
        contentContainerStyle={[styles.contenido, { paddingBottom: insets.bottom + 72 }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.titulo}>{t("perfil.titulo")}</Text>
        <Text style={styles.subtitulo}>{t("perfil.subtituloTecnico")}</Text>

        {/* 1️⃣ Foto de perfil */}
        <View style={styles.avatarCard}>
          <View style={styles.avatarWrap}>
            {avatar ? (
              <Image source={{ uri: avatar }} style={styles.avatarImg} />
            ) : (
              <View style={[styles.avatarImg, styles.avatarIniciales]}>
                <Text style={styles.avatarInicialesTxt}>{iniciales}</Text>
              </View>
            )}
            <Pressable
              onPress={pickImage}
              style={[styles.cameraBtn, !modoEdicion && { opacity: 0.55 }]}
              hitSlop={8}
            >
              <FontAwesome6 name="camera" size={12} color={modoEdicion ? "#141414" : "#8a8a8a"} />
            </Pressable>
          </View>
          <Text style={styles.avatarNombre}>{nombreCompleto}</Text>
          <Text style={styles.avatarCorreo}>{email}</Text>
          <View style={styles.avatarAcciones}>
            <Pressable onPress={pickImage} style={[styles.btnSecundario, !modoEdicion && { opacity: 0.55 }]} disabled={!modoEdicion && !!avatar}>
              <FontAwesome6 name="pen" size={11} color={modoEdicion ? C.oro : "#8a8a8a"} />
              <Text style={[styles.btnSecTxt, !modoEdicion && { color: "#8a8a8a" }]}>{t("perfil.cambiarFoto")}</Text>
            </Pressable>
            {avatar ? (
              <Pressable
                onPress={() => {
                  if (!modoEdicion) {
                    mostrarToast("Presiona Editar perfil para eliminar la foto");
                    return;
                  }
                  setConfirmEliminarFoto(true);
                }}
                style={[styles.btnSecundario, styles.btnDanger, !modoEdicion && { opacity: 0.55 }]}
              >
                <FontAwesome6 name="trash-can" size={11} color={modoEdicion ? "#e5484d" : "#8a8a8a"} />
                <Text style={[styles.btnSecTxt, { color: modoEdicion ? "#e5484d" : "#8a8a8a" }]}>{t("perfil.eliminarFoto")}</Text>
              </Pressable>
            ) : null}
          </View>
        </View>

        {/* 2️⃣ Mis especialidades — MENÚ DESPLEGABLE multi-select */}
        <View style={styles.formCard}>
          <View style={styles.cardHeader}>
            <FontAwesome6 name="screwdriver-wrench" size={13} color={C.oro} />
            <Text style={styles.cardTitle}>Mis especialidades</Text>
            {selectedEspecializaciones.length > 0 && (
              <View style={styles.badgeCount}>
                <Text style={styles.badgeCountTxt}>{selectedEspecializaciones.length}</Text>
              </View>
            )}
          </View>
          <Text style={styles.hint}>Selecciona una o varias especializaciones</Text>

          <Pressable
            onPress={() => modoEdicion && setEspecialidadModal(true)}
            disabled={!modoEdicion}
            style={({ pressed }) => [
              styles.dropdownField,
              !modoEdicion && styles.dropdownDisabled,
              pressed && modoEdicion && { opacity: 0.85 },
              especialidadModal && modoEdicion && styles.dropdownFieldOpen,
            ]}
          >
            <View style={{ flex: 1, minWidth: 0 }}>
              {selectedEspecializaciones.length === 0 ? (
                <Text style={styles.dropdownPlaceholder} numberOfLines={1}>
                  Seleccionar especialidades
                </Text>
              ) : (
                <Text style={styles.dropdownTxt} numberOfLines={2} ellipsizeMode="tail">
                  {especialidadesTexto}
                </Text>
              )}
            </View>
            <View style={[styles.dropdownChevron, especialidadModal && styles.dropdownChevronOpen]}>
              <FontAwesome6 name="chevron-down" size={11} color={modoEdicion ? "#f0c96f" : "#6b6b6b"} />
            </View>
          </Pressable>

          {/* Chips de vista rápida cuando hay selección y no está editando o como confirmación */}
          {selectedEspecializaciones.length > 0 && (
            <View style={styles.selectedChipsWrap}>
              {catalogo
                .filter((c) => selectedEspecializaciones.includes(c.id))
                .slice(0, 6)
                .map((c) => (
                  <View key={c.id} style={styles.selectedChip}>
                    <Text style={styles.selectedChipTxt} numberOfLines={1}>
                      {c.nombre}
                    </Text>
                  </View>
                ))}
              {selectedEspecializaciones.length > 6 && (
                <View style={[styles.selectedChip, styles.selectedChipMore]}>
                  <Text style={styles.selectedChipMoreTxt}>+{selectedEspecializaciones.length - 6}</Text>
                </View>
              )}
            </View>
          )}

          {!modoEdicion ? (
            <Text style={styles.hint}>Presiona Editar perfil para modificar tus especializaciones</Text>
          ) : null}
        </View>

        {/* 3️⃣ Información personal */}
        <View style={styles.formCard}>
          <View style={styles.cardHeader}>
            <FontAwesome6 name="user" size={13} color={C.oro} />
            <Text style={styles.cardTitle}>Información personal</Text>
          </View>
          <Field label={t("perfil.nombres")} value={nombre} onChange={setNombre} editable={modoEdicion} placeholder="Nombre" />
          <Field label={t("perfil.apellidos")} value={apellido} onChange={setApellido} editable={modoEdicion} placeholder="Apellido" />
          <Field label={t("perfil.telefono")} value={telefono} onChange={(v) => setTelefono(v.replace(/\D/g, "").slice(0, 10))} editable={modoEdicion} placeholder="300 123 4567" keyboard="numeric" maxLength={10} />
          <Field label={t("perfil.documento")} value={documento} onChange={(v) => setDocumento(v.replace(/\D/g, "").slice(0, 15))} editable={modoEdicion} placeholder="Documento" keyboard="numeric" />
          <Field label={t("perfil.certificacion")} value={certificacion} onChange={setCertificacion} editable={modoEdicion} placeholder="Ej. Certificado KNX, etc." />
          <View style={styles.fieldWrap}>
            <Text style={styles.fieldLabel}>{t("perfil.correo")}</Text>
            <View style={[styles.input, styles.inputDisabled]}>
              <Text style={styles.inputDisabledTxt} numberOfLines={1}>
                {email}
              </Text>
            </View>
            <Text style={styles.hint}>{t("perfil.correoNoEditable")}</Text>
          </View>

          {!modoEdicion ? (
            <Pressable onPress={() => setConfirmEditarVisible(true)} style={styles.btnPrimario}>
              <FontAwesome6 name="pen-to-square" size={13} color="#141414" />
              <Text style={styles.btnPrimTxt}>{t("perfil.editar")}</Text>
            </Pressable>
          ) : (
            <View style={styles.edicionBtns}>
              <Pressable onPress={cancelarEdicion} style={styles.btnGhost} disabled={guardando}>
                <Text style={styles.btnGhostTxt}>Cancelar</Text>
              </Pressable>
              <Pressable onPress={() => setConfirmVisible(true)} style={[styles.btnPrimario, { flex: 1 }]} disabled={guardando}>
                {guardando ? <ActivityIndicator color="#141414" size="small" /> : <Text style={styles.btnPrimTxt}>Guardar cambios</Text>}
              </Pressable>
            </View>
          )}
        </View>
      </ScrollView>

      {/* Modal selector especializaciones — MENÚ DESPLEGABLE con checkboxes */}
      <Modal visible={especialidadModal} transparent animationType="fade" onRequestClose={() => setEspecialidadModal(false)} statusBarTranslucent>
        <View style={styles.modalOverlay}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setEspecialidadModal(false)} />
          <View style={styles.modalCard}>
            <View style={styles.modalHead}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flex: 1 }}>
                <FontAwesome6 name="list-check" size={14} color={C.oro} />
                <Text style={styles.modalTitle}>{t("perfil.seleccionaEspecialidadTitle") || "Seleccionar especialidades"}</Text>
              </View>
              <Pressable onPress={() => setEspecialidadModal(false)} hitSlop={8} style={styles.modalClose}>
                <FontAwesome6 name="xmark" size={14} color="#fff" />
              </Pressable>
            </View>

            <Text style={styles.modalHint}>Puedes seleccionar una o varias opciones</Text>

            <ScrollView style={{ maxHeight: 380 }} showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 4 }}>
              {catalogo.map((c) => {
                const checked = selectedEspecializaciones.includes(c.id);
                return (
                  <Pressable
                    key={c.id}
                    onPress={() => toggleEspecializacion(c.id)}
                    style={({ pressed }) => [styles.checkRow, checked && styles.checkRowActive, pressed && { opacity: 0.9 }]}
                  >
                    <View style={[styles.checkbox, checked && styles.checkboxActive]}>
                      {checked ? <FontAwesome6 name="check" size={10} color="#141414" /> : null}
                    </View>
                    <Text style={[styles.checkLabel, checked && styles.checkLabelActive]} numberOfLines={2}>
                      {c.nombre}
                    </Text>
                  </Pressable>
                );
              })}
              {catalogo.length === 0 && (
                <View style={styles.emptyOptions}>
                  <FontAwesome6 name="circle-info" size={20} color="#5a5a5a" />
                  <Text style={styles.emptyOptionsTxt}>No hay especializaciones disponibles</Text>
                </View>
              )}
            </ScrollView>

            <View style={styles.modalFooter}>
              <View style={{ flex: 1 }}>
                <Text style={styles.modalCountTxt}>
                  {selectedEspecializaciones.length === 0
                    ? "Ninguna seleccionada"
                    : `${selectedEspecializaciones.length} seleccionada${selectedEspecializaciones.length > 1 ? "s" : ""}`}
                </Text>
              </View>
              <Pressable onPress={() => setEspecialidadModal(false)} style={styles.btnGhostSm}>
                <Text style={styles.btnGhostSmTxt}>{t("common.cerrar")}</Text>
              </Pressable>
              <Pressable onPress={() => setEspecialidadModal(false)} style={styles.btnPrimarioSm}>
                <Text style={styles.btnPrimarioSmTxt}>{t("common.aceptar")}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* Confirmación inicial Editar perfil */}
      <Modal visible={confirmEditarVisible} transparent animationType="fade" onRequestClose={() => setConfirmEditarVisible(false)} statusBarTranslucent>
        <View style={styles.confirmOverlay}>
          <View style={styles.confirmCard}>
            <View style={styles.confirmIcon}>
              <FontAwesome6 name="pen-to-square" size={20} color={C.oro} />
            </View>
            <Text style={styles.confirmTitle}>Editar perfil</Text>
            <Text style={styles.confirmMsg}>¿Estás seguro de que quieres editar tu perfil?</Text>
            <View style={styles.confirmBtns}>
              <Pressable onPress={() => setConfirmEditarVisible(false)} style={styles.btnGhost}>
                <Text style={styles.btnGhostTxt}>Rechazar</Text>
              </Pressable>
              <Pressable onPress={iniciarEdicion} style={[styles.btnPrimario, { flex: 1 }]}>
                <Text style={styles.btnPrimTxt}>Aceptar</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* Confirmación guardar */}
      <Modal visible={confirmVisible} transparent animationType="fade" onRequestClose={() => setConfirmVisible(false)} statusBarTranslucent>
        <View style={styles.confirmOverlay}>
          <View style={styles.confirmCard}>
            <View style={styles.confirmIcon}>
              <FontAwesome6 name="circle-question" size={22} color={C.oro} />
            </View>
            <Text style={styles.confirmTitle}>Guardar cambios</Text>
            <Text style={styles.confirmMsg}>¿Estás seguro de que deseas guardar los cambios realizados en tu perfil?</Text>
            <View style={styles.confirmBtns}>
              <Pressable onPress={() => setConfirmVisible(false)} style={styles.btnGhost} disabled={guardando}>
                <Text style={styles.btnGhostTxt}>Cancelar</Text>
              </Pressable>
              <Pressable onPress={handleGuardar} style={[styles.btnPrimario, { flex: 1 }]} disabled={guardando}>
                {guardando ? <ActivityIndicator color="#141414" /> : <Text style={styles.btnPrimTxt}>Confirmar</Text>}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* Confirmación eliminar foto */}
      <Modal visible={confirmEliminarFoto} transparent animationType="fade" onRequestClose={() => setConfirmEliminarFoto(false)} statusBarTranslucent>
        <View style={styles.confirmOverlay}>
          <View style={styles.confirmCard}>
            <View style={[styles.confirmIcon, { backgroundColor: "rgba(229,72,77,0.12)", borderColor: "rgba(229,72,77,0.22)" }]}>
              <FontAwesome6 name="trash-can" size={18} color="#e5484d" />
            </View>
            <Text style={styles.confirmTitle}>Eliminar foto de perfil</Text>
            <Text style={styles.confirmMsg}>¿Estás seguro de que deseas eliminar tu foto de perfil?</Text>
            <View style={styles.confirmBtns}>
              <Pressable onPress={() => setConfirmEliminarFoto(false)} style={styles.btnGhost}>
                <Text style={styles.btnGhostTxt}>{t("common.cancelar")}</Text>
              </Pressable>
              <Pressable onPress={confirmarEliminarFoto} style={[styles.btnPrimario, { backgroundColor: "#e5484d", flex: 1 }]}>
                <Text style={[styles.btnPrimTxt, { color: "#fff" }]}>Eliminar</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {toast ? (
        <View style={styles.toastWrap} pointerEvents="none">
          <View style={styles.toast}>
            <Text style={styles.toastTxt}>{toast}</Text>
          </View>
        </View>
      ) : null}
    </View>
  );
}

function Field({ label, value, onChange, editable, placeholder, keyboard, maxLength }: { label: string; value: string; onChange: (v: string) => void; editable: boolean; placeholder?: string; keyboard?: any; maxLength?: number }) {
  return (
    <View style={styles.fieldWrap}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor="#6b6b6b"
        editable={editable}
        keyboardType={keyboard}
        maxLength={maxLength}
        style={[styles.input, !editable && styles.inputDisabled]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  pantalla: { flex: 1, backgroundColor: "#000" },
  contenido: { padding: 16, gap: 14 },
  centro: { flex: 1, backgroundColor: "#000", alignItems: "center", justifyContent: "center", gap: 10 },
  cargandoTxt: { color: "#bdbdbd", fontSize: 13 },
  titulo: { color: "#fff", fontSize: 20, fontFamily: FontFamilies.bodyBold },
  subtitulo: { color: "#bdbdbd", fontSize: 13, marginTop: -8 },
  avatarCard: {
    backgroundColor: "#161616",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.09)",
    borderRadius: 16,
    padding: 18,
    alignItems: "center",
    gap: 8,
  },
  avatarWrap: { width: 92, height: 92, borderRadius: 46, alignItems: "center", justifyContent: "center", marginBottom: 4 },
  avatarImg: { width: 92, height: 92, borderRadius: 46, borderWidth: 2, borderColor: "#caa24d", backgroundColor: "#0f0f0f" },
  avatarIniciales: { alignItems: "center", justifyContent: "center", backgroundColor: "rgba(212,165,75,0.15)" },
  avatarInicialesTxt: { color: "#f0c96f", fontSize: 28, fontFamily: FontFamilies.bodyBold },
  cameraBtn: {
    position: "absolute",
    bottom: 0,
    right: 0,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "#caa24d",
    borderWidth: 2,
    borderColor: "#161616",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarNombre: { color: "#fff", fontSize: 16, fontFamily: FontFamilies.bodyBold, textAlign: "center" },
  avatarCorreo: { color: "#bdbdbd", fontSize: 12.5, textAlign: "center" },
  avatarAcciones: { flexDirection: "row", gap: 8, marginTop: 6 },
  btnSecundario: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderWidth: 1,
    borderColor: "rgba(212,165,75,0.35)",
    backgroundColor: "rgba(212,165,75,0.08)",
    paddingVertical: 7,
    paddingHorizontal: 12,
    borderRadius: 999,
  },
  btnSecTxt: { color: "#f0c96f", fontSize: 12, fontFamily: FontFamilies.bodyBold },
  btnDanger: { borderColor: "rgba(229,72,77,0.35)", backgroundColor: "rgba(229,72,77,0.08)" },
  formCard: {
    backgroundColor: "#161616",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.09)",
    borderRadius: 16,
    padding: 14,
    gap: 12,
  },
  cardHeader: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 2 },
  cardTitle: { color: "#fff", fontSize: 14, fontFamily: FontFamilies.bodyBold, flex: 1 },
  badgeCount: {
    backgroundColor: "#caa24d",
    borderRadius: 999,
    minWidth: 22,
    height: 22,
    paddingHorizontal: 6,
    alignItems: "center",
    justifyContent: "center",
  },
  badgeCountTxt: { color: "#141414", fontSize: 11, fontFamily: FontFamilies.bodyBold },
  fieldWrap: { gap: 6 },
  fieldLabel: { color: "#f0c96f", fontSize: 11, fontFamily: FontFamilies.bodyBold, textTransform: "uppercase", letterSpacing: 0.5 },
  input: {
    backgroundColor: "#0f0f0f",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.09)",
    borderRadius: 10,
    color: "#fff",
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 13.5,
  },
  inputDisabled: { backgroundColor: "rgba(255,255,255,0.04)", borderColor: "rgba(255,255,255,0.06)", color: "#8a8a8a" },
  inputDisabledTxt: { color: "#8a8a8a", fontSize: 13.5 },
  hint: { color: "#6b6b6b", fontSize: 11, marginTop: -2 },
  // Dropdown field
  dropdownField: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    backgroundColor: "#0f0f0f",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.09)",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
    minHeight: 46,
  },
  dropdownFieldOpen: {
    borderColor: "#caa24d",
    backgroundColor: "rgba(212,165,75,0.06)",
  },
  dropdownDisabled: {
    backgroundColor: "rgba(255,255,255,0.04)",
    borderColor: "rgba(255,255,255,0.06)",
    opacity: 0.85,
  },
  dropdownTxt: { color: "#fff", fontSize: 13.5, flex: 1, lineHeight: 18 },
  dropdownPlaceholder: { color: "#6b6b6b", fontSize: 13.5, flex: 1 },
  dropdownChevron: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: "rgba(255,255,255,0.06)",
    alignItems: "center",
    justifyContent: "center",
  },
  dropdownChevronOpen: {
    backgroundColor: "rgba(212,165,75,0.18)",
    transform: [{ rotate: "180deg" }],
  },
  selectedChipsWrap: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 2 },
  selectedChip: {
    backgroundColor: "rgba(212,165,75,0.12)",
    borderWidth: 1,
    borderColor: "rgba(212,165,75,0.22)",
    borderRadius: 999,
    paddingVertical: 4,
    paddingHorizontal: 9,
    maxWidth: "100%",
  },
  selectedChipTxt: { color: "#f0c96f", fontSize: 11.5, fontFamily: FontFamilies.bodyMedium },
  selectedChipMore: { backgroundColor: "rgba(255,255,255,0.06)", borderColor: "rgba(255,255,255,0.09)" },
  selectedChipMoreTxt: { color: "#bdbdbd", fontSize: 11.5, fontFamily: FontFamilies.bodyBold },
  // Modal dropdown
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.62)", justifyContent: "center", padding: 16 },
  modalCard: {
    backgroundColor: "#121212",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(212,165,75,0.28)",
    padding: 16,
    gap: 10,
    maxHeight: "78%",
  },
  modalHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  modalTitle: { color: "#fff", fontSize: 15, fontFamily: FontFamilies.bodyBold, flex: 1 },
  modalHint: { color: "#8a8a8a", fontSize: 12, marginTop: -2 },
  modalClose: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.09)",
    alignItems: "center",
    justifyContent: "center",
  },
  modalFooter: { flexDirection: "row", gap: 10, alignItems: "center", marginTop: 8, paddingTop: 10, borderTopWidth: 1, borderTopColor: "rgba(255,255,255,0.06)" },
  modalCountTxt: { color: "#8a8a8a", fontSize: 12, fontFamily: FontFamilies.bodyMedium },
  checkRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.07)",
    borderRadius: 10,
    paddingVertical: 11,
    paddingHorizontal: 12,
  },
  checkRowActive: { backgroundColor: "rgba(212,165,75,0.12)", borderColor: "rgba(212,165,75,0.35)" },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: "rgba(255,255,255,0.22)",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "transparent",
  },
  checkboxActive: { backgroundColor: "#caa24d", borderColor: "#caa24d" },
  checkLabel: { color: "#dcdcdc", fontSize: 13, flex: 1, lineHeight: 18 },
  checkLabelActive: { color: "#fff", fontFamily: FontFamilies.bodyBold },
  emptyOptions: { alignItems: "center", paddingVertical: 18, gap: 8 },
  emptyOptionsTxt: { color: "#8a8a8a", fontSize: 12.5, textAlign: "center" },
  btnGhostSm: {
    borderWidth: 1,
    borderColor: "rgba(212,165,75,0.35)",
    borderRadius: 10,
    paddingVertical: 9,
    paddingHorizontal: 14,
    alignItems: "center",
  },
  btnGhostSmTxt: { color: "#f0c96f", fontFamily: FontFamilies.button, fontSize: 12.5 },
  btnPrimarioSm: { backgroundColor: "#caa24d", borderRadius: 10, paddingVertical: 9, paddingHorizontal: 16, alignItems: "center" },
  btnPrimarioSmTxt: { color: "#141414", fontFamily: FontFamilies.button, fontSize: 12.5 },
  // others
  edicionBtns: { flexDirection: "row", gap: 10, marginTop: 4 },
  btnPrimario: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#caa24d",
    borderRadius: 10,
    paddingVertical: 11,
    paddingHorizontal: 14,
  },
  btnPrimTxt: { color: "#141414", fontFamily: FontFamilies.button, fontSize: 13 },
  btnGhost: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "rgba(212,165,75,0.35)",
    paddingVertical: 11,
  },
  btnGhostTxt: { color: "#f0c96f", fontFamily: FontFamilies.button, fontSize: 13 },
  confirmOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.72)", justifyContent: "center", padding: 20 },
  confirmCard: {
    backgroundColor: "#121212",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(212,165,75,0.28)",
    padding: 18,
    gap: 10,
    alignItems: "center",
  },
  confirmIcon: { width: 44, height: 44, borderRadius: 22, backgroundColor: "rgba(212,165,75,0.12)", borderWidth: 1, borderColor: "rgba(212,165,75,0.22)", alignItems: "center", justifyContent: "center" },
  confirmTitle: { color: "#fff", fontSize: 16, fontFamily: FontFamilies.bodyBold, textAlign: "center" },
  confirmMsg: { color: "#bdbdbd", fontSize: 13, textAlign: "center", lineHeight: 18 },
  confirmBtns: { flexDirection: "row", gap: 10, width: "100%", marginTop: 6 },
  toastWrap: { position: "absolute", left: 16, right: 16, bottom: 90, alignItems: "center" },
  toast: { backgroundColor: "rgba(0,0,0,0.92)", borderWidth: 1, borderColor: "#c9a227", borderRadius: 40, paddingVertical: 9, paddingHorizontal: 16 },
  toastTxt: { color: "#f0c96f", fontSize: 12.5, textAlign: "center" },
});
