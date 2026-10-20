// Ruta móvil de privacidad. Expo Router la incorpora a la navegación según su ubicación en app/.
import React from "react";

import LegalScreen from "@/components/public/LegalScreen";

// Contenido literal de la WEB (fe/src/pages/legal/PoliticaPrivacidad.tsx).
export default function PrivacidadScreen() {
  return (
    <LegalScreen
      icono="shield-halved"
      titulo="Política de Privacidad"
      actualizacion="Agosto de 2026"
      secciones={[
        {
          titulo: "Introducción",
          parrafos: [
            "En Neodomus nos comprometemos a proteger la privacidad y los datos personales de nuestros usuarios. Esta política explica qué información recopilamos, cómo la utilizamos y los derechos que tienes sobre ella, en cumplimiento de la Ley 1581 de 2012 y su Decreto Reglamentario 1377 de 2013 de la República de Colombia.",
          ],
        },
        {
          titulo: "Datos que recopilamos",
          items: [
            { texto: "Datos de registro: nombre, correo electrónico, teléfono y contraseña cifrada.", tipo: "punto" },
            { texto: "Datos de perfil: imagen de usuario, preferencias y dispositivos vinculados.", tipo: "punto" },
            { texto: "Datos de uso: interacciones con la plataforma, citas, pedidos y consultas realizadas.", tipo: "punto" },
            { texto: "Datos técnicos: dirección IP, tipo de navegador y registros de acceso, utilizados con fines de seguridad.", tipo: "punto" },
          ],
        },
        {
          titulo: "Uso de la información",
          parrafos: [
            "Utilizamos tus datos para administrar tu cuenta, procesar pedidos, gestionar citas, personalizar tu experiencia y ofrecer soporte técnico.",
            "También los empleamos para mejorar nuestros servicios, prevenir fraudes y cumplir obligaciones legales y regulatorias.",
          ],
        },
        {
          titulo: "Compartir información",
          parrafos: [
            "No vendemos ni comercializamos tus datos personales con terceros.",
            "Podremos compartir información con proveedores de servicios (procesamiento de pagos, envíos y soporte técnico) exclusivamente para la operación de la plataforma, y con autoridades competentes cuando la ley lo exija.",
          ],
        },
        {
          titulo: "Derechos del usuario",
          parrafos: [
            "De acuerdo con la normativa colombiana de protección de datos, tienes derecho a:",
          ],
          items: [
            { texto: "Conocer, actualizar y rectificar tus datos personales.", tipo: "check" },
            { texto: "Solicitar prueba de la autorización otorgada.", tipo: "check" },
            { texto: "Revocar la autorización y solicitar la supresión de tus datos.", tipo: "check" },
            { texto: "Presentar quejas ante la Superintendencia de Industria y Comercio (SIC).", tipo: "check" },
          ],
        },
        {
          titulo: "Seguridad de los datos",
          parrafos: [
            "Implementamos medidas técnicas y organizativas como cifrado de conexiones (SSL), control de accesos y monitoreo continuo para proteger tu información contra accesos no autorizados, pérdida o alteración.",
          ],
        },
        {
          titulo: "Retención de los datos",
          parrafos: [
            "Conservamos tus datos personales mientras tu cuenta esté activa o durante el tiempo que exija la normativa aplicable. Al eliminar tu cuenta, los datos serán suprimidos o anonimizados.",
          ],
        },
        {
          titulo: "Modificaciones",
          parrafos: [
            "Podremos actualizar esta política cuando sea necesario. Las modificaciones serán publicadas dentro de la plataforma y entrarán en vigencia desde su publicación.",
          ],
        },
        {
          titulo: "Contacto",
          parrafos: [
            "Para ejercer tus derechos o resolver inquietudes sobre esta política, escríbenos a soporte@neodomus.com.",
          ],
        },
      ]}
    />
  );
}
