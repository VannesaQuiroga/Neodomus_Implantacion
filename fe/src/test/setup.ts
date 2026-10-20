// Entorno de pruebas de los hooks de imagen autenticada.
// jsdom no implementa createObjectURL/revokeObjectURL con la semántica completa;
// se sustituyen por un registro en memoria para verificar su ciclo de vida.
const creadas: string[] = [];
const revocadas: string[] = [];

(globalThis as any).URL.createObjectURL = (_blob: Blob) => {
  const url = `blob:test/${creadas.length}`;
  creadas.push(url);
  return url;
};
(globalThis as any).URL.revokeObjectURL = (url: string) => {
  revocadas.push(url);
};

(globalThis as any).__objectUrls = { creadas, revocadas };
