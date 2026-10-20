// Peticiones de consulta y encendido/apagado de dispositivos al backend.
import { apiFetch } from "./api";

// Comunica con el backend mediante API "/dispositivos".
export const obtenerDispositivos = async () => {
  return apiFetch("/dispositivos");
};

// Comunica con el backend mediante API `/dispositivos/${id}/encender`.
export const encenderDispositivo = async (id: number) => {
  return apiFetch(`/dispositivos/${id}/encender`, {
    method: "POST",
  });
};

// Comunica con el backend mediante API `/dispositivos/${id}/apagar`.
export const apagarDispositivo = async (id: number) => {
  return apiFetch(`/dispositivos/${id}/apagar`, {
    method: "POST",
  });
};