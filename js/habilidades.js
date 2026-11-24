/* MÓDULO "habilidades": cada personaje puede saber habilidades (curar, golpe certero...). Versión básica, de ejemplo.
   En el JSON (necesita el módulo "grupo"; declararlo DESPUÉS de "grupo"):
     "habilidades": {                                    // catálogo
       "curar":  { "nombre": "Curar", "coste": { "stat": "energia", "cantidad": 2 },
                   "efectos": [ { "tipo": "mod_stat", "quien": "todos", "stat": "vida", "valor": 4 } ] },
       "golpe_certero": { "nombre": "Golpe certero", "coste": { "stat": "energia", "cantidad": 2 }, "dano": 6 }
     }
     "grupo": { "miembros": { "clara": { ..., "habilidades": ["curar"] } } }
   · "coste" (opcional): estadística PROPIA del personaje que se gasta al usarla. La energía se recupera con efectos de la historia.
   · "efectos": se aplican sobre quien la usa (como un objeto); con "quien" pueden afectar a todos, etc.
   · "dano": ataque a un enemigo elegido en el combate de grupo: dado + dano, sin restar su defensa.
   · "usable_en": "combate", "fuera" o "ambos" (por defecto). Una con "dano" solo sirve en combate.
   · Fuera de combate se usan desde el panel "Habilidades"; en combate, desde el botón "Habilidad" de su turno.
   · Efecto aprender_habilidad { quien, habilidad } y condición tiene_habilidad { habilidad, quien? }.
   Depende de: estado, reglas, nucleo, guardado, registro, dom, grupo, validador */
import { juego, etiqueta } from './estado.js';
import { aplicar } from './reglas.js';
import { recordar } from './nucleo.js';
import { autoguardar } from './guardado.js';
import { registrar, resolver } from './registro.js';
import { el, plegable } from './dom.js';
import { destinatarios, enGrupo, miembro } from './grupo.js';
import { reglasDe } from './validador.js';

const defs = () => juego.aventura.habilidades || {};
const puede = (m, h) => !h.coste || (m.stats[h.coste.stat] ?? 0) >= h.coste.cantidad;   // ¿le alcanza el coste?

// Usa una habilidad: paga el coste y aplica sus efectos sobre quien la usa. Devuelve la habilidad, o null si no pudo.
function usar(id, hid) {
  const m = miembro(id), h = defs()[hid];
  if (!h || !m.habilidades?.includes(hid) || !puede(m, h)) return null;
  if (h.coste) m.stats[h.coste.stat] -= h.coste.cantidad;
  juego.registro.push(`${m.nombre} usa ${h.nombre}.`);
  juego.usuario = id;   // un efecto sin "quien" recae en quien la usa
  try { (h.efectos || []).forEach(aplicar); } finally { juego.usuario = undefined; }
  return h;
}

// Lo que el combate de grupo necesita: qué habilidades puede usar ahora un personaje y cómo usarlas
juego.ganchos.habilidades = {
  de: id => {
    if (!juego.estado?.grupo || !juego.aventura?.habilidades) return [];
    const m = miembro(id);
    return Object.entries(defs()).filter(([hid, h]) => m.habilidades?.includes(hid) && h.usable_en !== 'fuera' && puede(m, h)).map(([hid, h]) => ({ id: hid, ...h }));
  },
  usar,
};

const costeTxt = h => h.coste ? ` (${h.coste.cantidad} ${etiqueta(h.coste.stat)})` : '';
function usarFuera(id, hid) {   // desde el panel, fuera de combate
  recordar();
  juego.registro = [];
  const m = miembro(id);
  if (m.stats.vida <= 0) juego.registro.push(`${m.nombre} está caído y no puede actuar.`);
  else if (!usar(id, hid)) juego.registro.push(`${m.nombre} no tiene suficiente ${etiqueta(defs()[hid].coste.stat)}.`);
  autoguardar();
  juego.ganchos.pintar();
}

