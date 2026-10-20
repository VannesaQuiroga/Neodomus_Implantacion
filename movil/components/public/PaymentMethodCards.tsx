// Presenta los métodos de pago disponibles para seleccionarlos.
import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import FontAwesome6 from "@expo/vector-icons/FontAwesome6";
import { FontFamilies } from "@/constants/theme";

export interface MetodoOpcion {
  codigo: string;
  nombre: string;
  icono: string;
  subtitulo?: string;
}

const ICONOS: Record<string, string> = {
  tarjeta_debito: "credit-card",
  tarjeta_credito: "credit-card",
  pse: "building-columns",
  paypal: "paypal",
  punto_pago: "store",
};

export function nombreMetodo(codigo: string): string {
  const mapa: Record<string, string> = {
    tarjeta_debito: "Tarjeta débito",
    tarjeta_credito: "Tarjeta crédito",
    pse: "PSE",
    paypal: "PayPal",
    punto_pago: "Punto de pago",
  };
  return mapa[codigo] || codigo.replace("_", " ");
}

export default function PaymentMethodCards({
  metodos,
  seleccionado,
  onSelect,
}: {
  metodos: string[];
  seleccionado: string;
  onSelect: (codigo: string) => void;
}) {
  return (
    <View style={styles.grid}>
      {metodos.map((codigo) => {
        const activo = seleccionado === codigo;
        const nombre = nombreMetodo(codigo);
        const icono = ICONOS[codigo] || "credit-card";
        return (
          <Pressable
            key={codigo}
            onPress={() => onSelect(codigo)}
            style={[styles.card, activo && styles.cardActiva]}
          >
            <View style={[styles.iconoWrap, activo && styles.iconoWrapActivo]}>
              <FontAwesome6 name={icono as any} size={18} color={activo ? "#141414" : "#f0c96f"} />
            </View>
            <Text style={[styles.nombre, activo && styles.nombreActivo]} numberOfLines={2}>
              {nombre}
            </Text>
            {codigo === "pse" && <Text style={styles.sub}>PSE / Banco</Text>}
            {codigo === "tarjeta_credito" && <Text style={styles.sub}>Cuotas</Text>}
            {activo && (
              <View style={styles.check}>
                <FontAwesome6 name="circle-check" size={12} color="#141414" />
              </View>
            )}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  card: {
    flexBasis: "47%",
    flexGrow: 1,
    backgroundColor: "#161616",
    borderWidth: 1.5,
    borderColor: "rgba(255,255,255,0.09)",
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 10,
    alignItems: "center",
    gap: 8,
    minHeight: 96,
    position: "relative",
  },
  cardActiva: {
    backgroundColor: "rgba(212,165,75,0.14)",
    borderColor: "#caa24d",
  },
  iconoWrap: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: "rgba(212,165,75,0.12)",
    borderWidth: 1,
    borderColor: "rgba(212,165,75,0.22)",
    alignItems: "center",
    justifyContent: "center",
  },
  iconoWrapActivo: { backgroundColor: "#caa24d", borderColor: "#caa24d" },
  nombre: { color: "#ffffff", fontSize: 12, fontFamily: FontFamilies.bodyBold, textAlign: "center", lineHeight: 16 },
  nombreActivo: { color: "#f0c96f" },
  sub: { color: "#bdbdbd", fontSize: 10.5, textAlign: "center" },
  check: {
    position: "absolute",
    top: 8,
    right: 8,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: "#caa24d",
    alignItems: "center",
    justifyContent: "center",
  },
});
