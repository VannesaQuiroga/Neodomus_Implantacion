// ─────────────────────────────────────────────────────────────
// Pantalla Ayuda (Centro de Ayuda) — adaptación móvil de la
// AyudaPage WEB. Compartida por el TAB Ayuda y la ruta apilada /ayuda.
// Mismos 4 tabs: Preguntas frecuentes · Asistente virtual ·
// Contacto · Enviar consulta. FAQs literales (con intento a
// /faq como la web, que cae al fallback), contactos literales.
// ─────────────────────────────────────────────────────────────

import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";import FontAwesome6 from "@expo/vector-icons/FontAwesome6";

import { NeodomusColors as C, FontFamilies } from "@/constants/theme";
import PublicScreen from "@/components/public/PublicScreen";
import ChatBot from "@/components/chat/ChatBot";
import FormularioContacto from "@/components/public/FormularioContacto";
import {
  CANALES_ADICIONALES,
  INFO_CONTACTO,
} from "@/data/contactoInfo";
import { apiFetch } from "@/services/api";
import { useScrollTopAlEntrar } from "@/hooks/useScrollTopAlEntrar";
type TabAyuda = "faq" | "asistente" | "contacto" | "consulta";

interface FAQ {
  id: number;
  pregunta: string;
  respuesta: string;
  categoria: string;
}

// Fallback literal de la WEB (faqsMock en AyudaPage.tsx).
const FAQS_MOCK: FAQ[] = [
  { id: 1, pregunta: "¿Cómo realizo un pedido?", respuesta: 'Navega a la sección Productos, selecciona los items que deseas, ajusta cantidades y haz clic en "Agregar al carrito". Luego ve a tu carrito y completa el checkout.', categoria: "Pedidos" },
  { id: 2, pregunta: "¿Cuáles son los métodos de pago?", respuesta: "Aceptamos tarjetas de crédito/débito (Visa, Mastercard), PSE, Nequi y Daviplata. Todos los pagos son procesados de forma segura.", categoria: "Pagos" },
  { id: 3, pregunta: "¿Cómo agendo una cita con un técnico?", respuesta: 'Ve a la sección "Citas" en el menú, selecciona el tipo de servicio, fecha, hora y describe tu necesidad. Opcionalmente elige un técnico preferido.', categoria: "Citas" },
  { id: 4, pregunta: "¿Puedo cancelar o modificar mi cita?", respuesta: 'Sí, puedes cancelar o reprogramar desde tu perfil en la sección "Mis citas" con al menos 2 horas de antelación.', categoria: "Citas" },
  { id: 5, pregunta: "¿Cómo agrego productos a favoritos?", respuesta: 'En la página de productos, haz clic en el ícono de corazón en la tarjeta del producto. Luego ve a "Mi perfil > Mis favoritos" para verlos.', categoria: "Cuenta" },
  { id: 6, pregunta: "¿Cuál es el tiempo de entrega?", respuesta: "Envíos a ciudades principales: 2-3 días hábiles. Otras zonas: 4-6 días hábiles. Recibirás notificaciones de seguimiento.", categoria: "Envíos" },
  { id: 7, pregunta: "¿Ofrecen garantía en instalaciones?", respuesta: "Sí, todas nuestras instalaciones tienen garantía de 12 meses en mano de obra y la garantía del fabricante en equipos.", categoria: "Servicios" },
  { id: 8, pregunta: "¿Cómo contacto a soporte?", respuesta: "Puedes usar el formulario en esta página, escribir a soporte@neodomus.com o llamar al +57 601 123 4567 en horario laboral.", categoria: "Contacto" },
];

const TABS: { id: TabAyuda; texto: string; icono: string }[] = [
  { id: "faq", texto: "Preguntas frecuentes", icono: "circle-question" },
  { id: "asistente", texto: "Asistente virtual", icono: "robot" },
  { id: "contacto", texto: "Contacto", icono: "headset" },
  { id: "consulta", texto: "Enviar consulta", icono: "paper-plane" },
];

