// ─────────────────────────────────────────────────────────────
// Carrito — adaptación móvil de CarritoPage WEB.
// Mismo resumen, mismos textos. Al finalizar sin sesión se
// solicita iniciar sesión (gate de la web); con sesión de cliente,
// el checkout llega en la Fase 2 (módulos privados).
// ─────────────────────────────────────────────────────────────

import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Image,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { BlurView } from "expo-blur";
import { router } from "expo-router";
import FontAwesome6 from "@expo/vector-icons/FontAwesome6";

import { NeodomusColors as C, FontFamilies } from "@/constants/theme";
import PublicScreen from "@/components/public/PublicScreen";
import ProductCard from "@/components/public/ProductCard";
import { useCart } from "@/contexts/CartContext";
import { useAuth } from "@/contexts/AuthContext";
import { useScrollTopAlEntrar } from "@/hooks/useScrollTopAlEntrar";
import {
  claveItemCarrito,
  type ItemCarrito,
} from "@/contexts/CartContext";
import {
  formatearPrecio,
  listarProductos,
  urlImagenProducto,
  type Producto,
} from "@/services/productos.service";

const CANTIDAD_RECOMENDADOS = 6;

export default function CarritoScreen() {
  const {
    items,
    totalItems,
    totalPrice,
    updateQuantity,
    updateMetros,
    removeItem,
    clearCart,
  } = useCart();
  const { autenticado, userType } = useAuth();
  const [avisoLoginVisible, setAvisoLoginVisible] = useState(false);
  const scrollRef = useRef<import("react-native").ScrollView | null>(null);
  // Entrar al carrito desde otra sección → empezar arriba.
  useScrollTopAlEntrar(scrollRef);

  const finalizarCompra = () => {
    if (items.length === 0) return;

    if (!autenticado) {
      // Igual que la web: gate de login antes del checkout (modal Neodomus).
      setAvisoLoginVisible(true);
      return;
    }

    // Cliente autenticado → CHECKOUT REAL (mismo backend que la web).
    if (userType === "client") {
      router.push("/(tabs)/checkout");
      return;
    }

    Alert.alert(
      "Cuenta no válida",
      "Para finalizar tu compra necesitas una cuenta de cliente Neodomus.",
    );
  };

  return (
    <PublicScreen scrollRef={scrollRef}>
      <View style={styles.contenedor}>
        <Text style={styles.titulo}>Mi carrito</Text>
        <Text style={styles.subtitulo}>
          {items.length > 0
            ? `${totalItems} ${totalItems === 1 ? "producto en tu carrito" : "productos en tu carrito"}`
            : "Aún no tienes productos en tu carrito"}
        </Text>

        {items.length === 0 ? (
          <View style={styles.vacio}>
            <FontAwesome6 name="cart-shopping" size={40} color={C.oroClaro} />
            <Text style={styles.vacioTitulo}>Tu carrito está vacío</Text>
            <Pressable
              style={({ pressed }) => [styles.botonOro, pressed && styles.presionado]}
              onPress={() => router.navigate("/(tabs)/productos")}
            >
              <Text style={styles.textoBotonOro}>Explorar productos</Text>
            </Pressable>
          </View>
        ) : (
          <>
            {/* Flujo de contenido único (sin ScrollViews anidados):
                items → vaciar → resumen → recomendados */}
            <View style={styles.listaContenido}>
              {items.map((item) => (
                <TarjetaItem
                  key={claveItemCarrito(item)}
                  item={item}
                  onCantidad={(valor) => updateQuantity(claveItemCarrito(item), valor)}
                  onMetros={(valor) => updateMetros(claveItemCarrito(item), valor)}
                  onQuitar={() => removeItem(claveItemCarrito(item))}
                />
              ))}

              <Pressable
                style={({ pressed }) => [styles.vaciar, pressed && styles.presionado]}
                onPress={() =>
                  Alert.alert("Vaciar carrito", "¿Seguro que deseas vaciar el carrito?", [
                    { text: "Cancelar", style: "cancel" },
                    { text: "Vaciar", style: "destructive", onPress: () => clearCart() },
                  ])
                }
              >
                <FontAwesome6 name="trash-can" size={12} color={C.rojoError} />
                <Text style={styles.vaciarTexto}>Vaciar carrito</Text>
              </Pressable>

              {/* Resumen del pedido (igual que la web) */}
              <View style={styles.resumen}>
                <Text style={styles.resumenTitulo}>Resumen del pedido</Text>
                <View style={styles.resumenFila}>
                  <Text style={styles.resumenClave}>
                    Productos ({totalItems})
                  </Text>
                  <Text style={styles.resumenValor}>
                    {formatearPrecio(totalPrice)} COP
                  </Text>
                </View>
                <View style={styles.resumenFila}>
                  <Text style={styles.resumenClave}>Envío</Text>
                  <Text style={styles.resumenEnvio}>Se calcula al finalizar</Text>
                </View>
                <View style={[styles.resumenFila, styles.totalFila]}>
                  <Text style={styles.totalClave}>Total:</Text>
                  <Text style={styles.totalValor}>
                    {formatearPrecio(totalPrice)} COP
                  </Text>
                </View>
                <Pressable
                  style={({ pressed }) => [
                    styles.botonFinalizar,
                    pressed && styles.presionado,
                  ]}
                  onPress={finalizarCompra}
                >
                  <Text style={styles.textoFinalizar}>Finalizar compra</Text>
                </Pressable>
                <Text style={styles.hintPago}>
                  El pago se confirmará al enviar tu pedido.
                </Text>
              </View>

              <SeccionRecomendados />
            </View>
          </>
        )}
      </View>

      {/* Aviso "Inicia sesión para continuar" — identidad Neodomus,
          fondo con blur; cerrar NO toca el carrito. */}
      <Modal
        visible={avisoLoginVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setAvisoLoginVisible(false)}
      >
        <View style={styles.avisoOverlay}>
          <BlurView
            intensity={40}
            tint="dark"
            blurMethod="dimezisBlurView"
            style={StyleSheet.absoluteFill}
            pointerEvents="none"
          />
          <Pressable
            style={[StyleSheet.absoluteFill, styles.avisoBackdrop]}
            onPress={() => setAvisoLoginVisible(false)}
            accessibilityLabel="Cerrar aviso"
          />

          <View style={styles.avisoTarjeta}>
            <Pressable
              style={({ pressed }) => [
                styles.avisoCerrar,
                pressed && styles.presionado,
              ]}
              onPress={() => setAvisoLoginVisible(false)}
              accessibilityLabel="Cerrar"
              hitSlop={8}
            >
              <FontAwesome6 name="xmark" size={14} color={C.blanco} />
            </Pressable>

            <View style={styles.avisoIcono}>
              <FontAwesome6 name="lock" size={20} color={C.oroSuave} />
            </View>

            <Text style={styles.avisoTitulo}>Inicia sesión para continuar</Text>
            <Text style={styles.avisoTexto}>
              Para finalizar tu compra necesitas una cuenta de cliente
              Neodomus.
            </Text>

            <Pressable
              style={({ pressed }) => [
                styles.avisoBotonPrimario,
                pressed && styles.presionado,
              ]}
              onPress={() => {
                setAvisoLoginVisible(false);
                router.push({
                  pathname: "/login",
                  params: { redirigirA: "/(tabs)/carrito" },
                });
              }}
            >
              <Text style={styles.avisoTextoPrimario}>Iniciar sesión</Text>
            </Pressable>

            <Pressable
              style={({ pressed }) => [
                styles.avisoBotonSecundario,
                pressed && styles.presionado,
              ]}
              onPress={() => {
                setAvisoLoginVisible(false);
                router.push("/registro");
              }}
            >
              <Text style={styles.avisoTextoSecundario}>Registrarme</Text>
            </Pressable>

            <Pressable
              style={({ pressed }) => [
                styles.avisoCancelar,
                pressed && styles.presionado,
              ]}
              onPress={() => setAvisoLoginVisible(false)}
            >
              <Text style={styles.avisoTextoCancelar}>Seguir explorando</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </PublicScreen>
  );
}

