// ─────────────────────────────────────────────────────────────
// Navbar — visitante: Logo + Iniciar sesión + Registrarse.
// Usuario autenticado (registrado y verificado):
//   [Logo][☰ Herramientas] ···· Bienvenido / Nombre Apellido [Avatar]
//   · ☰ abre el MENÚ DE HERRAMIENTAS (cambiar contraseña, pedidos,
//     servicios, favoritos, reembolsos, reseñas, técnicos,
//     NOTIFICACIONES e idioma).
//   · Bienvenida + avatar abren el MENÚ DE USUARIO con ÚNICAMENTE
//     "Mi perfil" y "Cerrar sesión" (sin nombre dentro).
//   · SIN campanita de notificaciones: viven en el menú de herramientas.
// Respeta safe area superior y dimensiones de pantallas pequeñas
// (paneles con scroll, nunca cortados).
// ─────────────────────────────────────────────────────────────

import React, { useState } from "react";
import {
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import FontAwesome6 from "@expo/vector-icons/FontAwesome6";

import { FontFamilies } from "@/constants/theme";
import { useAuth } from "@/contexts/AuthContext";
import { useIdioma } from "@/contexts/IdiomaContext";

export default function PublicNavbar() {
  const { autenticado, usuario, avatar, cerrarSesion } = useAuth();
  const { t } = useIdioma();
  const insets = useSafeAreaInsets();

  const [menuHerramientasVisible, setMenuHerramientasVisible] = useState(false);
  const [menuUsuarioVisible, setMenuUsuarioVisible] = useState(false);

  const iniciales = (
    `${usuario?.nombre ?? "U"}`.trim().slice(0, 2) || "U"
  ).toUpperCase();

  const ir = (destino: string) => {
    setMenuHerramientasVisible(false);
    setMenuUsuarioVisible(false);
    router.push(destino as never);
  };

  return (
    <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
      {/* Logo */}
      <Pressable
        onPress={() => router.navigate("/(tabs)")}
        accessibilityRole="link"
        accessibilityLabel="Inicio"
        hitSlop={6}
      >
        <Image source={require("@/assets/images/Logo.jpg")} style={styles.logo} />
      </Pressable>

      {!autenticado ? (
        <View style={styles.acciones}>
          <Pressable
            style={({ pressed }) => [
              styles.botonRegistro,
              pressed && styles.presionado,
            ]}
            onPress={() => router.push("/registro")}
            hitSlop={6}
          >
            <Text style={styles.textoBotonOro}>Registrarse</Text>
          </Pressable>

          <Pressable
            style={({ pressed }) => [styles.botonLogin, pressed && styles.presionado]}
            onPress={() => router.push("/login")}
            hitSlop={6}
          >
            <Text style={styles.textoBotonClaro}>Iniciar sesión</Text>
          </Pressable>
        </View>
      ) : (
        <>
          {/* ☰ Menú de herramientas — junto al logo */}
          <Pressable
            style={({ pressed }) => [
              styles.botonHerramientas,
              pressed && styles.presionado,
            ]}
            onPress={() => setMenuHerramientasVisible(true)}
            accessibilityLabel="Menú de herramientas"
            accessibilityRole="button"
            hitSlop={6}
          >
            <FontAwesome6 name="bars" size={15} color="#ffffff" />
          </Pressable>

          <View style={{ flex: 1 }} />

          <View style={styles.acciones}>
            {/* Bienvenido + avatar → menú de usuario.
                Saludo en DOS LÍNEAS verticales para que el nombre
                completo tenga espacio; nunca se corta ni usa "...". */}
            <Pressable
              style={({ pressed }) => [
                styles.botonUsuario,
                pressed && styles.presionado,
              ]}
              onPress={() => setMenuUsuarioVisible(true)}
              accessibilityLabel="Menú de usuario"
              accessibilityRole="button"
              hitSlop={4}
            >
              <View style={styles.bienvenidaColumna}>
                <Text style={styles.textoBienvenido}>Bienvenido</Text>
                <Text style={styles.textoNombre}>
                  {usuario?.nombre ?? ""}
                </Text>
              </View>
              {avatar ? (
                <Image source={{ uri: avatar }} style={styles.avatar} />
              ) : (
                <View style={styles.avatarIniciales}>
                  <Text style={styles.textoIniciales}>{iniciales}</Text>
                </View>
              )}
            </Pressable>
          </View>
        </>
      )}

      {/* ── MENÚ DE HERRAMIENTAS (desplegable junto al logo) ── */}
      <Modal
        visible={menuHerramientasVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setMenuHerramientasVisible(false)}
      >
        <Pressable
          style={styles.menuOverlay}
          onPress={() => setMenuHerramientasVisible(false)}
          accessibilityLabel="Cerrar menú de herramientas"
        />
        <View
          style={[
            styles.menuPanel,
            styles.menuPanelIzquierda,
            { top: insets.top + 62 },
          ]}
        >
          <ScrollView bounces={false} showsVerticalScrollIndicator={false}>
            <Text style={styles.menuTituloSeccion}>{t("menu.herramientas")}</Text>

            <ItemMenu
              icono="key"
              texto={t("menu.cambiarPassword")}
              onPress={() => ir("/(tabs)/cambiar-password")}
            />
            <ItemMenu
              icono="box"
              texto={t("menu.misPedidos")}
              onPress={() => ir("/(tabs)/pedidos")}
            />
            <ItemMenu
              icono="screwdriver-wrench"
              texto={t("menu.misServicios")}
              onPress={() => ir("/(tabs)/mis-servicios")}
            />
            <ItemMenu
              icono="heart"
              texto={t("menu.misFavoritos")}
              onPress={() => ir("/(tabs)/favoritos")}
            />
            <ItemMenu
              icono="rotate-left"
              texto={t("menu.misReembolsos")}
              onPress={() => ir("/(tabs)/reembolsos")}
            />
            <ItemMenu
              icono="star"
              texto={t("menu.misResenas")}
              onPress={() => ir("/(tabs)/resenas")}
            />
            <ItemMenu
              icono="user-group"
              texto={t("menu.misTecnicos")}
              onPress={() => ir("/(tabs)/mis-tecnicos")}
            />

            {/* Notificaciones — dentro del menú de herramientas */}
            <ItemMenu
              icono="bell"
              texto={t("nav.notificaciones")}
              onPress={() => ir("/(tabs)/notificaciones")}
            />

            {/* Idioma ES/EN funcional */}
            <SelectorIdioma />
          </ScrollView>
        </View>
      </Modal>

      {/* ── MENÚ DE USUARIO (Bienvenido + avatar) ── */}
      <Modal
        visible={menuUsuarioVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setMenuUsuarioVisible(false)}
      >
        <Pressable
          style={styles.menuOverlay}
          onPress={() => setMenuUsuarioVisible(false)}
          accessibilityLabel="Cerrar menú de usuario"
        />
        <View
          style={[
            styles.menuPanel,
            styles.menuPanelDerecha,
            { top: insets.top + 62 },
          ]}
        >
          {/* El menú del usuario contiene ÚNICAMENTE Mi perfil y
              Cerrar sesión: sin saludo ni nombre dentro. */}
          <ItemMenu
            icono="user"
            texto={t("menu.miPerfil")}
            onPress={() => ir("/(tabs)/perfil")}
          />

          <View style={styles.separador} />
          <Pressable
            style={({ pressed }) => [styles.itemSalir, pressed && styles.presionado]}
            onPress={() => {
              setMenuUsuarioVisible(false);
              void cerrarSesion();
            }}
          >
            <FontAwesome6 name="right-from-bracket" size={13} color="#e5484d" />
            <Text style={styles.textoSalir}>{t("menu.cerrarSesion")}</Text>
          </Pressable>
        </View>
      </Modal>
    </View>
  );
}

function ItemMenu({
  icono,
  texto,
  onPress,
}: {
  icono: string;
  texto: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      style={({ pressed }) => [styles.menuItem, pressed && styles.presionado]}
      onPress={onPress}
    >
      <FontAwesome6 name={(icono as never) || "circle"} size={13} color="#f0c96f" />
      <Text style={styles.menuItemTexto}>{texto}</Text>
    </Pressable>
  );
}

function SelectorIdioma() {
  const { idioma, setIdioma, t } = useIdioma();
  return (
    <View style={styles.idiomaFila}>
      <FontAwesome6 name="language" size={13} color="#f0c96f" />
      <Text style={styles.menuItemTexto}>{t("menu.idioma")}</Text>
      <View style={styles.idiomaOpciones}>
        {(["es", "en"] as const).map((cod) => (
          <Pressable
            key={cod}
            onPress={() => void setIdioma(cod)}
            style={[styles.idiomaChip, idioma === cod && styles.idiomaChipActivo]}
          >
            <Text
              style={[
                styles.idiomaChipTexto,
                idioma === cod && styles.idiomaChipTextoActivo,
              ]}
            >
              {cod.toUpperCase()}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#caa24d",
    paddingHorizontal: 14,
    paddingBottom: 10,
    minHeight: 56,
    zIndex: 50,
  },

  logo: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: "#ffffff",
  },

  botonHerramientas: {
    marginLeft: 10,
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },

  acciones: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },

  presionado: { opacity: 0.75 },

  botonLogin: {
    borderRadius: 25,
    borderWidth: 1.5,
    borderColor: "#ffffff",
    paddingVertical: 7,
    paddingHorizontal: 12,
  },

  textoBotonClaro: {
    color: "#ffffff",
    fontSize: 12.5,
    fontFamily: FontFamilies.button,
  },

  botonRegistro: {
    borderRadius: 25,
    backgroundColor: "#ffffff",
    paddingVertical: 7,
    paddingHorizontal: 12,
  },

  textoBotonOro: {
    color: "#caa24d",
    fontSize: 12.5,
    fontFamily: FontFamilies.button,
  },

  botonUsuario: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    // Sin ancho máximo: nombres largos se envuelven a varias líneas,
    // nunca se cortan ni muestran "...".
    flexShrink: 1,
  },

  bienvenidaColumna: {
    alignItems: "flex-end",
    flexShrink: 1,
  },

  textoBienvenido: {
    color: "#ffffff",
    fontSize: 11,
    fontFamily: FontFamilies.button,
    textAlign: "right",
  },

  textoNombre: {
    color: "#ffffff",
    fontSize: 12.5,
    fontFamily: FontFamilies.bodyBold,
    textAlign: "right",
  },

  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1.5,
    borderColor: "#ffffff",
  },

  avatarIniciales: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#ffffff",
    alignItems: "center",
    justifyContent: "center",
  },

  textoIniciales: {
    color: "#caa24d",
    fontSize: 13,
    fontWeight: "700",
  },

  menuOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "transparent",
  },

  menuPanel: {
    position: "absolute",
    minWidth: 230,
    maxWidth: 320,
    maxHeight: "72%",
    backgroundColor: "#1e1e1e",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(212,165,75,0.35)",
    paddingVertical: 8,
    shadowColor: "#000000",
    shadowOpacity: 0.5,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 10,
  },

  // Panel de herramientas anclado a la izquierda (junto al logo),
  // para que nunca quede cortado por el borde derecho.
  menuPanelIzquierda: {
    left: 10,
  },

  menuPanelDerecha: {
    right: 10,
    minWidth: 220,
  },

  menuTituloSeccion: {
    color: "#f0c96f",
    fontSize: 12.5,
    fontFamily: FontFamilies.bodyBold,
    paddingHorizontal: 14,
    paddingTop: 4,
    paddingBottom: 6,
    opacity: 0.8,
  },

  menuItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 11,
    paddingHorizontal: 14,
  },

  menuItemTexto: {
    color: "#ffffff",
    fontSize: 13.5,
    flexShrink: 1,
  },

  separador: {
    height: 1,
    backgroundColor: "rgba(255,255,255,0.09)",
    marginVertical: 6,
  },

  itemSalir: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 11,
    paddingHorizontal: 14,
  },

  textoSalir: {
    color: "#e5484d",
    fontSize: 13.5,
    fontFamily: FontFamilies.button,
  },

  idiomaFila: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 11,
    paddingHorizontal: 14,
  },

  idiomaOpciones: {
    flexDirection: "row",
    gap: 6,
    marginLeft: "auto",
  },

  idiomaChip: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.2)",
    paddingVertical: 3,
    paddingHorizontal: 8,
  },

  idiomaChipActivo: {
    backgroundColor: "#caa24d",
    borderColor: "#caa24d",
  },

  idiomaChipTexto: { color: "#ffffff", fontSize: 11, fontWeight: "700" },

  idiomaChipTextoActivo: { color: "#141414" },
});
