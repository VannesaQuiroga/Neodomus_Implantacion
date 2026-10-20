// Controles de filtro usados en las pantallas del técnico.
import React, { useMemo, useState } from "react";
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import FontAwesome6 from "@expo/vector-icons/FontAwesome6";
import { FontFamilies, NeodomusColors as C } from "@/constants/theme";

// ─────────────────────────────────────────────────────────────
// SearchBar
// ─────────────────────────────────────────────────────────────
export function SearchBar({
  value,
  onChange,
  placeholder = "Buscar...",
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <View style={styles.searchWrap}>
      <FontAwesome6 name="magnifying-glass" size={13} color="#6b6b6b" />
      <TextInput
        style={styles.searchInput}
        placeholder={placeholder}
        placeholderTextColor="#6b6b6b"
        value={value}
        onChangeText={onChange}
        returnKeyType="search"
      />
      {value.length > 0 ? (
        <Pressable onPress={() => onChange("")} hitSlop={8} style={styles.searchClear}>
          <FontAwesome6 name="xmark" size={12} color="#8a8a8a" />
        </Pressable>
      ) : null}
    </View>
  );
}

// ─────────────────────────────────────────────────────────────
// FilterChip — pill button usado en la fila de filtros
// ─────────────────────────────────────────────────────────────
export function FilterChip({
  label,
  icon,
  active,
  onPress,
}: {
  label: string;
  icon: string;
  active?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.chip,
        active && styles.chipActive,
        pressed && { opacity: 0.8 },
      ]}
    >
      <FontAwesome6 name={icon as any} size={11} color={active ? "#141414" : "#f0c96f"} />
      <Text style={[styles.chipTxt, active && styles.chipTxtActive]} numberOfLines={1}>
        {label}
      </Text>
      <FontAwesome6
        name="chevron-down"
        size={9}
        color={active ? "#141414" : "#6b6b6b"}
        style={{ marginLeft: 2 }}
      />
    </Pressable>
  );
}

export function ClearFiltersBtn({ onPress }: { onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.clearBtn, pressed && { opacity: 0.7 }]}>
      <FontAwesome6 name="xmark" size={11} color="#f0c96f" />
      <Text style={styles.clearBtnTxt}>Limpiar</Text>
    </Pressable>
  );
}

// ─────────────────────────────────────────────────────────────
// FilterRow — contenedor responsive para chips
// ─────────────────────────────────────────────────────────────
export function FilterRow({ children }: { children: React.ReactNode }) {
  return <View style={styles.filterRow}>{children}</View>;
}

// ─────────────────────────────────────────────────────────────
// Tabs segmentadas
// ─────────────────────────────────────────────────────────────
export function Tabs({
  tabs,
  active,
  onChange,
}: {
  tabs: { key: string; label: string; icon?: string; count?: number }[];
  active: string;
  onChange: (k: string) => void;
}) {
  return (
    <View style={styles.tabsWrap}>
      {tabs.map((tb) => {
        const isActive = tb.key === active;
        return (
          <Pressable
            key={tb.key}
            onPress={() => onChange(tb.key)}
            style={[styles.tab, isActive && styles.tabActive]}
          >
            {tb.icon ? (
              <FontAwesome6 name={tb.icon as any} size={11} color={isActive ? "#141414" : "#bdbdbd"} />
            ) : null}
            <Text style={[styles.tabTxt, isActive && styles.tabTxtActive]} numberOfLines={1}>
              {tb.label}
            </Text>
            {tb.count !== undefined && tb.count > 0 ? (
              <View style={[styles.tabCount, isActive && styles.tabCountActive]}>
                <Text style={[styles.tabCountTxt, isActive && styles.tabCountTxtActive]}>{tb.count}</Text>
              </View>
            ) : null}
          </Pressable>
        );
      })}
    </View>
  );
}

// ─────────────────────────────────────────────────────────────
// CalendarPicker Modal — calendario nativo JS, móvil optimizado
// ─────────────────────────────────────────────────────────────
const MESES = [
  "Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"
];
const DIAS_SEM = ["L","M","X","J","V","S","D"];

function parseISODate(s: string | null): Date | null {
  if (!s) return null;
  const [y, m, d] = s.split("-").map(Number);
  if (!y || !m || !d) return null;
  const dt = new Date(y, m - 1, d);
  return isNaN(dt.getTime()) ? null : dt;
}

function toISO(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}

