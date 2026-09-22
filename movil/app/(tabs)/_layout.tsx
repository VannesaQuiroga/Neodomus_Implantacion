import { Tabs } from "expo-router";
import FontAwesome6 from "@expo/vector-icons/FontAwesome6";
import React from "react";

import { HapticTab } from "@/components/haptic-tab";
import { NeodomusColors as C } from "@/constants/theme";
import { useAuth } from "@/contexts/AuthContext";
import { useCart } from "@/contexts/CartContext";
import { useIdioma } from "@/contexts/IdiomaContext";

/**
 * Tab bar inferior FIJO — nunca se desmonta:
 * - Visitante:   Inicio · Productos · Carrito · Ayuda
 * - Autenticado: Inicio · Productos · Carrito · Técnicos · Citas · Ayuda
 *
 * IMPORTANTE: Técnicos y Citas se DECLARAN SIEMPRE. Si se condicionan con
 * `{autenticado && <Tabs.Screen/>}` expo-router las AUTO-REGISTRA como tabs
 * visibles al no encontrar su declaración → aparecían para visitantes.
 * Con `href: autenticado ? undefined : null` quedan ocultas de verdad para
 * el visitante y aparecen inmediatamente al iniciar sesión (estado reactivo
 * de AuthContext), y desaparecen al cerrar sesión. Además, las pantallas
 * están protegidas a nivel ruta (GateCliente) contra deep-links directos.
 *
 * Todas las pantallas privadas viven DENTRO de este grupo como rutas
 * ocultas (href:null) → navbar (PublicNavbar en cada pantalla vía
 * AppScreen) y tabs permanecen montados en toda la navegación.
 */
export default function TabLayout() {
  const { autenticado } = useAuth();
  const { totalItems } = useCart();
  const { t } = useIdioma();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarButton: HapticTab,
        tabBarActiveTintColor: C.oroClaro,
        tabBarInactiveTintColor: C.grisTexto,
        tabBarStyle: {
          backgroundColor: C.negro,
          borderTopColor: C.oroFooter,
          borderTopWidth: 1,
        },
        tabBarLabelStyle: {
          fontSize: 10,
          fontWeight: "600",
        },
      }}
    >
      {/* ── Tabs visibles (orden EXACTO solicitado) ── */}
      <Tabs.Screen
        name="index"
        options={{
          title: t("nav.inicio"),
          tabBarIcon: ({ color }) => (
            <FontAwesome6 name="house" size={18} color={color} />
          ),
        }}
      />

      <Tabs.Screen
        name="productos"
        options={{
          title: t("nav.productos"),
          tabBarIcon: ({ color }) => (
            <FontAwesome6 name="box-open" size={18} color={color} />
          ),
        }}
      />

      <Tabs.Screen
        name="carrito"
        options={{
          title: t("nav.carrito"),
          tabBarBadge:
            totalItems > 0 ? (totalItems > 99 ? "99+" : totalItems) : undefined,
          tabBarBadgeStyle: {
            backgroundColor: "#e5484d",
            color: "#ffffff",
            fontSize: 9.5,
          },
          tabBarIcon: ({ color }) => (
            <FontAwesome6 name="cart-shopping" size={16} color={color} />
          ),
        }}
      />

      {/* Técnicos y Citas: SOLO usuario autenticado. Declaradas siempre
          (href:null para visitante) para evitar el auto-registro de
          expo-router que las mostraba a visitantes. */}
      <Tabs.Screen
        name="tecnicos-tab"
        options={{
          href: autenticado ? undefined : null,
          title: t("nav.tecnicos"),
          tabBarIcon: ({ color }) => (
            <FontAwesome6 name="screwdriver-wrench" size={16} color={color} />
          ),
        }}
      />

      <Tabs.Screen
        name="citas-tab"
        options={{
          href: autenticado ? undefined : null,
          title: t("nav.citas"),
          tabBarIcon: ({ color }) => (
            <FontAwesome6 name="calendar-check" size={16} color={color} />
          ),
        }}
      />

      <Tabs.Screen
        name="ayuda"
        options={{
          title: t("nav.ayuda"),
          tabBarIcon: ({ color }) => (
            <FontAwesome6 name="circle-question" size={19} color={color} />
          ),
        }}
      />

      {/* ── Rutas ocultas del usuario autenticado (mismo layout) ── */}
      <Tabs.Screen name="perfil" options={{ href: null }} />
      <Tabs.Screen name="cambiar-password" options={{ href: null }} />
      <Tabs.Screen name="pedidos" options={{ href: null }} />
      <Tabs.Screen name="seguimiento" options={{ href: null }} />
      <Tabs.Screen name="facturas" options={{ href: null }} />
      <Tabs.Screen name="notificaciones" options={{ href: null }} />
      <Tabs.Screen name="mis-servicios" options={{ href: null }} />
      <Tabs.Screen name="mis-tecnicos" options={{ href: null }} />
      <Tabs.Screen name="favoritos" options={{ href: null }} />
      <Tabs.Screen name="reembolsos" options={{ href: null }} />
      <Tabs.Screen name="resenas" options={{ href: null }} />
      <Tabs.Screen name="checkout" options={{ href: null }} />

      {/* Públicas apiladas dentro de los tabs */}
      <Tabs.Screen name="info" options={{ href: null }} />
      <Tabs.Screen name="producto/[id]" options={{ href: null }} />
      {/* Explore eliminado para visitante — nunca visible */}
      <Tabs.Screen name="explore" options={{ href: null }} />
    </Tabs>
  );
}
