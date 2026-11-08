import LocalizedNotificationText from "@/components/common/LocalizedNotificationText";
// Mis pedidos — réplica de OrdersTab (WEB):
// GET /pedidos/mis-pedidos, acordeón de detalle, confirmar pago
// pendiente, rastrear pedido y descargar factura PDF real.
import React, { useCallback, useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import FontAwesome6 from "@expo/vector-icons/FontAwesome6";

import AppScreen from "@/components/app/AppScreen";
import { FontFamilies } from "@/constants/theme";

import { useAuth } from "@/contexts/AuthContext";
import { ApiError } from "@/services/api";
import {
  confirmarPagoPedido,
  descargarFacturaPdf,
  listarMisPedidos,
  type Pedido,
} from "@/services/cliente.services";

const COLOR_ESTADO: Record<string, string> = {
  Pagado: "#7ee29a",
  "Pago pendiente": "#f6c344",
  "Pago rechazado": "#f0858a",
  Cancelado: "#f0858a",
};

export default function PedidosScreen() {
  const { usuario } = useAuth();
  const [pedidos, setPedidos] = useState<Pedido[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [abierto, setAbierto] = useState<number | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    setError(null);
    try {
      setPedidos(await listarMisPedidos());
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "No se pudieron cargar los pedidos.");
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(t);
  }, [toast]);

  const confirmar = async (id: number) => {
    try {
      await confirmarPagoPedido(id);
      setToast(`Pago del pedido #${id} confirmado. ¡Gracias!`);
      await cargar();
    } catch (e) {
      setToast(e instanceof ApiError ? e.message : "No se pudo confirmar el pago.");
    }
  };

  const descargar = async (pedido: Pedido) => {
    if (!pedido.factura?.pdf_url || !usuario) return;
    try {
      // Tokens: la sesión móvil guarda el access token en storage.
      const { obtenerSesion } = await import("@/services/storage");
      const sesion = await obtenerSesion();
      await descargarFacturaPdf(
        pedido.factura.pdf_url,
        sesion?.accessToken ?? "",
      );
      setToast("Factura descargada.");
    } catch {
      setToast("No se pudo descargar la factura.");
    }
  };

  return (
    <AppScreen titulo="Mis pedidos">
      {cargando && <Text style={S.gris}>Cargando...</Text>}
      {error && <Text style={S.error}>{error}</Text>}

      {!cargando && pedidos.length === 0 && (
        <Text style={S.gris}>No tienes pedidos todavía.</Text>
      )}

      {pedidos.map((p) => (
        <View key={p.id_pedido} style={S.tarjeta}>
          <Pressable
            onPress={() => setAbierto(abierto === p.id_pedido ? null : p.id_pedido)}
            style={S.cabecera}
          >
            <View>
              <Text style={S.titulo}>Pedido #{p.id_pedido}</Text>
              <Text style={[S.estado, { color: COLOR_ESTADO[p.estado] ?? "#ffffff" }]}>
                {p.estado}
              </Text>
            </View>
            <View style={{ alignItems: "flex-end" }}>
              <Text style={S.total}>
                ${Math.round(p.total).toLocaleString("es-CO")} COP
              </Text>
              {!!p.fecha && <Text style={S.gris}>{String(p.fecha).slice(0, 10)}</Text>}
            </View>
          </Pressable>

          {abierto === p.id_pedido && (
            <View style={S.detalle}>
              {(p.detalles ?? []).map((d) => (
                <View key={d.id_detalle} style={S.fila}>
                  <Text style={S.detalleTexto} numberOfLines={2}>
                    {d.nombre} ×{" "}
                    {d.metros ? `${d.metros} m` : d.cantidad}
                  </Text>
                  <Text style={S.detalleValor}>
                    ${Math.round(d.subtotal).toLocaleString("es-CO")} COP
                  </Text>
                </View>
              ))}

              {p.pago && (
                <View style={S.seccion}>
                  <Text style={S.subtitulo}>Pago</Text>
                  <Text style={S.gris}>
                    Estado: {p.pago.estado === "aprobado" ? "Aprobado" : p.pago.estado === "pendiente" ? "Pendiente" : "Rechazado"}
                    {p.pago.metodo_pago_nombre ? ` · ${p.pago.metodo_pago_nombre}` : ""}
                  </Text>
                  {p.pago.numero_transaccion && (
                    <Text style={S.gris}>Transacción: {p.pago.numero_transaccion}</Text>
                  )}
                  {p.pago.codigo_punto_pago && (
                    <Text style={S.gris}>Código: {p.pago.codigo_punto_pago}</Text>
                  )}
                </View>
              )}

              {(p.fecha_entrega || p.nombre_tecnico_entrega) && (
                <View style={S.seccion}>
                  <Text style={S.subtitulo}>Entrega</Text>
                  {p.fecha_entrega && (
                    <Text style={S.gris}>
                      {String(p.fecha_entrega).slice(0, 10)}
                      {p.hora_entrega ? ` · ${p.hora_entrega.slice(0, 5)}` : ""}
                      {p.hora_entrega_fin ? `–${p.hora_entrega_fin.slice(0, 5)}` : ""}
                    </Text>
                  )}
                  {p.nombre_tecnico_entrega && (
                    <Text style={S.gris}>Técnico: {p.nombre_tecnico_entrega}</Text>
                  )}
                  {p.estado_entrega && (
                    <Text style={S.gris}>Estado: {p.estado_entrega}</Text>
                  )}
                </View>
              )}

              {/* Acciones */}
              <View style={{ gap: 8, marginTop: 10 }}>
                {p.estado === "Pago pendiente" && (
                  <Pressable
                    style={({ pressed }) => [S.botonOro, pressed && S.presionado]}
                    onPress={() => void confirmar(p.id_pedido)}
                  >
                    <Text style={S.textoOroNegro}>Confirmar pago</Text>
                  </Pressable>
                )}

                <Pressable
                  style={({ pressed }) => [S.botonOutline, pressed && S.presionado]}
                  onPress={() => {
                    // Rastrear pedido → pantalla dedicada.
                    
                    router.push({ pathname: "/(tabs)/seguimiento", params: { id: String(p.id_pedido) } });
                  }}
                >
                  <FontAwesome6 name="location-dot" size={13} color="#f0c96f" />
                  <Text style={S.textoOutline}>Rastrear mi pedido</Text>
                </Pressable>

                {p.factura?.pdf_url && (
                  <Pressable
                    style={({ pressed }) => [S.botonOutline, pressed && S.presionado]}
                    onPress={() => void descargar(p)}
                  >
                    <FontAwesome6 name="file-pdf" size={13} color="#f0c96f" />
                    <Text style={S.textoOutline}>Descargar factura PDF</Text>
                  </Pressable>
                )}
              </View>
            </View>
          )}
        </View>
      ))}

      {toast && (
        <View style={S.toastFijo}>
          <Text style={S.toastTexto}><LocalizedNotificationText message={toast} /></Text>
        </View>
      )}
    </AppScreen>
  );
}

