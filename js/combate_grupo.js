/* MÓDULO "combate_grupo": combate por turnos entre el grupo y varios enemigos.
   Reglas (las fórmulas viven aquí; los números, en el JSON):
   · Iniciativa: al empezar, cada combatiente tira velocidad + dado; se actúa de mayor a menor
     y el orden se mantiene toda la pelea.
   · En su turno cada personaje elige: Atacar (y a quién), Defender, Usar objeto o Huir.
   · Los enemigos atacan a un personaje vivo elegido al azar.
   · Daño = dado + ataque (fuerza, en los personajes) - defensa del rival, mínimo 0.
     Defender suma +3 a la defensa hasta tu siguiente turno.
   Estadísticas que lee: personajes → vida, fuerza, defensa, velocidad; enemigos → vida,
   ataque, defensa, velocidad (las ausentes valen 0).
   En el JSON: escena { "tipo": "combate_grupo", "enemigos": ["lobo","lobo"], "victoria", "derrota", "huida" }.
   Un combate ganado no se repite: al volver a la escena se va a "vencido" (si la escena lo define) o a
   "victoria" sin repetir sus efectos de entrada; con "repetible": true se vuelve a pelear.
   Necesita el módulo "grupo". Depende de: estado, reglas, nucleo, guardado, registro, dom, grupo */
import { juego, dado, etiqueta } from './estado.js';
import { aplicar } from './reglas.js';
import { ir, nodoActual, recordar } from './nucleo.js';
import { autoguardar } from './guardado.js';
import { registrar } from './registro.js';
import { el } from './dom.js';
import { aplicarObjeto } from './grupo.js';

const BONO_DEFENSA = 3;
// Estado del combate (se guarda con la partida): juego.estado.combateGrupo =
//   { enemigos: [{id, nombre, vida}], orden: ['m:aria','e:0',...], turno, ronda, fase, defiende: {id: true} }
const CG = () => juego.estado.combateGrupo;
const miembro = id => juego.estado.grupo.miembros[id];
const defE = id => juego.aventura.enemigos[id];                       // datos fijos del enemigo
const vivosM = () => juego.estado.grupo.orden.filter(id => miembro(id).stats.vida > 0);
const vivosE = () => CG().enemigos.flatMap((e, i) => e.vida > 0 ? [i] : []);
const actor = () => CG().orden[CG().turno].split(':')[1];             // id del personaje al que le toca
const usables = m => m.inventario.filter(id => juego.aventura.objetos[id].usable);
const nombreDe = k => { const [b, id] = k.split(':'); return b === 'm' ? miembro(id).nombre : CG().enemigos[+id].nombre; };

// ---- Preparar el combate ----
function iniciar(n) {
  // Si un enemigo se repite, se numera: "Lobo 1", "Lobo 2"
  const total = {}, visto = {};
  n.enemigos.forEach(id => { total[id] = (total[id] || 0) + 1; });
  const enemigos = n.enemigos.map(id => {
    visto[id] = (visto[id] || 0) + 1;
    return { id, nombre: total[id] > 1 ? `${defE(id).nombre} ${visto[id]}` : defE(id).nombre, vida: defE(id).vida };
  });
  const tiradas = [
    ...juego.estado.grupo.orden.filter(id => miembro(id).stats.vida > 0)
      .map(id => ({ k: 'm:' + id, v: (miembro(id).stats.velocidad ?? 0) + dado() })),
    ...enemigos.map((e, i) => ({ k: 'e:' + i, v: (defE(e.id).velocidad ?? 0) + dado() })),
  ];
  tiradas.sort((a, b) => b.v - a.v);   // el orden de sort es estable: a igualdad, el grupo va primero
  juego.estado.combateGrupo = { enemigos, orden: tiradas.map(t => t.k), turno: 0, ronda: 1, fase: 'accion', defiende: {} };
  juego.registro.push('Orden de combate: ' + tiradas.map(t => nombreDe(t.k)).join(' → '));
}

