/* MÓDULO "combate": combate uno contra uno. Se registra como tipo de escena 'combate'.
   Fórmula en el motor (aquí); los números (vida, ataque...) en el JSON.
   Daño = dado + ataque - defensa del rival, mínimo 0.
   Un combate ganado no se repite: si se vuelve a entrar en la escena se va a "vencido" (si la escena lo
   define) o a "victoria" sin repetir sus efectos de entrada; con "repetible": true se vuelve a pelear.
   Depende de: estado, reglas, nucleo, guardado, registro, dom */
import { juego, dado } from './estado.js';
import { aplicar } from './reglas.js';
import { ir, nodoActual, recordar } from './nucleo.js';
import { autoguardar } from './guardado.js';
import { registrar } from './registro.js';
import { el } from './dom.js';

registrar({
  nombre: 'combate',
  escenas: {
    combate: {
      // Al entrar en la escena se prepara el enemigo
      alEntrar: n => {
        if (juego.estado.vencidos?.[juego.estado.nodo] && !n.repetible) {   // ya lo venciste: no reaparece
          juego.registro.push(`Ya habías derrotado a ${juego.aventura.enemigos[n.enemigo].nombre}.`);
          juego.desvio = n.vencido ?? n.victoria;   // el núcleo atiende el desvío tras la entrada
          juego.sinEntrada = n.vencido === undefined;   // la victoria por defecto no repite sus premios de entrada
          return;
        }
        juego.estado.combate = { id: n.enemigo, vida: juego.aventura.enemigos[n.enemigo].vida };
      },
      barra: () => {
        const c = juego.estado.combate;
        return c ? ` | ${juego.aventura.enemigos[c.id].nombre}: vida ${c.vida}` : '';
      },
      pintar: (caja, n) => {
        if (!juego.estado.combate) return false;
        caja.append(el('button', 'Atacar', '', atacar));
        if (n.huida) caja.append(el('button', 'Huir', '', huir));
        return true;
      },
      destinos: n => [n.victoria, n.derrota, n.huida, n.vencido].filter(Boolean),
      validar: (id, n, a) => [
        ...(a.enemigos?.[n.enemigo] ? [] : [`${id}: el enemigo "${n.enemigo}" no existe`]),
        ...(n.victoria ? [] : [`${id}: falta "victoria"`]),
        ...(n.derrota ? [] : [`${id}: falta "derrota"`]),
      ],
    },
  },
});

export function atacar() {
  recordar();
  juego.registro = [];
  const { estado, aventura, registro } = juego;   // registro es la lista nueva de arriba
  const n = nodoActual(), e = aventura.enemigos[estado.combate.id];
  const mio = Math.max(0, dado() + (estado.stats.fuerza ?? 0) - e.defensa);
  estado.combate.vida -= mio;
  registro.push(`Golpeas a ${e.nombre}: -${mio}`);
  if (estado.combate.vida <= 0) {
    registro.push(`${e.nombre} cae derrotado.`);
    (e.recompensa || []).forEach(aplicar);
    if (e.xp) juego.ganchos.alVencer(e.xp);   // experiencia (módulo opcional)
    estado.combate = null;
    (estado.vencidos ??= {})[estado.nodo] = true;   // se recuerda que esta escena ya está superada
    return ir(n.victoria);
  }
  const suyo = Math.max(0, dado() + e.ataque - (estado.stats.defensa ?? 0));
  estado.stats.vida -= suyo;
  registro.push(`${e.nombre} te golpea: -${suyo}`);
  if (estado.stats.vida <= 0) { estado.combate = null; return ir(n.derrota); }
  autoguardar();
  juego.ganchos.pintar();
}
export function huir() {
  recordar();
  juego.registro = ['Huyes del combate.'];
  juego.estado.combate = null;
  ir(nodoActual().huida);
}
