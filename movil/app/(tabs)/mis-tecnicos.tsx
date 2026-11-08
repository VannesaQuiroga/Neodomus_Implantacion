// Mis técnicos — técnicos favoritos locales (AsyncStorage) igual que WEB
// Se enriquecen con el historial de citas FINALIZADAS (nº de servicios,
// teléfono) y con datos de /tecnicos/publicos para foto/calificación.
// Quitar el ♥ en Técnicos los elimina inmediatamente por contexto.
import React, { useEffect, useMemo, useState } from "react";
import { Alert, Linking, Pressable, StyleSheet, Text, View } from "react-native";
import FontAwesome6 from "@expo/vector-icons/FontAwesome6";

import AppScreen from "@/components/app/AppScreen";
import { FontFamilies } from "@/constants/theme";
import { ApiError } from "@/services/api";
import {
  listarMisCitas,
  listarTecnicosPublicos,
  type Cita,
  type TecnicoPublico,
} from "@/services/cliente.services";
import { useTecnicosFavoritos } from "@/contexts/TecnicosFavoritosContext";
import { useIdioma } from "@/contexts/IdiomaContext";

interface TecnicoLista {
  id_tecnico: number;
  nombre: string;
  telefono?: string | null;
  servicios: number;
  especialidad?: string | null;
}

/**
 * Normaliza el teléfono del técnico para WhatsApp:
 * - Solo dígitos (elimina espacios, guiones, paréntesis, "+").
 * - Si tiene 10 dígitos (móvil colombiano sin indicativo) antepone 57.
 * - Si ya trae indicativo 57 lo respeta.
 */
const numeroWhatsApp = (telefono?: string | null): string | null => {
  const digitos = (telefono ?? "").replace(/\D/g, "");
  if (!digitos) return null;
  if (digitos.length === 10) return `57${digitos}`;
  return digitos;
};

