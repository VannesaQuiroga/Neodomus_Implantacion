> **Nota implementación 2026-08:** Este sistema de diseño describe **TailwindCSS 4+** (`tailwind.config.js`, tokens `primary-*`). **La implementación actual NO usa Tailwind** (`fe/package.json` sin `tailwind`, `fe/vite.config.ts:6` solo `@vitejs/plugin-react`, `fe/src/styles/*.css` CSS puro con 58 media queries). Paleta real: dorado `#D4AF37` y negro `#000000` aplicados vía CSS variables/custom properties, no `primary-*`. El documento se mantiene como **referencia de diseño aspiracional**; para auditoría, el sistema real es CSS Modules/puro. Dark mode (`dark:`) no implementado (`fe/src/App.tsx` sin provider tema). Ver `restricciones.md:28` RT-002 actualizado.

esign System — Neodomus (Serie Educativa)
<!-- ¿Qué? Referencia técnica del sistema de diseño visual de Neodomus. ¿Para qué? Documentar las decisiones de estilo, la arquitectura CSS y las instrucciones para mantener la consistencia visual en toda la plataforma. ¿Impacto? Un sistema de diseño claro permite escalar la interfaz sin perder coherencia, facilita el onboarding de nuevos desarrolladores y asegura que el branding (negro + dorado) se aplique correctamente en todos los componentes. -->
1. Propósito
Neodomus es una plataforma de gestión de servicios domóticos que debe transmitir
elegancia, tecnología y confianza. Por ello, los colores corporativos son:

