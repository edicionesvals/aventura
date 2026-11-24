/* MÓDULO "puestos": quién se ocupa de qué en el grupo (timón, remo, médico, líder, guardia...).
   En el JSON de la aventura, sección "puestos" (necesita el módulo "grupo"):
     "puestos": {
       "max_por_miembro": 2,                       // opcional: cuántos puestos puede tener a la vez cada personaje
       "lista": {
         "timon": { "nombre": "Timón", "capacidad": 1, "asignado": ["capitan"] },
         "remo":  { "nombre": "Remo",  "capacidad": 2 }      // capacidad = huecos (p. ej. remos del barco)
       }
     }
   · Una persona puede tener varios puestos (hasta max_por_miembro): útil con tripulaciones pequeñas.
   · En pantalla hay un panel "Puestos" donde se asigna o se quita a cada personaje con un botón.
     Si el puesto es de uno solo, asignarlo a otro se lo quita al anterior; si tiene varios huecos y
     están llenos, no se puede añadir a nadie más.
   · Efectos: asignar_puesto / quitar_puesto { puesto, quien }. Condiciones: puesto_ocupado { puesto }
     y tiene_puesto { puesto, quien }.
   · "quien": "puesto:negociador" hace que una condición o un efecto recaiga en quien ocupe ese puesto
     (si está vacío, la condición no se cumple). Otros módulos lo usan: tiempo.velocidad.puesto.
   Depende de: estado, nucleo, guardado, registro, dom, grupo, validador */
import { juego } from './estado.js';
import { recordar } from './nucleo.js';
import { autoguardar } from './guardado.js';
import { registrar } from './registro.js';
import { el, plegable } from './dom.js';
import { idsDe, titularesDe } from './grupo.js';
import { reglasDe } from './validador.js';

const def = () => juego.aventura.puestos;
const P = () => (juego.estado.puestos ??= {});   // { puesto: [ids] } (se guarda con la partida)
const miembro = id => juego.estado.grupo.miembros[id];
const cuantos = id => Object.values(P()).filter(l => l.includes(id)).length;   // puestos que tiene un personaje

// Asigna un personaje a un puesto. Devuelve true si se pudo (y deja un mensaje si no).
function asignar(puesto, id) {
  const p = def().lista[puesto], m = miembro(id);
  if (idsDe(puesto).includes(id)) return true;
  const max = def().max_por_miembro;
  if (max && cuantos(id) >= max) { juego.registro.push(`${m.nombre} no puede ocupar más puestos.`); return false; }
  const hueco = p.capacidad ?? 1;
  if (idsDe(puesto).length >= hueco) {
    if (hueco > 1) { juego.registro.push(`No quedan huecos de ${p.nombre}.`); return false; }
    P()[puesto] = [];   // puesto de una sola persona: pasa al nuevo (se quita al anterior)
  }
  (P()[puesto] ??= []).push(id);
  juego.registro.push(`${m.nombre} pasa a ocupar: ${p.nombre}.`);
  return true;
}
function quitar(puesto, id) {
  P()[puesto] = (P()[puesto] || []).filter(x => x !== id);
  juego.registro.push(`${miembro(id).nombre} deja: ${def().lista[puesto].nombre}.`);
}

const condiciones = {
  puesto_ocupado: c => idsDe(c.puesto).length > 0,
  tiene_puesto: c => idsDe(c.puesto).includes(c.quien),
};
const efectos = {
  asignar_puesto: e => { asignar(e.puesto, e.quien); },
  quitar_puesto: e => { if (idsDe(e.puesto).includes(e.quien)) quitar(e.puesto, e.quien); },
};

// Cambiar un puesto desde el panel: guarda copia para "Deshacer"
function alternar(puesto, id) {
  recordar();
  juego.registro = [];
  if (idsDe(puesto).includes(id)) quitar(puesto, id); else asignar(puesto, id);
  autoguardar();
  juego.ganchos.pintar();
}