const condiciones = {
  tiene_habilidad: c => {   // sin "quien": basta con que alguien del grupo la sepa
    const d = destinatarios(c) ?? enGrupo();
    const sabe = m => m.habilidades?.includes(c.habilidad);
    return d.length > 0 && (c.quien === 'todos' ? d.every(sabe) : d.some(sabe));
  },
};
const efectos = {
  aprender_habilidad: e => (destinatarios(e) ?? []).forEach(m => {
    if (m.habilidades.includes(e.habilidad)) return;
    m.habilidades.push(e.habilidad);
    juego.registro.push(`${m.nombre} aprende ${defs()[e.habilidad].nombre}.`);
  }),
};

function panel(cont) {
  if (!juego.aventura.habilidades || !juego.estado.grupo || juego.estado.combateGrupo || juego.estado.combate) return;
  const caja = plegable('habilidades', 'Habilidades', false);
  for (const id of juego.estado.grupo.orden) {
    const m = miembro(id);
    if (!m.habilidades.length) continue;
    const fila = el('div', '', 'puesto'), botones = el('div', '', 'fila-puesto');
    fila.append(el('p', m.nombre, 'puesto-titulo'));
    for (const hid of m.habilidades) {
      const h = defs()[hid];
      if (h.usable_en === 'combate' || h.dano !== undefined) botones.append(el('span', h.nombre + costeTxt(h), 'solo-combate'));   // solo vale en combate
      else botones.append(el('button', h.nombre + costeTxt(h), '', () => usarFuera(id, hid)));
    }
    fila.append(botones);
    caja.append(fila);
  }
  if (caja.children.length > 1) cont.append(caja);   // sin nadie con habilidades, no hay panel
}

function validarAventura(a) {
  const hs = a.habilidades, err = [], miembros = a.grupo?.miembros || {};
  const usa = reglasDe(a).some(({ r }) => r.tipo === 'aprender_habilidad' || r.tipo === 'tiene_habilidad') || Object.values(miembros).some(m => m.habilidades?.length);
  if (!hs) return (usa || a.modulos?.includes('habilidades')) ? ['falta la sección "habilidades" (el catálogo)'] : [];
  if (!a.grupo) return ['"habilidades" necesita la sección "grupo"'];
  const { tablas } = resolver(a), m = a.modulos;
  if (m?.includes('grupo') && m.includes('habilidades') && m.indexOf('grupo') > m.indexOf('habilidades')) err.push('declara el módulo "grupo" antes que "habilidades"');
  for (const [id, h] of Object.entries(hs)) {
    const d = `habilidades.${id}`;
    if (!h.nombre) err.push(`${d}: falta "nombre"`);
    if (h.coste && !(h.coste.stat && h.coste.cantidad > 0)) err.push(`${d}: "coste" necesita "stat" y una "cantidad" mayor que 0`);
    if (h.dano !== undefined && !(h.dano >= 0)) err.push(`${d}: "dano" no es válido`);
    if (h.usable_en !== undefined && !['combate', 'fuera', 'ambos'].includes(h.usable_en)) err.push(`${d}: "usable_en" debe ser combate, fuera o ambos`);
    if (!h.efectos?.length && h.dano === undefined) err.push(`${d}: no hace nada (le faltan "efectos" o "dano")`);
    (h.efectos || []).forEach(e => tablas.efectos[e.tipo] || err.push(`${d}: tipo de efecto desconocido "${e.tipo}"`));
  }
  Object.entries(miembros).forEach(([mid, p]) => (p.habilidades || []).forEach(hid => hs[hid] || err.push(`grupo.${mid}: la habilidad "${hid}" no existe`)));
  reglasDe(a).forEach(({ r }) => { if (['aprender_habilidad', 'tiene_habilidad'].includes(r.tipo) && !hs[r.habilidad]) err.push(`${r.tipo}: la habilidad "${r.habilidad}" no existe`); });
  return err;
}

registrar({ nombre: 'habilidades', condiciones, efectos, panel, validarAventura });
