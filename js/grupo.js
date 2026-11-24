/* MÓDULO "grupo": varios personajes, cada uno con SUS estadísticas y SUS objetos.
   · Lo común al grupo (oro, días...) sigue en "estadisticas" de la aventura.
   · Cada personaje se define en "grupo.miembros" y empieza con "objetos" propios.
   · Condiciones y efectos aceptan "quien": un personaje, "lider" (el primero), "todos", "alguno"
     (este último solo en condiciones) o "puesto:id" (quien ocupe ese puesto; ver módulo puestos). Sin "quien":
       - estadísticas: se usa lo común (como en el motor sin grupo)
       - objetos: dar_objeto lo recibe el líder; tiene_objeto mira si alguien lo tiene
       - al usar un objeto, los efectos recaen en quien lo usa
   · Nuevos: efectos "unirse" y "abandonar" {id}; condición "en_grupo" {id}.
   Si la aventura no tiene sección "grupo", este módulo no hace nada (usa el núcleo).
   Depende de: estado, reglas, nucleo, guardado, registro, dom, validador */
import { juego, etiqueta } from './estado.js';
import { CONDICIONES as BASE_C, EFECTOS as BASE_E, aplicar } from './reglas.js';
import { recordar } from './nucleo.js';
import { autoguardar } from './guardado.js';
import { registrar } from './registro.js';
import { el, plegable } from './dom.js';
import { reglasDe } from './validador.js';

const hay = () => !!juego.estado?.grupo;            // ¿esta partida tiene grupo?
const G = () => juego.estado.grupo;                 // { orden: [ids], miembros: { id: {nombre, stats, inventario} } }
export const miembro = id => G().miembros[id];
export const enGrupo = () => G().orden.map(miembro);       // los que forman el grupo ahora
// Quién ocupa un puesto (módulo "puestos"): solo cuentan los personajes que siguen en el grupo
export const idsDe = puesto => hay() ? (juego.estado.puestos?.[puesto] || []).filter(id => G().orden.includes(id)) : [];
export const titularesDe = puesto => idsDe(puesto).map(miembro);

// Traduce "quien" a la lista de personajes afectados (null = no se indicó)
export function destinatarios(r) {
  const q = r.quien ?? juego.usuario;
  if (q === undefined) return null;
  if (typeof q === 'string' && q.startsWith('puesto:')) return titularesDe(q.slice(7));   // quien ocupe ese puesto (puede ser nadie)
  if (q === 'todos' || q === 'alguno') return enGrupo();
  if (q === 'lider') return [miembro(G().orden[0])];
  return [miembro(q)];
}
// "alguno": basta con que lo cumpla uno. "todos" o un personaje concreto: deben cumplirlo todos los destinatarios.
const sobre = (c, f) => {
  const d = destinatarios(c);
  if (!d.length) return false;   // un puesto vacío nunca cumple una condición
  return c.quien === 'alguno' ? d.some(f) : d.every(f);
};

const condiciones = {
  // Sin "quien", los objetos se miran en todo el grupo (basta con que alguien lo lleve)
  tiene_objeto: c => !hay() ? BASE_C.tiene_objeto(c)
    : sobre(c.quien === undefined ? { ...c, quien: 'alguno' } : c, m => m.inventario.includes(c.id)),
  // Sin "quien", las estadísticas son las comunes: lo hace el núcleo
  stat_min: c => (!hay() || c.quien === undefined) ? BASE_C.stat_min(c) : sobre(c, m => (m.stats[c.stat] ?? 0) >= c.valor),
  stat_max: c => (!hay() || c.quien === undefined) ? BASE_C.stat_max(c) : sobre(c, m => (m.stats[c.stat] ?? 0) <= c.valor),
  en_grupo: c => hay() && G().orden.includes(c.id),
};
const efectos = {
  mod_stat: e => {
    const d = hay() ? destinatarios(e) : null;
    if (!d) return BASE_E.mod_stat(e);                       // sin "quien": estadística común
    d.forEach(m => { m.stats[e.stat] = (m.stats[e.stat] ?? 0) + e.valor; });
  },
  dar_objeto: e => {
    if (!hay()) return BASE_E.dar_objeto(e);
    const nombre = juego.aventura.objetos[e.id].nombre;
    (destinatarios(e) ?? [miembro(G().orden[0])]).forEach(m => {   // sin "quien": lo recibe el líder
      if (!m.inventario.includes(e.id)) { m.inventario.push(e.id); juego.registro.push(`${m.nombre} obtiene: ${nombre}`); }
    });
  },
  quitar_objeto: e => {
    if (!hay()) return BASE_E.quitar_objeto(e);
    // sin "quien": se lo quita al primero que lo lleve
    const d = destinatarios(e) ?? enGrupo().filter(m => m.inventario.includes(e.id)).slice(0, 1);
    d.forEach(m => { m.inventario = m.inventario.filter(i => i !== e.id); });
  },
  unirse: e => {
    if (G().orden.includes(e.id)) return;
    G().orden.push(e.id);
    juego.registro.push(`${miembro(e.id).nombre} se une al grupo.`);
  },
  abandonar: e => {
    if (!G().orden.includes(e.id)) return;
    G().orden = G().orden.filter(i => i !== e.id);
    juego.registro.push(`${miembro(e.id).nombre} deja el grupo.`);
  },
};

