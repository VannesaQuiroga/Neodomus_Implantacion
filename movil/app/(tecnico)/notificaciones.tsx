import React, { useEffect, useState, useRef } from "react";
import { useIdioma } from "@/contexts/IdiomaContext";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import FontAwesome6 from "@expo/vector-icons/FontAwesome6";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { NeodomusColors as C, FontFamilies } from "@/constants/theme";
import { apiFetch } from "@/services/api";
import { useScrollTopAlEntrar } from "@/hooks/useScrollTopAlEntrar";

export default function TecnicoNotificacionesScreen() {
  const insets = useSafeAreaInsets();
  const { t } = useIdioma();
  const scrollRef = useRef<ScrollView>(null);
  useScrollTopAlEntrar(scrollRef);
  const [notifs, setNotifs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [marcando, setMarcando] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [mostrarTodas, setMostrarTodas] = useState(false);

  const cargar = async () => {
    setLoading(true);
    try {
      const res = await apiFetch<any[]>("/notificaciones/mias");
      setNotifs(Array.isArray(res) ? res : []);
    } catch {}
    setLoading(false);
  };

  useEffect(() => { cargar(); }, []);
  useEffect(() => { if (!toast) return; const t=setTimeout(()=>setToast(null),2500); return()=>clearTimeout(t); }, [toast]);

  const marcarTodas = async () => {
    if (notifs.length===0 || marcando) return;
    setMarcando(true);
    try {
      await apiFetch("/notificaciones/leer-todas", { method: "PATCH" });
      setNotifs(prev => prev.map(n=> ({ ...n, leida:true })));
      setToast(t("notificaciones.marcadas"));
    } catch (e:any) { setToast(e?.message || "Error"); }
    setMarcando(false);
  };

  if (loading) return <View style={styles.centro}><ActivityIndicator color={C.oro} /><Text style={styles.gris}>{t("common.cargando")}</Text></View>;

  const noLeidas = notifs.filter((n:any)=> !n.leida).length;
  const notifsVisibles = mostrarTodas ? notifs : notifs.filter((n:any)=> !n.leida);

  return (
    <View style={styles.pantalla}>
      <ScrollView ref={scrollRef} contentContainerStyle={[styles.contenido, { paddingBottom: insets.bottom + 72 }]} showsVerticalScrollIndicator={false}>
        <View style={styles.headerRow}>
          <View>
            <Text style={styles.titulo}>{t("notificaciones.titulo")}</Text>
            <Text style={styles.sub}>{noLeidas >0 ? `${noLeidas} sin leer` : t("notificaciones.todasAlDia")}</Text>
          </View>
          <View style={styles.headerBtns}>
            {notifs.length > 0 && (
              <Pressable onPress={() => setMostrarTodas(!mostrarTodas)} style={styles.btnToggle}>
                <FontAwesome6 name={mostrarTodas ? "eye-slash" : "eye"} size={11} color="#141414" />
                <Text style={styles.btnMarcarTxt}>{mostrarTodas ? "No leídas" : "Ver todas"}</Text>
              </Pressable>
            )}
            {notifs.length>0 && (
              <Pressable onPress={marcarTodas} disabled={marcando || noLeidas===0} style={[styles.btnMarcar, (marcando || noLeidas===0) && { opacity:0.5 }]}>
                <FontAwesome6 name="check-double" size={11} color="#141414" />
                <Text style={styles.btnMarcarTxt}>{marcando ? t("notificaciones.marcando") : t("notificaciones.marcarLeidas")}</Text>
              </Pressable>
            )}
          </View>
        </View>

        {notifs.length===0 ? (
          <View style={styles.empty}>
            <FontAwesome6 name="bell" size={24} color="#5a5a5a" />
            <Text style={styles.emptyTitle}>{t("tecnico.sinNotificaciones")}</Text>
            <Text style={styles.emptyHint}>{t("tecnico.sinNotificacionesHint")}</Text>
          </View>
        ) : notifsVisibles.length===0 ? (
          <View style={styles.empty}>
            <FontAwesome6 name="bell-slash" size={24} color="#5a5a5a" />
            <Text style={styles.emptyTitle}>{mostrarTodas ? "Sin notificaciones" : "Todo al día"}</Text>
            <Text style={styles.emptyHint}>{mostrarTodas ? "No hay notificaciones" : "No tienes notificaciones sin leer"}</Text>
          </View>
        ) : (
          notifsVisibles.map((n:any)=> {
            const titulo = n.titulo || n.title || "Notificación";
            const mensaje = n.mensaje || n.message || "";
            const fechaRaw = n.fecha_creacion || n.fecha || n.created_at;
            const fechaTxt = fechaRaw ? new Date(fechaRaw).toLocaleDateString("es-ES", { day:"numeric", month:"short", year:"numeric" }) : "";
            const leida = !!n.leida;
            return (
              <View key={n.id_notificacion || n.id} style={styles.notifCard}>
                <View style={styles.notifLeft}>
                  <View style={[styles.iconCircle, !leida && { backgroundColor:"rgba(212,165,75,0.18)", borderColor:"#caa24d" }]}>
                    <FontAwesome6 name="bell" size={13} color={!leida ? "#f0c96f" : "#bdbdbd"} />
                  </View>
                  <View style={{ flex:1, gap:3, minWidth:0 }}>
                    <Text style={styles.notifTitulo} numberOfLines={2}>{titulo}</Text>
                    {mensaje ? <Text style={styles.notifMensaje} numberOfLines={3}>{mensaje}</Text> : null}
                    {fechaTxt ? <Text style={styles.notifFecha}>{fechaTxt}</Text> : null}
                  </View>
                </View>
                {!leida ? <View style={styles.dot} /> : null}
              </View>
            );
          })
        )}
      </ScrollView>
      {toast && <View style={styles.toastWrap} pointerEvents="none"><View style={styles.toast}><Text style={styles.toastTxt}>{toast}</Text></View></View>}
    </View>
  );
}

const styles = StyleSheet.create({
  pantalla: { flex:1, backgroundColor:"#000" },
  contenido: { padding:14, gap:12 },
  centro: { flex:1, backgroundColor:"#000", alignItems:"center", justifyContent:"center", gap:10, paddingTop:40 },
  gris: { color:"#bdbdbd", fontSize:12.5 },
  titulo: { color:"#fff", fontSize:18, fontFamily: FontFamilies.bodyBold },
  sub: { color:"#bdbdbd", fontSize:13, marginTop:-8 },
  headerRow: { flexDirection:"row", alignItems:"center", justifyContent:"space-between", gap:10 },
  headerBtns: { flexDirection:"row", gap:6 },
  btnToggle: { flexDirection:"row", alignItems:"center", gap:6, backgroundColor:"#caa24d", paddingVertical:6, paddingHorizontal:10, borderRadius:8 },
  btnMarcar: { flexDirection:"row", alignItems:"center", gap:6, backgroundColor:"#caa24d", paddingVertical:6, paddingHorizontal:10, borderRadius:8 },
  btnMarcarTxt: { color:"#141414", fontSize:11, fontFamily: FontFamilies.bodyBold },
  empty: { alignItems:"center", paddingVertical:30, gap:8 },
  emptyTitle: { color:"#fff", fontSize:14, fontFamily: FontFamilies.bodyBold },
  emptyHint: { color:"#8a8a8a", fontSize:12, textAlign:"center" },
  notifCard: { flexDirection:"row", alignItems:"flex-start", justifyContent:"space-between", backgroundColor:"rgba(255,255,255,0.04)", borderWidth:1, borderColor:"rgba(255,255,255,0.07)", borderRadius:12, padding:12, gap:10 },
  notifLeft: { flex:1, flexDirection:"row", gap:10, alignItems:"flex-start", minWidth:0 },
  iconCircle: { width:32, height:32, borderRadius:16, backgroundColor:"rgba(212,165,75,0.12)", borderWidth:1, borderColor:"rgba(212,165,75,0.22)", alignItems:"center", justifyContent:"center", flexShrink:0 },
  notifTitulo: { color:"#fff", fontSize:13, fontFamily: FontFamilies.bodyBold, lineHeight:16 },
  notifMensaje: { color:"#bdbdbd", fontSize:12, lineHeight:16 },
  notifFecha: { color:"#8a8a8a", fontSize:11, marginTop:2 },
  dot: { width:8, height:8, borderRadius:4, backgroundColor:"#f0c96f", marginTop:6, flexShrink:0 },
  toastWrap: { position:"absolute", left:0, right:0, bottom:90, alignItems:"center" },
  toast: { backgroundColor:"rgba(0,0,0,0.92)", borderWidth:1, borderColor:"#c9a227", borderRadius:40, paddingVertical:9, paddingHorizontal:16 },
  toastTxt: { color:"#f0c96f", fontSize:12.5 },
});