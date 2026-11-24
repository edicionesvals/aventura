/* GUARDADO. localStorage guarda texto en el navegador; por eso JSON.stringify/parse.
   Depende de: estado.js, dom.js */
import { juego } from './estado.js';
import { aviso } from './dom.js';

// Va en try/catch porque puede fallar (modo privado, almacenamiento lleno).
export const ls = {
  get: k => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k, v) => { try { localStorage.setItem(k, v); } catch { aviso('No se pudo guardar en el navegador.'); } },
};
export const clave = ranura => `aventura:${juego.aventura.meta.id}:${ranura}`;   // una clave por aventura y ranura
// Ranuras manuales. 'manual' es la antigua de la 1.0: así no se pierden partidas ya guardadas.
export const RANURAS = [{ id: 'manual', nombre: 'Ranura 1' }, { id: 'manual2', nombre: 'Ranura 2' }, { id: 'manual3', nombre: 'Ranura 3' }];
export function guardar(ranura) {
  ls.set(clave(ranura), JSON.stringify(juego.estado));
  ls.set(clave(ranura) + ':fecha', new Date().toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' }));
}
// Texto de cada ranura para el desplegable: nombre y fecha, o "vacía"
export const etiquetas = () => RANURAS.map(r => ({
  id: r.id,
  texto: `${r.nombre} · ${ls.get(clave(r.id)) ? (ls.get(clave(r.id) + ':fecha') ?? 'guardada') : 'vacía'}`,
}));
export const autoguardar = () => guardar('auto');

export function restaurar(txt) {
  const p = JSON.parse(txt), a = juego.aventura;
  if (p.id !== a.meta.id || !a.nodos[p.nodo]) throw new Error('La partida no corresponde a esta aventura.');
  juego.estado = p; juego.registro = []; juego.historial = [];   // cargar una partida inicia una línea de tiempo nueva
  juego.ganchos.pintar();
}
export function exportar() {   // descarga la partida como archivo: copia de seguridad
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([JSON.stringify(juego.estado)], { type: 'application/json' }));
  a.download = `${juego.estado.id}-partida.json`;
  a.click();
}
