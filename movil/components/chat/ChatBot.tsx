// ─────────────────────────────────────────────────────────────
// Asistente virtual Neodomus — adaptación móvil del ChatBotWidget de la WEB.
// Misma lógica (botData.ts, delay 450ms, typing) y mismos textos.
// En móvil vive como sección del tab Ayuda, con teclado y scroll correctos.
// ─────────────────────────────────────────────────────────────

import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import type { ScrollViewInstance, TextInputInstance } from "react-native";
import FontAwesome6 from "@expo/vector-icons/FontAwesome6";

import { NeodomusColors as C, FontFamilies } from "@/constants/theme";
import {
  BOT_INICIAL,
  BOT_SUGERENCIAS,
  responderBot,
} from "@/data/botData";

interface MensajeChat {
  de: "bot" | "usuario";
  texto: string;
}

interface ChatBotProps {
  /** Si se pasa, muestra una X en la cabecera (ventana compacta flotante). */
  onCerrar?: () => void;
  /** Altura del cuerpo del chat. Por defecto 460 (tab Ayuda). */
  altura?: number;
}

export default function ChatBot({ onCerrar, altura = 460 }: ChatBotProps) {
  const [mensajes, setMensajes] = useState<MensajeChat[]>([
    { de: "bot", texto: BOT_INICIAL },
  ]);
  const [entrada, setEntrada] = useState("");
  const [escribiendo, setEscribiendo] = useState(false);
  const scrollRef = useRef<ScrollViewInstance>(null);

  // Mantener el último mensaje visible.
  useEffect(() => {
    scrollRef.current?.scrollToEnd({ animated: true });
  }, [mensajes, escribiendo]);

  const enviar = (textoCrudo: string) => {
    const mensaje = textoCrudo.trim();
    if (!mensaje || escribiendo) return;

    setMensajes((prev) => [...prev, { de: "usuario", texto: mensaje }]);
    setEntrada("");
    setEscribiendo(true);

    // Misma demora que la web: 450 ms.
    setTimeout(() => {
      setMensajes((prev) => [...prev, { de: "bot", texto: responderBot(mensaje) }]);
      setEscribiendo(false);
    }, 450);
  };

  const mostrarSugerencias = mensajes.length <= 1;

  return (
    <KeyboardAvoidingView
      style={[styles.container, { height: altura }]}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={Platform.OS === "ios" ? 90 : 0}
    >
      <View style={styles.header}>
        <View style={styles.avatar}>
          <FontAwesome6 name="robot" size={18} color={C.textoSobreOro} />
        </View>
        <View style={styles.headerTextos}>
          <Text style={styles.titulo}>Asistente Neodomus</Text>
          <View style={styles.estadoFila}>
            <View style={styles.puntoOnline} />
            <Text style={styles.estadoTexto}>En línea</Text>
          </View>
        </View>
        {onCerrar && (
          <Pressable
            onPress={onCerrar}
            style={({ pressed }) => [
              styles.botonCerrar,
              pressed && styles.presionado,
            ]}
            accessibilityLabel="Cerrar chat"
            hitSlop={8}
          >
            <FontAwesome6 name="xmark" size={14} color={C.blanco} />
          </Pressable>
        )}
      </View>

      <ScrollView
        ref={scrollRef}
        style={styles.mensajes}
        contentContainerStyle={styles.mensajesContenido}
        keyboardShouldPersistTaps="handled"
      >
        {mensajes.map((mensaje, indice) => (
          <View
            key={indice}
            style={[
              styles.burbuja,
              mensaje.de === "usuario" ?styles.burbujaUsuario : styles.burbujaBot,
            ]}
          >
            <Text
              style={
                mensaje.de === "usuario"
                  ? styles.burbujaUsuarioTexto
                  : styles.burbujaBotTexto
              }
            >
              {mensaje.texto}
            </Text>
          </View>
        ))}

        {escribiendo && (
          <View style={[styles.burbuja, styles.burbujaBot]}>
            <ActivityIndicator size="small" color={C.oro} />
          </View>
        )}

        {mostrarSugerencias && (
          <View style={styles.sugerencias}>
            {BOT_SUGERENCIAS.map((sugerencia) => (
              <Pressable
                key={sugerencia}
                style={({ pressed }) => [
                  styles.chip,
                  pressed && styles.chipPresionado,
                ]}
                onPress={() => enviar(sugerencia)}
              >
                <Text style={styles.chipTexto}>{sugerencia}</Text>
              </Pressable>
            ))}
          </View>
        )}
      </ScrollView>

      <View style={styles.inputFila}>
        <TextInput
          style={styles.input}
          placeholder="Escribe tu pregunta..."
          placeholderTextColor="#9e9e9e"
          value={entrada}
          onChangeText={setEntrada}
          onSubmitEditing={() => enviar(entrada)}
          editable={!escribiendo}
          multiline={false}
        />
        <Pressable
          style={({ pressed }) => [
            styles.enviar,
            (!entrada.trim() || escribiendo) && styles.enviarDeshabilitado,
            pressed && styles.enviarPresionado,
          ]}
          onPress={() => enviar(entrada)}
          disabled={!entrada.trim() || escribiendo}
          accessibilityLabel="Enviar mensaje"
        >
          <FontAwesome6 name="message" size={16} color={C.textoSobreOro} />
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: C.cardOscura,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: C.bordeOro,
    overflow: "hidden",
  },

  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: C.grisBorde,
    backgroundColor: C.negro,
  },

  avatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: C.oroClaro,
    alignItems: "center",
    justifyContent: "center",
  },

  headerTextos: { flex: 1 },

  botonCerrar: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.18)",
  },

  presionado: { opacity: 0.7 },

  titulo: {
    color: C.blanco,
    fontFamily: FontFamilies.bodyBold,
    fontSize: 15,
  },

  estadoFila: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 2,
  },

  puntoOnline: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: C.verdeOnline,
  },

  estadoTexto: {
    color: C.verdeOnline,
    fontSize: 12,
    fontFamily: FontFamilies.bodyMedium,
  },

  mensajes: { flex: 1 },

  mensajesContenido: {
    padding: 14,
    gap: 10,
  },

  burbuja: {
    maxWidth: "85%",
    borderRadius: 14,
    paddingVertical: 9,
    paddingHorizontal: 13,
  },

  burbujaBot: {
    alignSelf: "flex-start",
    backgroundColor: "#262626",
    borderWidth: 1,
    borderColor: C.grisBorde,
  },

  burbujaUsuario: {
    alignSelf: "flex-end",
    backgroundColor: C.oro,
  },

  burbujaBotTexto: {
    color: C.blanco,
    fontSize: 14,
    lineHeight: 20,
    fontFamily: FontFamilies.body,
  },

  burbujaUsuarioTexto: {
    color: C.textoSobreOro,
    fontSize: 14,
    lineHeight: 20,
    fontFamily: FontFamilies.bodyMedium,
  },

  sugerencias: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 4,
  },

  chip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: C.oroClaro,
    backgroundColor: "rgba(212,165,75,0.12)",
    paddingVertical: 7,
    paddingHorizontal: 12,
  },

  chipPresionado: { opacity: 0.7 },

  chipTexto: {
    color: C.oroSuave,
    fontSize: 12.5,
    fontFamily: FontFamilies.bodyMedium,
  },

  inputFila: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 12,
    borderTopWidth: 1,
    borderTopColor: C.grisBorde,
    backgroundColor: C.negro,
  },

  input: {
    flex: 1,
    minHeight: 44,
    backgroundColor: C.cardOscuraAlt,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C.grisBorde,
    color: C.blanco,
    paddingHorizontal: 14,
    fontSize: 14.5,
    fontFamily: FontFamilies.body,
  },

  enviar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: C.oro,
    alignItems: "center",
    justifyContent: "center",
  },

  enviarDeshabilitado: { opacity: 0.45 },

  enviarPresionado: { opacity: 0.8 },
});