// ---- Avanzar turnos: los enemigos actúan solos; se para cuando le toca a alguien del grupo ----
function avanzar() {
  const cg = CG(), n = nodoActual();
  for (let seguridad = 0; seguridad < 500; seguridad++) {   // tope de seguridad contra bucles
    if (!vivosE().length) return ganar(n);
    if (!vivosM().length) return perder(n);
    const [b, id] = cg.orden[cg.turno].split(':');
    if (b === 'm' && miembro(id).stats.vida > 0) { delete cg.defiende[id]; cg.fase = 'accion'; return; }   // te toca
    if (b === 'e' && cg.enemigos[+id].vida > 0) turnoEnemigo(+id);
    cg.turno = (cg.turno + 1) % cg.orden.length;               // (los caídos pierden su turno)
    if (cg.turno === 0) cg.ronda++;
  }
}
function turnoEnemigo(i) {
  const cg = CG(), e = cg.enemigos[i], d = defE(e.id), vivos = vivosM();
  const id = vivos[dado(vivos.length) - 1], m = miembro(id);   // objetivo al azar entre los personajes vivos
  const defensa = (m.stats.defensa ?? 0) + (cg.defiende[id] ? BONO_DEFENSA : 0);
  const dano = Math.max(0, dado() + (d.ataque ?? 0) - defensa);
  m.stats.vida = Math.max(0, m.stats.vida - dano);
  juego.registro.push(`${e.nombre} golpea a ${m.nombre}: -${dano}` + (m.stats.vida === 0 ? ` (${m.nombre} cae)` : ''));
}
function ganar(n) {
  juego.registro.push('¡Habéis vencido!');
  CG().enemigos.forEach(e => (defE(e.id).recompensa || []).forEach(aplicar));
  const xp = CG().enemigos.reduce((t, e) => t + (defE(e.id).xp ?? 0), 0);
  if (xp) juego.ganchos.alVencer(xp);   // experiencia (módulo opcional): la reciben los que siguen en pie
  juego.estado.combateGrupo = null;
  (juego.estado.vencidos ??= {})[juego.estado.nodo] = true;   // se recuerda que esta escena ya está superada
  ir(n.victoria);
}
function perder(n) { juego.estado.combateGrupo = null; ir(n.derrota); }

// ---- Acciones del jugador ----
const fase = f => { CG().fase = f; if (f === 'accion') CG().pendiente = null; autoguardar(); juego.ganchos.pintar(); };   // cambiar de menú no gasta turno
function confirmar() {   // antes de gastar el turno guardamos una copia: "Deshacer" vuelve a elegir acción
  CG().fase = 'accion';
  CG().pendiente = null;   // (atacar() lee antes qué habilidad se estaba usando)
  recordar();
  juego.registro = [];
}
function acabar() {      // pasa al siguiente combatiente y avanza hasta que le toque a alguien del grupo
  const cg = CG();
  cg.turno = (cg.turno + 1) % cg.orden.length;
  if (cg.turno === 0) cg.ronda++;
  avanzar();
  if (CG()) { autoguardar(); juego.ganchos.pintar(); }   // si el combate sigue (si no, ir() ya redibujó)
}
function atacar(i) {
  const hid = CG().pendiente;   // si no es null, es un ataque con habilidad (módulo habilidades)
  confirmar();
  const m = miembro(actor()), e = CG().enemigos[i];
  const h = hid ? juego.ganchos.habilidades.usar(actor(), hid) : null;   // paga el coste y aplica sus efectos
  // Ataque normal: dado + fuerza - defensa. Con habilidad: dado + su "dano" (ignora la defensa).
  const dano = h ? Math.max(0, dado() + (h.dano ?? 0)) : Math.max(0, dado() + (m.stats.fuerza ?? 0) - (defE(e.id).defensa ?? 0));
  e.vida = Math.max(0, e.vida - dano);
  juego.registro.push(`${m.nombre} ${h ? `usa ${h.nombre} sobre` : 'golpea a'} ${e.nombre}: -${dano}` + (e.vida === 0 ? ` (${e.nombre} cae)` : ''));
  acabar();
}
function usarHab(hid) { confirmar(); juego.ganchos.habilidades.usar(actor(), hid); acabar(); }   // habilidad sin objetivo enemigo (p. ej. curar)
function defender() { confirmar(); CG().defiende[actor()] = true; juego.registro.push(`${miembro(actor()).nombre} se defiende.`); acabar(); }
function usarObjeto(objeto) { confirmar(); aplicarObjeto(actor(), objeto); acabar(); }   // usar un objeto gasta el turno
function huir() {
  confirmar();
  const n = nodoActual();
  juego.registro = ['Huis del combate.'];
  juego.estado.combateGrupo = null;
  ir(n.huida);
}

