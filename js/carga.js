/* CARGA DE AVENTURAS: desde una URL o desde un archivo elegido por el usuario.
   Depende de: estado, dom, validador, guardado, nucleo, registro */
import { juego } from './estado.js';
import { aviso } from './dom.js';
import { validar, avisos } from './validador.js';
import { ls, clave, restaurar } from './guardado.js';
import { nueva } from './nucleo.js';
import { activar } from './registro.js';

export function cargarDatos(datos) {
  const err = validar(datos);
  if (err.length) return aviso('La aventura tiene errores:\n• ' + err.join('\n• '));
  aviso('');
  juego.aventura = datos;
  avisos(datos).forEach(m => console.warn('Aviso: ' + m));   // dudas del validador, en la consola (F12)
  activar(datos);   // activa el núcleo + los módulos que declara la aventura
  const auto = ls.get(clave('auto'));
  try {
    if (auto && confirm('Hay una partida automática de esta aventura. ¿Continuar donde la dejaste?')) return restaurar(auto);
  } catch { /* partida incompatible: empezamos de cero */ }
  nueva();
}
export async function cargarURL(url) {
  try {
    const r = await fetch(url);
    if (!r.ok) throw new Error(`${r.status} al pedir ${url}`);
    cargarDatos(await r.json());
  } catch (e) {
    aviso(`No se pudo cargar la aventura (${e.message}). Si abriste el HTML con doble clic, usa un servidor local o el botón "Abrir aventura".`);
  }
}
// Lee un archivo elegido por el usuario y se lo pasa a una función
export async function leerArchivo(ev, fn) {
  const f = ev.target.files[0]; ev.target.value = '';   // vaciar permite elegir el mismo archivo otra vez
  if (!f) return;
  try { fn(await f.text()); } catch (e) { aviso('Archivo no válido: ' + e.message); }
}
