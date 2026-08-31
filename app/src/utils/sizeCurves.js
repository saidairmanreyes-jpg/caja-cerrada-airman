/**
 * sizeCurves.js — FUENTE DE VERDAD ÚNICA DE CURVAS DE TALLAS — ANTIGRAVITI
 *
 * REGLA DE NEGOCIO GLOBAL:
 *   Ningún componente debe definir su propio array de tallas.
 *   Todos los módulos (Estándares, Maquila, Kanban, Recepciones, PDF, etc.)
 *   deben importar desde este archivo.
 *
 * Curvas oficiales aprobadas por operaciones:
 *   SUPERIORES (Dama & Caballero): XC, CH, MD, GD, XG, XX, 3X, 4X, 5X
 *   PANTALÓN CABALLERO:            28, 29, 30, 31, 32, 33, 34, 36, 38, 40, 42, 44, 46, 48, 50
 *   PANTALÓN DAMA:                 00, T0, T1, T3, T5, T7, T9, 11, 13, 15, 17, 19, 21, 23
 */

// ─────────────────────────────────────────────────────────────────────────────
// CURVAS ESTANDARIZADAS
// ─────────────────────────────────────────────────────────────────────────────

/** Prendas superiores: camisas, blusas, polo, playeras, cuellos redondos (Dama & Caballero) */
export const CURVA_SUPERIORES = [
  'XC', 'CH', 'MD', 'GD', 'XG', 'XX', '3X', '4X', '5X'
]

/** Pantalones de Caballero */
export const CURVA_PANTALON_CABALLERO = [
  '28', '29', '30', '31', '32', '33', '34',
  '36', '38', '40', '42', '44', '46', '48', '50'
]

/** Pantalones de Dama */
export const CURVA_PANTALON_DAMA = [
  '00', 'T0', 'T1', 'T3', 'T5', 'T7', 'T9',
  '11', '13', '15', '17', '19', '21', '23'
]

/** Unión de todas las tallas (para validaciones y búsquedas) */
export const TODAS_LAS_TALLAS = [
  ...CURVA_SUPERIORES,
  ...CURVA_PANTALON_CABALLERO,
  ...CURVA_PANTALON_DAMA
]

// ─────────────────────────────────────────────────────────────────────────────
// PRESETS PARA KANBAN / BOM CONFIG
// ─────────────────────────────────────────────────────────────────────────────

export const SIZE_PRESETS = {
  PANTALON_CABALLERO: {
    label: 'Pantalón Caballero (28 al 50)',
    gender: 'CABALLERO',
    sizes: [...CURVA_PANTALON_CABALLERO]
  },
  PANTALON_DAMA: {
    label: 'Pantalón Dama (00 al 23)',
    gender: 'DAMA',
    sizes: [...CURVA_PANTALON_DAMA]
  },
  SUPERIORES: {
    label: 'Superiores (XC a 5X)',
    gender: 'UNISEX',
    sizes: [...CURVA_SUPERIORES]
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// HELPER: detecta automáticamente la curva correcta según descripción/categoría
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Retorna la curva de tallas correcta para un producto.
 * @param {string} description - Descripción del producto (ej. "PANTALÓN GABARDINA CABALLERO")
 * @param {string} category    - Categoría (ej. "PANTALONES", "CAMISAS")
 * @param {string} gender      - Género (ej. "CABALLERO", "DAMA")
 * @returns {string[]} Array de tallas estandarizadas
 */
export function getTallasForProduct(description = '', category = '', gender = '') {
  const desc = description.toUpperCase()
  const cat  = category.toUpperCase()
  const gen  = gender.toUpperCase()

  const isPantalon = cat.includes('PANTALON') || cat.includes('PANTALÓN') ||
                     desc.includes('PANTALON') || desc.includes('PANTALÓN') ||
                     desc.includes('GABARDINA') || desc.includes('BERMUDA')

  if (isPantalon) {
    if (gen.includes('DAMA') || gen.includes('MUJER') || desc.includes('DAMA') || desc.includes('MUJER')) {
      return [...CURVA_PANTALON_DAMA]
    }
    return [...CURVA_PANTALON_CABALLERO]
  }

  // Default: prendas superiores
  return [...CURVA_SUPERIORES]
}

/**
 * Retorna la curva correcta directamente desde un talla conocida
 * (útil para PDF generator que sólo tiene la talla del pedido).
 * @param {string} talla   - Talla actual del pedido
 * @param {string} gender  - Género (opcional)
 * @returns {string[]}
 */
export function getSizeRunFromTalla(talla = '', gender = '') {
  const t = talla.toUpperCase().trim()
  const g = gender.toUpperCase()

  if (CURVA_PANTALON_DAMA.includes(t) || g.includes('DAMA') || g.includes('MUJER')) {
    return [...CURVA_PANTALON_DAMA]
  }
  if (CURVA_PANTALON_CABALLERO.includes(t)) {
    return [...CURVA_PANTALON_CABALLERO]
  }
  if (CURVA_SUPERIORES.includes(t)) {
    return [...CURVA_SUPERIORES]
  }
  // Fallback: retorna la talla sola para no romper flujos existentes
  return t ? [t] : [...CURVA_SUPERIORES]
}
