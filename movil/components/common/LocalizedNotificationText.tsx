import React from "react";
import { Text } from "react-native";
import { traducirMensajeNotificacion, useIdioma } from "@/contexts/IdiomaContext";

export default function LocalizedNotificationText({ message }: { message: string }) {
  const { idioma } = useIdioma();
  return <Text>{traducirMensajeNotificacion(message, idioma)}</Text>;
}