const S = StyleSheet.create({
  gris: { color: "#bdbdbd", fontSize: 12.5 },
  error: { color: "#f0858a", fontSize: 13 },
  tarjeta: {
    backgroundColor: "#161616",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.09)",
    padding: 14,
  },
  cabecera: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  titulo: { color: "#ffffff", fontSize: 15.5, fontFamily: FontFamilies.bodyBold },
  estado: { fontSize: 12.5, fontFamily: FontFamilies.bodyMedium },
  total: { color: "#f0c96f", fontFamily: FontFamilies.bodyBold, fontSize: 14 },
  detalle: { borderTopWidth: 1, borderTopColor: "rgba(255,255,255,0.09)", marginTop: 12, paddingTop: 12, gap: 7 },
  fila: { flexDirection: "row", justifyContent: "space-between", gap: 10 },
  detalleTexto: { color: "#ffffff", fontSize: 13, flex: 1, lineHeight: 18 },
  detalleValor: { color: "#bdbdbd", fontSize: 12.5 },
  seccion: { marginTop: 6 },
  subtitulo: { color: "#f0c96f", fontSize: 12.5, fontFamily: FontFamilies.bodyBold, marginBottom: 3 },
  botonOro: { backgroundColor: "#caa24d", borderRadius: 12, minHeight: 44, alignItems: "center", justifyContent: "center" },
  textoOroNegro: { color: "#141414", fontFamily: FontFamilies.button, fontSize: 14 },
  botonOutline: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(212,165,75,0.45)",
    minHeight: 44,
  },
  textoOutline: { color: "#f0c96f", fontFamily: FontFamilies.button, fontSize: 13.5 },
  presionado: { opacity: 0.85 },
  toastFijo: {
    position: "absolute",
    bottom: 20,
    left: 20,
    right: 20,
    backgroundColor: "rgba(0,0,0,0.92)",
    borderColor: "#c9a227",
    borderWidth: 1,
    borderRadius: 30,
    paddingVertical: 10,
    alignItems: "center",
  },
  toastTexto: { color: "#f0c96f", fontSize: 13 },
});
