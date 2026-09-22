// ─────────────────────────────────────────────────────────────
// Tab Productos — catálogo público desde la BD real.
//
// Estructura VIRTUALIZADA correcta (sin anidar ScrollView+FlatList):
//   [Navbar fijo]
//   FlatList raíz
//     ├─ ListHeaderComponent: búsqueda + categorías + favoritos
//     ├─ data: productos (cards)
//     └─ ListFooterComponent: FOOTER CONTEXTUAL de Neodomus
// ─────────────────────────────────────────────────────────────

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import FontAwesome6 from "@expo/vector-icons/FontAwesome6";
import { useFocusEffect } from "expo-router";

import { NeodomusColors as C, FontFamilies } from "@/constants/theme";
import PublicNavbar from "@/components/public/PublicNavbar";
import ProductCard from "@/components/public/ProductCard";
import AppFooter from "@/components/public/AppFooter";
import AsistenteFlotante from "@/components/public/AsistenteFlotante";
import { useFavoritos } from "@/contexts/FavoritosContext";
import { useScrollTopAlEntrar } from "@/hooks/useScrollTopAlEntrar";
import {
  listarProductos,
  obtenerCategorias,
  type CategoriaProducto,
  type Producto,
} from "@/services/productos.service";

const LIMITE_PAGINA = 10;

