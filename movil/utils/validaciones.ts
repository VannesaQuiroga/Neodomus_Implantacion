// ─────────────────────────────────────────────────────────────
// Validaciones — copia EXACTA de las reglas de la WEB
// (Register.tsx / ResetPassword.tsx / Login.tsx).
// ─────────────────────────────────────────────────────────────

/** Regex de contraseña de Register/ResetPassword de la WEB. */
export const REGEX_CONTRASENA =
  /^(?=[^a-z]*[a-z])(?=[^A-Z]*[A-Z])(?=\D*\d)(?=[^!@#$%^&*(),.?":{}|<>]*[!@#$%^&*(),.?":{}|<>]).{8,}$/;

/** Regex de correo de Login/ForgotPassword de la WEB. */
export const REGEX_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface RequisitosContrasena {
  length: boolean;
  uppercase: boolean;
  lowercase: boolean;
  number: boolean;
  special: boolean;
}

/** Checks en vivo idénticos a los de la web. */
export function evaluarContrasena(valor: string): RequisitosContrasena {
  return {
    length: valor.length >= 8,
    uppercase: /[A-Z]/.test(valor),
    lowercase: /[a-z]/.test(valor),
    number: /\d/.test(valor),
    special: /[!@#$%^&*(),.?":{}|<>]/.test(valor),
  };
}

export const contrasenaValida = (requisitos: RequisitosContrasena): boolean =>
  Object.values(requisitos).every(Boolean);

/** Sanitizado de documento/teléfono igual que la web: solo dígitos, máx 10. */
export const limpiarNumerico = (valor: string): string =>
  valor.replace(/\D/g, "").slice(0, 10);

/** Regiones hardcodeadas de la web (regionesColombia). */
export const REGIONES_COLOMBIA: Record<string, string[]> = {
  Bogotá: ["Bogotá D.C."],
};

export const TIPOS_DOCUMENTO = [
  { valor: "1", label: "CC" },
  { valor: "2", label: "CE" },
];
