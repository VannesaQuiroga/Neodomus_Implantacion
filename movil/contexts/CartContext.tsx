// ─────────────────────────────────────────────────────────────
// Carrito — réplica del CartContext de la WEB (contexts/CartContext.tsx).
//
// - Persistencia en 'neodomus_carrito' (misma clave que la web, aquí AsyncStorage).
// - Clave de línea para dedupe: id + color + medida/tamaño + metros (igual que web).
// - Venta por metros: cantidad = unidades, metros = longitud por unidad.
//   Total metros = metros * cantidad. Precio = precio_por_metro * total_metros.
//   Clave incluye metros para distinguir cortes del mismo producto (1,5 m vs 2 m).
// - Disponibilidad: el ítem guarda stock_maximo (m disponible de la línea) y
//   updateMetros/updateQuantity lo respetan; la validación definitiva es del backend.
// - Al cerrar sesión el carrito se vacía (igual que la web).
// ─────────────────────────────────────────────────────────────

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import AsyncStorage from "@react-native-async-storage/async-storage";

import type { Producto } from "@/services/productos.service";
import { urlImagenProducto } from "@/services/productos.service";
import { parseMetros } from "@/utils/metros";
import { useAuth } from "./AuthContext";

const CLAVE_CARRITO = "neodomus_carrito";

export interface ItemCarrito {
  id_producto: number;
  nombre_producto: string;
  precio_venta_producto: number;
  imagen: string | null;
  cantidad: number;
  color?: string;
  tamaño?: string;
  medida?: string;
  id_variante?: number;
  venta_por_metros?: boolean;
  metros?: number;
  tecnicos_requeridos?: number;
  /** Metraje máximo disponible para esta línea (venta por metros). */
  stock_maximo?: number;
}

export const claveItemCarrito = (
  item: Pick<ItemCarrito, "id_producto" | "color" | "medida" | "tamaño" | "metros" | "venta_por_metros">,
): string =>
  [
    item.id_producto,
    item.color?.toLowerCase(),
    (item.medida || item.tamaño || "").toLowerCase(),
    item.venta_por_metros && item.metros ? `${item.metros}m` : null,
  ]
    .filter(Boolean)
    .join("-");

interface CarritoContextValue {
  items: ItemCarrito[];
  totalItems: number;
  totalPrice: number;
  addItem: (
    producto: Producto,
    opciones?: {
      cantidad?: number;
      metros?: number;
      color?: string;
      tamaño?: string;
      medida?: string;
      id_variante?: number;
      /** Disponibilidad (m) de la línea al agregarla; se guarda para validar el carrito. */
      stock_maximo?: number;
    },
  ) => void;
  updateQuantity: (clave: string, cantidad: number) => void;
  /** Devuelve el error de disponibilidad (igual que la web) o null si se aplicó. */
  updateMetros: (clave: string, metros: number | string) => string | null;
  removeItem: (clave: string) => void;
  clearCart: () => void;
}

const CarritoContext = createContext<CarritoContextValue | null>(null);

function cargarItemsGuardados(): ItemCarrito[] {
  return [];
}