export default function ProductosScreen() {
  const { esFavorito } = useFavoritos();
  const listaRef = useRef<FlatList<Producto> | null>(null);
  // Al entrar a la sección desde otro tab → la lista empieza arriba.
  useScrollTopAlEntrar(listaRef);

  const [productos, setProductos] = useState<Producto[]>([]);
  const [categorias, setCategorias] = useState<CategoriaProducto[]>([]);
  const [cargando, setCargando] = useState(true);
  const [refrescando, setRefrescando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [busqueda, setBusqueda] = useState("");
  const [categoriaSeleccionada, setCategoriaSeleccionada] = useState<number | null>(null);
  const [soloFavoritos, setSoloFavoritos] = useState(false);
  const [pagina, setPagina] = useState(1);

  const cargar = useCallback(async () => {
    setError(null);
    if (__DEV__) {
      console.log('Solicitando productos...');
      console.log('URL utilizada:', `${require("@/constants/api").API_BASE_URL}/productos/?limit=100`);
    }
    try {
      const [productosRes, categoriasRes] = await Promise.all([
        listarProductos(),
        obtenerCategorias().catch(() => [] as CategoriaProducto[]),
      ]);
      if (__DEV__) {
        console.log('Respuesta productos:', productosRes);
        console.log(`[productos] ✓ backend respondió: total=${productosRes.total} data=${productosRes.data?.length ?? 0} categorías=${categoriasRes?.length ?? 0}`);
        if ((productosRes.data?.length ?? 0) === 0) console.log("[productos] Escenario A/B: lista vacía — verificar backend / productos activos / filtros");
        else console.log(`[productos] Escenario B/C: ${productosRes.data.length} productos recibidos, primer producto:`, JSON.stringify(productosRes.data[0]).slice(0, 400));
      }
      const lista = productosRes.data ?? [];
      if (__DEV__) console.log('Productos recibidos:', lista);
      if (lista.length === 0 && __DEV__) {
        console.log("[productos] ⚠️ data vacía — revisar si el backend tiene productos con estado activo y stock>0");
        console.log("[productos] Escenario A: API no devuelve productos — corregir conexión/BD");
      } else if (__DEV__) {
        console.log(`[productos] Escenario B/C/D: ${lista.length} productos en estado`);
      }
      setProductos(lista);
      setCategorias(categoriasRes ?? []);
    } catch (e: any) {
      const msg = e?.message || String(e);
      const status = e?.status ?? 0;
      if (__DEV__) {
        console.log(`[productos] ✗ Escenario A: fallo API status=${status} msg=${msg}`);
        console.log('Respuesta productos:', e);
        console.log("[productos]   → Verifica EXPO_PUBLIC_API_URL en movil/.env, que el backend esté corriendo y que el celular esté en la misma Wi-Fi que el PC.");
      }
      setError(
        status === 0
          ? `No se pudo conectar con el servidor. ${msg}`
          : `Error al cargar productos (código ${status}): ${msg}`,
      );
    } finally {
      setCargando(false);
      setRefrescando(false);
    }
  }, []);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  // Al volver a Productos tras una compra exitosa, recargar stock real del backend
  // sin mostrar spinner (silencioso). Esto evita que el usuario vea cantidades antiguas.
  useFocusEffect(
    useCallback(() => {
      void (async () => {
        try {
          const res = await listarProductos();
          setProductos(res.data ?? []);
        } catch {}
      })();
    }, []),
  );

  // Igual que la web: búsqueda por nombre + filtro por categoría en cliente.
  const filtrados = useMemo(() => {
    const texto = busqueda.trim().toLowerCase();
    return productos.filter((producto) => {
      const coincideTexto =
        !texto || producto.nombre_producto.toLowerCase().includes(texto);
      const coincideCategoria =
        categoriaSeleccionada == null ||
        producto.id_cate_pr === categoriaSeleccionada;
      const coincideFavoritos = !soloFavoritos || esFavorito(producto.id_producto);
      return coincideTexto && coincideCategoria && coincideFavoritos;
    });
  }, [productos, busqueda, categoriaSeleccionada, soloFavoritos, esFavorito]);

  const visibles = useMemo(
    () => filtrados.slice(0, pagina * LIMITE_PAGINA),
    [filtrados, pagina],
  );

  // Log para Escenario B/C/D: renderizado
  useEffect(() => {
    if (__DEV__) {
      console.log(`[productos] Render: productos=${productos.length} filtrados=${filtrados.length} visibles=${visibles.length} busqueda="${busqueda}" categoria=${categoriaSeleccionada}`);
      if (productos.length > 0 && filtrados.length === 0) {
        console.log("[productos] ⚠️ Productos llegan pero filtrados vacíos — revisar filtros/búsqueda/categoría");
      }
      if (visibles.length > 0) {
        const p = visibles[0] as any;
        if (p && !p.nombre_producto && p.nombre) console.log("[productos] ⚠️ Propiedad incorrecta: producto.nombre en lugar de producto.nombre_producto", p);
        if (p && p.nombre_producto) console.log(`[productos] Primer visible: id=${p.id_producto} nombre="${p.nombre_producto}" precio=${p.precio_venta_producto} stock=${p.stock_producto} imagen=${p.imagen_url}`);
      }
    }
  }, [productos.length, filtrados.length, visibles.length, busqueda, categoriaSeleccionada]);

  const reiniciarPagina = () => setPagina(1);

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

  if (error) {
    return (
      <View style={styles.pantalla}>
        <PublicNavbar />
        <View style={styles.centro}>
          <FontAwesome6 name="circle-exclamation" size={34} color={C.rojoError} />
          <Text style={styles.errorTitulo}>Algo salió mal</Text>
          <Text style={styles.errorTexto}>{error}</Text>
          <Pressable
            style={({ pressed }) => [
              styles.botonReintentar,
              pressed && styles.presionado,
            ]}
            onPress={() => {
              setCargando(true);
              void cargar();
            }}
          >
            <Text style={styles.textoReintentar}>Reintentar</Text>
          </Pressable>
        </View>
        <AsistenteFlotante />
      </View>
    );
  }

  return (
    <View style={styles.pantalla}>
      {/* Navbar FIJO (fuera de la lista virtualizada) */}
      <PublicNavbar />

      {/* ÚNICA lista virtualizada vertical: header=filtros, footer=contextual */}
      <FlatList
        ref={listaRef}
        style={styles.lista}
        data={visibles}
        keyExtractor={(producto) => String(producto.id_producto)}
        numColumns={2}
        columnWrapperStyle={styles.filaGrid}
        contentContainerStyle={styles.grid}
        ListHeaderComponent={
          <View style={styles.barraFiltros}>
            <View style={styles.buscadorWrap}>
              <FontAwesome6 name="magnifying-glass" size={14} color="#9e9e9e" />
              <TextInput
                style={styles.buscador}
                placeholder="Buscar producto"
                placeholderTextColor="#9e9e9e"
                value={busqueda}
                onChangeText={(texto) => {
                  setBusqueda(texto);
                  reiniciarPagina();
                }}
              />
              {busqueda.length > 0 && (
                <Pressable onPress={() => setBusqueda("")} hitSlop={8}>
                  <FontAwesome6 name="xmark" size={14} color="#9e9e9e" />
                </Pressable>
              )}
            </View>

            <View style={styles.chipsWrap}>
              <ScrollViewHorizontalChips>
                <ChipCategoria
                  activa={categoriaSeleccionada == null && !soloFavoritos}
                  texto="Todas las categorías"
                  onPress={() => {
                    setCategoriaSeleccionada(null);
                    setSoloFavoritos(false);
                    reiniciarPagina();
                  }}
                />
                {categorias.map((categoria) => (
                  <ChipCategoria
                    key={categoria.id_categoria}
                    activa={categoriaSeleccionada === categoria.id_categoria}
                    texto={categoria.nombre_categoria}
                    onPress={() => {
                      setCategoriaSeleccionada(categoria.id_categoria);
                      reiniciarPagina();
                    }}
                  />
                ))}
                <ChipCategoria
                  activa={soloFavoritos}
                  texto="♥ Mis favoritos"
                  onPress={() => {
                    setSoloFavoritos(!soloFavoritos);
                    reiniciarPagina();
                  }}
                />
              </ScrollViewHorizontalChips>
            </View>
          </View>
        }
        ListEmptyComponent={
          <View style={styles.vacio}>
            <FontAwesome6 name="box-open" size={36} color={C.oroClaro} />
            <Text style={styles.vacioTitulo}>Sin resultados</Text>
            <Text style={styles.vacioTexto}>
              No encontramos productos con esa búsqueda.
            </Text>
          </View>
        }
        ListFooterComponent={<AppFooter />}
        refreshControl={
          <RefreshControl
            refreshing={refrescando}
            onRefresh={() => {
              setRefrescando(true);
              void cargar();
            }}
            tintColor={C.oro}
            colors={[C.oro]}
            progressViewOffset={10}
          />
        }
        renderItem={({ item }) => (
          <View style={styles.cardWrap}>
            <ProductCard producto={item} />
          </View>
        )}
        onEndReachedThreshold={0.4}
        onEndReached={() => {
          if (visibles.length < filtrados.length) {
            setPagina((actual) => actual + 1);
          }
        }}
      />

      <AsistenteFlotante />
    </View>
  );
}

/** Chips horizontales sin usar ScrollView virtualizado anidado. */
function ScrollViewHorizontalChips({ children }: { children: React.ReactNode }) {
  return (
    <FlatList
      horizontal
      data={React.Children.toArray(children)}
      keyExtractor={(_hijo, indice) => `chip-${indice}`}
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.chipsCategorias}
      renderItem={({ item }) => <>{item}</>}
      keyboardShouldPersistTaps="handled"
    />
  );
}

