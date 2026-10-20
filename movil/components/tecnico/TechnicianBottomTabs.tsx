// Componente de navegación y estructura visual: TechnicianBottomTabs. Se reutiliza en las pantallas de su área.
import React, { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import FontAwesome6 from "@expo/vector-icons/FontAwesome6";
import { useRouter, useSegments } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { FontFamilies } from "@/constants/theme";
import { apiFetch } from "@/services/api";
import { useIdioma } from "@/contexts/IdiomaContext";

// Comunica con el backend mediante API "/notificaciones/mias"; programa una actualización periódica.
export default function TechnicianBottomTabs() {
  const router = useRouter();
  const segments = useSegments() as string[];
  const insets = useSafeAreaInsets();
  const { t } = useIdioma();
  const [notifCount, setNotifCount] = useState(0);

  const TABS = [
    { id: "inicio", label: t("navigation.home"), icon: "house", to: "/(tecnico)" as const },
    { id: "citas", label: t("navigation.appointments"), short: t("navigation.appointmentsShort"), icon: "calendar-check", to: "/(tecnico)/citas" as const },
    { id: "entregas", label: t("navigation.deliveries"), short: t("navigation.deliveriesShort"), icon: "truck-fast", to: "/(tecnico)/entregas" as const },
    { id: "notif", label: t("navigation.notifications"), short: t("navigation.notificationsShort"), icon: "bell", to: "/(tecnico)/notificaciones" as const },
  ];

  useEffect(() => {
    let alive = true;
    // Comunica con el backend mediante API "/notificaciones/mias".
    const cargar = async () => {
      try {
        const res = await apiFetch<any[]>("/notificaciones/mias").catch(() => []);
        if (!alive || !Array.isArray(res)) return;
        const noLeidas = res.filter((n: any) => n.leida === false).length;
        setNotifCount(noLeidas);
      } catch {
        if (alive) setNotifCount(0);
      }
    };
    cargar();
    const id = setInterval(cargar, 60000);
    return () => { alive = false; clearInterval(id); };
  }, []);

  const isActive = (to: string) => {
    const seg = segments[1]; // /(tecnico)/<seg>
    if (to === "/(tecnico)") return !seg || seg === "index" || seg === "" ;
    const clean = to.replace("/(tecnico)/", "");
    return seg === clean;
  };

  return (
    <View style={[styles.bar, { paddingBottom: insets.bottom + 6 }]}>
      {TABS.map((t) => {
        const activo = isActive(t.to);
        return (
          <Pressable
            key={t.id}
            onPress={() => router.push(t.to as any)}
            style={[styles.tab, activo && styles.tabActivo]}
            hitSlop={4}
          >
            <FontAwesome6 name={t.icon as any} size={14} color={activo ? "#141414" : "#bdbdbd"} />
            <Text style={[styles.label, activo && styles.labelActivo]} numberOfLines={1}>
              {t.short || t.label}
            </Text>
            {t.id === "notif" && notifCount > 0 ? (
              <View style={styles.badge}><Text style={styles.badgeTxt}>{notifCount > 9 ? "9+" : String(notifCount)}</Text></View>
            ) : null}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: "row",
    backgroundColor: "#0f0f0f",
    borderTopWidth: 1,
    borderTopColor: "rgba(212,165,75,0.22)",
    paddingTop: 6,
    paddingHorizontal: 4,
    gap: 4,
  },
  tab: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 3,
    paddingVertical: 6,
    paddingHorizontal: 4,
    borderRadius: 10,
    backgroundColor: "transparent",
  },
  tabActivo: {
    backgroundColor: "#caa24d",
  },
  label: {
    color: "#bdbdbd",
    fontSize: 9.5,
    fontFamily: FontFamilies.bodyMedium,
    textAlign: "center",
  },
  labelActivo: {
    color: "#141414",
    fontFamily: FontFamilies.bodyBold,
  },
  badge: {
    position: "absolute",
    top: 2,
    right: 12,
    minWidth: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: "#e5484d",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 3,
  },
  badgeTxt: { color: "#fff", fontSize: 8, fontFamily: FontFamilies.bodyBold },
});