function TarjetaItem({  item,
  onCantidad,
  onMetros,
  onQuitar,
}: {
  item: ItemCarrito;
  onCantidad: (cantidad: number) => void;
  onMetros: (metros: number) => void;
  onQuitar: () => void;
}) {
  const esMetros = !!item.venta_por_metros;
  const cantidadEfectiva = esMetros ? (item.metros ?? 10) * (item.cantidad || 1) : item.cantidad;
  // Misma resolución de imagen que Productos (cubre ítems guardados antes
  // del fix: si imagen vino null, aplica la convención /uploads/{id}.jpg).
  const urlImagen = urlImagenProducto({
    id_producto: item.id_producto,
    imagen_url: item.imagen,
  });

  return (
    <View style={styles.item}>
      <View style={styles.itemImagenWrap}>
        <Image source={{ uri: urlImagen }} style={styles.itemImagen} />
      </View>

      <View style={styles.itemInfo}>
        <Text style={styles.itemNombre} numberOfLines={2}>
          {item.nombre_producto}
        </Text>
        <Text style={styles.itemPrecio}>
          {formatearPrecio(item.precio_venta_producto)} COP /{" "}
          {esMetros ? "metro" : "unidad"}
        </Text>

        {!!item.color && <Text style={styles.itemDetalle}>Color: {item.color}</Text>}
        {!esMetros && !!item.tamaño && (
          <Text style={styles.itemDetalle}>Medida: {item.tamaño}</Text>
        )}
        {(item.tecnicos_requeridos ?? 1) > 0 && (
          <Text style={styles.itemDetalle}>
            Requiere{" "}
            {(item.tecnicos_requeridos ?? 1) > 1
              ? `${item.tecnicos_requeridos} técnicos`
              : "1 técnico"}
          </Text>
        )}
        {esMetros && (
          <Text style={styles.itemDetalle}>
            {item.cantidad} × {item.metros ?? 10} m = {cantidadEfectiva} m total
          </Text>
        )}

        <View style={styles.itemControles}>
          {esMetros ? (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <View style={styles.contador}>
                <Pressable
                  style={styles.contadorBoton}
                  onPress={() => onCantidad(Math.max(1, (item.cantidad || 1) - 1))}
                  accessibilityLabel="Reducir unidades"
                >
                  <FontAwesome6 name="minus" size={10} color={C.blanco} />
                </Pressable>
                <Text style={styles.chipMetros}>{item.cantidad}</Text>
                <Pressable
                  style={styles.contadorBoton}
                  onPress={() => onCantidad((item.cantidad || 1) + 1)}
                  accessibilityLabel="Aumentar unidades"
                >
                  <FontAwesome6 name="plus" size={10} color={C.blanco} />
                </Pressable>
              </View>
              <View style={styles.contador}>
                <Pressable
                  style={styles.contadorBoton}
                  onPress={() => onMetros(Math.max(10, (item.metros ?? 10) - 10))}
                  accessibilityLabel="Reducir metros"
                >
                  <FontAwesome6 name="minus" size={10} color={C.blanco} />
                </Pressable>
                <Text style={styles.chipMetros}>{item.metros ?? 10} m</Text>
                <Pressable
                  style={styles.contadorBoton}
                  onPress={() => onMetros(Math.min(50, (item.metros ?? 10) + 10))}
                  accessibilityLabel="Aumentar metros"
                >
                  <FontAwesome6 name="plus" size={10} color={C.blanco} />
                </Pressable>
              </View>
            </View>
          ) : (
            <View style={styles.contador}>
              <Pressable
                style={styles.contadorBoton}
                onPress={() => onCantidad(item.cantidad - 1)}
                accessibilityLabel="Reducir cantidad"
              >
                <FontAwesome6 name="minus" size={11} color={C.blanco} />
              </Pressable>
              <Text style={styles.chipMetros}>{item.cantidad}</Text>
              <Pressable
                style={styles.contadorBoton}
                onPress={() => onCantidad(item.cantidad + 1)}
                accessibilityLabel="Aumentar cantidad"
              >
                <FontAwesome6 name="plus" size={11} color={C.blanco} />
              </Pressable>
            </View>
          )}

          <Text style={styles.itemSubtotal}>
            {formatearPrecio(
              item.precio_venta_producto * cantidadEfectiva,
            )}{" "}
            COP
          </Text>

          <Pressable
            onPress={onQuitar}
            accessibilityLabel="Eliminar producto"
            hitSlop={8}
            style={styles.eliminar}
          >
            <FontAwesome6 name="trash-can" size={14} color={C.rojoError} />
          </Pressable>
        </View>
      </View>
    </View>
  );
}

