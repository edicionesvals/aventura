/* REGISTRO DE MÓDULOS. Un módulo es un objeto con esta forma (todo opcional salvo el nombre):
     { nombre: 'combate',
       condiciones: { tipo: función },   // nuevos tipos de condición (o versiones que sustituyen a las del núcleo)
       efectos:     { tipo: función },   // nuevos tipos de efecto
       escenas: { tipo: {                // nuevos tipos de escena
         alEntrar(n),                    // preparar la escena al llegar
         barra(n),                       // texto extra para la barra de estado
         pintar(caja, n),                // dibuja sus botones; devuelve true si lo hizo
         destinos(n),                    // ids de escena a los que puede llevar
         validar(id, n, a)               // lista de errores propios
       } },
       alNueva(),                        // prepara su parte del estado al empezar una partida
       panel(contenedor),                // dibuja un panel propio en pantalla (p. ej. el grupo)
       validarAventura(a) }              // errores propios de la aventura completa
   Cada archivo de módulo se registra al importarse. La aventura elige cuáles usa con
   "modulos": [...] en su JSON. No depende de ningún otro archivo. */
const MODULOS = {};                                   // todos los módulos conocidos
export const registrar = m => { MODULOS[m.nombre] = m; };

// Lo que está activo AHORA (lo consulta el motor mientras se juega)
export const activas = { condiciones: {}, efectos: {}, escenas: {}, inicios: [], paneles: [] };

// ¿Qué módulos usa una aventura?
//  · sin "modulos": modo compatible, se activan todos (así las aventuras antiguas siguen valiendo)
//  · con "modulos" (aunque sea []): solo esos, más el núcleo, que siempre está
// Si dos módulos definen el mismo tipo, gana el último: así "grupo" puede sustituir efectos del núcleo.
export function resolver(a) {
  const errores = [], todos = Object.keys(MODULOS);
  let nombres = a.modulos ?? todos;
  if (!Array.isArray(nombres)) { errores.push('"modulos" debe ser una lista'); nombres = []; }
  nombres = nombres.filter(n => {
    if (MODULOS[n]) return true;
    errores.push(`módulo desconocido "${n}" (disponibles: ${todos.filter(k => k !== 'nucleo').join(', ')})`);
    return false;   // se descarta: no existe
  });
  const modulos = ['nucleo', ...nombres].map(n => MODULOS[n]);
  const tablas = { condiciones: {}, efectos: {}, escenas: {} };
  for (const m of modulos) for (const k in tablas) Object.assign(tablas[k], m[k]);
  tablas.inicios = modulos.filter(m => m.alNueva).map(m => m.alNueva);
  tablas.paneles = modulos.filter(m => m.panel).map(m => m.panel);
  return { tablas, errores, modulos };
}
export const activar = a => Object.assign(activas, resolver(a).tablas);
// Qué módulo aporta un tipo (para dar pistas en los mensajes de error)
export const proveedor = (tabla, tipo) => Object.values(MODULOS).find(m => m[tabla]?.[tipo])?.nombre;
