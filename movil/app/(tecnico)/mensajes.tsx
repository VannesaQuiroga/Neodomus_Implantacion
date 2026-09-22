import React, { useEffect, useState, useRef } from "react";
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import FontAwesome6 from "@expo/vector-icons/FontAwesome6";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { NeodomusColors as C, FontFamilies } from "@/constants/theme";
import { apiFetch } from "@/services/api";
import { useAuth } from "@/contexts/AuthContext";
import { useScrollTopAlEntrar } from "@/hooks/useScrollTopAlEntrar";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const MENSAJES_KEY = "tecMensajes";

interface Mensaje {
  de: "cliente" | "tecnico";
  texto: string;
  hora: string;
}

interface Conversacion {
  id: number;
  cliente: string;
  email: string;
  mensajes: Mensaje[];
  leido: boolean;
}

interface Cliente {
  id_cliente: number;
  nombre: string;
  email?: string | null;
}

async function cargarConversaciones(): Promise<Conversacion[]> {
  try {
    const raw = await AsyncStorage.getItem(MENSAJES_KEY);
    if (raw) return JSON.parse(raw) as Conversacion[];
  } catch {}
  return [];
}

async function guardarConversaciones(c: Conversacion[]) {
  try {
    await AsyncStorage.setItem(MENSAJES_KEY, JSON.stringify(c));
  } catch {}
}

async function sembrarConversaciones(
  clientes: Cliente[],
  tecnicoNombre: string,
): Promise<Conversacion[]> {
  const previas = await cargarConversaciones();
  if (previas.length > 0) return previas;

  const ahora = new Date().toLocaleTimeString("es-ES", {
    hour: "2-digit",
    minute: "2-digit",
  });

  const nuevas: Conversacion[] = clientes.slice(0, 5).map((cliente, i) => ({
    id: cliente.id_cliente,
    cliente: cliente.nombre,
    email: cliente.email || "",
    leido: i !== 0,
    mensajes: [
      {
        de: "cliente",
        texto: `Hola, soy ${cliente.nombre}. Quería confirmar los detalles de mi cita agendada con Neodomus.`,
        hora: ahora,
      },
      {
        de: "tecnico",
        texto: `Hola ${cliente.nombre}, soy ${tecnicoNombre}. Claro, ya tengo tu cita registrada y estaré atento. ¡Saludos!`,
        hora: ahora,
      },
    ],
  }));

  await guardarConversaciones(nuevas);
  return nuevas;
}

function iniciales(nombre: string): string {
  return nombre
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0].toUpperCase())
    .join("");
}

