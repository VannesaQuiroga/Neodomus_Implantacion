// ─────────────────────────────────────────────────────────────
// Datos de contacto público — textos literales de la WEB
// (AyudaPage.tsx · tarjetas infoContacto + Canales adicionales).
// Compartidos por el tab Ayuda y la pantalla Contacto.
// ─────────────────────────────────────────────────────────────

export interface TarjetaContacto {
  icono: string;
  tituloClave: string;
  valor: string;
  valorClave?: string;
  detalleClave: string;
  enlace: string | null;
}

export const INFO_CONTACTO: TarjetaContacto[] = [
  {
    icono: "envelope",
    tituloClave: "contacto.correoTitulo",
    valor: "soporte@neodomus.com",
    detalleClave: "contacto.correoDetalle",
    enlace: "mailto:soporte@neodomus.com",
  },
  {
    icono: "phone",
    tituloClave: "contacto.lineaTitulo",
    valor: "+57 601 123 4567",
    detalleClave: "contacto.lineaDetalle",
    enlace: "tel:+576011234567",
  },
  {
    icono: "clock",
    tituloClave: "contacto.horarioTitulo",
    valor: "",
    valorClave: "contacto.horarioValor",
    detalleClave: "contacto.horarioDetalle",
    enlace: null,
  },
  {
    icono: "location-dot",
    tituloClave: "contacto.oficinaTitulo",
    valor: "Cra 15 #93-47, Bogotá",
    detalleClave: "contacto.oficinaDetalle",
    enlace: null,
  },
];

export const CANALES_ADICIONALES: string[] = [
  "contacto.chatProximamente",
  "contacto.whatsapp",
  "contacto.redes",
];