export function CalendarPicker({
  visible,
  value,
  onSelect,
  onClose,
}: {
  visible: boolean;
  value: string; // YYYY-MM-DD or ""
  onSelect: (v: string) => void;
  onClose: () => void;
}) {
  const initial = parseISODate(value) || new Date();
  const [cursor, setCursor] = useState<Date>(() => new Date(initial.getFullYear(), initial.getMonth(), 1));

  // Sync cursor when value changes and modal opens
  React.useEffect(() => {
    if (visible) {
      const d = parseISODate(value);
      if (d) setCursor(new Date(d.getFullYear(), d.getMonth(), 1));
      else setCursor(new Date(new Date().getFullYear(), new Date().getMonth(), 1));
    }
  }, [visible, value]);

  const month = cursor.getMonth();
  const year = cursor.getFullYear();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDow = (new Date(year, month, 1).getDay() + 6) % 7; // L=0
  const sel = parseISODate(value);

  const cells = useMemo(() => {
    const arr: (number | null)[] = [];
    for (let i = 0; i < firstDow; i++) arr.push(null);
    for (let d = 1; d <= daysInMonth; d++) arr.push(d);
    return arr;
  }, [firstDow, daysInMonth]);

  const isSelected = (day: number) =>
    sel !== null && sel.getFullYear() === year && sel.getMonth() === month && sel.getDate() === day;
  const isToday = (day: number) => {
    const t = new Date();
    return t.getFullYear() === year && t.getMonth() === month && t.getDate() === day;
  };

  const prev = () => setCursor(new Date(year, month - 1, 1));
  const next = () => setCursor(new Date(year, month + 1, 1));

  const todayStr = toISO(new Date());

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.calOverlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={styles.calCard}>
          {/* header */}
          <View style={styles.calHeader}>
            <Pressable onPress={prev} hitSlop={10} style={styles.calNavBtn}>
              <FontAwesome6 name="chevron-left" size={13} color="#f0c96f" />
            </Pressable>
            <Text style={styles.calHeaderTxt}>{MESES[month]} {year}</Text>
            <Pressable onPress={next} hitSlop={10} style={styles.calNavBtn}>
              <FontAwesome6 name="chevron-right" size={13} color="#f0c96f" />
            </Pressable>
          </View>
          {/* weekdays */}
          <View style={styles.calWeekRow}>
            {DIAS_SEM.map((d) => (
              <Text key={d} style={styles.calWeekTxt}>{d}</Text>
            ))}
          </View>
          {/* grid */}
          <View style={styles.calGrid}>
            {cells.map((day, idx) =>
              day === null ? (
                <View key={`e-${idx}`} style={styles.calCell} />
              ) : (
                <Pressable
                  key={day}
                  onPress={() => {
                    const v = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
                    onSelect(v);
                    onClose();
                  }}
                  style={[
                    styles.calCell,
                    isSelected(day) && styles.calCellSelected,
                    !isSelected(day) && isToday(day) && styles.calCellToday,
                  ]}
                >
                  <Text style={[
                    styles.calCellTxt,
                    isSelected(day) && styles.calCellTxtSelected,
                    !isSelected(day) && isToday(day) && styles.calCellTxtToday,
                  ]}>{day}</Text>
                </Pressable>
              )
            )}
          </View>
          {/* actions */}
          <View style={styles.calActions}>
            <Pressable onPress={() => { onSelect(""); onClose(); }} style={styles.calBtnGhost}>
              <Text style={styles.calBtnGhostTxt}>Limpiar</Text>
            </Pressable>
            <Pressable onPress={() => { onSelect(todayStr); onClose(); }} style={styles.calBtnGhost}>
              <Text style={styles.calBtnGhostTxt}>Hoy</Text>
            </Pressable>
            <Pressable onPress={onClose} style={styles.calBtnPrimary}>
              <Text style={styles.calBtnPrimaryTxt}>Cerrar</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

// ─────────────────────────────────────────────────────────────
// PickerModal — selector genérico (hora / estado)
// ─────────────────────────────────────────────────────────────
export function PickerModal({
  visible,
  title,
  options,
  value,
  onSelect,
  onClose,
}: {
  visible: boolean;
  title: string;
  options: { label: string; value: string }[];
  value: string;
  onSelect: (v: string) => void;
  onClose: () => void;
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.pickerOverlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={styles.pickerCard}>
          <View style={styles.pickerHeader}>
            <Text style={styles.pickerTitle}>{title}</Text>
            <Pressable onPress={onClose} hitSlop={8} style={styles.pickerClose}>
              <FontAwesome6 name="xmark" size={14} color="#fff" />
            </Pressable>
          </View>
          <ScrollView style={{ maxHeight: 340 }} showsVerticalScrollIndicator={false}>
            {options.map((opt) => {
              const active = opt.value === value;
              return (
                <Pressable
                  key={opt.value + opt.label}
                  onPress={() => { onSelect(opt.value); onClose(); }}
                  style={[styles.pickerOpt, active && styles.pickerOptActive]}
                >
                  <Text style={[styles.pickerOptTxt, active && styles.pickerOptTxtActive]}>{opt.label}</Text>
                  {active ? <FontAwesome6 name="check" size={11} color="#caa24d" /> : null}
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

// ─────────────────────────────────────────────────────────────
// Filters bottom sheet — contenedor para agrupar filtros
// ─────────────────────────────────────────────────────────────
export function FiltersSheet({
  visible,
  onClose,
  onClear,
  hasActive,
  children,
}: {
  visible: boolean;
  onClose: () => void;
  onClear: () => void;
  hasActive: boolean;
  children: React.ReactNode;
}) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.sheetOverlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={styles.sheetCard}>
          <View style={styles.sheetHandle} />
          <View style={styles.sheetHeader}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <FontAwesome6 name="sliders" size={14} color="#f0c96f" />
              <Text style={styles.sheetTitle}>Filtros</Text>
            </View>
            <Pressable onPress={onClose} hitSlop={8} style={styles.sheetClose}>
              <FontAwesome6 name="xmark" size={14} color="#fff" />
            </Pressable>
          </View>
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: 14, paddingBottom: 8 }}>
            {children}
          </ScrollView>
          <View style={styles.sheetFooter}>
            {hasActive ? (
              <Pressable onPress={onClear} style={styles.sheetBtnGhost}>
                <Text style={styles.sheetBtnGhostTxt}>Limpiar filtros</Text>
              </Pressable>
            ) : (
              <View style={{ flex: 1 }} />
            )}
            <Pressable onPress={onClose} style={styles.sheetBtnPrimary}>
              <Text style={styles.sheetBtnPrimaryTxt}>Aplicar</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

export function FilterLabel({ children }: { children: string }) {
  return <Text style={styles.filterLabel}>{children}</Text>;
}

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────
export function formatDateDisplay(iso: string): string {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  if (!y || !m || !d) return iso;
  return `${d}/${m}/${y}`;
}

export const HORAS_OPCIONES = [
  { label: "Todas", value: "" },
  ...Array.from({ length: 11 }, (_, i) => {
    const h = String(i + 8).padStart(2, "0");
    return { label: `${h}:00`, value: `${h}:00` };
  }),
];

export const HORAS_OPCIONES_12H = [
  { label: "Todas", value: "" },
  ...Array.from({ length: 11 }, (_, i) => {
    const hh = i + 8;
    const ampm = hh < 12 ? "a. m." : "p. m.";
    const display = hh <= 12 ? hh : hh - 12;
    return { label: `${display}:00 ${ampm}`, value: `${String(hh).padStart(2, "0")}:00` };
  }),
];

// ─────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  searchWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#0f0f0f",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.09)",
    borderRadius: 12,
    paddingHorizontal: 12,
    height: 44,
    width: "100%",
  },
  searchInput: { flex: 1, color: "#fff", fontSize: 13.5, paddingVertical: 0, minWidth: 0 },
  searchClear: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: "rgba(255,255,255,0.08)",
    alignItems: "center",
    justifyContent: "center",
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#1a1a1a",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.09)",
    borderRadius: 999,
    paddingVertical: 7,
    paddingHorizontal: 12,
  },
  chipActive: {
    backgroundColor: "#caa24d",
    borderColor: "#caa24d",
  },
  chipTxt: { color: "#bdbdbd", fontSize: 12.5, fontFamily: FontFamilies.bodyMedium },
  chipTxtActive: { color: "#141414", fontFamily: FontFamilies.bodyBold },
  filterRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    alignItems: "center",
  },
  clearBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    borderWidth: 1,
    borderColor: "rgba(212,165,75,0.35)",
    borderRadius: 999,
    paddingVertical: 7,
    paddingHorizontal: 12,
  },
  clearBtnTxt: { color: "#f0c96f", fontSize: 12, fontFamily: FontFamilies.bodyMedium },
  tabsWrap: {
    flexDirection: "row",
    gap: 8,
    backgroundColor: "#0a0a0a",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
    borderRadius: 12,
    padding: 4,
  },
  tab: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 9,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: "transparent",
  },
  tabActive: { backgroundColor: "#caa24d", borderColor: "#caa24d" },
  tabTxt: { color: "#bdbdbd", fontSize: 13, fontFamily: FontFamilies.bodyMedium, textAlign: "center" },
  tabTxtActive: { color: "#141414", fontFamily: FontFamilies.bodyBold },
  tabCount: {
    backgroundColor: "rgba(255,255,255,0.08)",
    borderRadius: 999,
    paddingHorizontal: 6,
    paddingVertical: 1,
    minWidth: 20,
    alignItems: "center",
  },
  tabCountActive: { backgroundColor: "rgba(0,0,0,0.15)" },
  tabCountTxt: { color: "#bdbdbd", fontSize: 11, fontFamily: FontFamilies.bodyBold },
  tabCountTxtActive: { color: "#141414" },
  // calendar
  calOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.62)", justifyContent: "center", padding: 16 },
  calCard: {
    backgroundColor: "#121212",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(212,165,75,0.28)",
    padding: 16,
    gap: 10,
  },
  calHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  calHeaderTxt: { color: "#fff", fontSize: 16, fontFamily: FontFamilies.bodyBold, textTransform: "capitalize" },
  calNavBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.09)",
    alignItems: "center",
    justifyContent: "center",
  },
  calWeekRow: { flexDirection: "row", justifyContent: "space-between", paddingHorizontal: 2 },
  calWeekTxt: { width: 36, textAlign: "center", color: "#8a8a8a", fontSize: 11, fontFamily: FontFamilies.bodyMedium },
  calGrid: { flexDirection: "row", flexWrap: "wrap", gap: 2 },
  calCell: { width: 36, height: 36, alignItems: "center", justifyContent: "center", borderRadius: 18 },
  calCellSelected: { backgroundColor: "#caa24d" },
  calCellToday: { borderWidth: 1, borderColor: "rgba(212,165,75,0.45)" },
  calCellTxt: { color: "#fff", fontSize: 13 },
  calCellTxtSelected: { color: "#141414", fontFamily: FontFamilies.bodyBold },
  calCellTxtToday: { color: "#f0c96f", fontFamily: FontFamilies.bodyBold },
  calActions: { flexDirection: "row", gap: 8, marginTop: 4 },
  calBtnGhost: {
    flex: 1,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "rgba(212,165,75,0.35)",
    paddingVertical: 10,
    alignItems: "center",
  },
  calBtnGhostTxt: { color: "#f0c96f", fontFamily: FontFamilies.bodyMedium, fontSize: 12.5 },
  calBtnPrimary: { flex: 1, backgroundColor: "#caa24d", borderRadius: 10, paddingVertical: 10, alignItems: "center" },
  calBtnPrimaryTxt: { color: "#141414", fontFamily: FontFamilies.button, fontSize: 12.5 },
  // picker
  pickerOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.62)", justifyContent: "center", padding: 16 },
  pickerCard: {
    backgroundColor: "#121212",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(212,165,75,0.28)",
    padding: 16,
    gap: 10,
    maxHeight: "75%",
  },
  pickerHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  pickerTitle: { color: "#fff", fontSize: 16, fontFamily: FontFamilies.bodyBold },
  pickerClose: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.09)",
    alignItems: "center",
    justifyContent: "center",
  },
  pickerOpt: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 13,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.06)",
    borderRadius: 8,
  },
  pickerOptActive: { backgroundColor: "rgba(212,165,75,0.10)" },
  pickerOptTxt: { color: "#fff", fontSize: 13.5 },
  pickerOptTxtActive: { color: "#f0c96f", fontFamily: FontFamilies.bodyBold },
  // sheet
  sheetOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.55)", justifyContent: "flex-end" },
  sheetCard: {
    backgroundColor: "#121212",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderWidth: 1,
    borderBottomWidth: 0,
    borderColor: "rgba(212,165,75,0.28)",
    padding: 16,
    gap: 14,
    maxHeight: "78%",
  },
  sheetHandle: { width: 36, height: 4, borderRadius: 2, backgroundColor: "rgba(255,255,255,0.18)", alignSelf: "center", marginBottom: 2 },
  sheetHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  sheetTitle: { color: "#fff", fontSize: 16, fontFamily: FontFamilies.bodyBold },
  sheetClose: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.09)",
    alignItems: "center",
    justifyContent: "center",
  },
  sheetFooter: { flexDirection: "row", gap: 10, marginTop: 4 },
  sheetBtnGhost: {
    flex: 1,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "rgba(212,165,75,0.35)",
    paddingVertical: 11,
    alignItems: "center",
  },
  sheetBtnGhostTxt: { color: "#f0c96f", fontFamily: FontFamilies.button, fontSize: 13 },
  sheetBtnPrimary: { flex: 1, backgroundColor: "#caa24d", borderRadius: 10, paddingVertical: 11, alignItems: "center" },
  sheetBtnPrimaryTxt: { color: "#141414", fontFamily: FontFamilies.button, fontSize: 13 },
  filterLabel: { color: "#f0c96f", fontSize: 11, fontFamily: FontFamilies.bodyBold, textTransform: "uppercase", letterSpacing: 0.3 },
});
