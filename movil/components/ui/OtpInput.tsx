// ─────────────────────────────────────────────────────────────
// Input de código de 6 dígitos — adaptación móvil de los boxes
// de VerifyEmail/VerifyCode de la WEB.
//
// - Solo dígitos, auto-avance y backspace inteligente.
// - Pegado del código completo en la primera caja (como la web).
// - Las cajas se reparten el ancho disponible con flex:1 → nunca
//   se desbordan en pantallas pequeñas.
// ─────────────────────────────────────────────────────────────

import React, { useRef, useState } from "react";
import { Platform, TextInput, StyleSheet, View } from "react-native";
import type { ScrollViewInstance, TextInputInstance } from "react-native";

interface OtpInputProps {
  valor: string;
  onChange: (codigoCompleto: string) => void;
  longitud?: number;
  deshabilitado?: boolean;
  error?: boolean;
}

export default function OtpInput({
  valor,
  onChange,
  longitud = 6,
  deshabilitado = false,
  error = false,
}: OtpInputProps) {
  const refs = useRef<(TextInputInstance | null)[]>([]);
  const [focoIndice, setFocoIndice] = useState(0);

  const manejarCambio = (indice: number, textoCrudo: string) => {
    // Pegado: solo se acepta en la primera caja (igual que la web).
    if (indice === 0 && textoCrudo.replace(/\D/g, "").length > 1) {
      const completo = textoCrudo
        .replace(/\D/g, "")
        .substring(0, longitud);
      onChange(completo);
      if (completo.length === longitud) {
        refs.current[longitud - 1]?.focus();
      }
      return;
    }

    const digitos = Array.from({ length: longitud }, (_, i) => valor[i] ?? "");
    const limpio = textoCrudo.replace(/\D/g, "");
    if (!limpio) {
      digitos[indice] = "";
    } else {
      // Igual que la web: al escribir varios caracteres se toma el ÚLTIMO dígito.
      digitos[indice] = limpio[limpio.length - 1];
    }
    onChange(digitos.join(""));

    if (digitos[indice] && indice < longitud - 1) {
      refs.current[indice + 1]?.focus();
    }
  };

  const manejarTecla = (indice: number, key: string) => {
    if (key !== "Backspace") return;
    const digitos = Array.from({ length: longitud }, (_, i) => valor[i] ?? "");
    if (!digitos[indice] && indice > 0) {
      digitos[indice - 1] = "";
      onChange(digitos.join(""));
      refs.current[indice - 1]?.focus();
    }
  };

  return (
    <View style={styles.fila}>
      {Array.from({ length: longitud }, (_, i) => (
        <TextInput
          key={i}
          ref={(ref) => {
            refs.current[i] = ref;
          }}
          style={[
            styles.caja,
            valor[i] ? styles.cajaLlena : null,
            i === focoIndice && !error ? styles.cajaFoco : null,
            error ? styles.cajaError : null,
          ]}
          value={valor[i] ?? ""}
          onChangeText={(texto) => manejarCambio(i, texto)}
          onKeyPress={({ nativeEvent }) => manejarTecla(i, nativeEvent.key)}
          onFocus={() => setFocoIndice(i)}
          maxLength={2}
          placeholder="-"
          placeholderTextColor="#6b6b6b"
          keyboardType={Platform.OS === "ios" ? "number-pad" : "numeric"}
          textContentType="oneTimeCode"
          editable={!deshabilitado}
          selectTextOnFocus
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  fila: {
    flexDirection: "row",
    width: "100%",
    justifyContent: "center",
  },

  caja: {
    flex: 1,
    aspectRatio: 0.78,
    maxWidth: 56,
    minWidth: 38,
    marginHorizontal: 4,
    textAlign: "center",
    fontSize: 22,
    fontFamily: "Inter_700Bold",
    color: "#ffffff",
    backgroundColor: "#0f0f0f",
    borderWidth: 1.5,
    borderColor: "rgba(255,255,255,0.09)",
    borderRadius: 12,
    paddingVertical: 0,
  },

  cajaLlena: {
    borderColor: "#d4a54b",
  },

  cajaFoco: {
    borderColor: "#d4a54b",
    shadowColor: "#d4a54b",
    shadowOpacity: 0.35,
    shadowRadius: 6,
    elevation: 3,
  },

  cajaError: {
    borderColor: "#f0858a",
  },
});
