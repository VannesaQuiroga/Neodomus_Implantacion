// ─────────────────────────────────────────────────────────────
// Detalle de producto — adaptación móvil de ProductoDetalle WEB
// (ruta /producto/:id). Lógica de variantes/colores/medidas/
// metros/precio EXACTA de la web (constants/variantes.ts),
// favoritos y agregar al carrito con la configuración elegida.
// ─────────────────────────────────────────────────────────────

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  FlatList,
} from "react-native";
import { Image } from "expo-image";
import { useLocalSearchParams, router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import FontAwesome6 from "@expo/vector-icons/FontAwesome6";

import { NeodomusColors as C, FontFamilies } from "@/constants/theme";
import PublicNavbar from "@/components/public/PublicNavbar";
import AsistenteFlotante from "@/components/public/AsistenteFlotante";
import { useFavoritos } from "@/contexts/FavoritosContext";
import { useCart } from "@/contexts/CartContext";
import {
  formatearPrecio,
  obtenerProducto,
  precioFinalDe,
  tieneDescuento,
  urlImagenProducto,
  type Producto as ProductoType,
  type ListaProductos,
} from "@/services/productos.service";
import { apiFetch } from "@/services/api";
import {
  COLOR_HEX,
  RGB_GRADIENTE,
  medidaDe,
  paletaDeColores,
} from "@/constants/variantes";

const METROS_OPCIONES = [10, 20, 30, 40, 50];
/** Altura estimada del tab bar (el tab bar real es nativo). */
const TAB_BAR_ALTO = 66;

export default function ProductoDetalleScreen() {
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [producto, setProducto] = useState<ProductoType | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [falloImagen, setFalloImagen] = useState(false);

  const [color, setColor] = useState("");
  const [tamano, setTamano] = useState("");
  const [metros, setMetros] = useState(10);
  const [cantidad, setCantidad] = useState(1);
  const [displayCantidad, setDisplayCantidad] = useState<string | undefined>(undefined);
  const [toast, setToast] = useState<string | null>(null);
  const [recomendados, setRecomendados] = useState<ProductoType[]>([]);
  const [busqueda, setBusqueda] = useState("");
  const carouselRef = useRef<FlatList>(null);
  const [scrollX, setScrollX] = useState(0);
  const CARD_W = 162;

  const { esFavorito, toggleFavorito } = useFavoritos();
  const { addItem } = useCart();

  const cargar = useCallback(async () => {
    setCargando(true);
    setError(null);
    try {
      const datos = await obtenerProducto(id as string);
      setProducto(datos);
      // Igual que la WEB: color inicial = primero de la paleta.
      setColor(paletaDeColores(datos.variantes ?? [], datos.id_cate_pr)[0]);
    } catch {
      setError("No se pudo cargar el producto.");
    } finally {
      setCargando(false);
    }
  }, [id]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  // Productos recomendados: misma categoría primero, luego las demás
  useEffect(() => {
    if (!producto?.id_cate_pr) return;
    apiFetch<ListaProductos>("/productos/?limit=100")
      .then((res) => {
        const todos = res.data ?? [];
        const mismosCat = todos.filter(
          (p: ProductoType) => p.id_cate_pr === producto.id_cate_pr && p.id_producto !== producto.id_producto,
        );
        const otrosCat = todos.filter(
          (p: ProductoType) => p.id_cate_pr !== producto.id_cate_pr && p.id_producto !== producto.id_producto,
        );
        setRecomendados([...mismosCat, ...otrosCat].slice(0, 15));
      })
      .catch(() => {});
  }, [producto?.id_cate_pr, producto?.id_producto]);

  useEffect(() => {
    if (!toast) return;
    const temporizador = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(temporizador);
  }, [toast]);

  // ── Lógica de variantes EXACTA de la WEB (ProductoDetalle.tsx) ──
  const variantes = useMemo(() => producto?.variantes ?? [], [producto]);
  const usaMedidas = useMemo(
    () => variantes.some((v) => !!medidaDe(v)),
    [variantes],
  );

  const paleta = useMemo(
    () => paletaDeColores(variantes, producto?.id_cate_pr),
    [variantes, producto?.id_cate_pr],
  );

  // Medidas disponibles para el color seleccionado (regla WEB).
  const tamanosDisponibles = useMemo(
    () =>
      Array.from(
        new Set(
          variantes
            .filter((v) => v.nombre === color)
            .map(medidaDe)
            .filter(Boolean),
        ),
      ),
    [variantes, color],
  );

  const varianteActiva = useMemo(
    () =>
      variantes.find(
        (v) => v.nombre === color && (!usaMedidas || medidaDe(v) === tamano),
      ) ?? null,
    [variantes, color, tamano, usaMedidas],
  );

  const conDescuento = producto ? tieneDescuento(producto) : false;
  const precioUnitario = varianteActiva?.precio ?? (producto ? precioFinalDe(producto) : 0);
  const esMetros = !!producto?.venta_por_metros;
  const subtotal = esMetros ? precioUnitario * metros : precioUnitario * cantidad;

  const stockDisponible = producto
    ? variantes.length > 0
      ? varianteActiva?.stock ?? 0
      : producto.stock_producto ?? 0
    : 0;

  if (cargando) {
    return (
      <View style={styles.pantalla}>
        <PublicNavbar />
        <View style={styles.centro}>
          <ActivityIndicator size="large" color={C.oro} />
          <Text style={styles.cargandoTexto}>Cargando...</Text>
        </View>
        <AsistenteFlotante />
      </View>
    );
  }

  if (error || !producto) {
    return (
      <View style={styles.pantalla}>
        <PublicNavbar />
        <View style={styles.centro}>
          <FontAwesome6 name="circle-exclamation" size={34} color={C.rojoError} />
          <Text style={styles.errorTexto}>{error}</Text>
          <Pressable
            style={({ pressed }) => [
              styles.botonOro,
              pressed && styles.presionado,
            ]}
            onPress={() => router.replace("/(tabs)/productos")}
          >
            <Text style={styles.textoBotonOro}>Volver a productos</Text>
          </Pressable>
        </View>
        <AsistenteFlotante />
      </View>
    );
  }

  const imagen = falloImagen ? null : urlImagenProducto(producto);

  const caracteristicas = (producto.caracteristicas_producto ?? "")
    .split("\n")
    .map((linea) => linea.replace(/^[-*\s]+/, "").trim())
    .filter(Boolean);

  const agregarAlCarrito = () => {
    // Validaciones con los mensajes EXACTOS de la WEB.
    if (stockDisponible <= 0) {
      setToast("No hay stock disponible para esta combinación de color/tamaño");
      return;
    }
    if (usaMedidas && !tamano) {
      setToast("Selecciona un tamaño disponible");
      return;
    }
    if (producto.venta_por_metros && (!metros || metros <= 0)) {
      setToast("Ingresa una cantidad de metros válida");
      return;
    }

    addItem(producto, {
      cantidad,
      metros,
      // Color SIEMPRE según la paleta seleccionada (como la web).
      color: color || undefined,
      tamaño: tamano || varianteActiva?.tamaño || undefined,
      medida: varianteActiva ? medidaDe(varianteActiva) || undefined : undefined,
      id_variante: varianteActiva?.id,
    });
    setToast(
      `${esMetros ? `${metros} m x ` : `${cantidad} x `}${producto.nombre_producto} agregado al carrito`,
    );
  };

  return (
    <View style={styles.pantalla}>
      {/* Navbar fijo arriba */}
      <PublicNavbar />

      {/* Barra de búsqueda */}
      <View style={styles.buscadorWrap}>
        <FontAwesome6 name="magnifying-glass" size={14} color="#9e9e9e" />
        <TextInput
          style={styles.buscador}
          placeholder="Buscar producto"
          placeholderTextColor="#9e9e9e"
          value={busqueda}
          onChangeText={setBusqueda}
          onSubmitEditing={() => {
            if (busqueda.trim()) {
              router.push({ pathname: "/(tabs)/productos", params: { busqueda: busqueda.trim() } } as never);
            }
          }}
          returnKeyType="search"
        />
        {busqueda.length > 0 && (
          <Pressable onPress={() => setBusqueda("")} hitSlop={8}>
            <FontAwesome6 name="xmark" size={14} color="#9e9e9e" />
          </Pressable>
        )}
      </View>

      {/* Contenido con scroll; el bloque de compra vive DENTRO del flujo. */}
      <ScrollView
        style={styles.scrollDetalle}
        contentContainerStyle={[
          styles.contenedor,
          { paddingBottom: TAB_BAR_ALTO + insets.bottom + 28 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* Volver — SIEMPRE al listado de Productos (como la web:
            navigate('/productos')), venga de donde venga. */}
        <Pressable
          style={styles.volver}
          onPress={() => router.replace("/(tabs)/productos")}
          hitSlop={8}
        >
          <FontAwesome6 name="chevron-left" size={15} color={C.oroSuave} />
          <Text style={styles.volverTexto}>Volver a productos</Text>
        </Pressable>

        {/* Imagen */}
        <View style={styles.zonaImagen}>
          {imagen ? (
            <Image
              source={{ uri: imagen }}
              style={styles.imagen}
              contentFit="cover"
              cachePolicy="memory-disk"
              transition={180}
              onError={() => {
                if (__DEV__) console.log(`[imagen] fallo detalle ${imagen}`);
                setFalloImagen(true);
              }}
            />
          ) : (
            <View style={[styles.imagen, styles.imagenPlaceholder]}>
              <FontAwesome6 name="box-open" size={54} color={C.oroClaro} />
            </View>
          )}

          {conDescuento && (
            <View style={styles.badgePromo}>
              <Text style={styles.badgeTexto}>
                Promoción -{producto.descuento_activo}%
              </Text>
            </View>
          )}

          <Pressable
            style={styles.corazon}
            onPress={() => toggleFavorito(producto.id_producto)}
            accessibilityLabel={
              esFavorito(producto.id_producto)
                ? "Quitar de favoritos"
                : "Agregar a favoritos"
            }
            hitSlop={8}
          >
            <FontAwesome6
              name="heart"
              size={19}
              solid={esFavorito(producto.id_producto)}
              color={esFavorito(producto.id_producto) ? "#e5484d" : C.blanco}
            />
          </Pressable>
        </View>

        <View style={styles.info}>
          {/* Chips: categoría + requiere técnico (datos reales del backend) */}
          {!!producto.nombre_categoria && (
            <View style={styles.chipsFila}>
              <View style={styles.chipCategoria}>
                <Text style={styles.chipCategoriaTexto}>
                  {producto.nombre_categoria}
                </Text>
              </View>
              {(producto.tecnicos_requeridos ?? 0) > 0 && (
                <View style={styles.chipTecnico}>
                  <FontAwesome6
                    name="screwdriver-wrench"
                    size={10}
                    color="#141414"
                  />
                  <Text style={styles.chipTecnicoTexto}>
                    {(producto.tecnicos_requeridos ?? 1) > 1
                      ? `Requiere ${producto.tecnicos_requeridos} técnicos`
                      : "Requiere un técnico"}
                  </Text>
                </View>
              )}
            </View>
          )}
          <Text style={styles.nombre}>{producto.nombre_producto}</Text>

          <View style={styles.precioFila}>
            {conDescuento && (
              <Text style={styles.precioOriginal}>
                {formatearPrecio(producto.precio_venta_producto)}
              </Text>
            )}
            <Text style={styles.precioMonto}>
              {formatearPrecio(precioUnitario)}
            </Text>
            <Text style={styles.precioSufijo}>
              COP{esMetros ? " / metro" : ""}
            </Text>
          </View>

          <Text style={styles.stock}>
            {stockDisponible > 0
              ? `Disponible · ${stockDisponible} u.`
              : "Sin stock"}
          </Text>

          {/* Color — paleta EXACTA de la WEB (variantes o fallback por categoría) */}
          {paleta.length > 0 && (
            <View style={styles.seccionVariantes}>
              <Text style={styles.tituloVariantes}>Color: {color}</Text>
              <View style={styles.swatches}>
                {paleta.map((nombreColor) => {
                  const activo = color === nombreColor;
                  const hex = COLOR_HEX[nombreColor];
                  const esRgb = nombreColor === "RGB";
                  return (
                    <Pressable
                      key={nombreColor}
                      onPress={() => setColor(nombreColor)}
                      style={[styles.swatch, activo && styles.swatchActivo]}
                      accessibilityLabel={nombreColor}
                      accessibilityState={{ selected: activo }}
                    >
                      {esRgb ? (
                        <View style={styles.swatchRgb}>
                          {RGB_GRADIENTE.map((c) => (
                            <View
                              key={c}
                              style={[
                                styles.swatchRgbSector,
                                { backgroundColor: c },
                              ]}
                            />
                          ))}
                        </View>
                      ) : (
                        <View
                          style={[
                            styles.swatchRelleno,
                            { backgroundColor: hex ?? "#888888" },
                          ]}
                        />
                      )}
                    </Pressable>
                  );
                })}
              </View>
            </View>
          )}

          {/* Medidas — solo si las variantes las definen (usaTamanos, regla WEB) */}
          {usaMedidas && tamanosDisponibles.length > 0 && (
            <View style={styles.seccionVariantes}>
              <Text style={styles.tituloVariantes}>Elige la medida:</Text>
              <View style={styles.chipsMedida}>
                {tamanosDisponibles.map((medida) => {
                  const variante = variantes.find(
                    (v) => v.nombre === color && medidaDe(v) === medida,
                  );
                  const agotada = !variante || variante.stock <= 0;
                  return (
                    <Pressable
                      key={medida}
                      disabled={agotada}
                      onPress={() => setTamano(medida)}
                      style={[
                        styles.chipMedida,
                        tamano === medida && styles.chipMedidaActiva,
                        agotada && styles.chipAgotado,
                      ]}
                    >
                      <Text
                        style={[
                          styles.chipMedidaTexto,
                          tamano === medida && styles.chipMedidaTextoActivo,
                        ]}
                      >
                        {medida}
                        {agotada ? " (agotado)" : ""}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          )}

          {/* Metros */}
          {esMetros && (
            <View style={styles.seccionVariantes}>
              <Text style={styles.tituloVariantes}>
                Elige cuántos metros quieres:
              </Text>
              <View style={styles.chipsMedida}>
                {METROS_OPCIONES.map((opcion) => (
                  <Pressable
                    key={opcion}
                    onPress={() => setMetros(opcion)}
                    style={[
                      styles.chipMedida,
                      metros === opcion && styles.chipMedidaActiva,
                    ]}
                  >
                    <Text
                      style={[
                        styles.chipMedidaTexto,
                        metros === opcion && styles.chipMedidaTextoActivo,
                      ]}
                    >
                      {opcion} m
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>
          )}

          {/* Cantidad */}
          {!esMetros && (
            <View style={styles.seccionVariantes}>
              <Text style={styles.tituloVariantes}>Cantidad:</Text>
              <View style={styles.contador}>
                <Pressable
                  style={styles.contadorBoton}
                  onPress={() => setCantidad((actual) => Math.max(1, actual - 1))}
                  accessibilityLabel="Reducir cantidad"
                >
                  <FontAwesome6 name="minus" size={13} color={C.blanco} />
                </Pressable>
                <TextInput
                  style={styles.contadorInput}
                  value={displayCantidad !== undefined ? displayCantidad : String(cantidad)}
                  onChangeText={(txt) => {
                    const limpio = txt.replace(/\D/g, "");
                    setDisplayCantidad(limpio);
                  }}
                  onBlur={() => {
                    const raw = (displayCantidad ?? String(cantidad)).trim();
                    let num = parseInt(raw, 10);
                    if (raw === "" || isNaN(num) || num < 1) num = 1;
                    if (stockDisponible > 0 && num > stockDisponible) num = stockDisponible;
                    setCantidad(num);
                    setDisplayCantidad(undefined);
                  }}
                  keyboardType="numeric"
                  maxLength={4}
                  selectTextOnFocus
                />
                <Pressable
                  style={styles.contadorBoton}
                  onPress={() => setCantidad((actual) => actual + 1)}
                  accessibilityLabel="Aumentar cantidad"
                >
                  <FontAwesome6 name="plus" size={13} color={C.blanco} />
                </Pressable>
              </View>
            </View>
          )}

          {/* Descripción */}
          <Text style={styles.descripcionTitulo}>Descripción</Text>
          <Text style={styles.descripcion}>
            {producto.descripcion_producto ||
              `El ${producto.nombre_producto} pertenece a la categoría de ${producto.nombre_categoria}. Diseñado para integrarse a la perfección en tu hogar inteligente, combina tecnología confiable con una instalación sencilla.`}
          </Text>

          {/* Características */}
          {caracteristicas.length > 0 && (
            <>
              <Text style={styles.descripcionTitulo}>
                Características principales
              </Text>
              {caracteristicas.map((linea) => (
                <View key={linea} style={styles.caracteristica}>
                  <FontAwesome6 name="check" size={12} color={C.oroClaro} />
                  <Text style={styles.caracteristicaTexto}>{linea}</Text>
                </View>
              ))}
            </>
          )}

          {/* Beneficios fijos de la web */}
          <View style={styles.beneficios}>
            <Beneficio icono="truck-fast" texto="Envío seguro a todo el país" />
            <Beneficio icono="shield-halved" texto="Garantía oficial Neodomus" />
            {(producto.tecnicos_requeridos ?? 1) > 0 && (
              <Beneficio
                icono="screwdriver-wrench"
                texto={`Requiere ${(producto.tecnicos_requeridos ?? 1) > 1 ? `${producto.tecnicos_requeridos} técnicos` : "1 técnico"} para su instalación`}
              />
            )}
          </View>

          {/* Bloque de compra DENTRO del flujo del scroll: nunca flota
              ni tapa descripción/garantías. Se actualiza con la cantidad. */}
          <View style={styles.bloqueCompra}>
            <View style={styles.compraFila}>
              <View>
                <Text style={styles.subtotalEtiqueta}>Subtotal</Text>
                <Text style={styles.subtotalValor}>
                  {formatearPrecio(subtotal)} COP
                </Text>
              </View>
              {esMetros && (
                <Text style={styles.compraMetroHint}>{metros} m</Text>
              )}
            </View>

            <Pressable
              style={({ pressed }) => [
                styles.botonAgregar,
                pressed && styles.presionado,
                stockDisponible <= 0 && !esMetros && styles.botonDeshabilitado,
              ]}
              onPress={agregarAlCarrito}
              disabled={stockDisponible <= 0 && !esMetros}
            >
              <Text style={styles.textoBotonOroNegro}>
                Agregar al carrito
              </Text>
              {/* Icono a la DERECHA, en caja fija: siempre visible */}
              <View style={styles.botonIconoCaja}>
                <FontAwesome6
                  name="cart-shopping"
                  size={15}
                  color={C.textoSobreOro}
                />
              </View>
            </Pressable>

            {stockDisponible <= 0 && !esMetros && (
              <Text style={styles.sinStockNota}>
                Sin stock en esta combinación.
              </Text>
            )}
          </View>
        </View>

        {/* Recomendados */}
        {recomendados.length > 0 && (
          <View style={styles.recomendados}>
            <Text style={styles.recomendadosTitulo}>También te puede interesar</Text>
            <View style={styles.recomendadosCarrousel}>
              <Pressable
                style={styles.flechaIzq}
                onPress={() => carouselRef.current?.scrollToOffset({ offset: Math.max(0, scrollX - 170), animated: true })}
                hitSlop={16}
              >
                <FontAwesome6 name="chevron-left" size={20} color={C.oroSuave} />
              </Pressable>
              <FlatList
              ref={carouselRef}
              data={recomendados}
              horizontal
              showsHorizontalScrollIndicator={false}
              keyExtractor={(item) => String(item.id_producto)}
              contentContainerStyle={styles.recomendadosLista}
              onScroll={(e) => setScrollX(e.nativeEvent.contentOffset.x)}
              scrollEventThrottle={16}
              renderItem={({ item: p }) => {
                const img = urlImagenProducto(p);
                const precio = precioFinalDe(p);
                return (
                  <Pressable
                    style={styles.recomendadoCard}
                    onPress={() => router.push(`/(tabs)/producto/${p.id_producto}` as never)}
                  >
                    {img ? (
                      <Image source={{ uri: img }} style={styles.recomendadoImg} contentFit="cover" cachePolicy="memory-disk" />
                    ) : (
                      <View style={[styles.recomendadoImg, styles.recomendadoImgPlaceholder]}>
                        <FontAwesome6 name="image" size={20} color="#555" />
                      </View>
                    )}
                    {tieneDescuento(p) && (
                      <View style={styles.recomendadoBadge}>
                        <Text style={styles.recomendadoBadgeTxt}>-{p.descuento_activo}%</Text>
                      </View>
                    )}
                    <View style={styles.recomendadoInfo}>
                      <Text style={styles.recomendadoNombre} numberOfLines={2}>{p.nombre_producto}</Text>
                      <Text style={styles.recomendadoPrecio}>{formatearPrecio(precio)}</Text>
                    </View>
                  </Pressable>
                );
              }}
            />
              <Pressable
                style={styles.flechaDer}
                onPress={() => carouselRef.current?.scrollToOffset({ offset: scrollX + 170, animated: true })}
                hitSlop={16}
              >
                <FontAwesome6 name="chevron-right" size={20} color={C.oroSuave} />
              </Pressable>
            </View>
          </View>
        )}
      </ScrollView>

      {toast && (
        <View style={styles.toastWrap} pointerEvents="none">
          <View style={styles.toast}>
            <Text style={styles.toastTexto}>{toast}</Text>
          </View>
        </View>
      )}

      <AsistenteFlotante />
    </View>
  );
}

function Beneficio({ icono, texto }: { icono: string; texto: string }) {
  return (
    <View style={styles.beneficio}>
      <FontAwesome6 name={(icono as never) || "check"} size={13} color={C.oroClaro} />
      <Text style={styles.beneficioTexto}>{texto}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pantalla: {
    flex: 1,
    backgroundColor: "#000000",
  },

  scrollDetalle: { flex: 1 },

  contenedor: {
    paddingHorizontal: 14,
    paddingTop: 10,
  },

  buscadorWrap: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#1c1c1c",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    borderRadius: 12,
    marginHorizontal: 14,
    marginTop: 8,
    marginBottom: 4,
    paddingHorizontal: 12,
    gap: 8,
  },

  buscador: {
    flex: 1,
    color: "#ffffff",
    fontSize: 14,
    paddingVertical: 10,
  },

  volver: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    paddingVertical: 8,
    alignSelf: "flex-start",
  },

  volverTexto: {
    color: "#f0c96f",
    fontSize: 14,
    fontFamily: FontFamilies.bodyMedium,
  },

  zonaImagen: {
    width: "100%",
    aspectRatio: 1,
    borderRadius: 20,
    overflow: "hidden",
    backgroundColor: "#1c1c1c",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.09)",
  },

  imagen: { width: "100%", height: "100%" },

  imagenPlaceholder: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#0f0f0f",
  },

  badgePromo: {
    position: "absolute",
    left: 10,
    bottom: 10,
    backgroundColor: "#e5484d",
    borderRadius: 999,
    paddingVertical: 4,
    paddingHorizontal: 10,
  },

  badgeTexto: {
    color: "#ffffff",
    fontSize: 12,
    fontWeight: "700",
  },

  corazon: {
    position: "absolute",
    right: 10,
    top: 10,
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: "rgba(0,0,0,0.55)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.09)",
    alignItems: "center",
    justifyContent: "center",
  },

  info: {
    paddingTop: 16,
    gap: 9,
  },

  chipsFila: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    width: "100%",
  },

  chipCategoria: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(212,165,75,0.28)",
    backgroundColor: "rgba(212,165,75,0.08)",
    paddingVertical: 5,
    paddingHorizontal: 11,
    maxWidth: "100%",
    flexShrink: 1,
    minWidth: 0,
  },

  chipCategoriaTexto: {
    color: "#f0c96f",
    fontSize: 11.5,
    fontFamily: FontFamilies.bodyMedium,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },

  chipTecnico: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: 999,
    backgroundColor: "#d4a54b",
    paddingVertical: 5,
    paddingHorizontal: 11,
    maxWidth: "100%",
    flexShrink: 1,
    minWidth: 0,
  },

  chipTecnicoTexto: {
    color: "#141414",
    fontSize: 11.5,
    fontFamily: FontFamilies.button,
    flexShrink: 1,
  },

  nombre: {
    color: "#ffffff",
    fontSize: 21,
    lineHeight: 27,
    fontFamily: FontFamilies.bodyBold,
  },

  precioFila: {
    flexDirection: "row",
    alignItems: "baseline",
    flexWrap: "wrap",
    gap: 8,
  },

  precioOriginal: {
    color: "#bdbdbd",
    fontSize: 14,
    textDecorationLine: "line-through",
  },

  precioMonto: {
    color: "#f0c96f",
    fontSize: 22,
    fontFamily: FontFamilies.bodyBold,
  },

  precioSufijo: {
    color: "#bdbdbd",
    fontSize: 13,
  },

  stock: {
    color: "#7ee29a",
    fontSize: 13,
    fontFamily: FontFamilies.bodyMedium,
  },

  seccionVariantes: {
    gap: 8,
    marginTop: 6,
  },

  tituloVariantes: {
    color: "#ffffff",
    fontSize: 14.5,
    fontFamily: FontFamilies.bodyBold,
  },

  swatches: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },

  swatch: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 2,
    borderColor: "transparent",
    alignItems: "center",
    justifyContent: "center",
    padding: 3,
    overflow: "hidden",
  },

  swatchRelleno: {
    width: "100%",
    height: "100%",
    borderRadius: 14,
  },

  swatchRgb: {
    flexDirection: "row",
    width: "100%",
    height: "100%",
    borderRadius: 14,
    overflow: "hidden",
  },

  swatchRgbSector: { flex: 1 },

  swatchActivo: {
    borderColor: "#d4a54b",
  },

  swatchAgotado: {
    opacity: 0.35,
  },

  chipsMedida: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },

  chipMedida: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(212,165,75,0.28)",
    paddingVertical: 8,
    paddingHorizontal: 14,
    backgroundColor: "rgba(212,165,75,0.08)",
  },

  chipMedidaActiva: {
    backgroundColor: "#caa24d",
    borderColor: "#caa24d",
  },

  chipAgotado: { opacity: 0.45 },

  chipMedidaTexto: {
    color: "#f0c96f",
    fontSize: 13,
    fontFamily: FontFamilies.bodyMedium,
  },

  chipMedidaTextoActivo: {
    color: "#141414",
    fontFamily: FontFamilies.button,
  },

  contador: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
  },

  contadorBoton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 1,
    borderColor: "#d4a54b",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(212,165,75,0.1)",
  },

  contadorValor: {
    color: "#ffffff",
    fontSize: 17,
    fontFamily: FontFamilies.bodyBold,
    minWidth: 24,
    textAlign: "center",
  },

  contadorInput: {
    color: "#ffffff",
    fontSize: 17,
    fontFamily: FontFamilies.bodyBold,
    minWidth: 40,
    textAlign: "center",
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.2)",
    paddingVertical: 2,
  },

  descripcionTitulo: {
    color: "#ffffff",
    fontSize: 16,
    fontFamily: FontFamilies.bodyBold,
    marginTop: 10,
  },

  descripcion: {
    color: "#bdbdbd",
    fontSize: 14.5,
    lineHeight: 23,
    fontFamily: FontFamilies.body,
  },

  caracteristica: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 9,
  },

  caracteristicaTexto: {
    color: "#ffffff",
    fontSize: 14,
    lineHeight: 21,
    flex: 1,
  },

  beneficios: {
    marginTop: 12,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.09)",
    paddingTop: 12,
    gap: 9,
  },

  beneficio: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },

  beneficioTexto: {
    color: "#ffffff",
    fontSize: 13.5,
    fontFamily: FontFamilies.bodyMedium,
  },

  bloqueCompra: {
    marginTop: 18,
    backgroundColor: "#161616",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(212,165,75,0.28)",
    padding: 14,
    gap: 12,
  },

  compraFila: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
  },

  compraMetroHint: {
    color: "#bdbdbd",
    fontSize: 13,
    fontFamily: FontFamilies.bodyMedium,
  },

  sinStockNota: {
    color: "#f0858a",
    fontSize: 12.5,
    textAlign: "center",
  },

  subtotalEtiqueta: {
    color: "#bdbdbd",
    fontSize: 11.5,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },

  subtotalValor: {
    color: "#f0c96f",
    fontSize: 20,
    fontFamily: FontFamilies.bodyBold,
  },

  botonAgregar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#caa24d",
    borderRadius: 12,
    minHeight: 52,
    paddingLeft: 16,
    paddingRight: 10,
    gap: 10,
  },

  botonIconoCaja: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.12)",
  },

  botonDeshabilitado: { opacity: 0.5 },

  textoBotonOroNegro: {
    color: "#141414",
    fontFamily: FontFamilies.button,
    fontSize: 14.5,
  },

  textoBotonOro: {
    color: "#141414",
    fontFamily: FontFamilies.button,
    fontSize: 13.5,
  },

  botonOro: {
    backgroundColor: "#caa24d",
    borderRadius: 12,
    paddingVertical: 11,
    paddingHorizontal: 26,
    marginTop: 6,
  },

  presionado: { opacity: 0.85 },

  centro: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 80,
    paddingHorizontal: 30,
    gap: 12,
  },

  cargandoTexto: {
    color: "#bdbdbd",
    fontSize: 14.5,
  },

  errorTexto: {
    color: "#bdbdbd",
    fontSize: 14,
    textAlign: "center",
  },

  toastWrap: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "flex-end",
    paddingBottom: 90,
  },

  toast: {
    backgroundColor: "rgba(0,0,0,0.92)",
    borderWidth: 1,
    borderColor: "#c9a227",
    borderRadius: 40,
    paddingVertical: 10,
    paddingHorizontal: 20,
  },

  toastTexto: {
    color: "#f0c96f",
    fontSize: 13.5,
    fontFamily: FontFamilies.bodyMedium,
    textAlign: "center",
  },

  // ── Recomendados ──
  recomendados: {
    marginTop: 24,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.09)",
    paddingTop: 18,
  },
  recomendadosTitulo: {
    color: "#ffffff",
    fontSize: 16,
    fontFamily: FontFamilies.bodyBold,
    marginBottom: 14,
  },
  recomendadosWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  recomendadosCarrousel: {
    flexDirection: "row",
    alignItems: "center",
  },
  flechaIzq: {
    padding: 8,
    marginRight: 4,
  },
  flechaDer: {
    padding: 8,
    marginLeft: 4,
  },
  recomendadosLista: {
    gap: 12,
    paddingRight: 14,
  },
  recomendadoCard: {
    width: 150,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    borderRadius: 14,
    overflow: "hidden",
  },
  recomendadoImg: {
    width: "100%",
    aspectRatio: 1,
    backgroundColor: "#0f0f0f",
  },
  recomendadoImgPlaceholder: {
    alignItems: "center",
    justifyContent: "center",
  },
  recomendadoBadge: {
    position: "absolute",
    top: 6,
    left: 6,
    backgroundColor: "#e5484d",
    borderRadius: 8,
    paddingVertical: 2,
    paddingHorizontal: 7,
  },
  recomendadoBadgeTxt: {
    color: "#fff",
    fontSize: 10,
    fontWeight: "700",
  },
  recomendadoInfo: {
    padding: 10,
    gap: 4,
  },
  recomendadoNombre: {
    color: "#ffffff",
    fontSize: 12,
    fontFamily: FontFamilies.bodyMedium,
    lineHeight: 16,
  },
  recomendadoPrecio: {
    color: "#caa24d",
    fontSize: 14,
    fontFamily: FontFamilies.bodyBold,
  },
});
