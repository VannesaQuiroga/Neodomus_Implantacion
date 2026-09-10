import React from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import FontAwesome6 from "@expo/vector-icons/FontAwesome6";
import { useRouter, useSegments } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/contexts/AuthContext";
import { FontFamilies } from "@/constants/theme";
import { useIdioma } from "@/contexts/IdiomaContext";

interface Props {
  visible: boolean;
  onClose: () => void;
}

const SECCIONES = [
  {
    titulo: "Panel",
    links: [{ to: "/(tecnico)", icon: "house", label: "Inicio" }],
  },
  {
    titulo: "Servicios",
    links: [
      { to: "/(tecnico)/citas", icon: "calendar-check", label: "Mis Citas" },
      { to: "/(tecnico)/entregas", icon: "truck-fast", label: "Entregas" },
      { to: "/(tecnico)/devoluciones", icon: "box-open", label: "Devoluciones" },
      { to: "/(tecnico)/novedades", icon: "shield-halved", label: "Novedades" },
      { to: "/(tecnico)/historial", icon: "clock-rotate-left", label: "Historial" },
    ],
  },
  {
    titulo: "Clientes",
    links: [{ to: "/(tecnico)/clientes", icon: "users", label: "Clientes" }],
  },
  {
    titulo: "Calificaciones",
    links: [{ to: "/(tecnico)/calificaciones", icon: "star", label: "Mis Calificaciones" }],
  },
];

export default function TechnicianDrawer({ visible, onClose }: Props) {
  const router = useRouter();
  const segments = useSegments() as string[];
  const { usuario } = useAuth();
  const { t } = useIdioma();
  const insets = useSafeAreaInsets();

  const handleNavigate = (to: string) => {
    onClose();
    setTimeout(() => router.push(to as any), 150);
  };

  const checkActive = (to: string) => {
    const group = segments[0];
    if (to === "/(tecnico)") return group === "(tecnico)" && (segments.length === 1 || segments[1] === undefined || segments[1] === "index");
    const clean = to.replace("/(tecnico)/", "");
    return group === "(tecnico)" && segments[1] === clean;
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.overlay}>
        <Pressable style={styles.backdrop} onPress={onClose} />
        <View style={[styles.drawer, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 20 }]}>
          <View style={styles.header}>
            <Text style={styles.headerTitle}>MENÚ</Text>
            <Pressable onPress={onClose} hitSlop={8} style={styles.closeBtn}>
              <FontAwesome6 name="xmark" size={16} color="#ffffff" />
            </Pressable>
          </View>
          <Text style={styles.userName}>{usuario?.nombre || "Técnico"}</Text>
          <Text style={styles.userMail}>{usuario?.correo || ""}</Text>

          <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
            {SECCIONES.map((sec) => (
              <View key={sec.titulo} style={styles.seccion}>
                <Text style={styles.seccionTitulo}>{sec.titulo.toUpperCase()}</Text>
                {sec.links.map((link) => {
                  const active = checkActive(link.to);
                  return (
                    <Pressable
                      key={link.to}
                      onPress={() => handleNavigate(link.to)}
                      style={[styles.link, active && styles.linkActivo]}
                    >
                      <FontAwesome6 name={link.icon as any} size={14} color={active ? "#141414" : "#f0c96f"} />
                      <Text style={[styles.linkTexto, active && styles.linkTextoActivo]}>{link.label}</Text>
                    </Pressable>
                  );
                })}
              </View>
            ))}

            <View style={styles.seccion}>
              <Text style={styles.seccionTitulo}>CUENTA</Text>
              <Pressable
                onPress={() => handleNavigate("/(tecnico)/cambiar-password")}
                style={[styles.link, checkActive("/(tecnico)/cambiar-password") && styles.linkActivo]}
              >
                <FontAwesome6 name="key" size={14} color={checkActive("/(tecnico)/cambiar-password") ? "#141414" : "#f0c96f"} />
                <Text style={[styles.linkTexto, checkActive("/(tecnico)/cambiar-password") && styles.linkTextoActivo]}>Cambiar contraseña</Text>
              </Pressable>
              <Pressable
                onPress={() => handleNavigate("/(tecnico)/idioma")}
                style={[styles.link, checkActive("/(tecnico)/idioma") && styles.linkActivo]}
              >
                <FontAwesome6 name="language" size={14} color={checkActive("/(tecnico)/idioma") ? "#141414" : "#f0c96f"} />
                <Text style={[styles.linkTexto, checkActive("/(tecnico)/idioma") && styles.linkTextoActivo]}>Idioma</Text>
              </Pressable>
            </View>
          </ScrollView>

        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, flexDirection: "row" },
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.55)" },
  drawer: {
    width: 280,
    backgroundColor: "#0f0f0f",
    borderRightWidth: 1,
    borderRightColor: "rgba(212,165,75,0.28)",
    paddingHorizontal: 14,
    gap: 12,
  },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  headerTitle: { color: "#f0c96f", fontSize: 12, fontFamily: FontFamilies.bodyBold, letterSpacing: 1.2 },
  closeBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.09)",
    alignItems: "center",
    justifyContent: "center",
  },
  userName: { color: "#ffffff", fontSize: 14, fontFamily: FontFamilies.bodyBold, marginTop: 4 },
  userMail: { color: "#bdbdbd", fontSize: 12, marginTop: -8 },
  scroll: { flex: 1, marginTop: 8 },
  seccion: { gap: 4, marginBottom: 14 },
  seccionTitulo: { color: "#6b6b6b", fontSize: 10, fontFamily: FontFamilies.bodyBold, letterSpacing: 1, marginBottom: 4 },
  link: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "transparent",
  },
  linkActivo: { backgroundColor: "#caa24d", borderColor: "#caa24d" },
  linkTexto: { color: "#ffffff", fontSize: 13, fontFamily: FontFamilies.bodyMedium, flex: 1 },
  linkTextoActivo: { color: "#141414", fontFamily: FontFamilies.bodyBold },
  logout: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "rgba(240,133,138,0.35)",
    backgroundColor: "rgba(240,133,138,0.08)",
    marginTop: 8,
  },
  logoutTexto: { color: "#f0858a", fontSize: 13, fontFamily: FontFamilies.bodyBold },
});
