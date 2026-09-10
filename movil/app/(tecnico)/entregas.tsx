import React, { useEffect, useState, useRef } from "react";
import { useIdioma } from "@/contexts/IdiomaContext";
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  Modal,
  Platform,
  KeyboardAvoidingView,
} from "react-native";
import FontAwesome6 from "@expo/vector-icons/FontAwesome6";
import * as ImagePicker from "expo-image-picker";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { NeodomusColors as C, FontFamilies } from "@/constants/theme";
import { apiFetch } from "@/services/api";
import { API_BASE_URL } from "@/constants/api";
import { useScrollTopAlEntrar } from "@/hooks/useScrollTopAlEntrar";
import {
  crearNovedad,
  subirEvidencia,
  TIPOS_NOVEDAD,
  PRIORIDADES,
} from "@/services/novedades.service";
import { obtenerSesion } from "@/services/storage";

// ── Helpers ──────────────────────────────────────────────────

const urlEvidencia = (url: string) =>
  url.startsWith("http") ? url : `${API_BASE_URL.replace(/\/api\/v1\/?$/, "")}${url}`;

// ── Recogida interface ───────────────────────────────────────

interface Recogida {
  id_devolucion: number;
  id_pedido?: number | null;
  producto: string;
  cliente: string;
  direccion: string;
  telefono?: number | null;
  estado_devolucion: string;
  preferencia: string;
  recogida_estado: "Asignada" | "Recogida" | null;
  motivo?: string | null;
  evidencia_recogida_url?: string | null;
  fecha_recogida?: string | null;
}

// ── Component ────────────────────────────────────────────────

