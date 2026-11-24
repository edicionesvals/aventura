/* NÚCLEO: moverse por las escenas. No sabe nada de combate ni de pantalla:
   avisa a la interfaz mediante juego.ganchos. Depende de: estado, reglas, guardado, registro */
import { juego } from './estado.js';
import { aplicar } from './reglas.js';
import { activas } from './registro.js';
import { autoguardar } from './guardado.js';

// Historial para "Deshacer": antes de cada acción guardamos una copia del estado.
// Como la semilla del azar va dentro del estado, tras deshacer una tirada y repetir
// la misma acción sale el mismo resultado (adrede: no se puede repetir hasta acertar).
export function recordar() {
  const h = juego.historial;
  h.push(JSON.stringify(juego.estado));
  if (h.length > 30) h.shift();   // solo los últimos 30 pasos
}
export function deshacer() {
  const h = juego.historial;
  if (!h.length) return;
  juego.estado = JSON.parse(h.pop());
  juego.registro = ['Vuelves un paso atrás.'];
  autoguardar();
  juego.ganchos.pintar();
}

export const nodoActual = () => juego.aventura.nodos[juego.estado.nodo];

// Entrar en un nodo (escena). Si es el mismo en el que estamos, no se repiten
// sus efectos de entrada ("al_entrar").
export function ir(destino) {
  const { estado, ganchos } = juego;
  if (juego.desvio) { destino = juego.desvio; juego.desvio = undefined; }   // un efecto (ir_a, un plazo...) pidió otra escena
  if (destino !== estado.nodo) {
    estado.nodo = destino;
    const n = nodoActual();
    if (!juego.sinEntrada) (n.al_entrar || []).forEach(aplicar);
    juego.sinEntrada = false;   // solo valía para esta entrada
    if (juego.desvio) return ir(destino);   // ...también puede pedirlo un efecto de entrada (ir() lee juego.desvio)
    activas.escenas[n.tipo]?.alEntrar?.(n);   // si un módulo gestiona este tipo de escena (p. ej. 'combate'), se le avisa
    if (juego.desvio) return ir(destino);     // ...y la propia escena puede pedir otro destino (p. ej. un combate ya ganado)
  }
  autoguardar();
  ganchos.pintar();
}

export function elegir(opcion) {
  recordar();
  juego.registro = [];
  (opcion.efectos || []).forEach(aplicar);
  ir(opcion.destino ?? juego.estado.nodo);   // sin destino: nos quedamos (útil en diálogos)
}

export function usar(id) {
  recordar();
  juego.registro = [];
  const o = juego.aventura.objetos[id];
  (o.efectos || []).forEach(aplicar);
  juego.registro.push(`Usas: ${o.nombre}`);
  if (o.consumible !== false) aplicar({ tipo: 'quitar_objeto', id });
  if (juego.desvio) return ir(juego.estado.nodo);   // el objeto pidió ir a otra escena
  autoguardar();
  juego.ganchos.pintar();   // usar un objeto no gasta turno en combate (decisión de diseño; cámbiala si quieres)
}

export function nueva() {
  const a = juego.aventura;
  juego.estado = { id: a.meta.id, nodo: null, stats: structuredClone(a.estadisticas ?? {}),   // la sección "estadisticas" es opcional
                   inventario: [], flags: {}, combate: null, semilla: Date.now() >>> 0 };
  juego.registro = []; juego.historial = [];
  activas.inicios.forEach(f => f());   // cada módulo prepara su parte del estado (p. ej. el grupo)
  ir(a.meta.inicio);
}
