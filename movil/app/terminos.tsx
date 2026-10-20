// Ruta móvil de terminos. Expo Router la incorpora a la navegación según su ubicación en app/.
import React from "react";

import LegalScreen from "@/components/public/LegalScreen";

// Contenido literal de la WEB (fe/src/pages/legal/TerminosUso.tsx).
export default function TerminosScreen() {
  return (
    <LegalScreen
      icono="file-contract"
      titulo="Términos de Uso"
      actualizacion="Agosto de 2026"
      secciones={[
        {
          titulo: "Introducción",
          parrafos: [
            "Bienvenido a Neodomus. Al acceder y utilizar nuestra plataforma, el usuario acepta los presentes Términos de Uso. Estos regulan el acceso y uso de los servicios ofrecidos por Neodomus.",
          ],
        },
        {
          titulo: "Objeto",
          parrafos: [
            "Neodomus es una plataforma diseñada para la administración y automatización de hogares inteligentes, permitiendo el control de dispositivos domóticos, el monitoreo de eventos y la gestión de usuarios.",
          ],
        },
        {
          titulo: "Registro de usuarios",
          parrafos: [
            "Para acceder a determinadas funcionalidades será necesario crear una cuenta proporcionando información veraz, completa y actualizada.",
            "El usuario será responsable de mantener la confidencialidad de sus credenciales.",
          ],
        },
        {
          titulo: "Obligaciones del usuario",
          items: [
            { texto: "Utilizar la plataforma de forma responsable.", tipo: "check" },
            { texto: "No compartir sus credenciales de acceso.", tipo: "check" },
            { texto: "No intentar vulnerar la seguridad del sistema.", tipo: "check" },
            { texto: "No realizar actividades ilícitas mediante la plataforma.", tipo: "check" },
          ],
        },
        {
          titulo: "Propiedad intelectual",
          parrafos: [
            "Todo el contenido de Neodomus, incluyendo diseño, logotipos, imágenes, bases de datos, software y código fuente, pertenece a Neodomus y se encuentra protegido por la legislación colombiana sobre propiedad intelectual.",
          ],
        },
        {
          titulo: "Suspensión del servicio",
          parrafos: [
            "Neodomus podrá suspender o cancelar cuentas cuando detecte incumplimientos de estos términos o actividades que comprometan la seguridad de la plataforma.",
          ],
        },
        {
          titulo: "Modificaciones",
          parrafos: [
            "Los presentes términos podrán actualizarse cuando sea necesario.",
            "Las modificaciones serán publicadas dentro de la plataforma y entrarán en vigencia desde su publicación.",
          ],
        },
        {
          titulo: "Legislación aplicable",
          parrafos: [
            "Estos términos se rigen por la legislación vigente de la República de Colombia.",
          ],
        },
      ]}
    />
  );
}