export default function TecnicoMensajesScreen() {
  const scrollRef = useRef<FlatList>(null);
  const insets = useSafeAreaInsets();
  const { usuario } = useAuth();
  const [conversaciones, setConversaciones] = useState<Conversacion[]>([]);
  const [activaId, setActivaId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [textoEnviar, setTextoEnviar] = useState("");

  useEffect(() => {
    const cargar = async () => {
      try {
        const clientes = await apiFetch<Cliente[]>("/tecnicos/mis-clientes");
        const nombre = usuario?.nombre || "Técnico";
        const sembradas = await sembrarConversaciones(
          Array.isArray(clientes) ? clientes : [],
          nombre,
        );
        setConversaciones(sembradas);
        if (sembradas.length > 0) setActivaId(sembradas[0].id);
      } catch {
      } finally {
        setLoading(false);
      }
    };
    cargar();
  }, []);

  const activa = conversaciones.find((c) => c.id === activaId) || null;
  const noLeidas = conversaciones.filter((c) => !c.leido).length;

  const abrirConversacion = (id: number) => {
    setActivaId(id);
    setConversaciones((prev) => {
      const siguiente = prev.map((c) =>
        c.id === id ? { ...c, leido: true } : c,
      );
      guardarConversaciones(siguiente);
      return siguiente;
    });
  };

  const enviarMensaje = () => {
    if (!textoEnviar.trim() || !activa) return;
    const ahora = new Date().toLocaleTimeString("es-ES", {
      hour: "2-digit",
      minute: "2-digit",
    });
    const nuevo: Mensaje = { de: "tecnico", texto: textoEnviar.trim(), hora: ahora };
    setConversaciones((prev) => {
      const siguiente = prev.map((c) =>
        c.id === activa.id
          ? { ...c, mensajes: [...c.mensajes, nuevo] }
          : c,
      );
      guardarConversaciones(siguiente);
      return siguiente;
    });
    setTextoEnviar("");
  };

  if (loading) {
    return (
      <View style={styles.centro}>
        <ActivityIndicator color={C.oro} size="large" />
        <Text style={styles.gris}>Cargando mensajes...</Text>
      </View>
    );
  }

  if (conversaciones.length === 0) {
    return (
      <View style={styles.centro}>
        <FontAwesome6 name="envelope" size={40} color={C.oroClaro} />
        <Text style={styles.tituloVacio}>Sin mensajes</Text>
        <Text style={styles.gris}>
          Tus conversaciones con clientes aparecerán aquí.
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.pantalla}>
      {activa ? (
        <KeyboardAvoidingView
          style={styles.chatContainer}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          keyboardVerticalOffset={90}
        >
          {/* Header de la conversación */}
          <View style={styles.chatHeader}>
            <Pressable
              onPress={() => setActivaId(null)}
              hitSlop={8}
              style={styles.backBtn}
            >
              <FontAwesome6 name="arrow-left" size={14} color={C.oroSuave} />
            </Pressable>
            <View style={styles.avatarSm}>
              <Text style={styles.avatarTextoSm}>{iniciales(activa.cliente)}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.chatHeaderNombre} numberOfLines={1}>
                {activa.cliente}
              </Text>
              <Text style={styles.chatHeaderEmail} numberOfLines={1}>
                {activa.email || "—"}
              </Text>
            </View>
          </View>

          {/* Mensajes */}
          <FlatList
            ref={scrollRef}
            data={activa.mensajes}
            keyExtractor={(_, i) => String(i)}
            contentContainerStyle={[
              styles.mensajesLista,
              { paddingBottom: insets.bottom + 10 },
            ]}
            onContentSizeChange={() =>
              scrollRef.current?.scrollToEnd({ animated: true })
            }
            renderItem={({ item: m }) => (
              <View
                style={[
                  styles.burbuja,
                  m.de === "tecnico"
                    ? styles.burbujaTecnico
                    : styles.burbujaCliente,
                ]}
              >
                <Text style={styles.mensajeTexto}>{m.texto}</Text>
                <Text style={styles.mensajeHora}>
                  {m.de === "tecnico" ? "Tú" : activa.cliente.split(" ")[0]} ·{" "}
                  {m.hora}
                </Text>
              </View>
            )}
          />

          {/* Input */}
          <View style={[styles.inputBar, { paddingBottom: insets.bottom + 8 }]}>
            <TextInput
              style={styles.input}
              value={textoEnviar}
              onChangeText={setTextoEnviar}
              placeholder="Escribe un mensaje..."
              placeholderTextColor="#6b6b6b"
              multiline
              maxLength={500}
            />
            <Pressable
              onPress={enviarMensaje}
              disabled={!textoEnviar.trim()}
              style={[
                styles.enviarBtn,
                !textoEnviar.trim() && styles.enviarBtnDesh,
              ]}
            >
              <FontAwesome6 name="paper-plane" size={14} color={C.textoSobreOro} />
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      ) : (
        /* Lista de conversaciones */
        <View style={styles.listaContainer}>
          <Text style={styles.titulo}>Mensajes</Text>
          {noLeidas > 0 && (
            <Text style={styles.badge}>
              {noLeidas} nuevo{noLeidas > 1 ? "s" : ""}
            </Text>
          )}

          <FlatList
            data={conversaciones}
            keyExtractor={(c) => String(c.id)}
            contentContainerStyle={{
              paddingBottom: insets.bottom + 72,
              paddingTop: 8,
            }}
            renderItem={({ item: c }) => (
              <Pressable
                onPress={() => abrirConversacion(c.id)}
                style={[
                  styles.convItem,
                  activaId === c.id && styles.convItemActivo,
                ]}
              >
                <View style={styles.avatar}>
                  <Text style={styles.avatarTexto}>{iniciales(c.cliente)}</Text>
                </View>
                <View style={styles.convInfo}>
                  <Text style={styles.convNombre} numberOfLines={1}>
                    {c.cliente}
                  </Text>
                  <Text style={styles.convPreview} numberOfLines={1}>
                    {c.mensajes[c.mensajes.length - 1]?.texto}
                  </Text>
                </View>
                {!c.leido && <View style={styles.dotNoLeido} />}
              </Pressable>
            )}
          />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  pantalla: { flex: 1, backgroundColor: "#000000" },
  centro: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#000000",
    gap: 12,
    paddingHorizontal: 30,
  },
  tituloVacio: {
    color: C.blanco,
    fontSize: 18,
    fontFamily: FontFamilies.bodyBold,
  },
  gris: { color: C.grisTexto, fontSize: 13, textAlign: "center" },

  titulo: {
    color: C.blanco,
    fontSize: 20,
    fontFamily: FontFamilies.bodyBold,
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  badge: {
    color: C.oroSuave,
    fontSize: 12,
    fontFamily: FontFamilies.bodyBold,
    paddingHorizontal: 16,
    marginTop: 2,
  },

  listaContainer: { flex: 1 },

  convItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginHorizontal: 12,
    marginVertical: 3,
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
    backgroundColor: "rgba(255,255,255,0.02)",
  },
  convItemActivo: {
    backgroundColor: "rgba(212,165,75,0.10)",
    borderColor: "rgba(212,165,75,0.2)",
  },
  avatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: "rgba(212,165,75,0.18)",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarTexto: {
    color: C.oroSuave,
    fontSize: 14,
    fontFamily: FontFamilies.bodyBold,
  },
  convInfo: { flex: 1, minWidth: 0 },
  convNombre: {
    color: C.blanco,
    fontSize: 14,
    fontFamily: FontFamilies.bodyBold,
  },
  convPreview: {
    color: C.grisTexto,
    fontSize: 12,
    marginTop: 2,
  },
  dotNoLeido: {
    width: 9,
    height: 9,
    borderRadius: 4.5,
    backgroundColor: C.oroClaro,
  },

  chatContainer: { flex: 1 },
  chatHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.08)",
  },
  backBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarSm: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(212,165,75,0.18)",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarTextoSm: {
    color: C.oroSuave,
    fontSize: 12,
    fontFamily: FontFamilies.bodyBold,
  },
  chatHeaderNombre: {
    color: C.blanco,
    fontSize: 14,
    fontFamily: FontFamilies.bodyBold,
  },
  chatHeaderEmail: { color: C.grisTexto, fontSize: 11 },

  mensajesLista: { padding: 14, gap: 10 },

  burbuja: {
    maxWidth: "78%",
    padding: 12,
    borderRadius: 14,
  },
  burbujaTecnico: {
    alignSelf: "flex-end",
    backgroundColor: "rgba(212,165,75,0.16)",
    borderWidth: 1,
    borderColor: "rgba(212,165,75,0.35)",
  },
  burbujaCliente: {
    alignSelf: "flex-start",
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  mensajeTexto: { color: C.blanco, fontSize: 13, lineHeight: 18 },
  mensajeHora: { color: C.grisTexto, fontSize: 10, marginTop: 4 },

  inputBar: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 8,
    padding: 10,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.08)",
  },
  input: {
    flex: 1,
    color: C.blanco,
    fontSize: 13,
    fontFamily: FontFamilies.body,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    paddingHorizontal: 14,
    paddingVertical: 10,
    maxHeight: 100,
  },
  enviarBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: C.oro,
    alignItems: "center",
    justifyContent: "center",
  },
  enviarBtnDesh: { opacity: 0.4 },
});