export default function TecnicoEntregasScreen() {
  const scrollRef = useRef<ScrollView>(null);
  const { t } = useIdioma();
  useScrollTopAlEntrar(scrollRef);
  const insets = useSafeAreaInsets();

  // Data
  const [entregas, setEntregas] = useState<any[]>([]);
  const [recogidas, setRecogidas] = useState<Recogida[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorCarga, setErrorCarga] = useState(false);

  // UI state
  const [updatingId, setUpdatingId] = useState<number | null>(null);
  const [subiendoEvidenciaId, setSubiendoEvidenciaId] = useState<number | null>(null);
  const [subiendoRecogidaId, setSubiendoRecogidaId] = useState<number | null>(null);
  const [compartiendoUbicacion, setCompartiendoUbicacion] = useState(false);
  const [toast, setToast] = useState<{ msg: string; tipo: "success" | "error" } | null>(null);

  // Confirm recogida modal
  const [confirmRecogida, setConfirmRecogida] = useState<any | null>(null);

  // Novedad modal
  const [novedadPedido, setNovedadPedido] = useState<any | null>(null);
  const [novedadTipo, setNovedadTipo] = useState(TIPOS_NOVEDAD[0]);
  const [novedadPrioridad, setNovedadPrioridad] = useState("normal");
  const [novedadDescripcion, setNovedadDescripcion] = useState("");
  const [novedadGuardando, setNovedadGuardando] = useState(false);
  const [showTipoPicker, setShowTipoPicker] = useState(false);
  const [showPrioridadPicker, setShowPrioridadPicker] = useState(false);

  // Location tracking
  const watchIdRef = useRef<{ remove(): void } | null>(null);

  // ── Toast helper ─────────────────────────────────────────

  const notificar = (msg: string, tipo: "success" | "error" = "success") => {
    setToast({ msg, tipo });
  };

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(timer);
  }, [toast]);

  // ── Data loading ─────────────────────────────────────────

  const cargar = async () => {
    setLoading(true);
    setErrorCarga(false);
    try {
      const [resEntregas, resRecogidas] = await Promise.all([
        apiFetch<any[]>("/tecnicos/mis-entregas"),
        apiFetch<Recogida[]>("/devoluciones/mis-recogidas").catch(() => []),
      ]);
      setEntregas(resEntregas || []);
      setRecogidas(resRecogidas || []);
    } catch {
      setErrorCarga(true);
    }
    setLoading(false);
  };

  useEffect(() => {
    cargar();
    return () => detenerUbicacion();
  }, []);

  // ── Status update ────────────────────────────────────────

  const actualizarEstado = async (pedidoId: number, nuevoEstado: string) => {
    setUpdatingId(pedidoId);
    try {
      await apiFetch(`/tecnicos/entregas/${pedidoId}/estado`, {
        method: "PUT",
        body: JSON.stringify({ estado: nuevoEstado }),
      });
      const msg =
        nuevoEstado === "Recogido"
          ? "Entrega marcada como recogida"
          : nuevoEstado === "En camino"
            ? "Marcado como en camino"
            : "Entrega completada";
      notificar(msg);
      await cargar();
    } catch (e: any) {
      notificar(e?.message || "Error al actualizar estado", "error");
    }
    setUpdatingId(null);
  };

  // ── Evidence upload ──────────────────────────────────────

  const subirEvidencias = async (pedidoId: number) => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      notificar("Permiso de galería denegado", "error");
      return;
    }
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.7,
      allowsMultipleSelection: true,
    });
    if (res.canceled || !res.assets?.length) return;

    setSubiendoEvidenciaId(pedidoId);
    try {
      const fd = new FormData();
      for (const asset of res.assets) {
        fd.append("files", {
          uri: asset.uri,
          name: "evidencia.jpg",
          type: "image/jpeg",
        } as any);
      }
      await apiFetch(`/tecnicos/entregas/${pedidoId}/evidencias`, {
        method: "POST",
        body: fd,
        headers: {} as any,
      });
      await apiFetch(`/tecnicos/entregas/${pedidoId}/estado`, {
        method: "PUT",
        body: JSON.stringify({ estado: "Entregado" }),
      });
      notificar("Entrega completada con evidencias");
      await cargar();
    } catch (e: any) {
      notificar(e?.message || "Error al subir evidencias", "error");
    }
    setSubiendoEvidenciaId(null);
  };

  const agregarMasFotos = async (pedidoId: number) => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      notificar("Permiso de galería denegado", "error");
      return;
    }
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.7,
      allowsMultipleSelection: true,
    });
    if (res.canceled || !res.assets?.length) return;

    setSubiendoEvidenciaId(pedidoId);
    try {
      const fd = new FormData();
      for (const asset of res.assets) {
        fd.append("files", {
          uri: asset.uri,
          name: "evidencia.jpg",
          type: "image/jpeg",
        } as any);
      }
      await apiFetch(`/tecnicos/entregas/${pedidoId}/evidencias`, {
        method: "POST",
        body: fd,
        headers: {} as any,
      });
      notificar("Fotos agregadas");
      await cargar();
    } catch (e: any) {
      notificar(e?.message || "Error al subir fotos", "error");
    }
    setSubiendoEvidenciaId(null);
  };

  // ── Location sharing ─────────────────────────────────────

  const detenerUbicacion = () => {
    watchIdRef.current?.remove();
    watchIdRef.current = null;
    setCompartiendoUbicacion(false);
  };

  const compartirUbicacion = async () => {
    if (compartiendoUbicacion) {
      detenerUbicacion();
      return;
    }
    try {
      const { status } = await import("expo-location").then((m) =>
        m.requestForegroundPermissionsAsync(),
      );
      if (status !== "granted") {
        notificar("Permiso de ubicación denegado", "error");
        return;
      }
      const sub = await import("expo-location").then((m) =>
        m.watchPositionAsync(
          { accuracy: 6, timeInterval: 10000, distanceInterval: 10 },
          async (pos) => {
            try {
              await apiFetch("/tecnicos/ubicacion", {
                method: "POST",
                body: JSON.stringify({
                  latitud: pos.coords.latitude,
                  longitud: pos.coords.longitude,
                }),
              });
            } catch {}
          },
        ),
      );
      watchIdRef.current = sub;
      setCompartiendoUbicacion(true);
      notificar("Compartiendo ubicación");
    } catch {
      notificar("No se pudo acceder a la ubicación", "error");
    }
  };

  // ── Confirmar recogida (original) ────────────────────────

  const confirmarRecogida = async () => {
    if (!confirmRecogida) return;
    setUpdatingId(confirmRecogida.id_pedido);
    try {
      await apiFetch(`/tecnicos/entregas/${confirmRecogida.id_pedido}/estado`, {
        method: "PUT",
        body: JSON.stringify({ estado: "Recogido" }),
      });
      notificar("Entrega marcada como recogida");
      setConfirmRecogida(null);
      await cargar();
    } catch (e: any) {
      notificar(e?.message || "Error", "error");
    }
    setUpdatingId(null);
  };

  // ── Confirmar recogida devolución ────────────────────────

  const confirmarRecogidaDevolucion = async (idDevolucion: number) => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      notificar("Permiso de galería denegado", "error");
      return;
    }
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.7,
    });
    if (res.canceled || !res.assets?.[0]) return;

    const asset = res.assets[0];
    setSubiendoRecogidaId(idDevolucion);
    try {
      const sesion = await obtenerSesion();
      const fd = new FormData();
      fd.append("file", {
        uri: asset.uri,
        name: "evidencia.jpg",
        type: "image/jpeg",
      } as any);
      const response = await fetch(
        `${API_BASE_URL}/devoluciones/${idDevolucion}/evidencia-recogida`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${sesion?.accessToken}` },
          body: fd,
        },
      );
      if (!response.ok) throw new Error("Error al subir evidencia");
      notificar("Recogida confirmada con evidencia");
      await cargar();
    } catch (e: any) {
      notificar(e?.message || "Error al confirmar recogida", "error");
    }
    setSubiendoRecogidaId(null);
  };

  // ── Novedad creation ─────────────────────────────────────

  const crearNovedadEntrega = async () => {
    if (!novedadPedido || !novedadDescripcion.trim()) return;
    setNovedadGuardando(true);
    try {
      await crearNovedad({
        tipo_novedad: novedadTipo,
        descripcion: novedadDescripcion.trim(),
        prioridad: novedadPrioridad,
        id_pedido: novedadPedido.id_pedido,
      });
      notificar("Novedad registrada");
      setNovedadPedido(null);
      setNovedadDescripcion("");
    } catch (e: any) {
      notificar(e?.message || "Error al crear novedad", "error");
    }
    setNovedadGuardando(false);
  };

  // ── Derived data ─────────────────────────────────────────

  const enCamino = entregas.filter((e) => e.estado_entrega === "En camino").length;
  const entregasActivas = entregas.filter(
    (e) =>
      e.estado_entrega !== "Entregado" ||
      (e.evidencias_entrega || []).length === 0,
  );

  // ── Render ───────────────────────────────────────────────

  if (loading) {
    return (
      <View style={styles.centro}>
        <ActivityIndicator color={C.oro} />
        <Text style={styles.gris}>Cargando entregas...</Text>
      </View>
    );
  }

  if (errorCarga) {
    return (
      <View style={styles.centro}>
        <FontAwesome6 name="circle-info" size={28} color="#f0858a" />
        <Text style={[styles.gris, { fontSize: 14 }]}>
          No se pudieron cargar las entregas
        </Text>
        <Pressable onPress={cargar} style={styles.btnPrimary}>
          <FontAwesome6 name="arrows-rotate" size={12} color="#141414" />
          <Text style={styles.btnPrimaryTxt}>Reintentar</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.pantalla}>
      <ScrollView
        ref={scrollRef}
        contentContainerStyle={[styles.contenido, { paddingBottom: insets.bottom + 72 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.headerRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.titulo}>{t("entregas.titulo")}</Text>
            <Text style={styles.sub}>
              {entregas.length > 0
                ? `${entregas.length} pedidos asignados`
                : t("entregas.subtitulo")}
            </Text>
          </View>
          {enCamino > 0 && (
            <View style={[styles.badge, styles.bInfo]}>
              <Text style={styles.badgeTxt}>{enCamino} en camino</Text>
            </View>
          )}
        </View>

        {/* Entregas */}
        {entregasActivas.length === 0 ? (
          <View style={styles.empty}>
            <FontAwesome6 name="truck-fast" size={24} color="#5a5a5a" />
            <Text style={styles.gris}>No hay entregas pendientes</Text>
          </View>
        ) : (
          entregasActivas.map((e) => {
            const estado = e.estado_entrega || "Asignada";
            const isUpdating = updatingId === e.id_pedido;
            const isSubiendoEvidencia = subiendoEvidenciaId === e.id_pedido;
            const evidencias: string[] = e.evidencias_entrega || [];

            return (
              <View key={e.id_pedido} style={styles.card}>
                {/* Card header */}
                <View style={styles.cardHead}>
                  <Text style={styles.cardTitle} numberOfLines={1}>
                    {e.cliente} · Pedido #{e.id_pedido}
                  </Text>
                  <View
                    style={[
                      styles.badge,
                      estado === "Entregado"
                        ? styles.bOk
                        : estado === "En camino"
                          ? styles.bInfo
                          : estado === "Recogido"
                            ? styles.bProc
                            : styles.bPend,
                    ]}
                  >
                    <Text style={styles.badgeTxt}>{estado}</Text>
                  </View>
                </View>

                {/* Info */}
                <Text style={styles.cardSub}>
                  {e.fecha_entrega || ""} {e.hora_entrega || ""} · {e.direccion || ""}
                </Text>
                {e.telefono ? <Text style={styles.cardSub}>Tel: {e.telefono}</Text> : null}
                {e.email ? <Text style={styles.cardSub}>{e.email}</Text> : null}

                {/* Productos */}
                {e.productos && e.productos.length > 0 && (
                  <View style={styles.productosBox}>
                    {e.productos.map((p: any, idx: number) => (
                      <Text key={idx} style={styles.productoTxt}>
                        × {p.cantidad} {p.descripcion}
                      </Text>
                    ))}
                  </View>
                )}

                {/* Evidence thumbnails */}
                {estado === "Entregado" && evidencias.length > 0 && (
                  <View style={styles.evidenciasRow}>
                    {evidencias.slice(0, 3).map((url: string, idx: number) => (
                      <Image
                        key={idx}
                        source={{ uri: urlEvidencia(url) }}
                        style={styles.evidenciaThumb}
                      />
                    ))}
                    {evidencias.length > 3 && (
                      <Text style={styles.evidenciaMore}>+{evidencias.length - 3}</Text>
                    )}
                  </View>
                )}

                {/* Action buttons */}
                <View style={styles.actionsRow}>
                  {/* Asignada → Recogido */}
                  {(estado === "Asignada" || !e.estado_entrega) && (
                    <Pressable
                      onPress={() => setConfirmRecogida(e)}
                      disabled={isUpdating}
                      style={[styles.btnPrimary, isUpdating && { opacity: 0.6 }]}
                    >
                      <FontAwesome6 name="box-open" size={12} color="#141414" />
                      <Text style={styles.btnPrimaryTxt}>
                        {isUpdating ? t("entregas.actualizando") : t("entregas.yaRecogi")}
                      </Text>
                    </Pressable>
                  )}

                  {/* Recogido → En camino */}
                  {estado === "Recogido" && (
                    <Pressable
                      onPress={() => actualizarEstado(e.id_pedido, "En camino")}
                      disabled={isUpdating}
                      style={[styles.btnPrimary, isUpdating && { opacity: 0.6 }]}
                    >
                      <FontAwesome6 name="route" size={12} color="#141414" />
                      <Text style={styles.btnPrimaryTxt}>
                        {isUpdating ? "Procesando..." : "En camino"}
                      </Text>
                    </Pressable>
                  )}

                  {/* En camino → Entregado (with evidence) */}
                  {estado === "En camino" && (
                    <Pressable
                      onPress={() => subirEvidencias(e.id_pedido)}
                      disabled={isSubiendoEvidencia}
                      style={[styles.btnOk, isSubiendoEvidencia && { opacity: 0.6 }]}
                    >
                      <FontAwesome6 name="circle-check" size={12} color="#141414" />
                      <Text style={styles.btnPrimaryTxt}>
                        {isSubiendoEvidencia ? "Subiendo..." : "Entregado"}
                      </Text>
                    </Pressable>
                  )}

                  {/* Share location when en camino */}
                  {estado === "En camino" && (
                    <Pressable
                      onPress={compartirUbicacion}
                      style={[
                        styles.btnGhost,
                        compartiendoUbicacion && styles.btnGhostActive,
                      ]}
                    >
                      <FontAwesome6
                        name="location-dot"
                        size={12}
                        color={compartiendoUbicacion ? "#141414" : "#d4a54b"}
                      />
                      <Text
                        style={[
                          styles.btnGhostTxt,
                          compartiendoUbicacion && { color: "#141414" },
                        ]}
                      >
                        {compartiendoUbicacion ? "Detener GPS" : "Ubicación"}
                      </Text>
                    </Pressable>
                  )}

                  {/* Add more photos after delivered */}
                  {estado === "Entregado" && (
                    <Pressable
                      onPress={() => agregarMasFotos(e.id_pedido)}
                      disabled={isSubiendoEvidencia}
                      style={styles.btnGhost}
                    >
                      <FontAwesome6 name="camera" size={12} color="#d4a54b" />
                      <Text style={styles.btnGhostTxt}>Más fotos</Text>
                    </Pressable>
                  )}

                  {/* Novedad button */}
                  <Pressable
                    onPress={() => {
                      setNovedadPedido(e);
                      setNovedadTipo(TIPOS_NOVEDAD[0]);
                      setNovedadPrioridad("normal");
                      setNovedadDescripcion("");
                    }}
                    style={styles.btnNovedad}
                  >
                    <FontAwesome6 name="plus" size={10} color="#d4a54b" />
                    <Text style={styles.btnNovedadTxt}>Novedad</Text>
                  </Pressable>
                </View>
              </View>
            );
          })
        )}

        {/* ── Recogidas section ──────────────────────────── */}
        {recogidas.length > 0 && (
          <View style={[styles.card, { marginTop: 16 }]}>
            <View style={styles.cardHead}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flex: 1 }}>
                <FontAwesome6 name="box-open" size={14} color={C.oro} />
                <Text style={styles.cardTitle}>Recogidas</Text>
              </View>
            </View>
            <Text style={styles.cardSub}>
              Devoluciones asignadas para recoger
            </Text>
            {recogidas.map((r) => (
              <View key={r.id_devolucion} style={styles.recogidaItem}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.cardTitle} numberOfLines={1}>
                    Devolución #{r.id_devolucion} · {r.producto}
                  </Text>
                  <Text style={styles.cardSub}>
                    <FontAwesome6 name="users" size={10} color="#bdbdbd" /> {r.cliente}
                    {r.telefono ? ` · ${r.telefono}` : ""}
                  </Text>
                  <Text style={styles.cardSub}>
                    <FontAwesome6 name="location-dot" size={10} color="#bdbdbd" /> {r.direccion}
                  </Text>
                  {r.motivo ? (
                    <Text style={styles.cardSub}>Motivo: {r.motivo}</Text>
                  ) : null}
                </View>
                <View style={{ alignItems: "flex-end", gap: 6 }}>
                  <View
                    style={[
                      styles.badge,
                      r.recogida_estado === "Recogida" ? styles.bOk : styles.bPend,
                    ]}
                  >
                    <Text style={styles.badgeTxt}>
                      {r.recogida_estado === "Recogida" ? "Recogida" : "Pendiente"}
                    </Text>
                  </View>
                  {r.recogida_estado === "Recogida" && r.evidencia_recogida_url && (
                    <Image
                      source={{ uri: r.evidencia_recogida_url }}
                      style={styles.evidenciaThumb}
                    />
                  )}
                  {r.recogida_estado !== "Recogida" && (
                    <Pressable
                      onPress={() => confirmarRecogidaDevolucion(r.id_devolucion)}
                      disabled={subiendoRecogidaId === r.id_devolucion}
                      style={[
                        styles.btnPrimary,
                        subiendoRecogidaId === r.id_devolucion && { opacity: 0.6 },
                      ]}
                    >
                      <FontAwesome6 name="camera" size={12} color="#141414" />
                      <Text style={styles.btnPrimaryTxt}>
                        {subiendoRecogidaId === r.id_devolucion ? "Subiendo..." : "Evidencia"}
                      </Text>
                    </Pressable>
                  )}
                  {r.recogida_estado === "Recogida" && r.fecha_recogida && (
                    <Text style={styles.cardSub}>
                      {new Date(r.fecha_recogida).toLocaleDateString()}
                    </Text>
                  )}
                </View>
              </View>
            ))}
          </View>
        )}
      </ScrollView>

      {/* ── Confirm Recogida Modal ───────────────────────── */}
      <Modal
        visible={!!confirmRecogida}
        transparent
        animationType="fade"
        onRequestClose={() => setConfirmRecogida(null)}
        statusBarTranslucent
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>{t("entregas.confirmarRecogida")}</Text>
            <Text style={styles.gris}>{t("entregas.confirmarRecogidaMsg")}</Text>
            {confirmRecogida && (
              <View style={styles.confirmBox}>
                <Text style={styles.cardTitle}>Pedido #{confirmRecogida.id_pedido}</Text>
                <Text style={styles.cardSub}>{confirmRecogida.cliente}</Text>
              </View>
            )}
            <View style={{ flexDirection: "row", gap: 10, marginTop: 12 }}>
              <Pressable onPress={() => setConfirmRecogida(null)} style={styles.btnGhost}>
                <Text style={styles.btnGhostTxt}>Cancelar</Text>
              </Pressable>
              <Pressable onPress={confirmarRecogida} style={[styles.btnPrimary, { flex: 1 }]}>
                <Text style={styles.btnPrimaryTxt}>Confirmar</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── Novedad Modal ────────────────────────────────── */}
      <Modal
        visible={!!novedadPedido}
        transparent
        animationType="fade"
        onRequestClose={() => setNovedadPedido(null)}
        statusBarTranslucent
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={styles.modalOverlay}
        >
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Nueva Novedad</Text>
            {novedadPedido && (
              <Text style={styles.cardSub}>
                Pedido #{novedadPedido.id_pedido} · {novedadPedido.cliente}
              </Text>
            )}

            {/* Tipo picker */}
            <Text style={styles.label}>Tipo de novedad</Text>
            <Pressable onPress={() => setShowTipoPicker(true)} style={styles.pickerBtn}>
              <Text style={styles.pickerTxt}>{novedadTipo}</Text>
              <FontAwesome6 name="chevron-down" size={12} color="#bdbdbd" />
            </Pressable>

            {/* Prioridad picker */}
            <Text style={styles.label}>Prioridad</Text>
            <Pressable onPress={() => setShowPrioridadPicker(true)} style={styles.pickerBtn}>
              <Text style={styles.pickerTxt}>{novedadPrioridad}</Text>
              <FontAwesome6 name="chevron-down" size={12} color="#bdbdbd" />
            </Pressable>

            {/* Descripción */}
            <Text style={styles.label}>Descripción</Text>
            <TextInput
              value={novedadDescripcion}
              onChangeText={setNovedadDescripcion}
              placeholder="Describe la novedad..."
              placeholderTextColor="#5a5a5a"
              multiline
              numberOfLines={4}
              style={styles.textarea}
            />

            <View style={{ flexDirection: "row", gap: 10, marginTop: 8 }}>
              <Pressable
                onPress={() => setNovedadPedido(null)}
                style={styles.btnGhost}
              >
                <Text style={styles.btnGhostTxt}>Cancelar</Text>
              </Pressable>
              <Pressable
                onPress={crearNovedadEntrega}
                disabled={!novedadDescripcion.trim() || novedadGuardando}
                style={[
                  styles.btnPrimary,
                  { flex: 1 },
                  (!novedadDescripcion.trim() || novedadGuardando) && { opacity: 0.6 },
                ]}
              >
                {novedadGuardando ? (
                  <ActivityIndicator size="small" color="#141414" />
                ) : (
                  <FontAwesome6 name="paper-plane" size={12} color="#141414" />
                )}
                <Text style={styles.btnPrimaryTxt}>
                  {novedadGuardando ? "Guardando..." : "Crear"}
                </Text>
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ── Tipo Picker Modal ────────────────────────────── */}
      <Modal
        visible={showTipoPicker}
        transparent
        animationType="fade"
        onRequestClose={() => setShowTipoPicker(false)}
        statusBarTranslucent
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { maxHeight: "70%" }]}>
            <Text style={styles.modalTitle}>Tipo de novedad</Text>
            <ScrollView style={{ marginTop: 8 }}>
              {TIPOS_NOVEDAD.map((tipo) => (
                <Pressable
                  key={tipo}
                  onPress={() => {
                    setNovedadTipo(tipo);
                    setShowTipoPicker(false);
                  }}
                  style={[
                    styles.pickerOption,
                    novedadTipo === tipo && styles.pickerOptionActive,
                  ]}
                >
                  <Text
                    style={[
                      styles.pickerOptionTxt,
                      novedadTipo === tipo && { color: "#141414" },
                    ]}
                  >
                    {tipo}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
            <Pressable onPress={() => setShowTipoPicker(false)} style={[styles.btnGhost, { marginTop: 10 }]}>
              <Text style={styles.btnGhostTxt}>Cancelar</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* ── Prioridad Picker Modal ───────────────────────── */}
      <Modal
        visible={showPrioridadPicker}
        transparent
        animationType="fade"
        onRequestClose={() => setShowPrioridadPicker(false)}
        statusBarTranslucent
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Prioridad</Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 12 }}>
              {PRIORIDADES.map((p) => (
                <Pressable
                  key={p}
                  onPress={() => {
                    setNovedadPrioridad(p);
                    setShowPrioridadPicker(false);
                  }}
                  style={[
                    styles.prioridadChip,
                    novedadPrioridad === p && styles.prioridadChipActive,
                  ]}
                >
                  <Text
                    style={[
                      styles.prioridadChipTxt,
                      novedadPrioridad === p && { color: "#141414" },
                    ]}
                  >
                    {p}
                  </Text>
                </Pressable>
              ))}
            </View>
            <Pressable onPress={() => setShowPrioridadPicker(false)} style={[styles.btnGhost, { marginTop: 12 }]}>
              <Text style={styles.btnGhostTxt}>Cancelar</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* ── Toast ────────────────────────────────────────── */}
      {toast && (
        <View style={styles.toastWrap} pointerEvents="none">
          <View
            style={[
              styles.toast,
              toast.tipo === "error" && { borderColor: "#f0858a" },
            ]}
          >
            <Text style={[styles.toastTxt, toast.tipo === "error" && { color: "#f0858a" }]}>
              {toast.msg}
            </Text>
          </View>
        </View>
      )}
    </View>
  );
}

// ── Styles ───────────────────────────────────────────────────

const styles = StyleSheet.create({
  pantalla: { flex: 1, backgroundColor: "#000" },
  contenido: { padding: 14, gap: 12 },
  centro: {
    flex: 1,
    backgroundColor: "#000",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingTop: 40,
  },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  gris: { color: "#bdbdbd", fontSize: 12.5 },
  titulo: { color: "#fff", fontSize: 18, fontFamily: FontFamilies.bodyBold },
  sub: { color: "#bdbdbd", fontSize: 13, marginTop: -4 },
  card: {
    backgroundColor: "#161616",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.09)",
    borderRadius: 12,
    padding: 12,
    gap: 6,
  },
  cardHead: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 8,
  },
  cardTitle: {
    color: "#fff",
    fontSize: 14,
    fontFamily: FontFamilies.bodyBold,
    flex: 1,
  },
  cardSub: { color: "#bdbdbd", fontSize: 12 },
  badge: {
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderWidth: 1,
  },
  bOk: {
    backgroundColor: "rgba(126,226,154,0.15)",
    borderColor: "rgba(126,226,154,0.3)",
  },
  bInfo: {
    backgroundColor: "rgba(212,165,75,0.12)",
    borderColor: "rgba(212,165,75,0.25)",
  },
  bProc: {
    backgroundColor: "rgba(131,165,233,0.12)",
    borderColor: "rgba(131,165,233,0.25)",
  },
  bPend: {
    backgroundColor: "rgba(246,195,68,0.12)",
    borderColor: "rgba(246,195,68,0.25)",
  },
  badgeTxt: { color: "#fff", fontSize: 10, fontFamily: FontFamilies.bodyBold },
  empty: { alignItems: "center", paddingVertical: 30, gap: 8 },
  productosBox: {
    backgroundColor: "rgba(212,165,75,0.06)",
    borderRadius: 8,
    padding: 8,
    gap: 2,
  },
  productoTxt: { color: "#bdbdbd", fontSize: 11 },
  evidenciasRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 4,
  },
  evidenciaThumb: {
    width: 44,
    height: 44,
    borderRadius: 8,
    backgroundColor: "#1c1c1c",
  },
  evidenciaMore: { color: "#bdbdbd", fontSize: 11 },
  actionsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 6,
  },
  btnPrimary: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: "#caa24d",
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  btnOk: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: "#7ee29a",
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  btnPrimaryTxt: {
    color: "#141414",
    fontFamily: FontFamilies.bodyBold,
    fontSize: 12,
  },
  btnGhost: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "rgba(212,165,75,0.35)",
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  btnGhostActive: {
    backgroundColor: "#caa24d",
    borderColor: "#caa24d",
  },
  btnGhostTxt: {
    color: "#f0c96f",
    fontFamily: FontFamilies.button,
    fontSize: 11,
  },
  btnNovedad: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "rgba(212,165,75,0.3)",
    paddingVertical: 8,
    paddingHorizontal: 10,
  },
  btnNovedadTxt: {
    color: "#d4a54b",
    fontFamily: FontFamilies.button,
    fontSize: 11,
  },
  // Recogidas
  recogidaItem: {
    flexDirection: "row",
    gap: 10,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.06)",
    alignItems: "flex-start",
  },
  // Modals
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.72)",
    justifyContent: "center",
    padding: 16,
  },
  modalCard: {
    backgroundColor: "#121212",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(212,165,75,0.28)",
    padding: 16,
    gap: 10,
  },
  modalTitle: {
    color: "#fff",
    fontSize: 16,
    fontFamily: FontFamilies.bodyBold,
    textAlign: "center",
  },
  confirmBox: {
    backgroundColor: "rgba(212,165,75,0.08)",
    borderWidth: 1,
    borderColor: "rgba(212,165,75,0.18)",
    borderRadius: 10,
    padding: 10,
    marginTop: 6,
  },
  label: {
    color: "#bdbdbd",
    fontSize: 12,
    fontFamily: FontFamilies.bodyBold,
    marginTop: 4,
  },
  pickerBtn: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "#0f0f0f",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  pickerTxt: { color: "#fff", fontSize: 13 },
  textarea: {
    backgroundColor: "#0f0f0f",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    borderRadius: 8,
    padding: 10,
    color: "#fff",
    fontSize: 13,
    fontFamily: FontFamilies.body,
    textAlignVertical: "top",
    minHeight: 80,
  },
  pickerOption: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
    marginBottom: 2,
  },
  pickerOptionActive: {
    backgroundColor: "#caa24d",
  },
  pickerOptionTxt: {
    color: "#fff",
    fontSize: 13,
  },
  prioridadChip: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "rgba(212,165,75,0.3)",
  },
  prioridadChipActive: {
    backgroundColor: "#caa24d",
    borderColor: "#caa24d",
  },
  prioridadChipTxt: {
    color: "#d4a54b",
    fontSize: 13,
    fontFamily: FontFamilies.button,
  },
  // Toast
  toastWrap: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 90,
    alignItems: "center",
  },
  toast: {
    backgroundColor: "rgba(0,0,0,0.92)",
    borderWidth: 1,
    borderColor: "#c9a227",
    borderRadius: 40,
    paddingVertical: 9,
    paddingHorizontal: 16,
  },
  toastTxt: { color: "#f0c96f", fontSize: 12.5 },
});