export default function PantallaAyuda() {
  const scrollRef = useRef<ScrollView | null>(null);
  // Entrar a Ayuda desde otra sección → empezar arriba.
  useScrollTopAlEntrar(scrollRef);
  const [tabActivo, setTabActivo] = useState<TabAyuda>("faq");
  const [faqs, setFaqs] = useState<FAQ[]>(FAQS_MOCK);
  const [cargandoFaqs, setCargandoFaqs] = useState(true);
  const [faqAbierta, setFaqAbierta] = useState<number | null>(null);
  const [toast, setToast] = useState<{ msg: string; tipo: "success" | "error" } | null>(null);

  useEffect(() => {
    let activo = true;
    // Igual que la web: intenta /faq; si falla usa el fallback literal.
    apiFetch<{ data?: FAQ[] } | FAQ[]>("/faq")
      .then((datos) => {
        if (!activo) return;
        const lista = Array.isArray(datos) ? datos : (datos.data ?? []);
        if (lista.length > 0) setFaqs(lista);
      })
      .catch(() => {})
      .finally(() => {
        if (activo) setCargandoFaqs(false);
      });
    return () => {
      activo = false;
    };
  }, []);

  useEffect(() => {
    if (!toast) return;
    const temporizador = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(temporizador);
  }, [toast]);

  const categorias = [...new Set(faqs.map((faq) => faq.categoria))];

  return (
    <PublicScreen scrollRef={scrollRef}>
      <View style={styles.contenedor}>
        <Text style={styles.titulo}>Centro de Ayuda</Text>
        <Text style={styles.subtitulo}>
          Encuentra respuestas rápidas o escríbenos directamente, sin necesidad
          de iniciar sesión
        </Text>

        {/* Tabs internos */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.tabs}
        >
          {TABS.map((tab) => (
            <Pressable
              key={tab.id}
              onPress={() => setTabActivo(tab.id)}
              style={[styles.tab, tabActivo === tab.id && styles.tabActivo]}
            >
              <FontAwesome6
                name={(tab.icono as never) || "circle-question"}
                size={13}
                color={tabActivo === tab.id ? C.textoSobreOro : C.oroSuave}
              />
              <Text
                style={[
                  styles.tabTexto,
                  tabActivo === tab.id && styles.tabTextoActivo,
                ]}
              >
                {tab.texto}
              </Text>
            </Pressable>
          ))}
        </ScrollView>

        {/* ── FAQ ── */}
        {tabActivo === "faq" && (
          cargandoFaqs ? (
            <View style={styles.centro}>
              <ActivityIndicator color={C.oro} />
              <Text style={styles.cargandoTexto}>Cargando preguntas...</Text>
            </View>
          ) : (
            <View style={styles.seccion}>
              {categorias.map((categoria) => (
                <View key={categoria} style={styles.grupoFaq}>
                  <Text style={styles.categoriaTitulo}>
                    {categoria.toUpperCase()}
                  </Text>
                  {faqs
                    .filter((faq) => faq.categoria === categoria)
                    .map((faq) => (
                      <View
                        key={faq.id}
                        style={styles.tarjetaFaq}
                      >
                        <Pressable
                          style={styles.faqCabecera}
                          onPress={() =>
                            setFaqAbierta(faqAbierta === faq.id ? null : faq.id)
                          }
                        >
                          <Text style={styles.faqPregunta}>{faq.pregunta}</Text>
                          <FontAwesome6
                            name={
                              faqAbierta === faq.id
                                ? "chevron-up"
                                : "chevron-down"
                            }
                            size={13}
                            color={C.oroSuave}
                          />
                        </Pressable>
                        {faqAbierta === faq.id && (
                          <Text style={styles.faqRespuesta}>{faq.respuesta}</Text>
                        )}
                      </View>
                    ))}
                </View>
              ))}

              <View style={styles.ctaFaq}>
                <Text style={styles.ctaFaqTitulo}>
                  ¿No encontraste tu respuesta?
                </Text>
                <Pressable
                  style={({ pressed }) => [
                    styles.botonPrimario,
                    pressed && styles.presionado,
                  ]}
                  onPress={() => setTabActivo("consulta")}
                >
                  <Text style={styles.textoBotonPrimario}>
                    Enviar una pregunta
                  </Text>
                </Pressable>
              </View>
            </View>
          )
        )}

        {/* ── Asistente virtual ── */}
        {tabActivo === "asistente" && <ChatBot />}

        {/* ── Contacto ── */}
        {tabActivo === "contacto" && (
          <View style={styles.seccion}>
            {INFO_CONTACTO.map((item) => (
              <Pressable
                key={item.titulo}
                disabled={!item.enlace}
                onPress={() =>
                  item.enlace && Linking.openURL(item.enlace).catch(() => {})
                }
                style={styles.tarjetaContacto}
              >
                <View style={styles.contactoIcono}>
                  <FontAwesome6
                    name={(item.icono as never) || "circle-info"}
                    size={16}
                    color={C.textoSobreOro}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.contactoTitulo}>{item.titulo}</Text>
                  <Text style={styles.contactoValor}>{item.valor}</Text>
                  <Text style={styles.contactoDetalle}>{item.detalle}</Text>
                </View>
                {!!item.enlace && (
                  <FontAwesome6
                    name="arrow-up-right-from-square"
                    size={13}
                    color={C.grisTexto}
                  />
                )}
              </Pressable>
            ))}

            <View style={styles.canalesAdicionales}>
              <Text style={styles.canalesTitulo}>Canales adicionales</Text>
              {CANALES_ADICIONALES.map((canal) => (
                <Text key={canal} style={styles.canalLinea}>
                  {canal}
                </Text>
              ))}
            </View>
          </View>
        )}

        {/* ── Enviar consulta ── */}
        {tabActivo === "consulta" && (
          <FormularioContacto
            alEnviado={(msg, tipo) => setToast({ msg, tipo })}
          />
        )}
      </View>

      {toast && (
        <View style={styles.toastWrap} pointerEvents="none">
          <View
            style={[
              styles.toast,
              toast.tipo === "success" ? styles.toastExito : styles.toastError,
            ]}
          >
            <Text style={styles.toastTexto}>{toast.msg}</Text>
          </View>
        </View>
      )}
    </PublicScreen>
  );
}