export default function MisTecnicosScreen() {
  const { t } = useIdioma();
  const { favoritosTecnicos } = useTecnicosFavoritos();
  const [tecnicosPublicos, setTecnicosPublicos] = useState<TecnicoPublico[]>([]);
  const [citas, setCitas] = useState<Cita[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let activo = true;
    Promise.all([listarTecnicosPublicos(), listarMisCitas()])
      .then(([todos, citasUsuario]) => {
        if (!activo) return;
        setTecnicosPublicos(todos);
        setCitas(citasUsuario);
      })
      .catch((e) =>
        activo &&
        setError(
          e instanceof ApiError ? e.message : "Error al cargar técnicos.",
        ),
      )
      .finally(() => activo && setCargando(false));
    return () => {
      activo = false;
    };
  }, []);

  const favoritos = useMemo(
    () => tecnicosPublicos.filter((t) => favoritosTecnicos.has(t.id_tecnico)),
    [tecnicosPublicos, favoritosTecnicos],
  );

  // Historial por técnico (solo citas finalizadas) para enriquecer la lista.
  const historial = useMemo(() => {
    const mapa = new Map<
      number,
      { servicios: number; telefono?: string | null; tipo_servicio?: string | null }
    >();
    for (const cita of citas) {
      if (cita.estado !== "Finalizada" || !cita.id_tecnico) continue;
      const actual = mapa.get(cita.id_tecnico);
      if (actual) {
        actual.servicios += 1;
      } else {
        mapa.set(cita.id_tecnico, {
          servicios: 1,
          telefono: cita.tecnico_telefono ?? null,
          tipo_servicio: cita.tipo_servicio ?? null,
        });
      }
    }
    return mapa;
  }, [citas]);

  const tecnicos: TecnicoLista[] = useMemo(
    () =>
      favoritos.map((f) => {
        const h = historial.get(f.id_tecnico);
        return {
          id_tecnico: f.id_tecnico,
          nombre:
            `${f.first_name} ${f.last_name}`.trim() || `Técnico #${f.id_tecnico}`,
          telefono: f.telefono ?? h?.telefono ?? null,
          servicios: h?.servicios ?? 0,
          especialidad: f.certificacion_t ?? h?.tipo_servicio ?? null,
        };
      }),
    [favoritos, historial],
  );

  const abrirWhatsApp = (tecnico: TecnicoLista) => {
    const numero = numeroWhatsApp(tecnico.telefono);
    if (!numero) {
      Alert.alert(
        t("notify.whatsappNoDisponible"),
        t("notify.tecnicoSinWhatsApp"),
      );
      return;
    }
    // wa.me funciona tanto con la app instalada como vía navegador.
    Linking.openURL(`https://wa.me/${numero}`).catch(() =>
      Alert.alert(
        t("notify.whatsappNoAbrir"),
        t("notify.verificaWhatsApp", { number: numero }),
      ),
    );
  };

  const llamar = (telefono: string) => {
    const digitos = telefono.replace(/\D/g, "");
    Linking.openURL(`tel:+57${digitos}`).catch(() =>
      Alert.alert(t("notify.llamadaError"), t("notify.numeroTelefono", { number: telefono })),
    );
  };

  return (
    <AppScreen titulo="Mis técnicos">
      {cargando && <Text style={S.gris}>Cargando...</Text>}
      {error && <Text style={S.error}>{error}</Text>}
      {!cargando && !error && tecnicos.length === 0 && (
        <Text style={S.gris}>
          Aún no tienes técnicos favoritos. Marca con ♥ a tus técnicos en la
          sección Técnicos y aparecerán aquí.
        </Text>
      )}

      {tecnicos.map((tecnico) => (
        <View key={tecnico.id_tecnico} style={S.tarjeta}>
          <View style={{ flex: 1, gap: 3 }}>
            <Text style={S.nombre}>{tecnico.nombre}</Text>
            {!!tecnico.especialidad && (
              <Text style={S.especialidad}>{tecnico.especialidad}</Text>
            )}
            <Text style={S.gris}>
              {tecnico.servicios > 0
                ? `${tecnico.servicios} servicio(s)`
                : "Sin servicios finalizados aún"}
            </Text>
            {tecnico.telefono && <Text style={S.gris}>Tel: {tecnico.telefono}</Text>}
          </View>

          <View style={{ gap: 7 }}>
            {tecnico.telefono && (
              <Pressable
                style={({ pressed }) => [S.boton, pressed && S.presionado]}
                onPress={() => llamar(tecnico.telefono!)}
              >
                <FontAwesome6 name="phone" size={12} color="#141414" />
                <Text style={S.textoBoton}>Llamar</Text>
              </Pressable>
            )}
            {tecnico.telefono && (
              <Pressable
                style={({ pressed }) => [
                  S.botonWhatsapp,
                  pressed && S.presionado,
                ]}
                onPress={() => abrirWhatsApp(tecnico)}
              >
                <FontAwesome6 name="whatsapp" size={12} color="#f0c96f" />
                <Text style={[S.textoBotonOutline]}>WhatsApp</Text>
              </Pressable>
            )}
          </View>
        </View>
      ))}
    </AppScreen>
  );
}

const S = StyleSheet.create({
  gris: { color: "#bdbdbd", fontSize: 12.5 },
  error: { color: "#f0858a", fontSize: 13 },
  tarjeta: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "#161616",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.09)",
    padding: 14,
    gap: 12,
  },
  nombre: { color: "#ffffff", fontSize: 14.5, fontFamily: FontFamilies.bodyBold },
  especialidad: { color: "#f0c96f", fontSize: 12.5 },
  boton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    backgroundColor: "#caa24d",
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  // WhatsApp integrado al estilo Neodomus (outline dorado, sin azul).
  botonWhatsapp: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "rgba(212,165,75,0.5)",
    backgroundColor: "rgba(212,165,75,0.06)",
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  presionado: { opacity: 0.85 },
  textoBoton: { color: "#141414", fontFamily: FontFamilies.button, fontSize: 12.5 },
  textoBotonOutline: { color: "#f0c96f", fontFamily: FontFamilies.button, fontSize: 12.5 },
});
