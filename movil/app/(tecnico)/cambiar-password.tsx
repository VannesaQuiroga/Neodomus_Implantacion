// Ruta móvil de cambio de contraseña. Expo Router la incorpora a la navegación según su ubicación en app/.
import React, { useState } from "react";
import { useIdioma } from "@/contexts/IdiomaContext";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View, ActivityIndicator } from "react-native";
import FontAwesome6 from "@expo/vector-icons/FontAwesome6";
import { NeodomusColors as C, FontFamilies } from "@/constants/theme";
import { apiFetch } from "@/services/api";
import { useSafeAreaInsets } from "react-native-safe-area-context";

// Comunica con el backend mediante API "/auth/update-password", API "/auth/change-password".
export default function CambiarPasswordTecnico() {
  const insets = useSafeAreaInsets();
  const { t } = useIdioma();
  const [actual, setActual] = useState("");
  const [nueva, setNueva] = useState("");
  const [confirmar, setConfirmar] = useState("");
  const [show1, setShow1] = useState(false);
  const [show2, setShow2] = useState(false);
  const [show3, setShow3] = useState(false);
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);

  const validar = () => {
    if (nueva.length < 8) return "La nueva contraseña debe tener al menos 8 caracteres";
    if (!/[A-Z]/.test(nueva) || !/[a-z]/.test(nueva) || !/\d/.test(nueva) || !/[!@#$%^&*(),.?":{}|<>]/.test(nueva))
      return "La contraseña debe tener mayúscula, minúscula, número y carácter especial";
    if (nueva !== confirmar) return "Las contraseñas no coinciden";
    return null;
  };

  // Comunica con el backend mediante API "/auth/update-password", API "/auth/change-password".
  const guardar = async () => {
    const err = validar();
    if (err) { setToast({ msg: err, ok: false }); setTimeout(() => setToast(null), 2500); return; }
    setLoading(true);
    try {
      // técnico usa /auth/update-password (sin contraseña actual)
      // si el backend exige actual, intentamos change-password como fallback
      try {
        await apiFetch("/auth/update-password", { method: "POST", body: JSON.stringify({ new_password: nueva }) });
      } catch (e: any) {
        if (actual) {
          await apiFetch("/auth/change-password", { method: "POST", body: JSON.stringify({ current_password: actual, new_password: nueva }) });
        } else throw e;
      }
      setToast({ msg: "Contraseña actualizada correctamente", ok: true });
      setActual(""); setNueva(""); setConfirmar("");
    } catch (e: any) {
      setToast({ msg: e?.message || "Error al actualizar contraseña", ok: false });
    } finally {
      setLoading(false);
      setTimeout(() => setToast(null), 2500);
    }
  };

  return (
    <View style={styles.pantalla}>
      <ScrollView contentContainerStyle={[styles.contenido, { paddingBottom: insets.bottom + 72 }]} showsVerticalScrollIndicator={false}>
        <Text style={styles.titulo}>{t("auth.cambiarPassword")}</Text>
        <Text style={styles.sub}>{t("tecnico.resumenJornada")}</Text>

        <View style={styles.card}>
          <Text style={styles.label}>{t("perfil.correo")}</Text>
          <View style={styles.inputWrap}>
            <TextInput value={actual} onChangeText={setActual} placeholder="Contraseña actual" placeholderTextColor="#6b6b6b" secureTextEntry={!show1} style={styles.input} />
            <Pressable onPress={() => setShow1(!show1)} hitSlop={8} style={styles.eye}>
              <FontAwesome6 name={show1 ? "eye" : "eye-slash"} size={13} color="#8a8a8a" />
            </Pressable>
          </View>

          <Text style={styles.label}>Nueva contraseña</Text>
          <View style={styles.inputWrap}>
            <TextInput value={nueva} onChangeText={setNueva} placeholder="Nueva contraseña" placeholderTextColor="#6b6b6b" secureTextEntry={!show2} style={styles.input} />
            <Pressable onPress={() => setShow2(!show2)} hitSlop={8} style={styles.eye}>
              <FontAwesome6 name={show2 ? "eye" : "eye-slash"} size={13} color="#8a8a8a" />
            </Pressable>
          </View>

          <Text style={styles.label}>Confirmar nueva contraseña</Text>
          <View style={styles.inputWrap}>
            <TextInput value={confirmar} onChangeText={setConfirmar} placeholder="Confirmar contraseña" placeholderTextColor="#6b6b6b" secureTextEntry={!show3} style={styles.input} />
            <Pressable onPress={() => setShow3(!show3)} hitSlop={8} style={styles.eye}>
              <FontAwesome6 name={show3 ? "eye" : "eye-slash"} size={13} color="#8a8a8a" />
            </Pressable>
          </View>

          <View style={styles.requisitos}>
            <Text style={styles.reqTitle}>La contraseña debe contener:</Text>
            <Text style={[styles.req, nueva.length >= 8 && styles.reqOk]}>• 8+ caracteres</Text>
            <Text style={[styles.req, /[A-Z]/.test(nueva) && styles.reqOk]}>• Una mayúscula</Text>
            <Text style={[styles.req, /[a-z]/.test(nueva) && styles.reqOk]}>• Una minúscula</Text>
            <Text style={[styles.req, /\d/.test(nueva) && styles.reqOk]}>• Un número</Text>
            <Text style={[styles.req, /[!@#$%^&*(),.?":{}|<>]/.test(nueva) && styles.reqOk]}>• Carácter especial</Text>
          </View>

          <Pressable onPress={guardar} disabled={loading} style={({ pressed }) => [styles.btn, pressed && { opacity: 0.85 }, loading && { opacity: 0.6 }]}>
            {loading ? <ActivityIndicator color="#141414" /> : <Text style={styles.btnTxt}>Actualizar contraseña</Text>}
          </Pressable>

          {toast ? (
            <View style={[styles.toastInline, toast.ok ? styles.toastOk : styles.toastErr]}>
              <FontAwesome6 name={toast.ok ? "circle-check" : "circle-exclamation"} size={12} color={toast.ok ? "#7ee29a" : "#ff8f93"} />
              <Text style={[styles.toastInlineTxt, toast.ok ? { color: "#7ee29a" } : { color: "#ff8f93" }]}>{toast.msg}</Text>
            </View>
          ) : null}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  pantalla: { flex: 1, backgroundColor: "#000" },
  contenido: { padding: 16, gap: 14 },
  titulo: { color: "#fff", fontSize: 20, fontFamily: FontFamilies.bodyBold },
  sub: { color: "#bdbdbd", fontSize: 13, marginTop: -8 },
  card: { backgroundColor: "#161616", borderWidth: 1, borderColor: "rgba(255,255,255,0.09)", borderRadius: 14, padding: 14, gap: 10 },
  label: { color: "#f0c96f", fontSize: 11, fontFamily: FontFamilies.bodyBold, textTransform: "uppercase" },
  inputWrap: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#0f0f0f",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.09)",
    borderRadius: 10,
    paddingHorizontal: 12,
    height: 44,
  },
  input: { flex: 1, color: "#fff", fontSize: 13.5, paddingVertical: 0 },
  eye: { padding: 6, marginLeft: 6 },
  requisitos: { backgroundColor: "rgba(212,165,75,0.08)", borderWidth: 1, borderColor: "rgba(212,165,75,0.18)", borderRadius: 10, padding: 10, gap: 2 },
  reqTitle: { color: "#f0c96f", fontSize: 11, fontFamily: FontFamilies.bodyBold },
  req: { color: "#6b6b6b", fontSize: 11 },
  reqOk: { color: "#caa24d", fontFamily: FontFamilies.bodyBold },
  btn: { backgroundColor: "#caa24d", borderRadius: 10, paddingVertical: 12, alignItems: "center", marginTop: 6 },
  btnTxt: { color: "#141414", fontFamily: FontFamilies.button, fontSize: 13 },
  toastInline: { flexDirection: "row", alignItems: "center", gap: 8, borderWidth: 1, borderRadius: 10, padding: 10 },
  toastOk: { backgroundColor: "rgba(126,226,154,0.12)", borderColor: "rgba(126,226,154,0.3)" },
  toastErr: { backgroundColor: "rgba(240,133,138,0.12)", borderColor: "rgba(240,133,138,0.3)" },
  toastInlineTxt: { flex: 1, fontSize: 12.5 },
});