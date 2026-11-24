/* VALIDADOR: revisa la aventura al cargarla. Un destino mal escrito es el error
   más típico y así lo ves al instante en vez de descubrirlo jugando.
   Solo acepta tipos que existan en el núcleo o en los módulos que la aventura
   declara. Depende de: registro */
import { resolver, proveedor } from './registro.js';

// tabla = 'condiciones' | 'efectos'
function revisarRegla(r, tabla, tablas, donde, a, err) {
  if (!tablas[tabla][r.tipo]) {
    const m = proveedor(tabla, r.tipo);
    err.push(`${donde}: tipo desconocido "${r.tipo}"` + (m ? ` (¿falta declarar el módulo "${m}"?)` : ''));
  }
  if (r.id && r.tipo?.endsWith('objeto') && !a.objetos?.[r.id]) err.push(`${donde}: el objeto "${r.id}" no existe`);
  if (r.tipo === 'ir_a' && !a.nodos?.[r.destino]) err.push(`${donde}: ir_a: el nodo "${r.destino}" no existe`);
  [...(r.todas || []), ...(r.alguna || []), ...(r.cond ? [r.cond] : [])].forEach(s => revisarRegla(s, tabla, tablas, donde, a, err));
}
export function validar(a) {
  const { tablas, errores: err, modulos } = resolver(a), nodos = a.nodos || {};
  if (a.formato !== 1) err.push('formato no soportado (se esperaba 1)');
  if (!a.meta?.id || !nodos[a.meta?.inicio]) err.push('meta.id o meta.inicio incorrectos');
  (a.comunes || []).forEach(k => (k in (a.estadisticas || {})) || (k === 'dia' && a.tiempo) || err.push(`comunes: la estadística "${k}" no está en "estadisticas"`));
  const nodoExiste = (id, donde) => { if (!nodos[id]) err.push(`${donde}: el nodo "${id}" no existe`); };
  for (const [id, n] of Object.entries(nodos)) {
    (n.al_entrar || []).forEach(e => revisarRegla(e, 'efectos', tablas, id, a, err));
    (n.texto_si || []).forEach((t, i) => { if (t.condicion) revisarRegla(t.condicion, 'condiciones', tablas, `${id}, texto_si ${i + 1}`, a, err); });
    (n.opciones || []).forEach((o, i) => {
      const donde = `${id}, opción ${i + 1}`;
      if (o.destino) nodoExiste(o.destino, donde);
      if (o.condicion) revisarRegla(o.condicion, 'condiciones', tablas, donde, a, err);
      (o.efectos || []).forEach(e => revisarRegla(e, 'efectos', tablas, donde, a, err));
    });
    if (n.tipo) {   // cada tipo de escena lo aporta un módulo, que sabe cómo validarla
      const esc = tablas.escenas[n.tipo];
      if (!esc) {
        const m = proveedor('escenas', n.tipo);
        err.push(`${id}: tipo de escena "${n.tipo}" ` + (m ? `no disponible (¿falta declarar el módulo "${m}"?)` : 'desconocido'));
      } else {
        (esc.destinos?.(n) || []).forEach(d => nodoExiste(d, `${id} (${n.tipo})`));
        err.push(...(esc.validar?.(id, n, a) || []));
      }
    }
  }
  modulos.forEach(m => err.push(...(m.validarAventura?.(a) || [])));   // cada módulo revisa lo suyo
  return err;
}

// Todas las condiciones y efectos de la aventura en una lista plana: { tabla, r }
export function reglasDe(a) {
  const reglas = [], nodos = a.nodos || {};
  const aplanar = (r, tabla) => {
    reglas.push({ tabla, r });
    [...(r.todas || []), ...(r.alguna || []), ...(r.cond ? [r.cond] : [])].forEach(s => aplanar(s, tabla));
  };
  for (const n of Object.values(nodos)) {
    (n.al_entrar || []).forEach(e => aplanar(e, 'efectos'));
    (n.texto_si || []).forEach(t => t.condicion && aplanar(t.condicion, 'condiciones'));
    (n.opciones || []).forEach(o => { if (o.condicion) aplanar(o.condicion, 'condiciones'); (o.efectos || []).forEach(e => aplanar(e, 'efectos')); });
  }
  Object.values(a.enemigos || {}).forEach(e => (e.recompensa || []).forEach(x => aplanar(x, 'efectos')));
  Object.values(a.objetos || {}).forEach(o => (o.efectos || []).forEach(x => aplanar(x, 'efectos')));
  Object.values(a.habilidades || {}).forEach(h => (h.efectos || []).forEach(x => aplanar(x, 'efectos')));   // efectos de las habilidades
  (a.tiempo?.consumos || []).forEach(c => (c.si_falta || []).forEach(e => aplanar(e, 'efectos')));   // efectos del módulo tiempo
  (a.tiempo?.plazos || []).forEach(p => (p.efectos || []).forEach(e => aplanar(e, 'efectos')));
  return reglas;
}