Negro (#000000) – fondo, textos principales, elementos de alto contraste.

Dorado (#D4AF37) – acentos, botones primarios, detalles interactivos.

Este sistema de diseño define tokens semánticos (primary-*, neutral-*, etc.)
para que los componentes nunca hagan referencia directa a valores concretos.
Así, si en el futuro se decide ajustar la tonalidad del dorado, se cambia en un solo lugar.

2. Identidad Visual – Paleta Base
Rol	Color Tailwind (token)	Hex	Uso principal
Primario (acento)	primary-*	#D4AF37	Botones primarios, enlaces, bordes de foco, badges
Primario hover	primary-600	#C59B2E	Hover de botones primarios
Fondo oscuro	neutral-900	#111827	Header, sidebar, modos oscuros
Texto sobre oscuro	neutral-100	#F3F4F6	Texto principal en fondos oscuros
Fondo claro	white / neutral-50	#FFFFFF	Fondo general en modo claro
Texto sobre claro	neutral-800	#1F2937	Texto principal en fondos claros
Nota: La paleta primary está implementada como un alias de yellow-* (Tailwind),
pero ajustada a los valores exactos del dorado corporativo mediante variables CSS.

3. Arquitectura del Sistema de Temas
3.1 Principio: token semántico primary-*
Los componentes nunca usan un color concreto (yellow-500, gold). Usan el token
abstracto primary-*, que está definido una sola vez en la configuración de Tailwind.

text
Componentes (Button, InputField, ServiceCard, Navbar…)
      │
      │  usan  bg-primary-600, text-primary-500, border-primary-300 …
      │
      ▼
  tailwind.config.js  (extend theme.colors)
      │
      │  mapea  primary → custom palette
      │
      ▼
  CSS custom properties (--color-primary-500, --color-primary-600…)
Beneficio: cambiar el tono del dorado (o incluso reemplazar el color primario)
implica modificar un solo archivo. Todos los componentes se actualizan automáticamente.

3.2 Implementación con TailwindCSS v3 (y v4 compatible)
js
// tailwind.config.js
module.exports = {
  theme: {
    extend: {
      colors: {
        primary: {
          50: '#FDF8E7',
          100: '#FAEFC4',
          200: '#F5E09E',
          300: '#F0D178',
          400: '#EBC252',
          500: '#D4AF37', // dorado base
          600: '#C59B2E',
          700: '#B08726',
          800: '#9B731E',
          900: '#865F16',
          950: '#714B0E',
        },
        // Los colores semánticos (success, error, warning, info) se dejan con sus valores estándar
      },
    },
  },
};
En los componentes se usa así:

tsx
<button className="bg-primary-600 hover:bg-primary-700 text-white">
  Solicitar servicio
</button>
3.3 Soporte de modo oscuro
TailwindCSS ofrece la variante dark: que aplica estilos cuando el sistema operativo (o el usuario) tiene activado el modo oscuro. Neodomus define una paleta neutral adaptada:

css
/* En index.css o en la configuración */
:root {
  --background: #ffffff;
  --foreground: #1f2937;
}
.dark {
  --background: #111827;
  --foreground: #f3f4f6;
}
Los componentes deben usar bg-background y text-foreground (o directamente bg-white dark:bg-neutral-900).

4. Colores Semánticos – Estándar (No Cambian)
Al igual que en el sistema de autenticación de referencia, Neodomus reserva ciertos colores para significados universales:

Semántica	Color Tailwind	Uso en Neodomus
Éxito	green-*	Confirmación de pago, servicio completado
Error	red-*	Error de validación, cancelación fallida
Advertencia	yellow-*	Recordatorio de cita, aviso de disponibilidad
Información	blue-*	Notificaciones informativas, ayuda
Ejemplo: una alerta de éxito siempre usará bg-green-50 border-green-200 text-green-800, sin importar el color primario del proyecto.

tsx
// ✅ CORRECTO – semántico fijo
<div className="bg-green-50 border border-green-200 text-green-800 dark:bg-green-950 dark:border-green-800 dark:text-green-300">
  Pago registrado correctamente.
</div>
5. Logo y Elementos Gráficos
El logo de Neodomus (texto + ícono) debe usar el dorado como color principal y negro como fondo (o viceversa según el modo).

tsx
// Ejemplo de componente Logo (simplificado)
export function NeodomusLogo() {
  return (
    <div className="flex items-center gap-2">
      <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
        <path d="..." fill="currentColor" className="text-primary-500" />
        <circle cx="16" cy="16" r="14" stroke="currentColor" className="text-primary-600" strokeWidth="2" />
      </svg>
      <span className="font-bold text-neutral-900 dark:text-neutral-100 text-xl">
        Neodomus
      </span>
    </div>
  );
}
Regla: El ícono debe usar text-primary-500 y text-primary-600 para respetar el token primario.

6. Patrones de Uso Correcto en Componentes
6.1 Botón primario
tsx
// ✅ CORRECTO – usa primary
<button className="bg-primary-600 hover:bg-primary-700 text-white font-semibold py-2 px-4 rounded-lg transition">
  Solicitar servicio
</button>

// ❌ INCORRECTO – color dorado hardcodeado
<button className="bg-[#D4AF37] hover:bg-[#C59B2E] ...">
6.2 Enlace con acento
tsx
// ✅ CORRECTO
<a className="text-primary-600 hover:text-primary-700 dark:text-primary-400 dark:hover:text-primary-300">
  Ver más detalles
</a>
6.3 Focus ring en inputs
tsx
// ✅ CORRECTO – usa primary para el anillo de foco
<input
  className="focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 dark:focus:border-primary-400"
  placeholder="Correo electrónico"
/>
6.4 Badges / etiquetas de estado
tsx
// Badge de "Nuevo servicio"
<span className="bg-primary-100 text-primary-800 text-xs font-medium px-2 py-0.5 rounded dark:bg-primary-900 dark:text-primary-300">
  Nuevo
</span>
6.5 Tarjeta de servicio (hover con borde primario)
tsx
<div className="border border-neutral-200 rounded-lg p-4 hover:border-primary-300 dark:border-neutral-700 transition">
  <h3 className="text-neutral-900 dark:text-neutral-100">Instalación básica</h3>
  <p className="text-neutral-600 dark:text-neutral-400">...</p>
  <span className="text-primary-600 font-semibold">$25.000</span>
</div>
7. Verificación de Consistencia
Para auditar que el sistema de diseño se aplica correctamente:

bash
cd fe/src

# Buscar colores dorados hardcodeados (evitar estos patrones)
grep -rn "#D4AF37\|#C59B2E\|bg-yellow-\|text-yellow-" --include="*.tsx" . | grep -v "primary"

# Verificar que no se usan colores concretos en lugar de primary
grep -rn "bg-emerald-\|bg-blue-\|bg-violet-" --include="*.tsx" .
Si aparecen resultados (excepto en componentes semánticos como Alert), deben reemplazarse por primary-* o el token semántico correspondiente.

8. Adaptación para Futuros Proyectos
Aunque Neodomus es un proyecto único, el mismo sistema de tokens puede reutilizarse en otras aplicaciones del ecosistema domótico. Para cambiar el color primario:

Editar tailwind.config.js → colors.primary

Actualizar el logo SVG (si contiene el color)

Verificar que no haya valores hardcodeados.

Si se desea soportar múltiples temas (ej. cliente puede elegir color), se puede añadir un contexto de tema que sobrescriba las variables CSS.

9. Relación con el Repositorio de Referencia
El diseño de Neodomus sigue las mismas convenciones que el sistema de autenticación de referencia (NN Auth System), pero adaptado a su propia identidad de marca. La principal diferencia es que Neodomus no cambia de color por stack (es un proyecto único), sino que fija el dorado como primario y el negro como fondo principal.

Conclusión: Este design system garantiza que la interfaz de Neodomus sea coherente, mantenible y alineada con la marca. Los tokens primary-* abstraen el color real, permitiendo cambios futuros sin modificar decenas de componentes. Además, la separación entre colores de interacción (primario) y colores semánticos (éxito, error, etc.) evita ambigüedades y mejora la experiencia de usuario.
