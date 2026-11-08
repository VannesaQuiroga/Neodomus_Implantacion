// Notificaciones — listado REAL del usuario autenticado
// (GET /notificaciones/mias; tipos visibles al cliente, igual que WEB:
// reembolso, entrega, producto, promoción).
// Al abrir la pantalla se marcan como leídas con el endpoint EXISTENTE
// del backend (PATCH /notificaciones/leer-todas): así nunca aparecen
// indicadores de "no leídas" falsos ni persistentes.
import React, { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useIdioma } from "@/contexts/IdiomaContext";
import LocalizedNotificationText from "@/components/common/LocalizedNotificationText";

import AppScreen from "@/components/app/AppScreen";
import { FontFamilies } from "@/constants/theme";
import { ApiError } from "@/services/api";
import {
  listarNotificaciones,
  marcarNotificacionesLeidas,
  type Notificacion,
} from "@/services/cliente.services";

const TIPOS_CLIENTE = ["reembolso", "entrega", "producto", "promocion", "respuesta_soporte"];

export default function NotificacionesScreen() {
  const { t } = useIdioma();
  const [lista, setLista] = useState<Notificacion[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let activo = true;
    listarNotificaciones()
      .then(async (todas) => {
        if (!activo) return;
        setLista(todas.filter((n) => TIPOS_CLIENTE.includes(n.tipo)));
        // Marcar todas como leídas (backend del usuario autenticado).
        // Mejor esfuerzo: si falla, el listado se muestra igual.
        await marcarNotificacionesLeidas().catch(() => {});
        if (!activo) return;
        setLista((prev) => prev.map((n) => ({ ...n, leida: true })));
      })
      .catch((e) =>
        setError(e instanceof ApiError ? e.message : "Error al cargar notificaciones."),
      )
      .finally(() => activo && setCargando(false));
    return () => {
      activo = false;
    };
  }, []);

  return (
    <AppScreen titulo={t("notificaciones.titulo")}>
      {cargando && <Text style={S.gris}>{t("common.cargando")}</Text>}
      {error && <Text style={S.error}><LocalizedNotificationText message={error} /></Text>}
      {!cargando && lista.length === 0 && (
        <Text style={S.gris}>{t("tecnico.sinNotificaciones")}</Text>
      )}

      {lista.map((n) => (
        <View
          key={n.id_notificacion}
          style={[S.tarjeta, !n.leida && S.noLeida]}
        >
          <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 8 }}>
            <Text style={S.titulo} numberOfLines={1}>
              <LocalizedNotificationText message={n.titulo} />
            </Text>
            {!!n.fecha_creacion && (
              <Text style={S.fecha}>{String(n.fecha_creacion).slice(0, 10)}</Text>
            )}
          </View>
          <Text style={S.mensaje}><LocalizedNotificationText message={n.mensaje} /></Text>
          <Text style={S.tipo}>#{t(`notif.tipo.${n.tipo}`)}</Text>
        </View>
      ))}
    </AppScreen>
  );
}

const S = StyleSheet.create({
  gris: { color: "#bdbdbd", fontSize: 13 },
  error: { color: "#f0858a", fontSize: 13 },
  tarjeta: {
    backgroundColor: "#161616",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.09)",
    padding: 14,
    gap: 5,
  },
  noLeida: {
    borderColor: "rgba(212,165,75,0.45)",
    backgroundColor: "rgba(212,165,75,0.06)",
  },
  titulo: { color: "#ffffff", fontSize: 14.5, fontFamily: FontFamilies.bodyBold, flex: 1 },
  mensaje: { color: "#bdbdbd", fontSize: 13, lineHeight: 19 },
  fecha: { color: "#6f6f6f", fontSize: 11 },
  tipo: { color: "#f0c96f", fontSize: 11 },
});
