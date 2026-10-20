// Ruta móvil de estructura de navegación. Expo Router la incorpora a la navegación según su ubicación en app/.
import { Stack, useRouter, useSegments } from "expo-router";
import { StatusBar } from "expo-status-bar";
import React, { useEffect } from "react";
import {
  useFonts,
  Inter_400Regular,
  Inter_500Medium,
  Inter_700Bold,
  Inter_900Black,
} from "@expo-google-fonts/inter";
import {
  Montserrat_600SemiBold,
} from "@expo-google-fonts/montserrat";

import { SafeAreaProvider } from "react-native-safe-area-context";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { CarritoProvider } from "@/contexts/CartContext";
import { FavoritosProvider } from "@/contexts/FavoritosContext";
import { TecnicosFavoritosProvider } from "@/contexts/TecnicosFavoritosContext";
import { CookieConsentProvider } from "@/contexts/CookieConsentContext";
import { IdiomaProvider } from "@/contexts/IdiomaContext";

// La app arranca siempre en el grupo de tabs (experiencia pública).
export const unstable_settings = {
  anchor: "(tabs)",
};

/** Los favoritos dependen de la identidad: visitante o cuenta por correo. */
function ArbolFavoritos({ children }: { children: React.ReactNode }) {
  const { usuario } = useAuth();
  return (
    <FavoritosProvider correoUsuario={usuario?.correo ?? null}>
      <TecnicosFavoritosProvider correoUsuario={usuario?.correo ?? null}>
        {children}
      </TecnicosFavoritosProvider>
    </FavoritosProvider>
  );
}

function NavegacionRaiz() {
  const { cargando, usuario } = useAuth();
  const router = useRouter();
  const segments = useSegments() as string[];
  const [fuentesCargadas] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_700Bold,
    Inter_900Black,
    Montserrat_600SemiBold,
  });

  // Redirección automática por rol (igual que web RoleRoute)
  useEffect(() => {
    if (cargando || !fuentesCargadas) return;
    const rol = (usuario?.rol || "").toLowerCase();
    const enTecnico = segments[0] === "(tecnico)";
    const enTabs = segments[0] === "(tabs)";
    if (rol === "tecnico" && !enTecnico) {
      // Técnico debe estar en dashboard técnico, no en flujo cliente/visitante
      router.replace("/(tecnico)" as any);
    } else if (rol !== "tecnico" && enTecnico) {
      router.replace("/(tabs)" as any);
    }
  }, [usuario?.rol, cargando, fuentesCargadas, segments, router]);

  // Mantiene el splash screen mientras se restaura sesión y cargan las fuentes.
  if (cargando || !fuentesCargadas) return null;

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="(tecnico)" />

      {/* Flujos de autenticación como MODALES sobre la pantalla actual:
          el contenido público permanece detrás y la X vuelve al punto exacto. */}
      <Stack.Screen
        name="login"
        options={{ presentation: "transparentModal", animation: "fade" }}
      />
      <Stack.Screen
        name="registro"
        options={{ presentation: "transparentModal", animation: "fade" }}
      />
      <Stack.Screen
        name="verificar-correo"
        options={{ presentation: "transparentModal", animation: "fade" }}
      />
      <Stack.Screen
        name="recuperar-password"
        options={{ presentation: "transparentModal", animation: "fade" }}
      />
      <Stack.Screen
        name="codigo-seguridad"
        options={{ presentation: "transparentModal", animation: "fade" }}
      />
      <Stack.Screen
        name="nueva-password"
        options={{ presentation: "transparentModal", animation: "fade" }}
      />

      {/* Pantallas legales/públicas apiladas en el STACK raíz: el botón
          Atrás del sistema hace pop real al punto exacto de origen
          (Productos → Términos → Atrás → Productos). */}
      <Stack.Screen name="terminos" />
      <Stack.Screen name="privacidad" />
      <Stack.Screen name="cookies" />
      <Stack.Screen name="centro-privacidad" />
      <Stack.Screen name="contacto" />
      <Stack.Screen name="ayuda" />

      {/* ── Área USUARIO AUTENTICADO (stack raíz; Atrás real) ── */}
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <CarritoProvider>
          <ArbolFavoritos>
            {/* Banner/modal de cookies a nivel raíz: visible en toda la
                experiencia pública hasta que el usuario decida. */}
            <CookieConsentProvider>
              <IdiomaProvider>
                <NavegacionRaiz />
                <StatusBar style="light" />
              </IdiomaProvider>
            </CookieConsentProvider>
          </ArbolFavoritos>
        </CarritoProvider>
      </AuthProvider>
    </SafeAreaProvider>
  );
}