// accede a AsyncStorage para conservar o recuperar datos locales.
export function CarritoProvider({ children }: { children: React.ReactNode }) {
  const { autenticado } = useAuth();
  const [items, setItems] = useState<ItemCarrito[]>(cargarItemsGuardados);
  const [listo, setListo] = useState(false);
  const estabaAutenticado = useRef(autenticado);

  // Cargar carrito guardado una sola vez.
  useEffect(() => {
    let activo = true;
    AsyncStorage.getItem(CLAVE_CARRITO)
      .then((crudo) => {
        if (!activo || !crudo) return;
        try {
          const datos: unknown = JSON.parse(crudo);
          if (Array.isArray(datos)) setItems(datos as ItemCarrito[]);
        } catch {
          // JSON corrupto → se empieza con carrito vacío.
        }
      })
      .finally(() => {
        if (activo) setListo(true);
      });
    return () => {
      activo = false;
    };
  }, []);

  // Persistir en cada cambio (una vez cargado el inicial).
  useEffect(() => {
    if (!listo) return;
    AsyncStorage.setItem(CLAVE_CARRITO, JSON.stringify(items)).catch(() => {});
  }, [items, listo]);

  // Cerrar sesión vacía el carrito (comportamiento de la WEB).
  useEffect(() => {
    if (estabaAutenticado.current && !autenticado) {
      setItems([]);
    }
    estabaAutenticado.current = autenticado;
  }, [autenticado]);

  const addItem = useCallback<CarritoContextValue["addItem"]>(
    (producto, opciones = {}) => {
      const {
        cantidad = 1,
        metros,
        color,
        tamaño,
        medida,
        id_variante,
        stock_maximo,
      } = opciones;

      setItems((prev) => {
        const esMetros = !!producto.venta_por_metros;
        const cantidadSolicitada = Math.max(1, cantidad);
        const metrosParseado = esMetros ? parseMetros(metros ?? 10) : null;
        const metrosSolicitado = esMetros ? (metrosParseado?.valor ?? 10) : undefined;

        const claveNueva = claveItemCarrito({
          id_producto: producto.id_producto,
          color,
          medida,
          tamaño,
          metros: metrosSolicitado,
          venta_por_metros: producto.venta_por_metros,
        });

        const existente = prev.find(
          (item) =>
            claveItemCarrito(item) === claveNueva && item.id_variante === id_variante,
        );

        if (existente) {
          return prev.map((item) =>
            item === existente
              ? {
                  ...item,
                  // Misma longitud (clave incluye metros) → incrementar unidades (web).
                  cantidad: Math.max(1, (item.cantidad ?? 0) + cantidadSolicitada),
                  stock_maximo: stock_maximo ?? item.stock_maximo,
                }
              : item,
          );
        }

        return [
          ...prev,
          {
            id_producto: producto.id_producto,
            nombre_producto: producto.nombre_producto,
            precio_venta_producto:
              producto.precio_final ?? producto.precio_venta_producto,
            // MISMA resolución que Productos (convención /uploads/{id}.jpg).
            imagen: urlImagenProducto(producto),
            cantidad: cantidadSolicitada,
            color,
            tamaño,
            medida,
            id_variante,
            venta_por_metros: producto.venta_por_metros,
            metros: metrosSolicitado,
            tecnicos_requeridos: producto.tecnicos_requeridos,
            stock_maximo,
          },
        ];
      });
    },
    [],
  );

  const updateQuantity = useCallback((clave: string, cantidad: number) => {
    setItems((prev) =>
      prev.map((item) =>
        claveItemCarrito(item) === clave
          ? { ...item, cantidad: Math.max(1, cantidad) }
          : item,
      ),
    );
  }, []);

  const updateMetros = useCallback<CarritoContextValue["updateMetros"]>(
    (clave, metros) => {
      const r = parseMetros(metros);
      if (r.valor == null) {
        return r.error ?? "Cantidad inválida";
      }
      const nuevosMetros = r.valor;
      // Igual que la web: el ítem conoce su disponibilidad (stock_maximo, en m)
      // y rechaza el cambio si la línea completa la excede. Sin límite guardado
      // (ítems antiguos) no se bloquea localmente: el backend es la barrera final.
      let error: string | null = null;
      setItems((prev) =>
        prev.map((item) => {
          if (claveItemCarrito(item) !== clave) return item;
          const stockMax = item.stock_maximo ?? Infinity;
          if (nuevosMetros * (item.cantidad || 1) > stockMax) {
            error = `Stock insuficiente: solo hay ${stockMax} m disponibles`;
            return item;
          }
          return { ...item, metros: nuevosMetros };
        }),
      );
      return error;
    },
    [],
  );

  const removeItem = useCallback((clave: string) => {
    setItems((prev) => prev.filter((item) => claveItemCarrito(item) !== clave));
  }, []);

  const clearCart = useCallback(() => setItems([]), []);

  const valor = useMemo<CarritoContextValue>(() => {
    const totalItems = items.reduce((suma, item) => suma + item.cantidad, 0);
    const totalPrice = items.reduce(
      (suma, item) =>
        suma +
        item.precio_venta_producto *
          (item.venta_por_metros ? (item.metros || 0) * (item.cantidad || 1) : item.cantidad),
      0,
    );
    return {
      items,
      totalItems,
      totalPrice,
      addItem,
      updateQuantity,
      updateMetros,
      removeItem,
      clearCart,
    };
  }, [items, addItem, updateQuantity, updateMetros, removeItem, clearCart]);

  return <CarritoContext.Provider value={valor}>{children}</CarritoContext.Provider>;
}

export function useCart(): CarritoContextValue {
  const contexto = useContext(CarritoContext);
  if (!contexto) {
    throw new Error("useCart debe usarse dentro de <CarritoProvider>");
  }
  return contexto;
}