const styles = StyleSheet.create({
  contenedor: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 14,
    gap: 14,
  },

  titulo: {
    color: C.blanco,
    fontSize: 25,
    fontFamily: FontFamilies.bodyBold,
  },

  subtitulo: {
    color: C.grisTexto,
    fontSize: 14,
    lineHeight: 20,
    marginTop: -6,
  },

  tabs: {
    gap: 8,
    paddingRight: 16,
  },

  tab: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: C.bordeOro,
    backgroundColor: "rgba(212,165,75,0.06)",
    paddingVertical: 9,
    paddingHorizontal: 14,
  },

  tabActivo: {
    backgroundColor: C.oro,
    borderColor: C.oro,
  },

  tabTexto: {
    color: C.oroSuave,
    fontSize: 13,
    fontFamily: FontFamilies.bodyMedium,
  },

  tabTextoActivo: {
    color: C.textoSobreOro,
    fontFamily: FontFamilies.button,
  },

  seccion: {
    gap: 10,
    paddingBottom: 10,
  },

  grupoFaq: { gap: 8 },

  categoriaTitulo: {
    color: C.grisTexto,
    fontSize: 12,
    letterSpacing: 1,
    fontFamily: FontFamilies.bodyBold,
    marginTop: 4,
  },

  tarjetaFaq: {
    backgroundColor: C.cardOscura,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: C.grisBorde,
    paddingVertical: 4,
    paddingHorizontal: 14,
  },

  faqCabecera: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    paddingVertical: 13,
  },

  faqPregunta: {
    color: C.blanco,
    fontSize: 14.5,
    fontFamily: FontFamilies.bodyMedium,
    flex: 1,
  },

  faqRespuesta: {
    color: C.grisTexto,
    fontSize: 13.5,
    lineHeight: 21,
    paddingBottom: 13,
  },

  ctaFaq: {
    alignItems: "center",
    gap: 10,
    marginTop: 8,
    marginBottom: 4,
  },

  ctaFaqTitulo: {
    color: C.blanco,
    fontSize: 15,
    fontFamily: FontFamilies.bodyBold,
  },

  botonPrimario: {
    backgroundColor: "#d4a54b",
    borderRadius: 12,
    paddingVertical: 13,
    paddingHorizontal: 22,
  },

  textoBotonPrimario: {
    color: C.textoSobreOro,
    fontFamily: FontFamilies.button,
    fontSize: 14,
  },

  centro: {
    alignItems: "center",
    paddingVertical: 40,
    gap: 10,
  },

  cargandoTexto: {
    color: C.grisTexto,
    fontSize: 13.5,
  },

  tarjetaContacto: {
    flexDirection: "row",
    alignItems: "center",
    gap: 13,
    backgroundColor: C.cardOscura,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: C.grisBorde,
    padding: 14,
  },

  contactoIcono: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: C.oroClaro,
    alignItems: "center",
    justifyContent: "center",
  },

  contactoTitulo: {
    color: C.grisTexto,
    fontSize: 12.5,
  },

  contactoValor: {
    color: C.blanco,
    fontSize: 15,
    fontFamily: FontFamilies.bodyBold,
    marginVertical: 1,
  },

  contactoDetalle: {
    color: C.grisTexto,
    fontSize: 12.5,
  },

  canalesAdicionales: {
    backgroundColor: "rgba(212,165,75,0.07)",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: C.bordeOro,
    padding: 14,
    gap: 5,
  },

  canalesTitulo: {
    color: C.oroSuave,
    fontSize: 13.5,
    fontFamily: FontFamilies.bodyBold,
    marginBottom: 2,
  },

  canalLinea: {
    color: C.blanco,
    fontSize: 13.5,
    lineHeight: 20,
  },

  toastWrap: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: "center",
    justifyContent: "flex-end",
    paddingBottom: 84,
  },

  toast: {
    borderRadius: 40,
    borderWidth: 1,
    paddingVertical: 10,
    paddingHorizontal: 20,
    maxWidth: "90%",
  },

  toastExito: {
    backgroundColor: "rgba(0,0,0,0.92)",
    borderColor: C.verdeExito,
  },

  toastError: {
    backgroundColor: "rgba(0,0,0,0.92)",
    borderColor: C.rojoError,
  },

  toastTexto: {
    color: C.blanco,
    fontSize: 13.5,
    textAlign: "center",
  },

  presionado: { opacity: 0.85 },
});