function ChipCategoria({
  activa,
  texto,
  onPress,
}: {
  activa: boolean;
  texto: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      style={[styles.chip, activa && styles.chipActiva]}
      onPress={onPress}
    >
      <Text style={[styles.chipTexto, activa && styles.chipTextoActivo]}>
        {texto}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pantalla: {
    flex: 1,
    backgroundColor: "#000000",
  },

  lista: { flex: 1 },

  barraFiltros: {
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 4,
    gap: 10,
  },

  buscadorWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    backgroundColor: "#0f0f0f",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.09)",
    borderRadius: 12,
    paddingHorizontal: 13,
    height: 46,
  },

  buscador: {
    flex: 1,
    color: "#ffffff",
    fontSize: 15,
    fontFamily: FontFamilies.body,
    paddingVertical: 0,
  },

  chipsWrap: { flexGrow: 0 },

  chipsCategorias: {
    gap: 8,
    paddingRight: 14,
    paddingVertical: 2,
  },

  chip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(212,165,75,0.28)",
    backgroundColor: "rgba(212,165,75,0.08)",
    paddingVertical: 7,
    paddingHorizontal: 13,
  },

  chipActiva: {
    backgroundColor: C.oro,
    borderColor: C.oro,
  },

  chipTexto: {
    color: C.oroSuave,
    fontSize: 12.5,
    fontFamily: FontFamilies.bodyMedium,
  },

  chipTextoActivo: {
    color: C.textoSobreOro,
    fontFamily: FontFamilies.button,
  },

  grid: {
    paddingHorizontal: 12,
    paddingBottom: 20,
    gap: 12,
  },

  filaGrid: {
    gap: 12,
  },

  cardWrap: {
    flex: 1,
    maxWidth: "50%",
    minWidth: 0,
  },

  centro: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 30,
    gap: 12,
  },

  cargandoTexto: {
    color: C.grisTexto,
    fontSize: 14.5,
    marginTop: 4,
  },

  errorTitulo: {
    color: C.blanco,
    fontSize: 19,
    fontFamily: FontFamilies.bodyBold,
  },

  errorTexto: {
    color: C.grisTexto,
    fontSize: 14,
    lineHeight: 21,
    textAlign: "center",
  },

  botonReintentar: {
    backgroundColor: C.oro,
    borderRadius: 12,
    paddingVertical: 11,
    paddingHorizontal: 26,
    marginTop: 6,
  },

  textoReintentar: {
    color: C.textoSobreOro,
    fontFamily: FontFamilies.button,
    fontSize: 13.5,
  },

  presionado: { opacity: 0.85 },

  vacio: {
    alignItems: "center",
    paddingVertical: 60,
    paddingHorizontal: 24,
    gap: 10,
  },

  vacioTitulo: {
    color: C.blanco,
    fontSize: 18,
    fontFamily: FontFamilies.bodyBold,
  },

  vacioTexto: {
    color: C.grisTexto,
    fontSize: 14,
    lineHeight: 21,
    textAlign: "center",
  },
});