registrar({
  nombre: 'combate_grupo',
  escenas: {
    combate_grupo: {
      alEntrar: n => {
        if (juego.estado.vencidos?.[juego.estado.nodo] && !n.repetible) {   // ya lo vencisteis: no reaparecen
          juego.registro.push('Ya habíais despejado este lugar.');
          juego.desvio = n.vencido ?? n.victoria;
          juego.sinEntrada = n.vencido === undefined;
          return;
        }
        iniciar(n); avanzar();
      },
      barra: () => CG() ? ` | Ronda ${CG().ronda} · ` + CG().enemigos.map(e => `${e.nombre}: ${e.vida}`).join(', ') : '',
      // Los botones dependen de la fase: elegir acción, elegir objetivo o elegir objeto
      pintar: (caja, n) => {
        const cg = CG();
        if (!cg) return false;
        const m = miembro(actor());
        if (cg.fase === 'objetivo') {
          vivosE().forEach(i => caja.append(el('button', `${cg.enemigos[i].nombre} (vida ${cg.enemigos[i].vida})`, '', () => atacar(i))));
          caja.append(el('button', 'Cancelar', '', () => fase('accion')));
        } else if (cg.fase === 'habilidad') {
          juego.ganchos.habilidades.de(actor()).forEach(h => caja.append(el('button',
            h.nombre + (h.coste ? ` (${h.coste.cantidad} ${etiqueta(h.coste.stat)})` : ''), '',
            () => { if (h.dano !== undefined) { CG().pendiente = h.id; fase('objetivo'); } else usarHab(h.id); })));
          caja.append(el('button', 'Cancelar', '', () => fase('accion')));
        } else if (cg.fase === 'objeto') {
          usables(m).forEach(id => caja.append(el('button', juego.aventura.objetos[id].nombre, '', () => usarObjeto(id))));
          caja.append(el('button', 'Cancelar', '', () => fase('accion')));
        } else {
          caja.append(el('p', `Turno de ${m.nombre}.`, 'turno'), el('button', 'Atacar', '', () => fase('objetivo')), el('button', 'Defender', '', defender));
          if (usables(m).length) caja.append(el('button', 'Usar objeto', '', () => fase('objeto')));
          if (juego.ganchos.habilidades?.de(actor()).length) caja.append(el('button', 'Habilidad', '', () => fase('habilidad')));
          if (n.huida) caja.append(el('button', 'Huir', '', huir));
        }
        return true;
      },
      destinos: n => [n.victoria, n.derrota, n.huida, n.vencido].filter(Boolean),
      validar: (id, n, a) => [
        ...(a.grupo ? [] : [`${id}: el combate de grupo necesita la sección "grupo"`]),
        ...(n.enemigos?.length ? [] : [`${id}: falta la lista "enemigos"`]),
        ...(n.enemigos || []).filter(x => !a.enemigos?.[x]).map(x => `${id}: el enemigo "${x}" no existe`),
        ...(n.victoria ? [] : [`${id}: falta "victoria"`]),
        ...(n.derrota ? [] : [`${id}: falta "derrota"`]),
      ],
    },
  },
  validarAventura: a => {
    const err = [], m = a.modulos;
    if (m?.includes('combate_grupo') && !m.includes('grupo')) err.push('el módulo "combate_grupo" necesita también el módulo "grupo"');
    if (Object.values(a.nodos || {}).some(n => n.tipo === 'combate_grupo'))
      Object.entries(a.grupo?.miembros || {}).forEach(([id, p]) => p.stats?.vida === undefined && err.push(`grupo.${id}: le falta la estadística "vida" (necesaria en combate)`));
    return err;
  },
});
