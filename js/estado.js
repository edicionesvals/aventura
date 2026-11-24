/* ESTADO COMPARTIDO. Los módulos ES no pueden reasignar las variables de otro
   archivo, así que todo lo que cambia vive como propiedades de UN objeto
   (`juego`) que todos importan. No depende de ningún otro archivo. */
export const juego = {
  aventura: null,   // datos del JSON (no cambian durante la partida)
  estado: null,     // la partida en curso: es TODO lo que se guarda
  registro: [],     // mensajes de la última acción (golpes, objetos...); no se guarda
  historial: [],    // copias anteriores del estado, para "Deshacer" (solo en memoria)
  usuario: undefined, // personaje que está usando un objeto ahora mismo (lo lee el módulo grupo)
  sinEntrada: false,  // si es true, la próxima escena a la que se entre no aplica sus efectos de entrada (los usa un combate ya ganado)
  desvio: undefined,  // escena a la que un efecto (ir_a, plazos...) pide ir; ir() lo atiende y lo borra
  // Punto de enganche: el núcleo avisa a la interfaz sin importarla (evita
  // dependencias circulares). Los módulos se enganchan en registro.js.
  ganchos: {
    pintar: () => {},   // lo rellena interfaz.js
    etiquetasFicha: () => [],   // etiquetasFicha(id) → textos extra para la ficha de un personaje (los rellena el módulo puestos)
    habilidades: null,  // { de(id), usar(id, hid) }: lo rellena el módulo habilidades; el combate de grupo lo consulta
    alVencer: () => {}, // alVencer(xp): los combates avisan al ganar; lo rellena el módulo experiencia
  },
};

// Nombre legible de una estadística: la aventura puede definir "etiquetas": { "viveres": "Víveres" }.
// Si no hay etiqueta, se muestra el nombre tal cual.
export const etiqueta = k => juego.aventura?.etiquetas?.[k] ?? k;

// Azar con semilla guardada en el estado (algoritmo mulberry32). Así, si
// cargas una partida, las tiradas siguientes salen igual: no se puede
// "repetir hasta que salga bien". Si no te importa, usa Math.random().
export function azar() {
  const e = juego.estado;
  e.semilla = (e.semilla + 0x6D2B79F5) >>> 0;
  let t = e.semilla;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
export const dado = (caras = 6) => Math.floor(azar() * caras) + 1;