/**
 * Productos recomendados — selección de productos REALES del backend
 * (GET /productos/?limit=100, el mismo del catálogo) que NO estén ya
 * en el carrito. Reutiliza la MISMA card de Productos (un solo corazón,
 * sobre la imagen; botón de carrito full-width con stepper).
 */
function SeccionRecomendados() {
  const { items } = useCart();
  const [todos, setTodos] = useState<Producto[]>([]);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    let activo = true;
    listarProductos()
      .then((respuesta) => {
        if (activo) setTodos(respuesta.data ?? []);
      })
      .catch(() => {
        // Sin recomendaciones si falla la red: no rompemos el carrito.
      })
      .finally(() => {
        if (activo) setCargando(false);
      });
    return () => {
      activo = false;
    };
  }, []);

  const enCarrito = useMemo(
    () => new Set(items.map((item) => item.id_producto)),
    [items],
  );

  const recomendados = useMemo(
    () =>
      todos
        .filter((producto) => !enCarrito.has(producto.id_producto))
        .slice(0, CANTIDAD_RECOMENDADOS),
    [todos, enCarrito],
  );

  if (cargando || recomendados.length === 0) return null;

  return (
    <View style={styles.recomendadosWrap}>
      <View style={styles.recomendadosSeparador} />
      <Text style={styles.recomendadosTitulo}>Productos recomendados</Text>
      <View style={styles.recomendadosGrid}>
        {recomendados.map((producto) => (
          <View key={producto.id_producto} style={styles.recomendadoCelda}>
            <ProductCard producto={producto} />
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  recomendadosWrap: {
    marginTop: 8,
  },

  recomendadosSeparador: {
    height: 1,
    backgroundColor: C.grisBorde,
    marginBottom: 16,
  },

  recomendadosTitulo: {
    color: C.blanco,
    fontSize: 19,
    fontFamily: FontFamilies.bodyBold,
    marginBottom: 12,
  },

  recomendadosGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },

  recomendadoCelda: {
    flexBasis: "47%",
    flexGrow: 1,
  },

  avisoOverlay: {
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: 22,
  },

  avisoBackdrop: {
    backgroundColor: "rgba(0,0,0,0.35)",
  },

  avisoTarjeta: {
    backgroundColor: "#121212",
    borderRadius: 24,
    borderWidth: 1,
    borderColor: C.bordeOro,
    padding: 20,
    alignItems: "center",
    gap: 12,
  },

  avisoCerrar: {
    position: "absolute",
    top: 14,
    right: 14,
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 1,
    borderColor: C.grisBorde,
    alignItems: "center",
    justifyContent: "center",
  },

  avisoIcono: {
    width: 56,
    height: 56,
    borderRadius: 28,
    borderWidth: 1,
    borderColor: C.bordeOro,
    backgroundColor: "rgba(212,165,75,0.10)",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 6,
  },

  avisoTitulo: {
    color: C.blanco,
    fontSize: 19,
    fontFamily: FontFamilies.bodyBold,
    textAlign: "center",
  },

  avisoTexto: {
    color: C.grisTexto,
    fontSize: 13.5,
    lineHeight: 20,
    textAlign: "center",
  },

  avisoBotonPrimario: {
    alignSelf: "stretch",
    backgroundColor: C.oro,
    borderRadius: 12,
    minHeight: 48,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 8,
    paddingHorizontal: 16,
  },

  avisoTextoPrimario: {
    color: C.textoSobreOro,
    fontFamily: FontFamilies.button,
    fontSize: 14.5,
  },

  avisoBotonSecundario: {
    alignSelf: "stretch",
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: C.blanco,
    minHeight: 48,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16,
  },

  avisoTextoSecundario: {
    color: C.blanco,
    fontFamily: FontFamilies.button,
    fontSize: 14.5,
  },

  avisoCancelar: {
    paddingVertical: 6,
    paddingHorizontal: 12,
  },

  avisoTextoCancelar: {
    color: C.grisTexto,
    fontSize: 13,
    textDecorationLine: "underline",
  },

  contenedor: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 14,
  },

  titulo: {
    color: C.blanco,
    fontSize: 26,
    fontFamily: FontFamilies.bodyBold,
  },

  subtitulo: {
    color: C.grisTexto,
    fontSize: 13.5,
    marginTop: 4,
  },

  lista: { flex: 1 },

  listaContenido: {
    paddingBottom: 24,
    gap: 12,
  },

  item: {
    flexDirection: "row",
    gap: 12,
    backgroundColor: C.cardOscura,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: C.grisBorde,
    padding: 12,
  },

  itemImagenWrap: {
    width: 84,
    height: 84,
    borderRadius: 12,
    overflow: "hidden",
    backgroundColor: C.inputFondo,
  },

  itemImagen: { width: "100%", height: "100%" },

  itemImagenVacia: {
    alignItems: "center",
    justifyContent: "center",
  },

  itemInfo: {
    flex: 1,
    gap: 3,
  },

  itemNombre: {
    color: C.blanco,
    fontSize: 14.5,
    fontFamily: FontFamilies.bodyBold,
    lineHeight: 19,
  },

  itemPrecio: {
    color: C.oroSuave,
    fontSize: 12.5,
    fontFamily: FontFamilies.bodyMedium,
  },

  itemDetalle: {
    color: C.grisTexto,
    fontSize: 12,
  },

  itemControles: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginTop: 6,
    flexWrap: "wrap",
  },

  contador: {
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
  },

  contadorBoton: {
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: C.bordeOro,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(212,165,75,0.1)",
  },

  chipMetros: {
    color: C.blanco,
    fontSize: 14.5,
    fontFamily: FontFamilies.bodyBold,
    minWidth: 34,
    textAlign: "center",
  },

  itemSubtotal: {
    color: C.blanco,
    fontSize: 13.5,
    fontFamily: FontFamilies.bodyBold,
  },

  eliminar: { marginLeft: "auto" },

  vaciar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    alignSelf: "center",
    paddingVertical: 10,
  },

  vaciarTexto: {
    color: C.rojoError,
    fontSize: 13,
    fontFamily: FontFamilies.bodyMedium,
  },

  resumen: {
    backgroundColor: C.cardOscura,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: C.bordeOro,
    padding: 16,
    gap: 10,
  },

  resumenTitulo: {
    color: C.blanco,
    fontSize: 16.5,
    fontFamily: FontFamilies.bodyBold,
  },

  resumenFila: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },

  resumenClave: {
    color: C.grisTexto,
    fontSize: 13.5,
  },

  resumenValor: {
    color: C.blanco,
    fontSize: 13.5,
    fontFamily: FontFamilies.bodyMedium,
  },

  resumenEnvio: {
    color: C.grisTexto,
    fontSize: 12.5,
    fontStyle: "italic",
  },

  totalFila: {
    borderTopWidth: 1,
    borderTopColor: C.grisBorde,
    paddingTop: 10,
    marginTop: 2,
  },

  totalClave: {
    color: C.blanco,
    fontSize: 15.5,
    fontFamily: FontFamilies.bodyBold,
  },

  totalValor: {
    color: C.oroSuave,
    fontSize: 18,
    fontFamily: FontFamilies.bodyBold,
  },

  botonFinalizar: {
    backgroundColor: C.oro,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 4,
  },

  textoFinalizar: {
    color: C.textoSobreOro,
    fontFamily: FontFamilies.button,
    fontSize: 14.5,
  },

  hintPago: {
    color: C.grisTexto,
    fontSize: 12,
    textAlign: "center",
  },

  vacio: {
    alignItems: "center",
    paddingVertical: 60,
    gap: 12,
  },

  vacioTitulo: {
    color: C.blanco,
    fontSize: 18,
    fontFamily: FontFamilies.bodyBold,
  },

  botonOro: {
    backgroundColor: C.oro,
    borderRadius: 12,
    paddingVertical: 11,
    paddingHorizontal: 26,
    marginTop: 6,
  },

  textoBotonOro: {
    color: C.textoSobreOro,
    fontFamily: FontFamilies.button,
    fontSize: 13.5,
  },

  presionado: { opacity: 0.85 },
});
