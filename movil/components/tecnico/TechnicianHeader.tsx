import React, { useState } from "react";
import { Pressable, StyleSheet, Text, View, Image, Modal } from "react-native";
import FontAwesome6 from "@expo/vector-icons/FontAwesome6";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/contexts/AuthContext";
import { FontFamilies } from "@/constants/theme";
import { useIdioma } from "@/contexts/IdiomaContext";

interface Props {
  onMenuPress: () => void;
  title?: string;
  subtitle?: string;
}

export default function TechnicianHeader({ onMenuPress, title, subtitle }: Props) {
  const { usuario, avatar, cerrarSesion } = useAuth();
  const { t } = useIdioma();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const nombre = usuario?.nombre?.split(" ")[0] || "Técnico";
  const nombreCompleto = (usuario?.nombre || "Técnico").trim();
  const iniciales = nombre.slice(0, 2).toUpperCase();

  const [perfilMenuVisible, setPerfilMenuVisible] = useState(false);

  const cerrarPerfilMenu = () => setPerfilMenuVisible(false);

  const irEditarPerfil = () => {
    cerrarPerfilMenu();
    setTimeout(() => router.push("/(tecnico)/perfil" as any), 120);
  };

  const handleCerrarSesion = async () => {
    cerrarPerfilMenu();
    await cerrarSesion();
    router.replace("/(tabs)" as any);
  };

  return (
    <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
      <View style={styles.topRow}>
        <Pressable onPress={onMenuPress} hitSlop={12} style={styles.menuBtn} accessibilityLabel="Abrir menú">
          <FontAwesome6 name="bars" size={18} color="#f0c96f" />
        </Pressable>

        <Image source={require("@/assets/images/Logo.jpg")} style={styles.logo} />

        <View style={styles.brand}>
          <Text style={styles.brandName}>Neodomus</Text>
          <Text style={styles.brandSub}>{t("tecnico.tecnico")}</Text>
        </View>

        <View style={styles.spacer} />

        <Pressable
          onPress={() => setPerfilMenuVisible(true)}
          hitSlop={8}
          style={({ pressed }) => [styles.avatarBtn, pressed && { opacity: 0.85 }]}
          accessibilityLabel="Menú perfil"
        >
          {avatar ? (
            <Image source={{ uri: avatar }} style={styles.avatar} />
          ) : (
            <View style={[styles.avatar, styles.avatarInicialesBg]}>
              <Text style={styles.avatarText}>{iniciales}</Text>
            </View>
          )}
        </Pressable>
      </View>

      {(title || subtitle) ? (
        <View style={styles.welcome}>
          {title ? <Text style={styles.welcomeTitle}>{title}</Text> : null}
          {subtitle ? <Text style={styles.welcomeSub}>{subtitle}</Text> : null}
        </View>
      ) : null}

      {/* Menú desplegable perfil - únicamente Editar perfil y Cerrar sesión */}
      <Modal visible={perfilMenuVisible} transparent animationType="fade" onRequestClose={cerrarPerfilMenu} statusBarTranslucent>
        <Pressable style={styles.dropdownOverlay} onPress={cerrarPerfilMenu} />
        <View style={[styles.dropdown, { top: insets.top + 56, right: 14 }]}>
          <View style={styles.dropdownHeader}>
            <Text style={styles.dropdownNombre} numberOfLines={1} ellipsizeMode="tail">
              {nombreCompleto}
            </Text>
            <View style={styles.perfilRolRow}>
              <View style={styles.dotVerde} />
              <Text style={styles.dropdownRol}>{t("tecnico.tecnico")}</Text>
            </View>
          </View>
          <View style={styles.dropdownSep} />
          <Pressable style={({ pressed }) => [styles.dropdownItem, pressed && { backgroundColor: "rgba(212,165,75,0.12)" }]} onPress={irEditarPerfil}>
            <FontAwesome6 name="user-pen" size={13} color="#f0c96f" />
            <Text style={styles.dropdownItemTxt}>{t("tecnico.editarPerfil")}</Text>
          </Pressable>
          <View style={styles.dropdownSep} />
          <Pressable style={({ pressed }) => [styles.dropdownItem, styles.dropdownDanger, pressed && { backgroundColor: "rgba(229,72,77,0.12)" }]} onPress={handleCerrarSesion}>
            <FontAwesome6 name="right-from-bracket" size={13} color="#ff8f93" />
            <Text style={[styles.dropdownItemTxt, { color: "#ff8f93" }]}>{t("common.cerrarSesion")}</Text>
          </Pressable>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    backgroundColor: "#000000",
    borderBottomWidth: 1,
    borderBottomColor: "rgba(212,165,75,0.28)",
    paddingBottom: 12,
    paddingHorizontal: 14,
    gap: 10,
  },
  topRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  menuBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "rgba(212,165,75,0.35)",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(212,165,75,0.08)",
    flexShrink: 0,
  },
  logo: {
    width: 32,
    height: 32,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "rgba(212,165,75,0.5)",
    flexShrink: 0,
  },
  brand: { flexDirection: "column", gap: 0, flexShrink: 1, minWidth: 0, justifyContent: "center" },
  brandName: { color: "#ffffff", fontSize: 13, fontFamily: FontFamilies.bodyBold, letterSpacing: 0.5, lineHeight: 14 },
  brandSub: { color: "#f0c96f", fontSize: 9, fontFamily: FontFamilies.bodyBold, letterSpacing: 1.2, lineHeight: 10, textTransform: "uppercase" },
  spacer: { flex: 1, minWidth: 6 },
  avatarBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: "#caa24d",
    flexShrink: 0,
  },
  avatarInicialesBg: {
    backgroundColor: "#caa24d",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 0,
  },
  avatarText: { color: "#141414", fontSize: 11, fontFamily: FontFamilies.bodyBold },
  perfilRolRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  dotVerde: { width: 6, height: 6, borderRadius: 3, backgroundColor: "#46d06f" },
  welcome: { gap: 2, marginTop: 4 },
  welcomeTitle: { color: "#ffffff", fontSize: 18, fontFamily: FontFamilies.bodyBold },
  welcomeSub: { color: "#bdbdbd", fontSize: 13, lineHeight: 18 },
  dropdownOverlay: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "transparent" },
  dropdown: {
    position: "absolute",
    minWidth: 210,
    maxWidth: 280,
    backgroundColor: "#141414",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(212,165,75,0.28)",
    paddingVertical: 6,
    shadowColor: "#000",
    shadowOpacity: 0.5,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 10,
  },
  dropdownHeader: { paddingHorizontal: 14, paddingVertical: 8, gap: 2 },
  dropdownNombre: { color: "#ffffff", fontSize: 13, fontFamily: FontFamilies.bodyBold },
  dropdownRol: { color: "#bdbdbd", fontSize: 11 },
  dropdownSep: { height: 1, backgroundColor: "rgba(255,255,255,0.08)", marginVertical: 6 },
  dropdownItem: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 11, paddingHorizontal: 14 },
  dropdownItemTxt: { color: "#ffffff", fontSize: 13, flex: 1, fontFamily: FontFamilies.bodyMedium },
  dropdownDanger: { },
  idiomaActual: { color: "#f0c96f", fontSize: 11, fontFamily: FontFamilies.bodyBold, backgroundColor: "rgba(212,165,75,0.15)", paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
});
