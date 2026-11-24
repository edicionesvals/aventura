/* REGLAS: condiciones y efectos. El JSON describe CONDICIONES ("¿puede verse
   esta opción?") y EFECTOS ("qué cambia al elegirla") con un "tipo"; cada tipo
   es una función de estas tablas. Para inventar una mecánica nueva, añades una
   entrada aquí. Depende de: estado.js, registro.js */
import { juego } from './estado.js';
import { registrar, activas } from './registro.js';

// Se lee juego.estado en el momento de usarlo: puede cambiar al cargar una partida.
const E = () => juego.estado;

export const CONDICIONES = {   // se exportan para que un módulo pueda ampliarlas o sustituirlas
  tiene_objeto: c => E().inventario.includes(c.id),
  flag:         c => !!E().flags[c.flag],
  no_flag:      c => !E().flags[c.flag],
  stat_min:     c => (E().stats[c.stat] ?? 0) >= c.valor,
  stat_max:     c => (E().stats[c.stat] ?? 0) <= c.valor,   // p. ej. "solo si llevas 20 días o menos"
  y:            c => c.todas.every(evaluar),    // todas se cumplen
  o:            c => c.alguna.some(evaluar),    // alguna se cumple
  no:           c => !evaluar(c.cond),
};
export const EFECTOS = {
  // Un objeto no se duplica: el inventario guarda ids sin repetir (más simple)
  dar_objeto:    e => { const inv = E().inventario; if (!inv.includes(e.id)) { inv.push(e.id); juego.registro.push(`Obtienes: ${juego.aventura.objetos[e.id].nombre}`); } },
  quitar_objeto: e => { E().inventario = E().inventario.filter(i => i !== e.id); },
  mod_stat:      e => { E().stats[e.stat] = (E().stats[e.stat] ?? 0) + e.valor; },
  flag:          e => { E().flags[e.flag] = e.valor ?? true; },  // flags = "memoria" de la historia
  mensaje:       e => { juego.registro.push(e.texto); },         // útil para diálogos
  ir_a:          e => { juego.desvio = e.destino; },             // pide ir a otra escena al acabar la acción (anula el destino de la opción)
};
// Estas dos tablas son el módulo "nucleo", que siempre está activo.
registrar({ nombre: 'nucleo', condiciones: CONDICIONES, efectos: EFECTOS });
// Al jugar se consultan las tablas ACTIVAS: núcleo + módulos que declara la aventura
export const evaluar = c => (c ? activas.condiciones[c.tipo](c) : true);   // sin condición = siempre se cumple
export const aplicar = e => activas.efectos[e.tipo](e);
// Sustituye {vida}, {oro}... por el valor de esa estadística
export const sustituir = t => t.replace(/\{(\w+)\}/g, (m, k) => E().stats[k] ?? m);