/* AVISOS: cosas dudosas que no impiden jugar. Se escriben en la consola (F12). */
export function avisos(a) {
  const av = [], nodos = a.nodos || {}, { tablas } = resolver(a);

  const reglas = reglasDe(a);   // 1. todas las condiciones y efectos, en una lista plana
  const de = (tabla, ...tipos) => reglas.filter(x => x.tabla === tabla && tipos.includes(x.r.tipo)).map(x => x.r);

  // 2. Flags: ¿se activan pero nadie los mira? ¿se miran pero nadie los activa?
  const puestos = new Set(de('efectos', 'flag').map(r => r.flag)), mirados = new Set(de('condiciones', 'flag', 'no_flag').map(r => r.flag));
  puestos.forEach(f => mirados.has(f) || av.push(`flag "${f}": se activa pero nunca se comprueba`));
  mirados.forEach(f => puestos.has(f) || av.push(`flag "${f}": se comprueba pero nunca se activa`));

  // 3. Objetos: ¿hay objetos que no se pueden conseguir nunca?
  const dados = new Set(de('efectos', 'dar_objeto').map(r => r.id));
  Object.values(a.grupo?.miembros || {}).forEach(m => (m.objetos || []).forEach(o => dados.add(o)));   // con lo que empieza cada personaje
  Object.keys(a.objetos || {}).forEach(o => dados.has(o) || av.push(`objeto "${o}": está definido pero nunca se consigue`));
  de('condiciones', 'tiene_objeto').forEach(r => dados.has(r.id) || a.objetos?.[r.id] || av.push(`objeto "${r.id}": se exige pero nunca se consigue`));

  // 4. Estadísticas usadas pero no definidas (suele ser una errata)
  const definidas = new Set(Object.keys(a.estadisticas || {}));
  Object.values(a.grupo?.miembros || {}).forEach(m => Object.keys(m.stats || {}).forEach(k => definidas.add(k)));   // estadísticas de cada personaje
  Object.values(a.mercados?.lugares || {}).forEach(l => Object.keys(l.productos || {}).forEach(k => definidas.add(k)));   // las mercancías son estadísticas comunes
  if (a.experiencia) { definidas.add('xp'); definidas.add('nivel'); }   // los crea el módulo experiencia
  if (a.tiempo) definidas.add('dia');   // el módulo tiempo crea la estadística común "dia"
  new Set(reglas.map(x => x.r.stat).filter(Boolean)).forEach(s => definidas.has(s) || av.push(`estadística "${s}": se usa pero no está en "estadisticas" (¿errata?)`));

  // 5. Escenas: inalcanzables, sin salida o con todas las opciones condicionadas
  const destinosDe = n => [...(n.opciones || []).map(o => o.destino), ...(tablas.escenas[n.tipo]?.destinos?.(n) || [])].filter(Boolean);
  if (nodos[a.meta?.inicio]) {
    const vistos = new Set(), pila = [a.meta.inicio, ...de('efectos', 'ir_a').map(r => r.destino)];   // los ir_a también son entradas
    while (pila.length) {
      const id = pila.pop();
      if (vistos.has(id) || !nodos[id]) continue;
      vistos.add(id);
      pila.push(...destinosDe(nodos[id]));
    }
    Object.keys(nodos).filter(id => !vistos.has(id)).forEach(id => av.push(`escena "${id}": inalcanzable desde el inicio`));
  }
  for (const [id, n] of Object.entries(nodos)) {
    if (n.fin || n.tipo) continue;
    if (!n.opciones?.length) av.push(`escena "${id}": sin opciones y sin "fin"; se tratará como un final`);
    else if (n.opciones.every(o => o.condicion && !o.bloqueada)) av.push(`escena "${id}": todas sus opciones tienen condición; revisa que nunca puedas quedarte sin salida`);
  }
  return av;
}
