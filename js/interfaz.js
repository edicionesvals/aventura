/* INTERFAZ: dibuja la pantalla a partir del estado y reparte los clics.
   Depende de: dom, estado, reglas, nucleo, registro */
import { $, el, plegable } from './dom.js';
import { juego, etiqueta } from './estado.js';
import { evaluar, sustituir } from './reglas.js';
import { nodoActual, elegir, usar, nueva } from './nucleo.js';
import { activas } from './registro.js';
import { etiquetas } from './guardado.js';

// Redibuja la pantalla ENTERA a partir del estado. Patrón simple y robusto:
// el estado manda, la pantalla es solo su reflejo.
export function pintar() {
  const { estado, aventura, registro } = juego, nodo = nodoActual();
  const esc = activas.escenas[nodo.tipo];   // módulo que gestiona este tipo de escena (si lo hay)
  $('titulo').textContent = aventura.meta.titulo;

  // Barra de estado: un "chip" por estadística común y, si la escena lo pide, otro con su información
  // (p. ej. la ronda y los enemigos en un combate)
  const barra = $('estado'); barra.replaceChildren();
  const enBarra = ([k]) => estado.grupo || !aventura.comunes || aventura.comunes.includes(k);   // "comunes": las demás van a la ficha del protagonista
  for (const [k, v] of Object.entries(estado.stats).filter(enBarra)) {
    const chip = el('span', '', 'chip');
    chip.append(el('span', etiqueta(k), 'etq'), el('strong', String(v)));
    barra.append(chip);
  }
  const extra = (esc?.barra?.(nodo) ?? '').replace(/^\s*\|\s*/, '');
  if (extra) barra.append(el('span', extra, 'chip combate'));

  const texto = $('texto'); texto.replaceChildren();   // replaceChildren() vacía el contenedor
  // Texto base + párrafos extra cuya condición se cumple ("texto_si"): así una escena
  // cambia según lo ocurrido sin tener que duplicarla.
  const extras = (nodo.texto_si || []).filter(t => evaluar(t.condicion)).map(t => t.texto);
  [nodo.texto, ...extras].join('\n').split('\n').forEach(p => texto.append(el('p', sustituir(p))));
  registro.forEach(r => texto.append(el('p', r, 'registro')));

  const caja = $('opciones'); caja.replaceChildren();
  if (esc?.pintar?.(caja, nodo)) {
    // el módulo de este tipo de escena (p. ej. combate) ya dibujó sus controles
  } else if (nodo.fin || !nodo.opciones?.length) {
    caja.append(el('p', 'Fin', 'fin'), el('button', 'Volver a empezar', '', nueva));
  } else {
    // Si la condición se cumple, botón normal. Si no, la opción se oculta, salvo que
    // traiga "bloqueada": "motivo": entonces se ve desactivada con ese motivo (da pistas).
    nodo.opciones.forEach(o => {
      if (evaluar(o.condicion)) caja.append(el('button', o.texto, '', () => elegir(o)));
      else if (o.bloqueada) {
        const b = el('button', `${o.texto} (${o.bloqueada})`, 'bloqueada');
        b.disabled = true;   // un botón desactivado no se puede pulsar
        caja.append(b);
      }
    });
  }

  // Zona lateral. Con grupo la dibuja el módulo grupo; con un solo protagonista la dibujamos aquí,
  // para que la pantalla tenga siempre la misma forma ("Personajes", haya uno o varios).
  const g = $('grupo');   // (el id se conserva: es la zona donde los módulos dibujan sus paneles)
  if (g) { g.replaceChildren(); if (!estado.grupo) panelProtagonista(g); activas.paneles.forEach(p => p(g)); }

  $('btn-deshacer').disabled = !juego.historial.length;   // sin pasos que deshacer, desactivado
  pintarRanuras();                                        // el desplegable de ranuras se rellena en cada redibujado
}
// Rellena el desplegable de ranuras (con fecha de cada una) conservando la elegida
export function pintarRanuras() {
  const sel = $('ranura'), actual = sel.value || 'manual';
  sel.replaceChildren();
  etiquetas().forEach(r => sel.append(new Option(r.texto, r.id)));
  sel.value = actual;
}
// Ficha del protagonista cuando no hay grupo: nombre, estadísticas propias y objetos (con su botón Usar)
function panelProtagonista(cont) {
  const { estado, aventura } = juego;
  const caja = plegable('personajes', 'Personajes', true), rejilla = el('div', '', 'miembros'), ficha = el('div', '', 'miembro');
  ficha.append(el('h2', aventura.meta.protagonista ?? 'Protagonista'));
  const propias = Object.entries(estado.stats).filter(([k]) => aventura.comunes && !aventura.comunes.includes(k));
  if (propias.length) ficha.append(el('p', propias.map(([k, v]) => `${etiqueta(k)}: ${v}`).join(' · '), 'stats'));
  if (!estado.inventario.length) ficha.append(el('p', 'Sin objetos', 'vacio'));
  for (const id of estado.inventario) {
    const o = aventura.objetos[id], fila = el('div', '', 'objeto');
    fila.append(el('span', o.nombre));
    if (o.usable) fila.append(el('button', 'Usar', '', () => usar(id)));
    ficha.append(fila);
  }
  rejilla.append(ficha);
  caja.append(rejilla);
  cont.append(caja);
}
juego.ganchos.pintar = pintar;   // el núcleo y el guardado llaman a pintar a través de este gancho
