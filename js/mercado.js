/* MÓDULO "mercado": comprar y vender mercancías con precios que varían. Versión básica, de ejemplo.
   En el JSON:
     "mercados": {
       "moneda": "oro", "margen": 0.2, "fluctuacion": 0.15,     // margen: lo que pierdes al vender; fluctuacion: variación diaria (±15 %)
       "lugares": { "rodas": { "nombre": "Mercado de Rodas",
                               "productos": { "vino": { "nombre": "Vino", "base": 6 }, "sal": { "nombre": "Sal", "base": 4 } } } }
     }
     escena: { "tipo": "mercado", "mercado": "rodas", "volver": "muelle_rodas", "texto": "..." }
   · Cada lugar valora distinto cada producto (precio "base"): comprar barato en uno y vender caro en otro es el negocio.
   · El precio de cada día se calcula con el precio base y una variación fija por (lugar, producto, día): es el mismo si recargas
     la página, y cambia al pasar los días (con el módulo "tiempo"; sin él, el día es 0 y los precios no fluctúan).
   · Lo que llevas es una estadística común con el id del producto (se crea sola) y se paga con la "moneda".
   Depende de: estado, nucleo, guardado, registro, dom */
import { juego } from './estado.js';
import { ir, recordar } from './nucleo.js';
import { autoguardar } from './guardado.js';
import { registrar } from './registro.js';
import { el } from './dom.js';

const def = () => juego.aventura.mercados;
const moneda = () => def().moneda ?? 'oro';

// Número "aleatorio" entre 0 y 1 que siempre sale igual para el mismo texto (hash FNV-1a)
function hash(texto) {
  let h = 2166136261;
  for (const c of texto) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); }
  return ((h >>> 0) % 1000) / 1000;
}
function precio(lugar, prod) {
  const base = def().lugares[lugar].productos[prod].base, dia = juego.estado.stats.dia ?? 0;
  const f = 1 + (hash(`${lugar}:${prod}:${dia}`) - 0.5) * 2 * (def().fluctuacion ?? 0.15);
  return Math.max(1, Math.round(base * f));
}
const precioVenta = (lugar, prod) => Math.max(1, Math.floor(precio(lugar, prod) * (1 - (def().margen ?? 0.2))));

function comprar(lugar, prod) {
  recordar();
  juego.registro = [];
  const s = juego.estado.stats, coste = precio(lugar, prod);
  if ((s[moneda()] ?? 0) >= coste) {
    s[moneda()] -= coste; s[prod] = (s[prod] ?? 0) + 1;
    juego.registro.push(`Compras 1 ${def().lugares[lugar].productos[prod].nombre} por ${coste}.`);
  }
  autoguardar();
  juego.ganchos.pintar();
}
function vender(lugar, prod) {
  recordar();
  juego.registro = [];
  const s = juego.estado.stats, ingreso = precioVenta(lugar, prod);
  if ((s[prod] ?? 0) > 0) {
    s[prod] -= 1; s[moneda()] = (s[moneda()] ?? 0) + ingreso;
    juego.registro.push(`Vendes 1 ${def().lugares[lugar].productos[prod].nombre} por ${ingreso}.`);
  }
  autoguardar();
  juego.ganchos.pintar();
}

registrar({
  nombre: 'mercado',
  escenas: {
    mercado: {
      // Una fila por producto: precios de hoy, lo que llevas y botones (solo los que se pueden usar)
      pintar: (caja, n) => {
        const s = juego.estado.stats, lugar = def().lugares[n.mercado];
        caja.append(el('p', lugar.nombre, 'turno'));
        for (const [id, p] of Object.entries(lugar.productos)) {
          const compra = precio(n.mercado, id), fila = el('div', '', 'producto');
          fila.append(el('span', `${p.nombre} · compra ${compra} · venta ${precioVenta(n.mercado, id)} · llevas ${s[id] ?? 0}`));
          if ((s[moneda()] ?? 0) >= compra) fila.append(el('button', 'Comprar 1', '', () => comprar(n.mercado, id)));
          if ((s[id] ?? 0) > 0) fila.append(el('button', 'Vender 1', '', () => vender(n.mercado, id)));
          caja.append(fila);
        }
        caja.append(el('button', 'Salir del mercado', '', () => { recordar(); juego.registro = []; ir(n.volver); }));
        return true;
      },
      destinos: n => [n.volver].filter(Boolean),
      validar: (id, n, a) => [
        ...(a.mercados?.lugares?.[n.mercado] ? [] : [`${id}: el mercado "${n.mercado}" no existe en "mercados.lugares"`]),
        ...(n.volver ? [] : [`${id}: falta "volver" (la escena a la que se sale)`]),
      ],
    },
  },
  // Al empezar, no llevas ninguna mercancía
  alNueva: () => {
    if (!def()) return;
    Object.values(def().lugares).forEach(l => Object.keys(l.productos).forEach(id => { juego.estado.stats[id] ??= 0; }));
  },
  validarAventura: a => {
    const m = a.mercados, err = [];
    const usa = Object.values(a.nodos || {}).some(n => n.tipo === 'mercado');
    if (!m) return (usa || a.modulos?.includes('mercado')) ? ['falta la sección "mercados"'] : [];
    const mon = m.moneda ?? 'oro';
    if (!(mon in (a.estadisticas || {}))) err.push(`mercados.moneda: la estadística "${mon}" no está en "estadisticas"`);
    for (const k of ['margen', 'fluctuacion']) if (m[k] !== undefined && !(m[k] >= 0 && m[k] < 1)) err.push(`mercados.${k}: debe estar entre 0 y 1`);
    if (!Object.keys(m.lugares || {}).length) err.push('mercados.lugares: no hay ningún mercado');
    for (const [id, l] of Object.entries(m.lugares || {})) {
      if (!Object.keys(l.productos || {}).length) err.push(`mercados.${id}: no tiene productos`);
      for (const [pid, p] of Object.entries(l.productos || {})) {
        if (!p.nombre) err.push(`mercados.${id}.${pid}: falta "nombre"`);
        if (!(p.base > 0)) err.push(`mercados.${id}.${pid}: "base" debe ser mayor que 0`);
      }
    }
    return err;
  },
});
