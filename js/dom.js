/* DOM: utilidades mínimas para tocar la página. No depende de ningún otro archivo. */
export const $ = id => document.getElementById(id);   // atajo para buscar elementos por id

// Crea un elemento. Usamos textContent (no innerHTML) a propósito: así un
// texto de aventura jamás se interpreta como HTML (más seguro).
export function el(tag, texto, clase, alClick) {
  const e = document.createElement(tag);
  if (texto) e.textContent = texto;
  if (clase) e.className = clase;
  if (alClick) e.onclick = alClick;
  return e;
}
export const aviso = msg => { $('aviso').textContent = msg; };

// Panel plegable (<details>). La pantalla se redibuja entera tras cada acción, así que
// guardamos aparte si cada panel estaba abierto: es solo estado de pantalla, no de la partida.
const abiertos = {};
export function plegable(id, titulo, abiertoPorDefecto = false) {
  const d = document.createElement('details');
  d.open = abiertos[id] ?? abiertoPorDefecto;
  d.ontoggle = () => { abiertos[id] = d.open; };
  d.append(el('summary', titulo));
  return d;
}
