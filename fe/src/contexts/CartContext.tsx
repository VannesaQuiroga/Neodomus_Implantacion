// Comparte los artículos del carrito y las operaciones para modificar sus cantidades.
import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { loadItem, saveItem } from '@utils/profileStorage';
import { parseMetros } from '@utils/metros';
import { useAuth } from '@contexts/AuthContext';

const CART_KEY = 'neodomus_carrito';

export interface CartItem {
  id_producto: number;
  nombre_producto: string;
  precio_venta_producto: number;
  imagen: string;
  cantidad: number;
  color?: string;
  tamaño?: string;
  medida?: string;
  id_variante?: number;
  venta_por_metros?: boolean;
  metros?: number;
  tecnicos_requeridos?: number;
  stock_maximo?: number;
}

interface CartContextValue {
  items: CartItem[];
  totalItems: number;
  totalPrice: number;
  addItem: (producto: Omit<CartItem, 'cantidad'>, cantidad?: number, metros?: number) => string | null;
  updateQuantity: (key: string, cantidad: number) => string | null;
  updateMetros: (key: string, metros: number | string) => string | null;
  removeItem: (key: string) => void;
  clearCart: () => void;
  actualizarStock: (key: string, stock: number) => void;
  tieneStockInsuficiente: boolean;
}

const CartContext = createContext<CartContextValue | undefined>(undefined);

const itemKey = (item: { id_producto: number; color?: string; medida?: string; tamaño?: string; metros?: number; venta_por_metros?: boolean }) =>
  [
    item.id_producto,
    item.color?.toLowerCase(),
    (item.medida || item.tamaño || '').toLowerCase(),
    item.venta_por_metros && item.metros ? `${item.metros}m` : null,
  ]
    .filter(Boolean)
    .join('-');

export const CartProvider = ({ children }: { children: ReactNode }) => {
  const [items, setItems] = useState<CartItem[]>(() => loadItem<CartItem[]>(CART_KEY, []));
  const { isAuthenticated } = useAuth();
  const prevAutenticado = useRef(isAuthenticated);

  useEffect(() => {
    if (prevAutenticado.current && !isAuthenticated) {
      setItems([]);
    }
    prevAutenticado.current = isAuthenticated;
  }, [isAuthenticated]);

  useEffect(() => {
    saveItem(CART_KEY, items);
  }, [items]);

  const addItem = (producto: Omit<CartItem, 'cantidad'>, cantidad = 1, metros?: number): string | null => {
    let error: string | null = null;
    setItems(prev => {
      const key = itemKey(producto as any);
      const existing = prev.find(i => itemKey(i) === key);
      if (existing) {
        const stockMax = existing.stock_maximo ?? Infinity;
        if (producto.venta_por_metros) {
          const largo = metros || 0;
          const unidades = cantidad || 1;
          if (largo <= 0) {
            error = 'Selecciona una longitud válida';
            return prev;
          }
          const totalExistente = (existing.metros || 0) * (existing.cantidad || 1);
          const totalNuevo = largo * unidades;
          const nuevoTotal = totalExistente + totalNuevo;
          if (nuevoTotal > stockMax) {
            error = `Stock insuficiente: solo hay ${stockMax} m disponibles`;
            return prev;
          }
          // Mismo largo (key incluye metros) -> incrementar unidades
          return prev.map(i =>
            itemKey(i) === key
              ? { ...i, cantidad: (i.cantidad || 1) + unidades }
              : i
          );
        }
        const nuevaCantidad = existing.cantidad + cantidad;
        if (nuevaCantidad > stockMax) {
          error = `Stock insuficiente: solo hay ${stockMax} unidades disponibles`;
          return prev;
        }
        return prev.map(i =>
          itemKey(i) === key
            ? { ...i, cantidad: nuevaCantidad }
            : i
        );
      }
      const stockMax = producto.stock_maximo ?? Infinity;
      if (producto.venta_por_metros) {
        const largo = metros || 0;
        const unidades = cantidad || 1;
        const totalSolicitado = largo * unidades;
        if (largo <= 0) {
          error = 'Selecciona una longitud válida';
          return prev;
        }
        if (totalSolicitado > stockMax) {
          error = `Stock insuficiente: solo hay ${stockMax} m disponibles`;
          return prev;
        }
      } else {
        if (cantidad > stockMax) {
          error = `Stock insuficiente: solo hay ${stockMax} unidades disponibles`;
          return prev;
        }
      }
      return [...prev, {
        ...producto,
        cantidad: producto.venta_por_metros ? (cantidad || 1) : cantidad,
        metros: producto.venta_por_metros ? metros || 0 : metros,
      }];
    });
    return error;
  };

  const updateQuantity = (key: string, cantidad: number): string | null => {
    let error: string | null = null;
    setItems(prev =>
      prev.map(i => {
        if (itemKey(i) !== key) return i;
        const nuevaCantidad = Math.max(1, cantidad);
        const stockMax = i.stock_maximo ?? Infinity;
        if (i.venta_por_metros) {
          const totalMetros = (i.metros || 0) * nuevaCantidad;
          if (totalMetros > stockMax) {
            error = `Stock insuficiente: solo hay ${stockMax} m disponibles`;
            return i;
          }
        } else {
          if (nuevaCantidad > stockMax) {
            error = `Stock insuficiente: solo hay ${stockMax} unidades disponibles`;
            return i;
          }
        }
        return { ...i, cantidad: nuevaCantidad };
      })
    );
    return error;
  };

  const updateMetros = (key: string, metros: number | string): string | null => {
    const resultado = parseMetros(metros);
    if (resultado.valor == null) {
      return resultado.error ?? 'Cantidad inválida';
    }
    const nuevosMetros = resultado.valor;
    let error: string | null = null;
    setItems(prev =>
      prev.map(i => {
        if (itemKey(i) !== key) return i;
        const stockMax = i.stock_maximo ?? Infinity;
        const totalMetros = nuevosMetros * (i.cantidad || 1);
        if (totalMetros > stockMax) {
          error = `Stock insuficiente: solo hay ${stockMax} m disponibles`;
          return i;
        }
        return { ...i, metros: nuevosMetros };
      })
    );
    return error;
  };

  const removeItem = (key: string) => {
    setItems(prev => prev.filter(i => itemKey(i) !== key));
  };

  const clearCart = () => setItems([]);

  const actualizarStock = (key: string, stock: number) => {
    setItems(prev =>
      prev.map(i => (itemKey(i) === key ? { ...i, stock_maximo: stock } : i))
    );
  };

  const totalItems = useMemo(() => items.reduce((acc, i) => acc + (i.venta_por_metros ? (i.cantidad || 1) : i.cantidad), 0), [items]);
  const totalPrice = useMemo(
    () =>
      items.reduce(
        (acc, i) =>
          acc +
          i.precio_venta_producto * (i.venta_por_metros ? (i.metros || 0) * (i.cantidad || 1) : i.cantidad),
        0
      ),
    [items]
  );

  const tieneStockInsuficiente = useMemo(
    () => items.some(i => {
      const stockMax = i.stock_maximo ?? Infinity;
      const cantidadActual = i.venta_por_metros ? (i.metros || 0) * (i.cantidad || 1) : i.cantidad;
      return cantidadActual > stockMax;
    }),
    [items]
  );

  return (
    <CartContext.Provider value={{ items, totalItems, totalPrice, addItem, updateQuantity, updateMetros, removeItem, clearCart, actualizarStock, tieneStockInsuficiente }}>
      {children}
    </CartContext.Provider>
  );
};

export const useCart = () => {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('useCart debe usarse dentro de CartProvider');
  return ctx;
};
