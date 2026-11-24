/* MÓDULO "tiempo": reloj de días, consumo de recursos y viajes.
   En el JSON de la aventura, sección "tiempo":
     "tiempo": {
       "dia_inicial": 1,
       "velocidad": { "base": 1, "suma_miembros": "fuerza_remo", "puesto": "remo",   // velocidad = base + suma de esa estadística
                      "requiere": { "puesto": "timon", "factor": 0.5, "mensaje": "..." } },   // (solo de quienes ocupan "puesto", si se indica)
       "consumos": [ { "stat": "viveres", "por_dia": 1, "por_miembro": true, "si_falta": [ ...efectos ] } ],
       "plazos":   [ { "dia": 9, "efectos": [ ...efectos ] } ]   // se aplican una sola vez, al llegar a ese día
     }
   · El día actual es la estadística común "dia": sale en la barra de estado, se usa en el texto
     como {dia} y en las condiciones stat_min / stat_max.
   · Efectos nuevos: pasar_dias {dias} y viajar {distancia}; el viaje dura distancia / velocidad días,
     redondeado hacia arriba (más remeros = menos días, pero más bocas que alimentar).
   · Cada día que pasa se gasta cada recurso de "consumos" (por_miembro: se multiplica por el nº de
     personajes del grupo). Si no alcanza, el recurso queda a 0 y se aplican los efectos de "si_falta".
   · Un efecto "ir_a" dentro de si_falta o de un plazo interrumpe el viaje y lleva a otra escena.
   Depende de: estado, reglas, registro, validador */
import { juego } from './estado.js';
import { aplicar } from './reglas.js';
import { registrar, resolver } from './registro.js';
import { reglasDe } from './validador.js';
import { titularesDe } from './grupo.js';

const T = () => juego.aventura.tiempo;
const miembros = () => { const g = juego.estado.grupo; return g ? g.orden.map(id => g.miembros[id]) : []; };

// Velocidad del viaje: base + suma de una estadística de los miembros del grupo (p. ej. "fuerza_remo").
// Con "puesto", solo suman quienes ocupan ese puesto (así los remos disponibles limitan a los remeros).
// Con "requiere", si nadie ocupa ese puesto (p. ej. el timón) la velocidad se multiplica por "factor".
function velocidad() {
  const v = T().velocidad || {};
  const quienes = v.puesto ? titularesDe(v.puesto) : miembros();
  const extra = v.suma_miembros ? quienes.reduce((t, m) => t + (m.stats[v.suma_miembros] ?? 0), 0) : 0;
  let vel = (v.base ?? 1) + extra, sinTitular = false;
  if (v.requiere && !titularesDe(v.requiere.puesto).length) { vel *= v.requiere.factor ?? 0.5; sinTitular = true; }
  return { vel: Math.max(0.1, vel), sinTitular };   // nunca 0, para no dividir por cero
}

// Pasa UN día: avanza el reloj, gasta los recursos y aplica los plazos que se cumplan
function unDia() {
  const s = juego.estado.stats, hechos = (juego.estado.plazosHechos ??= []);
  s.dia = (s.dia ?? 1) + 1;
  const bocas = Math.max(1, miembros().length);
  for (const c of T().consumos || []) {
    const gasto = c.por_dia * (c.por_miembro ? bocas : 1), hay = s[c.stat] ?? 0;
    s[c.stat] = Math.max(0, hay - gasto);
    if (hay < gasto) (c.si_falta || []).forEach(aplicar);   // no alcanzaba: hambre, sed...
  }
  (T().plazos || []).forEach((p, i) => {
    if (s.dia >= p.dia && !hechos.includes(i)) { hechos.push(i); (p.efectos || []).forEach(aplicar); }
  });
}
function pasarDias(n) {
  for (let i = 0; i < n; i++) { unDia(); if (juego.desvio) break; }   // un ir_a interrumpe el viaje
}

const efectos = {
  pasar_dias: e => pasarDias(e.dias),
  viajar: e => {
    const { vel, sinTitular } = velocidad();
    if (sinTitular) juego.registro.push(T().velocidad.requiere.mensaje || 'Falta alguien en un puesto clave y el viaje se ralentiza.');
    const dias = Math.max(1, Math.ceil(e.distancia / vel));
    juego.registro.push(`El viaje dura ${dias} día${dias > 1 ? 's' : ''}.`);
    pasarDias(dias);
  },
};

// Al empezar la partida se crea la estadística común "dia"
function alNueva() {
  if (!T()) return;
  juego.estado.stats.dia = T().dia_inicial ?? 1;
  juego.estado.plazosHechos = [];
}

function validarAventura(a) {
  const t = a.tiempo, err = [], { tablas } = resolver(a);
  const usan = reglasDe(a).some(({ r }) => r.tipo === 'pasar_dias' || r.tipo === 'viajar');
  if (!t) return (usan || a.modulos?.includes('tiempo')) ? ['falta la sección "tiempo" (la necesitan pasar_dias y viajar)'] : [];
  const revisar = (lista, donde) => (lista || []).forEach(e => {
    if (!tablas.efectos[e.tipo]) err.push(`${donde}: tipo de efecto desconocido "${e.tipo}"`);
    if (e.tipo === 'ir_a' && !a.nodos?.[e.destino]) err.push(`${donde}: ir_a: el nodo "${e.destino}" no existe`);
  });
  (t.consumos || []).forEach((c, i) => {
    const d = `tiempo.consumos[${i}]`;
    if (!(c.stat in (a.estadisticas || {}))) err.push(`${d}: la estadística "${c.stat}" no está en "estadisticas"`);
    if (!(c.por_dia > 0)) err.push(`${d}: "por_dia" debe ser un número mayor que 0`);
    revisar(c.si_falta, `${d}.si_falta`);
  });
  (t.plazos || []).forEach((p, i) => {
    if (!(p.dia > 0)) err.push(`tiempo.plazos[${i}]: falta "dia"`);
    revisar(p.efectos, `tiempo.plazos[${i}]`);
  });
  for (const clave of ['puesto', 'requiere']) {   // los puestos de "velocidad" deben existir
    const p = clave === 'puesto' ? t.velocidad?.puesto : t.velocidad?.requiere?.puesto;
    if (p && !a.puestos?.lista?.[p]) err.push(`tiempo.velocidad.${clave}: el puesto "${p}" no existe en "puestos"`);
  }
  return err;
}

registrar({ nombre: 'tiempo', efectos, alNueva, validarAventura });