// Panel de pantalla: por cada puesto, un botón por personaje (marcado con ✓ si lo ocupa)
function panel(cont) {
  if (!def() || !juego.estado.grupo || juego.estado.combateGrupo || juego.estado.combate) return;   // no se cambia en pleno combate
  const caja = plegable('puestos', 'Puestos', false);   // plegado de entrada: no es lo que más se mira
  caja.className = 'puestos';
  for (const [id, p] of Object.entries(def().lista)) {
    const fila = el('div', '', 'puesto'), botones = el('div', '', 'fila-puesto');
    fila.append(el('p', `${p.nombre} (${idsDe(id).length}/${p.capacidad ?? 1})`, 'puesto-titulo'));
    for (const mid of juego.estado.grupo.orden) {
      const activo = idsDe(id).includes(mid);
      botones.append(el('button', (activo ? '✓ ' : '') + miembro(mid).nombre, activo ? 'activo' : '', () => alternar(id, mid)));
    }
    fila.append(botones);
    caja.append(fila);
  }
  cont.append(caja);
}

// Al empezar la partida se cargan las asignaciones iniciales
function alNueva() {
  if (!def()) return;
  juego.estado.puestos = Object.fromEntries(Object.entries(def().lista).map(([id, p]) => [id, [...(p.asignado || [])]]));
}

function validarAventura(a) {
  const p = a.puestos;
  if (!p) return a.modulos?.includes('puestos') ? ['declaras el módulo "puestos" pero falta la sección "puestos"'] : [];
  if (!a.grupo) return ['"puestos" necesita la sección "grupo"'];
  const err = [], lista = p.lista || {}, ids = Object.keys(a.grupo.miembros || {}), cuenta = {};
  if (a.modulos?.includes('puestos') && !a.modulos.includes('grupo')) err.push('el módulo "puestos" necesita también el módulo "grupo"');
  if (!Object.keys(lista).length) err.push('puestos.lista: no hay ningún puesto');
  for (const [id, x] of Object.entries(lista)) {
    if (!x.nombre) err.push(`puestos.${id}: falta "nombre"`);
    const cap = x.capacidad ?? 1, asig = x.asignado || [];
    if (!(cap >= 1)) err.push(`puestos.${id}: "capacidad" debe ser 1 o más`);
    if (asig.length > cap) err.push(`puestos.${id}: hay ${asig.length} asignados y solo ${cap} huecos`);
    asig.forEach(m => { ids.includes(m) || err.push(`puestos.${id}: el personaje "${m}" no existe`); cuenta[m] = (cuenta[m] || 0) + 1; });
  }
  if (p.max_por_miembro) Object.entries(cuenta).forEach(([m, n]) => n > p.max_por_miembro && err.push(`el personaje "${m}" empieza con ${n} puestos y el máximo es ${p.max_por_miembro}`));
  for (const { r } of reglasDe(a)) {
    if (['asignar_puesto', 'quitar_puesto', 'puesto_ocupado', 'tiene_puesto'].includes(r.tipo) && !lista[r.puesto]) err.push(`${r.tipo}: el puesto "${r.puesto}" no existe`);
    if (['asignar_puesto', 'quitar_puesto', 'tiene_puesto'].includes(r.tipo) && !ids.includes(r.quien)) err.push(`${r.tipo}: el personaje "${r.quien}" no existe`);
  }
  return err;
}

// En la ficha de cada personaje del grupo se lista el puesto (o puestos) que ocupa
juego.ganchos.etiquetasFicha = id => {
  if (!def() || !juego.estado?.grupo) return [];
  const mios = Object.entries(def().lista).filter(([pid]) => idsDe(pid).includes(id)).map(([, p]) => p.nombre);
  return mios.length ? [`Puesto: ${mios.join(', ')}`] : [];
};

registrar({ nombre: 'puestos', condiciones, efectos, alNueva, panel, validarAventura });
