// ─────────────────────────────────────────────────────────────
// Tarjeta de producto — adaptación móvil del catálogo WEB
// (mismos datos, precios, stock, metraje y validaciones).
// Diseño limpio, sin espacios vacíos, sin desbordes.
// ─────────────────────────────────────────────────────────────

import React, { useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { Image } from "expo-image";
import { router, type Href } from "expo-router";
import FontAwesome6 from "@expo/vector-icons/FontAwesome6";

import { NeodomusColors as C, FontFamilies } from "@/constants/theme";
import {
  formatearPrecio,
  precioFinalDe,
  tieneDescuento,
  urlImagenProducto,
  type Producto,
} from "@/services/productos.service";
import { useFavoritos } from "@/contexts/FavoritosContext";
import { useCart } from "@/contexts/CartContext";

interface ProductCardProps {
  producto: Producto;
}

const METROS_OPCIONES = [10, 20, 30, 40, 50];

export default function ProductCard({ producto }: ProductCardProps) {
  const { esFavorito, toggleFavorito } = useFavoritos();
  const { addItem, items } = useCart();
  const prevItemsLen = useRef(items.length);
  const [falloImagen, setFalloImagen] = useState(false);
  const [cantidad, setCantidad] = useState(1);
  const [displayCantidad, setDisplayCantidad] = useState<string | undefined>(undefined);
  const [metros, setMetros] = useState(10);
  const [unidades, setUnidades] = useState(1);
  const [displayUnidades, setDisplayUnidades] = useState<string | undefined>(undefined);
  const [mostrarMetros, setMostrarMetros] = useState(false);
  const [agregando, setAgregando] = useState(false);

  // Reiniciar selección tras compra exitosa (carrito vaciado). Solo cuando
  // el carrito pasa de tener items a 0 (pago APROBADO), no en pendiente/rechazado.
  useEffect(() => {
    if (prevItemsLen.current > 0 && items.length === 0) {
      setCantidad(1);
      setDisplayCantidad(undefined);
      setUnidades(1);
      setDisplayUnidades(undefined);
      setMetros(10);
      setMostrarMetros(false);
    }
    prevItemsLen.current = items.length;
  }, [items.length]);

  const favorito = esFavorito(producto.id_producto);
  const conDescuento = tieneDescuento(producto);
  const precioFinal = precioFinalDe(producto);
  const imagen = falloImagen ? null : urlImagenProducto(producto);
  const esPorMetros = !!producto.venta_por_metros;

  const stockTotal = React.useMemo(() => {
    if (producto.variantes && producto.variantes.length > 0) {
      return producto.variantes.reduce((a, v) => a + (v.stock || 0), 0);
    }
    return producto.stock_producto ?? Infinity;
  }, [producto]);

  const stockDisponible = Number.isFinite(stockTotal) ? stockTotal : null;
  const esStockAgotado = stockDisponible !== null && stockDisponible <= 0;
  const esStockBajo = stockDisponible !== null && stockDisponible > 0 && stockDisponible <= 5;
  const totalMetros = metros * unidades;
  // Precio mostrado en tarjeta: para productos sin metraje es unitario (no cambia con cantidad).
  // Para productos con metraje depende solo del metraje seleccionado, no de la cantidad de unidades.
  const precioMostrar = esPorMetros ? precioFinal * metros : precioFinal;
  const precioOriginalMostrar = esPorMetros ? producto.precio_venta_producto * metros : producto.precio_venta_producto;

  const abrirDetalle = () =>
    router.push(`/(tabs)/producto/${producto.id_producto}` as Href);

  const handleAdd = () => {
    if (agregando) return;
    setAgregando(true);
    setTimeout(() => setAgregando(false), 600);
    if (esPorMetros) {
      if (totalMetros > stockTotal) return;
      addItem(producto, { cantidad: unidades, metros });
    } else {
      if (Number.isFinite(stockTotal) && cantidad > stockTotal) return;
      if (esStockAgotado) return;
      addItem(producto, { cantidad });
    }
  };

  const disminuirCantidad = () => {
    setDisplayCantidad(undefined);
    setCantidad((c) => Math.max(1, c - 1));
  };
  const aumentarCantidad = () => {
    setDisplayCantidad(undefined);
    setCantidad((c) => {
      if (Number.isFinite(stockTotal) && c >= stockTotal) return c;
      return c + 1;
    });
  };
  const disminuirUnidades = () => {
    setDisplayUnidades(undefined);
    setUnidades((u) => Math.max(1, u - 1));
  };
  const aumentarUnidades = () => {
    setDisplayUnidades(undefined);
    const maxU = Number.isFinite(stockTotal) ? Math.max(1, Math.floor(stockTotal / metros) || 1) : Infinity;
    setUnidades((u) => (u >= maxU ? u : u + 1));
  };
  const handleMetrosChange = (m: number) => {
    setMetros(m);
    setMostrarMetros(false);
    if (Number.isFinite(stockTotal) && m * unidades > stockTotal) {
      const maxU = Math.max(1, Math.floor(stockTotal / m) || 1);
      if (unidades > maxU) setUnidades(maxU);
    }
  };

  // Validación al terminar edición manual (onBlur / onSubmit)
  const confirmarCantidad = () => {
    const raw = (displayCantidad ?? String(cantidad)).trim();
    let num = parseInt(raw, 10);
    if (raw === "" || isNaN(num) || num < 1) num = 1;
    if (Number.isFinite(stockTotal) && num > stockTotal) num = stockTotal as number;
    if (num < 0) num = 1;
    setCantidad(num);
    setDisplayCantidad(undefined);
  };
  const confirmarUnidades = () => {
    const raw = (displayUnidades ?? String(unidades)).trim();
    let num = parseInt(raw, 10);
    if (raw === "" || isNaN(num) || num < 1) num = 1;
    const maxU = Number.isFinite(stockTotal) ? Math.max(1, Math.floor((stockTotal as number) / metros) || 1) : Infinity;
    if (Number.isFinite(maxU) && num > (maxU as number)) num = maxU as number;
    if (num < 0) num = 1;
    setUnidades(num);
    setDisplayUnidades(undefined);
  };

  return (
    <View style={styles.tarjeta}>
      <View style={styles.zonaImagen}>
        <Pressable onPress={abrirDetalle} style={styles.imagenContenedor}>
          {imagen ? (
            <Image
              source={{ uri: imagen }}
              style={styles.imagen}
              contentFit="cover"
              transition={180}
              cachePolicy="memory-disk"
              onError={() => {
                if (__DEV__) console.log(`[imagen] fallo carga ${imagen}`);
                setFalloImagen(true);
              }}
            />
          ) : (
            <View style={[styles.imagen, styles.imagenPlaceholder]}>
              <FontAwesome6 name="box-open" size={30} color={C.oroClaro} />
            </View>
          )}
        </Pressable>

        {conDescuento && (
          <View style={styles.badgeDescuento}>
            <Text style={styles.badgeTexto}>-{producto.descuento_activo}%</Text>
          </View>
        )}

        {!!producto.es_nuevo && (
          <View style={styles.badgeNuevo}>
            <Text style={styles.badgeNuevoTexto}>Nuevo</Text>
          </View>
        )}

        <Pressable
          style={styles.corazon}
          onPress={() => toggleFavorito(producto.id_producto)}
          hitSlop={8}
        >
          <FontAwesome6
            name="heart"
            size={17}
            solid={favorito}
            color={favorito ? "#e5484d" : C.blanco}
          />
        </Pressable>
      </View>

      <View style={styles.contenido}>
        {/* ── Bloque superior: categoría + técnicos (altura reservada) ── */}
        <View style={styles.bloqueChips}>
          {!!producto.nombre_categoria || (producto.tecnicos_requeridos ?? 0) > 0 ? (
            <View style={styles.chipsFila}>
              {!!producto.nombre_categoria && (
                <View style={styles.chipCategoria}>
                  <Text style={styles.categoria} numberOfLines={1}>
                    {producto.nombre_categoria}
                  </Text>
                </View>
              )}
              {(producto.tecnicos_requeridos ?? 0) > 0 && (
                <View style={styles.chipTecnico}>
                  <FontAwesome6 name="screwdriver-wrench" size={9} color="#141414" />
                  <Text style={styles.chipTecnicoTexto}>
                    {(producto.tecnicos_requeridos ?? 1) > 1
                      ? `Requiere ${producto.tecnicos_requeridos} técnicos`
                      : "Requiere un técnico"}
                  </Text>
                </View>
              )}
            </View>
          ) : (
            <View style={styles.chipsPlaceholder} />
          )}
        </View>

        {/* ── Nombre con altura fija (2 líneas) para alineación ── */}
        <Pressable onPress={abrirDetalle} style={styles.nombreWrap}>
          <Text style={styles.nombre} numberOfLines={2}>
            {producto.nombre_producto}
          </Text>
        </Pressable>

        {/* ── Bloque precio: altura fija — precio base no cambia con cantidad unidades ── */}
        <View style={styles.bloquePrecio}>
          <View style={styles.precioFila}>
            {conDescuento && (
              <Text style={styles.precioOriginal}>
                {formatearPrecio(precioOriginalMostrar)}
              </Text>
            )}
            <Text style={styles.precioMonto}>{formatearPrecio(precioMostrar)}</Text>
            <Text style={styles.precioSufijo}>COP</Text>
          </View>
          <View style={styles.precioDetalleWrap}>
            {esPorMetros ? (
              <Text style={styles.precioDetalle} numberOfLines={1}>
                {precioFinal.toLocaleString()} COP / metro · {metros} m
              </Text>
            ) : (
              <Text style={styles.precioDetallePlaceholder} numberOfLines={1} />
            )}
          </View>
        </View>

        {/* ── Stock con altura fija (siempre visible placeholder si es null) ── */}
        <View style={styles.stockFilaWrap}>
          {stockDisponible !== null ? (
            <View style={styles.stockFila}>
              <View style={[styles.stockDot, esStockAgotado ? styles.dotAgotado : esStockBajo ? styles.dotBajo : styles.dotOk]} />
              <Text style={[styles.stockTexto, esStockAgotado && styles.stockTextoAgotado]} numberOfLines={1}>
                {esStockAgotado ? "Sin stock" : `Disponible: ${stockDisponible} ${esPorMetros ? "m" : stockDisponible === 1 ? "unidad" : "unidades"}`}
              </Text>
            </View>
          ) : (
            <View style={styles.stockPlaceholder} />
          )}
        </View>

        {/* ── Controles: cantidad alineada en todas las tarjetas ── */}
        {esPorMetros ? (
          <View style={styles.metrosBloque}>
            <View style={styles.cantidadFila}>
              <Text style={styles.cantidadLabel}>Cantidad:</Text>
              <View style={styles.cantidadControl}>
                <Pressable onPress={disminuirUnidades} style={styles.cantidadBoton} hitSlop={6}>
                  <FontAwesome6 name="minus" size={10} color={C.blanco} />
                </Pressable>
                <TextInput
                  style={styles.cantidadInput}
                  value={displayUnidades !== undefined ? displayUnidades : String(unidades)}
                  onChangeText={(val) => {
                    const limpio = val.replace(/[^0-9]/g, "");
                    if (limpio === "") {
                      setDisplayUnidades("");
                      return;
                    }
                    let num = parseInt(limpio, 10);
                    const maxU = Number.isFinite(stockTotal) ? Math.max(1, Math.floor(stockTotal / metros) || 1) : Infinity;
                    if (Number.isFinite(maxU) && num > (maxU as number)) num = maxU as number;
                    setDisplayUnidades(String(num));
                  }}
                  onBlur={confirmarUnidades}
                  onSubmitEditing={confirmarUnidades}
                  keyboardType="number-pad"
                  maxLength={4}
                  selectTextOnFocus
                  returnKeyType="done"
                  placeholder="1"
                  placeholderTextColor="#6b6b6b"
                />
                <Pressable
                  onPress={aumentarUnidades}
                  disabled={Number.isFinite(stockTotal) && unidades >= Math.max(1, Math.floor(stockTotal / metros) || 1)}
                  style={[styles.cantidadBoton, Number.isFinite(stockTotal) && unidades >= Math.max(1, Math.floor(stockTotal / metros) || 1) && styles.botonDeshabilitado]}
                  hitSlop={6}
                >
                  <FontAwesome6 name="plus" size={10} color={C.blanco} />
                </Pressable>
              </View>
            </View>
            <Pressable
              style={styles.metrosSelector}
              onPress={() => setMostrarMetros((v) => !v)}
            >
              <Text style={styles.metrosSelectorTexto}>{metros} metros</Text>
              <FontAwesome6 name={mostrarMetros ? "chevron-up" : "chevron-down"} size={10} color={C.oroSuave} />
            </Pressable>
            {mostrarMetros && (
              <View style={styles.metrosOpciones}>
                {METROS_OPCIONES.map((m) => (
                  <Pressable
                    key={m}
                    onPress={() => handleMetrosChange(m)}
                    style={[styles.metroOpcion, metros === m && styles.metroOpcionActiva]}
                  >
                    <Text style={[styles.metroOpcionTexto, metros === m && styles.metroOpcionTextoActiva]}>{m} metros</Text>
                  </Pressable>
                ))}
              </View>
            )}
          </View>
        ) : (
          <View style={styles.bloqueCantidadSinMetraje}>
            <View style={styles.cantidadFila}>
              <Text style={styles.cantidadLabel}>Cantidad:</Text>
              <View style={styles.cantidadControl}>
                <Pressable onPress={disminuirCantidad} style={styles.cantidadBoton} hitSlop={8}>
                  <FontAwesome6 name="minus" size={10} color={C.blanco} />
                </Pressable>
                <TextInput
                  style={styles.cantidadInput}
                  value={displayCantidad !== undefined ? displayCantidad : String(cantidad)}
                  onChangeText={(val) => {
                    const limpio = val.replace(/[^0-9]/g, "");
                    if (limpio === "") {
                      setDisplayCantidad("");
                      return;
                    }
                    let num = parseInt(limpio, 10);
                    if (Number.isFinite(stockTotal) && num > stockTotal) num = stockTotal as number;
                    setDisplayCantidad(String(num));
                  }}
                  onBlur={confirmarCantidad}
                  onSubmitEditing={confirmarCantidad}
                  keyboardType="number-pad"
                  maxLength={4}
                  selectTextOnFocus
                  returnKeyType="done"
                  placeholder="1"
                  placeholderTextColor="#6b6b6b"
                />
                <Pressable
                  onPress={aumentarCantidad}
                  disabled={Number.isFinite(stockTotal) && cantidad >= stockTotal}
                  style={[styles.cantidadBoton, Number.isFinite(stockTotal) && cantidad >= stockTotal && styles.botonDeshabilitado]}
                  hitSlop={8}
                >
                  <FontAwesome6 name="plus" size={10} color={C.blanco} />
                </Pressable>
              </View>
            </View>
            <View style={styles.metrajePlaceholder} />
          </View>
        )}

        {/* Variantes chips compactos — altura reservada para alineación */}
        {producto.variantes && producto.variantes.length > 0 ? (
          <View style={styles.variantesFila}>
            {producto.variantes.slice(0, 3).map((v) => (
              <View key={v.id} style={[styles.varianteChip, (v.stock || 0) <= 0 && styles.varianteAgotada]}>
                {v.hex ? <View style={[styles.varianteDot, { backgroundColor: v.hex }]} /> : null}
                <Text style={styles.varianteTexto} numberOfLines={1}>
                  {v.etiqueta_medida || v.tamaño || v.nombre} · {v.stock}
                </Text>
              </View>
            ))}
            {producto.variantes.length > 3 && (
              <View style={styles.varianteChipMas}>
                <Text style={styles.varianteTexto}>+{producto.variantes.length - 3}</Text>
              </View>
            )}
          </View>
        ) : (
          <View style={styles.variantesPlaceholder} />
        )}

        <Pressable
          style={({ pressed }) => [styles.agregar, pressed && styles.presionado, (agregando || esStockAgotado) && styles.agregarDeshabilitado]}
          onPress={handleAdd}
          disabled={!!esStockAgotado || agregando}
        >
          <Text style={styles.agregarTexto}>{agregando ? "Agregando..." : esStockAgotado ? "Sin stock" : "Agregar al carrito"}</Text>
          <View style={styles.agregarIconoCaja}>
            <FontAwesome6 name="cart-shopping" size={14} color={C.textoSobreOro} />
          </View>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  tarjeta: {
    flex: 1,
    width: "100%",
    minWidth: 0,
    backgroundColor: C.cardOscura,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: C.grisBorde,
    overflow: "hidden",
  },
  zonaImagen: {
    width: "100%",
    aspectRatio: 4 / 3,
    backgroundColor: C.cardOscuraAlt,
    overflow: "hidden",
  },
  imagenContenedor: { flex: 1 },
  imagen: { width: "100%", height: "100%" },
  imagenPlaceholder: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: C.inputFondo,
  },
  badgeDescuento: {
    position: "absolute",
    left: 8,
    bottom: 8,
    backgroundColor: "#e5484d",
    borderRadius: 999,
    paddingVertical: 3,
    paddingHorizontal: 8,
  },
  badgeTexto: {
    color: C.blanco,
    fontSize: 11,
    fontWeight: "700",
  },
  badgeNuevo: {
    position: "absolute",
    left: 8,
    top: 8,
    backgroundColor: C.oroClaro,
    borderRadius: 999,
    paddingVertical: 3,
    paddingHorizontal: 9,
  },
  badgeNuevoTexto: {
    color: C.textoSobreOro,
    fontSize: 11,
    fontWeight: "700",
  },
  corazon: {
    position: "absolute",
    right: 8,
    top: 8,
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: "rgba(0,0,0,0.55)",
    borderWidth: 1,
    borderColor: C.grisBorde,
    alignItems: "center",
    justifyContent: "center",
  },
  contenido: {
    flex: 1,
    padding: 10,
    paddingTop: 8,
    gap: 6,
    width: "100%",
    minWidth: 0,
  },
  bloqueChips: { minHeight: 26, justifyContent: "center", width: "100%" },
  chipsPlaceholder: { height: 18 },
  nombreWrap: { minHeight: 36, justifyContent: "center", width: "100%" },
  bloquePrecio: { gap: 2, minHeight: 34, width: "100%" },
  precioDetalleWrap: { minHeight: 14, justifyContent: "center" },
  precioDetallePlaceholder: { height: 11 },
  stockFilaWrap: { minHeight: 18, justifyContent: "center", width: "100%" },
  stockPlaceholder: { height: 7 },
  categoria: {
    color: C.oroSuave,
    fontSize: 11,
    fontFamily: FontFamilies.bodyMedium,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  chipsFila: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    width: "100%",
    minWidth: 0,
  },
  chipCategoria: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: C.bordeOro,
    backgroundColor: "rgba(212,165,75,0.08)",
    paddingVertical: 4,
    paddingHorizontal: 9,
    maxWidth: "100%",
    flexShrink: 1,
    minWidth: 0,
  },
  chipTecnico: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    borderRadius: 999,
    backgroundColor: C.oroClaro,
    paddingVertical: 4,
    paddingHorizontal: 9,
    maxWidth: "100%",
    flexShrink: 1,
    minWidth: 0,
  },
  chipTecnicoTexto: {
    color: C.textoSobreOro,
    fontSize: 10,
    fontFamily: FontFamilies.button,
    flexShrink: 1,
  },
  nombre: {
    color: C.blanco,
    fontSize: 13,
    lineHeight: 17,
    fontFamily: FontFamilies.bodyBold,
    flexShrink: 1,
  },
  precioFila: {
    flexDirection: "row",
    alignItems: "baseline",
    flexWrap: "wrap",
    gap: 6,
    width: "100%",
    minWidth: 0,
  },
  precioOriginal: {
    color: C.grisTexto,
    fontSize: 12.5,
    textDecorationLine: "line-through",
  },
  precioMonto: {
    color: C.oroSuave,
    fontSize: 15,
    fontFamily: FontFamilies.bodyBold,
  },
  precioSufijo: {
    color: C.grisTexto,
    fontSize: 11.5,
  },
  precioDetalle: {
    color: "#bdbdbd",
    fontSize: 11,
    fontFamily: FontFamilies.bodyMedium,
    marginTop: -2,
  },
  stockFila: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    width: "100%",
    minWidth: 0,
  },
  stockDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  dotOk: { backgroundColor: "#4ade80" },
  dotBajo: { backgroundColor: "#f0c35a" },
  dotAgotado: { backgroundColor: "#e5484d" },
  stockTexto: {
    color: C.grisTexto,
    fontSize: 11,
    fontFamily: FontFamilies.bodyMedium,
    flexShrink: 1,
    minWidth: 0,
  },
  stockTextoOk: { color: C.grisTexto },
  stockTextoAgotado: { color: "#ff8f8f" },
  metrosBloque: {
    gap: 8,
    marginTop: 2,
    width: "100%",
    minWidth: 0,
  },
  bloqueCantidadSinMetraje: {
    gap: 8,
    marginTop: 2,
    width: "100%",
    minWidth: 0,
  },
  metrajePlaceholder: {
    height: 36,
    width: "100%",
  },
  metrosSelector: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderWidth: 1,
    borderColor: C.bordeOro,
    borderRadius: 8,
    backgroundColor: "rgba(0,0,0,0.35)",
    paddingVertical: 9,
    paddingHorizontal: 12,
    width: "100%",
  },
  metrosSelectorTexto: {
    color: C.oroSuave,
    fontSize: 13,
    fontFamily: FontFamilies.bodyMedium,
  },
  metrosOpciones: {
    borderWidth: 1,
    borderColor: C.bordeOro,
    borderRadius: 8,
    backgroundColor: "#0f0f0f",
    overflow: "hidden",
    marginTop: 4,
  },
  metroOpcion: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.06)",
  },
  metroOpcionActiva: {
    backgroundColor: "rgba(212,165,75,0.12)",
  },
  metroOpcionTexto: {
    color: C.blanco,
    fontSize: 13,
    fontFamily: FontFamilies.body,
  },
  metroOpcionTextoActiva: {
    color: C.oro,
    fontFamily: FontFamilies.bodyBold,
  },
  cantidadFila: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 2,
    width: "100%",
    minWidth: 0,
  },
  cantidadLabel: {
    color: "#c9c9c9",
    fontSize: 11,
    fontFamily: FontFamilies.bodyMedium,
    flexShrink: 1,
  },
  cantidadControl: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: C.bordeOro,
    borderRadius: 8,
    overflow: "hidden",
    backgroundColor: "rgba(0,0,0,0.35)",
    flexShrink: 1,
    maxWidth: "100%",
    minWidth: 0,
  },
  cantidadBoton: {
    width: 32,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  cantidadValor: {
    color: C.blanco,
    fontSize: 13,
    fontFamily: FontFamilies.bodyBold,
    minWidth: 36,
    textAlign: "center",
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: "#2e2e2e",
    paddingVertical: 6,
    flexShrink: 0,
  },
  cantidadInput: {
    color: C.blanco,
    fontSize: 13,
    fontFamily: FontFamilies.bodyBold,
    minWidth: 42,
    maxWidth: 52,
    textAlign: "center",
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: "#2e2e2e",
    paddingVertical: 5,
    paddingHorizontal: 2,
    flexShrink: 0,
    includeFontPadding: false,
  },
  cantidadSufijo: {
    color: C.blanco,
    fontSize: 11,
    fontFamily: FontFamilies.bodyMedium,
    marginLeft: 2,
    marginRight: 4,
  },
  botonDeshabilitado: {
    opacity: 0.4,
  },
  variantesFila: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginTop: 2,
    width: "100%",
    minWidth: 0,
    minHeight: 22,
  },
  variantesPlaceholder: { height: 22 },
  varianteChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(212,165,75,0.2)",
    backgroundColor: "rgba(212,165,75,0.06)",
    paddingVertical: 4,
    paddingHorizontal: 8,
    maxWidth: "100%",
    flexShrink: 1,
    minWidth: 0,
  },
  varianteAgotada: {
    opacity: 0.5,
  },
  varianteDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.3)",
  },
  varianteTexto: {
    color: C.blanco,
    fontSize: 10,
    fontFamily: FontFamilies.bodyMedium,
    flexShrink: 1,
    minWidth: 0,
  },
  varianteChipMas: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: C.bordeOro,
    borderStyle: "dashed",
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  agregar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: C.oro,
    borderRadius: 10,
    minHeight: 44,
    paddingLeft: 14,
    paddingRight: 10,
    gap: 8,
    width: "100%",
    maxWidth: "100%",
    minWidth: 0,
    marginTop: "auto",
  },
  agregarDeshabilitado: {
    backgroundColor: "#555",
    opacity: 0.8,
  },
  agregarIconoCaja: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.12)",
    flexShrink: 0,
  },
  presionado: { opacity: 0.85 },
  agregarTexto: {
    color: C.textoSobreOro,
    fontSize: 13,
    fontFamily: FontFamilies.button,
    flexShrink: 1,
    minWidth: 0,
  },
});
