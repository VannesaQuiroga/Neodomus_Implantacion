// ─────────────────────────────────────────────────────────────
// Formulario "Enviar consulta" — adaptación móvil del tab de la
// AyudaPage WEB. Mismo endpoint POST /contacto, mismas
// validaciones y mensajes literales.
// ─────────────────────────────────────────────────────────────

import React, { useEffect, useState } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { NeodomusColors as C, FontFamilies } from "@/constants/theme";
import { enviarConsulta } from "@/services/contacto.service";
import { useAuth } from "@/contexts/AuthContext";
import { useIdioma } from "@/contexts/IdiomaContext";

const CATEGORIAS = [
  { valor: "consulta-general", asunto: "Consulta general", clave: "form.opcion.consultaGeneral" },
  { valor: "soporte-tecnico", asunto: "Soporte técnico", clave: "form.opcion.soporteTecnico" },
  { valor: "pedido", asunto: "Pedido", clave: "form.opcion.pedido" },
  { valor: "pago", asunto: "Pago", clave: "form.opcion.pago" },
  { valor: "reembolso", asunto: "Reembolso", clave: "form.opcion.reembolso" },
  { valor: "reclamo", asunto: "Reclamo", clave: "form.opcion.reclamo" },
  { valor: "otro", asunto: "Otro", clave: "form.opcion.otro" },
];

interface FormularioContactoProps {
  alEnviado?: (mensaje: string, tipo: "success" | "error") => void;
}

export default function FormularioContacto({ alEnviado }: FormularioContactoProps) {
  const { usuario } = useAuth();
  const { t } = useIdioma();
  const [nombre, setNombre] = useState(usuario?.nombre ?? "");
  const [email, setEmail] = useState(usuario?.correo ?? "");
  const [categoria, setCategoria] = useState("");
  const [mensaje, setMensaje] = useState("");
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    if (usuario) {
      setNombre((actual) => actual || usuario.nombre);
      setEmail((actual) => actual || usuario.correo);
    }
  }, [usuario]);

  const enviar = async () => {
    if (!nombre.trim() || !email.trim() || !mensaje.trim()) {
      alEnviado?.(t("form.completaCampos"), "error");
      return;
    }
    if (!email.includes("@")) {
      alEnviado?.(t("form.emailInvalido"), "error");
      return;
    }
    if (!categoria) {
      alEnviado?.(t("form.seleccionaCategoria"), "error");
      return;
    }

    setEnviando(true);
    try {
      await enviarConsulta({
        nombre: nombre.trim(),
        email: email.trim(),
        asunto: CATEGORIAS.find((item) => item.valor === categoria)?.asunto ?? "Consulta",
        mensaje: mensaje.trim(),
        categoria,
      });
      alEnviado?.(
        t("form.exito"),
        "success",
      );
      setCategoria("");
      setMensaje("");
    } catch {
      alEnviado?.(t("form.errorEnvio"), "error");
    } finally {
      setEnviando(false);
    }
  };

  return (
    <View style={styles.form}>
      <Text style={styles.label}>{t("form.nombre")}</Text>
      <TextInput
        style={styles.input}
        placeholder={t("form.nombrePlaceholder")}
        placeholderTextColor="#8a8a8a"
        value={nombre}
        onChangeText={setNombre}
        editable={!enviando}
      />

      <Text style={styles.label}>{t("form.email")}</Text>
      <TextInput
        style={styles.input}
        placeholder={t("form.emailPlaceholder")}
        placeholderTextColor="#8a8a8a"
        keyboardType="email-address"
        autoCapitalize="none"
        value={email}
        onChangeText={setEmail}
        editable={!enviando}
      />

      <Text style={styles.label}>{t("form.motivo")}</Text>
      <View style={styles.categoriasWrap}>
        {CATEGORIAS.map((item) => (
          <Pressable
            key={item.valor}
            onPress={() => setCategoria(item.valor)}
            disabled={enviando}
            style={[styles.chipCategoria, categoria === item.valor && styles.chipCategoriaActiva]}
          >
            <Text
              style={[
                styles.chipCategoriaTexto,
                categoria === item.valor && styles.chipCategoriaTextoActivo,
              ]}
            >
              {t(item.clave)}
            </Text>
          </Pressable>
        ))}
      </View>

      <Text style={styles.label}>{t("form.mensaje")}</Text>
      <TextInput
        style={[styles.input, styles.textarea]}
        placeholder={t("form.mensajePlaceholder")}
        placeholderTextColor="#8a8a8a"
        value={mensaje}
        onChangeText={setMensaje}
        multiline
        textAlignVertical="top"
        editable={!enviando}
        maxLength={2000}
      />
      <Text style={styles.hint}>{t("form.minimoCaracteres")}</Text>

      <Pressable
        style={({ pressed }) => [
          styles.boton,
          pressed && styles.presionado,
          enviando && styles.deshabilitado,
        ]}
        onPress={() => void enviar()}
        disabled={enviando}
      >
        <Text style={styles.textoBoton}>
          {enviando ? t("form.enviando") : t("publico.enviarConsulta")}
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  form: {
    backgroundColor: C.cardOscura,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: C.grisBorde,
    padding: 16,
    gap: 6,
  },

  label: {
    color: C.blanco,
    fontSize: 13.5,
    fontFamily: FontFamilies.bodyBold,
    marginTop: 8,
  },

  input: {
    backgroundColor: C.inputFondo,
    borderWidth: 1,
    borderColor: C.grisBorde,
    borderRadius: 12,
    color: C.blanco,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14.5,
    fontFamily: FontFamilies.body,
    minHeight: 46,
  },

  textarea: {
    minHeight: 110,
    paddingTop: 12,
  },

  hint: {
    color: C.grisTexto,
    fontSize: 11.5,
    marginTop: -2,
  },

  categoriasWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 7,
    marginTop: 4,
  },

  chipCategoria: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: C.bordeOro,
    backgroundColor: "rgba(212,165,75,0.06)",
    paddingVertical: 7,
    paddingHorizontal: 12,
  },

  chipCategoriaActiva: {
    backgroundColor: C.oro,
    borderColor: C.oro,
  },

  chipCategoriaTexto: {
    color: C.oroSuave,
    fontSize: 12.5,
    fontFamily: FontFamilies.bodyMedium,
  },

  chipCategoriaTextoActivo: {
    color: C.textoSobreOro,
    fontFamily: FontFamilies.button,
  },

  boton: {
    backgroundColor: "#d4a54b",
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: "center",
    marginTop: 14,
  },

  deshabilitado: { opacity: 0.6 },

  presionado: { opacity: 0.85 },

  textoBoton: {
    color: C.textoSobreOro,
    fontFamily: FontFamilies.button,
    fontSize: 14,
  },
});
