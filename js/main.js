/* =====================================================================
   MOTOR DE AVENTURAS DE TEXTO · Versión 2.0-alfa (módulos registrables: combate y grupo)
   Punto de entrada: conecta los botones y arranca. Mapa de archivos:
     dom.js       utilidades de página          estado.js    estado compartido y azar
     reglas.js    condiciones y efectos         nucleo.js    moverse por las escenas
     combate.js   combate 1 contra 1            guardado.js  guardar, cargar, exportar
     validador.js revisión de la aventura       carga.js     abrir aventuras
     interfaz.js  dibujar la pantalla           registro.js  módulos enchufables
     grupo.js     módulo: varios personajes   combate_grupo.js  módulo: combate múltiple
     puestos.js   módulo: puestos de la tripulación   tiempo.js  módulo: reloj, recursos, viajes
     experiencia.js  módulo: experiencia y niveles
     habilidades.js  módulo: habilidades   mercado.js  módulo: mercados de precios variables
     main.js      este archivo
   Para probar en local: `python -m http.server` en esta carpeta y abrir
   http://localhost:8000 (fetch y los módulos no funcionan con file://).
   ===================================================================== */
import { $, el, aviso } from './dom.js';
import { juego } from './estado.js';
import { ls, clave, guardar, restaurar, exportar } from './guardado.js';
import { nueva, deshacer } from './nucleo.js';
import { cargarDatos, cargarURL, leerArchivo } from './carga.js';
import { pintarRanuras } from './interfaz.js';   // además registra pintar() en los ganchos
import './grupo.js';      // módulo "grupo": varios personajes, cada uno con sus estadísticas y objetos
import './puestos.js';       // módulo "puestos": quién ocupa cada puesto (timón, remo, médico...)
import './habilidades.js';   // módulo "habilidades": habilidades de cada personaje (después de grupo)
import './mercado.js';       // módulo "mercado": comprar y vender mercancías con precios variables
import './experiencia.js';   // módulo "experiencia": xp y niveles (debe ir después de grupo)
import './tiempo.js';        // módulo "tiempo": días, consumo de recursos y viajes
import './combate_grupo.js';   // módulo "combate_grupo": combate por turnos con varios enemigos
import './combate.js';    // módulo "combate": se registra al importarse (módulo nuevo = archivo nuevo + una línea import aquí)

const cerrarMenu = () => { const m = $('menu'); if (m) m.open = false; };   // el menú (☰) es un <details>

// El menú ☰ se cierra al tocar fuera de él o al pulsar Escape, como los menús de las barras de navegación
document.addEventListener('pointerdown', e => { const m = $('menu'); if (m?.open && !m.contains(e.target)) m.open = false; });
document.addEventListener('keydown', e => { if (e.key === 'Escape') cerrarMenu(); });

$('btn-nueva').onclick = () => { if (juego.aventura && confirm('¿Empezar de nuevo?')) nueva(); cerrarMenu(); };
$('btn-guardar').onclick = () => { if (juego.estado) { guardar($('ranura').value); pintarRanuras(); aviso('Partida guardada.'); cerrarMenu(); } };
$('btn-deshacer').onclick = deshacer;
$('btn-cargar').onclick = () => {
  const t = juego.aventura && ls.get(clave($('ranura').value));
  try { t ? (restaurar(t), aviso('')) : aviso('Esa ranura está vacía.'); } catch (e) { aviso(e.message); }
  cerrarMenu();
};
$('btn-exportar').onclick = () => { if (juego.estado) exportar(); cerrarMenu(); };
$('archivo-aventura').onchange = ev => { cerrarMenu(); leerArchivo(ev, t => cargarDatos(JSON.parse(t))); };
$('archivo-partida').onchange = ev => { cerrarMenu(); leerArchivo(ev, t => { if (!juego.aventura) throw new Error('Carga primero una aventura.'); restaurar(t); }); };

(async function arrancar() {
  try {
    const r = await fetch('aventuras/index.json');
    if (!r.ok) throw new Error(`no se encontró el archivo (error ${r.status})`);
    const lista = await r.json();
    if (!lista.length) throw new Error('la lista está vacía');
    lista.forEach(a => $('selector').append(new Option(a.titulo, a.archivo)));
    $('selector').onchange = () => { cargarURL($('selector').value); cerrarMenu(); };
    cargarURL(lista[0].archivo);
  } catch (e) {
    // Sin lista de aventuras no es un fallo grave: mensaje neutro en pantalla
    // y el detalle técnico en la consola (F12).
    $('selector').hidden = true;
    $('texto').append(el('p', 'Pulsa «Abrir aventura (.json)» para elegir una aventura y empezar.'));
    console.warn('No se pudo cargar aventuras/index.json:', e.message);
  }
})();