// Aplica un objeto de un personaje: efectos sobre quien lo usa, consumo y mensaje. Mientras se
// aplican, juego.usuario hace que un efecto sin "quien" (p. ej. curar) recaiga en ese personaje.
// No guarda copia para deshacer ni redibuja: eso lo decide quien lo llama.
export function aplicarObjeto(id, objeto) {
  const m = miembro(id), o = juego.aventura.objetos[objeto];
  juego.usuario = id;
  try { (o.efectos || []).forEach(aplicar); } finally { juego.usuario = undefined; }
  juego.registro.push(`${m.nombre} usa: ${o.nombre}`);
  if (o.consumible !== false) m.inventario = m.inventario.filter(i => i !== objeto);
}
// Uso desde el panel de pantalla (fuera de combate)
export function usarGrupo(id, objeto) {
  recordar();
  juego.registro = [];
  aplicarObjeto(id, objeto);
  autoguardar();
  juego.ganchos.pintar();
}

// Panel de pantalla: una ficha por personaje, con sus estadísticas y sus objetos
function panel(cont) {
  if (!hay()) return;
  const caja = plegable('personajes', 'Personajes', true), rejilla = el('div', '', 'miembros');
  for (const id of G().orden) {
    const m = miembro(id), ficha = el('div', '', 'miembro');
    ficha.append(el('h2', m.nombre), el('p', Object.entries(m.stats).map(([k, v]) => `${etiqueta(k)}: ${v}`).join(' · '), 'stats'));
    const extras = juego.ganchos.etiquetasFicha(id);   // p. ej. los puestos que ocupa
    if (extras.length) ficha.append(el('p', extras.join(' · '), 'puestos-ficha'));
    for (const objeto of m.inventario) {
      const o = juego.aventura.objetos[objeto], fila = el('div', '', 'objeto');
      fila.append(el('span', o.nombre));
      if (o.usable && !juego.estado.combateGrupo) fila.append(el('button', 'Usar', '', () => usarGrupo(id, objeto)));   // en combate se usa desde su menú
      ficha.append(fila);
    }
    rejilla.append(ficha);
  }
  caja.append(rejilla);
  cont.append(caja);
}

// Al empezar una partida se crea el estado de cada personaje a partir de la aventura
function alNueva() {
  const def = juego.aventura.grupo;
  if (!def) return;
  juego.estado.grupo = {
    orden: [...def.inicial],
    miembros: Object.fromEntries(Object.entries(def.miembros).map(([id, m]) =>
      [id, { nombre: m.nombre, stats: structuredClone(m.stats || {}), inventario: [...(m.objetos || [])], habilidades: [...(m.habilidades || [])] }])),
  };
}

function validarAventura(a) {
  const g = a.grupo;
  if (!g) return a.modulos?.includes('grupo') ? ['declaras el módulo "grupo" pero falta la sección "grupo"'] : [];
  const err = [], ids = Object.keys(g.miembros || {});
  if (!ids.length) return ['grupo.miembros: no hay ningún personaje'];
  if (!g.inicial?.length) err.push('grupo.inicial: debe haber al menos un personaje');
  (g.inicial || []).forEach(i => ids.includes(i) || err.push(`grupo.inicial: "${i}" no está en grupo.miembros`));
  ids.forEach(i => (g.miembros[i].objetos || []).forEach(o => a.objetos?.[o] || err.push(`grupo.${i}: el objeto "${o}" no existe`)));
  const claves = ['todos', 'alguno', 'lider', ...ids];
  for (const { r } of reglasDe(a)) {
    const esPuesto = String(r.quien).startsWith('puesto:') && a.puestos?.lista?.[String(r.quien).slice(7)];
    if (r.quien !== undefined && !claves.includes(r.quien) && !esPuesto) err.push(`"quien" desconocido: "${r.quien}" (usa un personaje, "lider", "todos", "alguno" o "puesto:id")`);
    if (['unirse', 'abandonar', 'en_grupo'].includes(r.tipo) && !ids.includes(r.id)) err.push(`${r.tipo}: el personaje "${r.id}" no existe`);
  }
  return err;
}

registrar({ nombre: 'grupo', condiciones, efectos, alNueva, panel, validarAventura });
