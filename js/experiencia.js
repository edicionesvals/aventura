/* MÓDULO "experiencia": puntos de experiencia (xp) y niveles.
   En el JSON de la aventura, sección "experiencia":
     "experiencia": {
       "niveles": [                                  // el primer elemento es el NIVEL 2 (se empieza en el 1)
         { "xp": 10, "mejoras": { "vida": 4, "fuerza": 1 }, "mensaje": "opcional" },   // xp = total acumulado necesario
         { "xp": 30, "mejoras": { "vida": 4, "defensa": 1 } }
       ]
     }
   · Cada personaje tiene las estadísticas "xp" y "nivel" (se crean al empezar; con un solo protagonista,
     las suyas propias). Se ven en su ficha; "etiquetas" puede darles nombre ("XP", "Nivel").
   · Los enemigos dan XP con el campo "xp" de su ficha en "enemigos". Al ganar un combate, TODOS los
     personajes que siguen en pie reciben la XP completa; los caídos no reciben nada y se quedan a 0 de vida.
   · La historia puede darla con el efecto dar_xp { cantidad, quien? }: sin "quien", la reciben los que siguen en pie.
   · Al alcanzar la xp de un nivel se aplican sus "mejoras" (suman a las estadísticas); se puede subir varios niveles
     de golpe. Nada se elige: las mejoras vienen fijadas aquí.
   · Se puede condicionar con stat_min sobre "nivel" ({ "tipo": "stat_min", "quien": "aria", "stat": "nivel", "valor": 2 }).
   Debe declararse DESPUÉS de "grupo" en "modulos". Depende de: estado, registro, grupo, validador */
import { juego } from './estado.js';
import { registrar } from './registro.js';
import { enGrupo, destinatarios } from './grupo.js';
import { reglasDe } from './validador.js';

const def = () => juego.aventura.experiencia;

// Quién recibe la experiencia: con grupo, quien indique "quien" o, por defecto, los que siguen en pie;
// con un solo protagonista, él mismo. Cada receptor es { nombre, stats }.
function receptores(quien) {
  if (!juego.estado.grupo) return [{ nombre: juego.aventura.meta.protagonista ?? 'Protagonista', stats: juego.estado.stats }];
  if (quien === undefined) return enGrupo().filter(m => (m.stats.vida ?? 1) > 0);
  return destinatarios({ quien }) ?? [];
}

// Da XP a un receptor y sube de nivel todas las veces que corresponda
function darXp(r, cantidad) {
  const s = r.stats, niveles = def().niveles;
  s.xp = (s.xp ?? 0) + cantidad;
  juego.registro.push(`${r.nombre} gana ${cantidad} XP.`);
  // niveles[0] es el nivel 2: para pasar del nivel L al L+1 hace falta la xp de niveles[L - 1]
  while ((s.nivel ?? 1) - 1 < niveles.length && s.xp >= niveles[(s.nivel ?? 1) - 1].xp) {
    const n = niveles[(s.nivel ?? 1) - 1];
    s.nivel = (s.nivel ?? 1) + 1;
    for (const [k, v] of Object.entries(n.mejoras || {})) s[k] = (s[k] ?? 0) + v;
    juego.registro.push(`¡${r.nombre} sube al nivel ${s.nivel}!` + (n.mensaje ? ' ' + n.mensaje : ''));
  }
}
const repartir = (cantidad, lista) => lista.forEach(r => darXp(r, cantidad));

const efectos = { dar_xp: e => repartir(e.cantidad, receptores(e.quien)) };

// Los combates llaman a este gancho al ganar, con la XP total de los enemigos vencidos
juego.ganchos.alVencer = xp => { if (def() && xp > 0) repartir(xp, receptores()); };

// Al empezar la partida, todos parten del nivel 1 con 0 de xp
function alNueva() {
  if (!def()) return;
  const g = juego.estado.grupo;
  (g ? Object.values(g.miembros).map(m => m.stats) : [juego.estado.stats]).forEach(s => { s.xp ??= 0; s.nivel ??= 1; });
}

function validarAventura(a) {
  const x = a.experiencia, err = [];
  const usa = reglasDe(a).some(({ r }) => r.tipo === 'dar_xp') || Object.values(a.enemigos || {}).some(e => e.xp);
  if (!x) return (usa || a.modulos?.includes('experiencia')) ? ['falta la sección "experiencia" (la necesitan dar_xp y el campo xp de los enemigos)'] : [];
  const m = a.modulos;
  if (m && !m.includes('experiencia')) err.push('hay sección "experiencia" pero no declaras el módulo "experiencia"');
  if (m?.includes('grupo') && m.includes('experiencia') && m.indexOf('grupo') > m.indexOf('experiencia')) err.push('declara el módulo "grupo" antes que "experiencia"');
  const niveles = x.niveles;
  if (!Array.isArray(niveles) || !niveles.length) return [...err, 'experiencia.niveles: debe ser una lista con al menos un nivel'];
  let previo = 0;
  niveles.forEach((n, i) => {
    const d = `experiencia.niveles[${i}] (nivel ${i + 2})`;
    if (!(n.xp > previo)) err.push(`${d}: "xp" debe ser mayor que la del nivel anterior (${previo})`);
    previo = n.xp;
    Object.entries(n.mejoras || {}).forEach(([k, v]) => typeof v === 'number' || err.push(`${d}: la mejora "${k}" debe ser un número`));
  });
  reglasDe(a).forEach(({ r }) => { if (r.tipo === 'dar_xp' && !(r.cantidad > 0)) err.push('dar_xp: "cantidad" debe ser mayor que 0'); });
  Object.entries(a.enemigos || {}).forEach(([id, e]) => { if (e.xp !== undefined && !(e.xp >= 0)) err.push(`enemigo "${id}": "xp" no es válido`); });
  return err;
}

registrar({ nombre: 'experiencia', efectos, alNueva, validarAventura });
