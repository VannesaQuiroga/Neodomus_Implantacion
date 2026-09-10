import React, { useState } from "react";
import { View, StyleSheet } from "react-native";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import TechnicianHeader from "@/components/tecnico/TechnicianHeader";
import TechnicianDrawer from "@/components/tecnico/TechnicianDrawer";
import TechnicianBottomTabs from "@/components/tecnico/TechnicianBottomTabs";
import GateTecnico from "@/components/app/GateTecnico";
import { useAuth } from "@/contexts/AuthContext";

export default function TecnicoLayout() {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const { cargando } = useAuth();

  if (cargando) return null;

  return (
    <View style={styles.container}>
      <GateTecnico titulo="Dashboard Técnico">
        <TechnicianHeader onMenuPress={() => setDrawerOpen(true)} />
        <View style={styles.content}>
          <Stack
            screenOptions={{
              headerShown: false,
              contentStyle: { backgroundColor: "#000000" },
              animation: "slide_from_right",
            }}
          >
            <Stack.Screen name="index" />
            <Stack.Screen name="citas" />
            <Stack.Screen name="entregas" />
            <Stack.Screen name="historial" />
            <Stack.Screen name="clientes" />
            <Stack.Screen name="calificaciones" />
            <Stack.Screen name="devoluciones" />
            <Stack.Screen name="perfil" />
            <Stack.Screen name="cambiar-password" />
            <Stack.Screen name="idioma" />
            <Stack.Screen name="notificaciones" />
            <Stack.Screen name="novedades" />
          </Stack>
        </View>
        <TechnicianBottomTabs />
        <TechnicianDrawer visible={drawerOpen} onClose={() => setDrawerOpen(false)} />
      </GateTecnico>
      <StatusBar style="light" translucent={false} backgroundColor="#000000" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#000000" },
  content: { flex: 1 },
});
