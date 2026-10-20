// Selector desplegable reutilizable de la interfaz móvil.
import React, { useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import FontAwesome6 from "@expo/vector-icons/FontAwesome6";
import { FontFamilies } from "@/constants/theme";

interface Option {
  label: string;
  value: string;
}

interface DropdownProps {
  value: string | null;
  placeholder: string;
  options: Option[];
  onChange: (value: string) => void;
  label?: string;
}

export default function Dropdown({ value, placeholder, options, onChange, label }: DropdownProps) {
  const [abierto, setAbierto] = useState(false);
  const seleccionado = options.find((o) => o.value === value);

  return (
    <View style={styles.wrap}>
      {!!label && <Text style={styles.label}>{label}</Text>}
      <Pressable
        style={({ pressed }) => [styles.selector, pressed && styles.presionado]}
        onPress={() => setAbierto(true)}
      >
        <Text style={[styles.texto, !seleccionado && styles.placeholder]}>
          {seleccionado ? seleccionado.label : placeholder}
        </Text>
        <FontAwesome6 name={abierto ? "chevron-up" : "chevron-down"} size={11} color="#f0c96f" />
      </Pressable>

      <Modal transparent visible={abierto} animationType="fade" onRequestClose={() => setAbierto(false)}>
        <Pressable style={styles.overlay} onPress={() => setAbierto(false)}>
          <View style={styles.modalCard}>
            <ScrollView style={{ maxHeight: 320 }} showsVerticalScrollIndicator={false}>
              {options.map((opt) => (
                <Pressable
                  key={opt.value}
                  onPress={() => {
                    onChange(opt.value);
                    setAbierto(false);
                  }}
                  style={[styles.opcion, value === opt.value && styles.opcionActiva]}
                >
                  <Text style={[styles.opcionTexto, value === opt.value && styles.opcionTextoActiva]}>
                    {opt.label}
                  </Text>
                  {value === opt.value && <FontAwesome6 name="check" size={11} color="#caa24d" />}
                </Pressable>
              ))}
            </ScrollView>
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 6, width: "100%" },
  label: { color: "#f0c96f", fontSize: 12, fontFamily: FontFamilies.bodyMedium },
  selector: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#0f0f0f",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.09)",
    borderRadius: 12,
    paddingHorizontal: 13,
    paddingVertical: 13,
    minHeight: 46,
    gap: 8,
  },
  texto: { color: "#ffffff", fontSize: 13.5, fontFamily: FontFamilies.bodyMedium, flex: 1 },
  placeholder: { color: "#8a8a8a" },
  presionado: { opacity: 0.85 },
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
    justifyContent: "center",
    paddingHorizontal: 20,
  },
  modalCard: {
    backgroundColor: "#1a1a1a",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(212,165,75,0.28)",
    paddingVertical: 6,
    maxHeight: 340,
  },
  opcion: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 13,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.06)",
  },
  opcionActiva: { backgroundColor: "rgba(212,165,75,0.10)" },
  opcionTexto: { color: "#ffffff", fontSize: 13.5, fontFamily: FontFamilies.body },
  opcionTextoActiva: { color: "#f0c96f", fontFamily: FontFamilies.bodyBold },
});
