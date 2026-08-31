import React, { useState, useEffect } from 'react'
import { db } from '../../firebase'
import { collection, doc, setDoc, getDocs, deleteDoc, onSnapshot } from 'firebase/firestore'
import * as XLSX from 'xlsx'
import KanbanLeadTimeSimulatorModal from './KanbanLeadTimeSimulatorModal'
import {
  Layers, Settings, Truck, Users, RefreshCw, Upload, Download, Plus,
  Trash2, Edit3, Check, X, Search, AlertCircle, FileSpreadsheet, ArrowRight,
  ShieldAlert, Sparkles, Sliders, Grid, Copy, HelpCircle, Tag, CheckCircle2,
  Clock, Database, Warehouse, DollarSign, Filter, CheckCircle, BarChart3
} from 'lucide-react'
import {
  CURVA_SUPERIORES,
  CURVA_PANTALON_CABALLERO,
  CURVA_PANTALON_DAMA
} from '../../utils/sizeCurves'

const WAREHOUSES = ['MATRIZ', 'PLANTA', 'MEXICO', 'MONTERREY']

// Helper para normalizar nombres de almacenes y sus alias comunes
export const normalizeWarehouse = (wh) => {
  if (!wh) return 'MEXICO'
  const u = String(wh).toUpperCase().trim()
  if (u.includes('CDMX') || u.includes('MEXICO') || u.includes('MÉXICO') || u === 'DF') return 'MEXICO'
  if (u.includes('MTY') || u.includes('MONTERREY')) return 'MONTERREY'
  if (u.includes('PLANTA') || u.includes('FABRICA')) return 'PLANTA'
  if (u.includes('MATRIZ') || u.includes('CENTRAL')) return 'MATRIZ'
  return u
}

// ═════════════════════════════════════════════════════════════════════════════
// ── CATÁLOGO MAESTRO DE MATERIAS PRIMAS (GENEALOGÍA DE SKU & MAPEO DE ORIGEN) ──
// ═════════════════════════════════════════════════════════════════════════════
export const RAW_MATERIALS_CATALOG = [
  // ── TELAS TIPO A: LISOS (Base Cruda Teñible / Greige en Molino Guatemala) ──
  { code: 'TEL-GAB-ISA', name: 'GABARDINA ISABEL', type: 'TELA', comportamiento_tela: 'LISO', origen_fabricacion: 'BASE_CRUDA_TEÑIBLE', almacen_recepcion: 'PLANTA (TEH)', lead_time_teñido_dias: 15, lead_time_transito_teh_dias: 4, unit: 'MTS', notes: 'Tipo A: Liso - Permite stock en crudo/greige en molino Guatemala' },
  { code: 'TEL-HAW-ELA', name: 'HAWA ELASTANO', type: 'TELA', comportamiento_tela: 'LISO', origen_fabricacion: 'BASE_CRUDA_TEÑIBLE', almacen_recepcion: 'PLANTA (TEH)', lead_time_teñido_dias: 15, lead_time_transito_teh_dias: 4, unit: 'MTS', notes: 'Tipo A: Liso - Permite stock en crudo/greige en molino Guatemala' },
  { code: 'TEL-GAB-AMI', name: 'GABARDINA AMIN ELASTANO', type: 'TELA', comportamiento_tela: 'LISO', origen_fabricacion: 'BASE_CRUDA_TEÑIBLE', almacen_recepcion: 'PLANTA (TEH)', lead_time_teñido_dias: 15, lead_time_transito_teh_dias: 4, unit: 'MTS', notes: 'Tipo A: Liso - Permite stock en crudo/greige en molino Guatemala' },
  { code: 'TEL-TWI-MEC', name: 'TWILL MECHANICAL', type: 'TELA', comportamiento_tela: 'LISO', origen_fabricacion: 'BASE_CRUDA_TEÑIBLE', almacen_recepcion: 'PLANTA (TEH)', lead_time_teñido_dias: 15, lead_time_transito_teh_dias: 4, unit: 'MTS', notes: 'Tipo A: Liso - Permite stock en crudo/greige en molino Guatemala' },
  { code: 'TEL-WAR-PIQ', name: 'WARP PIQUE', type: 'TELA', comportamiento_tela: 'LISO', origen_fabricacion: 'BASE_CRUDA_TEÑIBLE', almacen_recepcion: 'HACIENDA (AGS)', lead_time_teñido_dias: 15, lead_time_transito_teh_dias: 5, unit: 'MTS', notes: 'Tipo A: Liso - Permite stock en crudo/greige en molino Guatemala' },
  { code: 'TEL-CLE-01',  name: 'CLEVELAND', type: 'TELA', comportamiento_tela: 'LISO', origen_fabricacion: 'BASE_CRUDA_TEÑIBLE', almacen_recepcion: 'PLANTA (TEH)', lead_time_teñido_dias: 15, lead_time_transito_teh_dias: 4, unit: 'MTS', notes: 'Tipo A: Liso - Permite stock en crudo/greige en molino Guatemala' },
  { code: 'TEL-GAB-01',  name: 'GABARDINA 8.5 OZ ALGODÓN 100%', type: 'TELA', comportamiento_tela: 'LISO', origen_fabricacion: 'BASE_CRUDA_TEÑIBLE', almacen_recepcion: 'PLANTA (TEH)', lead_time_teñido_dias: 15, lead_time_transito_teh_dias: 4, unit: 'MTS', notes: 'Tipo A: Liso - Pantalón trabajo' },
  { code: 'TEL-GAB-02',  name: 'GABARDINA 7.5 OZ ALGODÓN/POLIÉSTER', type: 'TELA', comportamiento_tela: 'LISO', origen_fabricacion: 'BASE_CRUDA_TEÑIBLE', almacen_recepcion: 'PLANTA (TEH)', lead_time_teñido_dias: 15, lead_time_transito_teh_dias: 4, unit: 'MTS', notes: 'Tipo A: Liso - Pantalón ligero' },
  { code: 'TEL-POP-01',  name: 'POPELINA 100% ALGODÓN PEINADO', type: 'TELA', comportamiento_tela: 'LISO', origen_fabricacion: 'BASE_CRUDA_TEÑIBLE', almacen_recepcion: 'PLANTA (TEH)', lead_time_teñido_dias: 15, lead_time_transito_teh_dias: 4, unit: 'MTS', notes: 'Tipo A: Liso - Camisa vestir clásica' },
  { code: 'TEL-PIQ-01',  name: 'PIQUÉ ALGODÓN 100% 220G PEINADO', type: 'TELA', comportamiento_tela: 'LISO', origen_fabricacion: 'BASE_CRUDA_TEÑIBLE', almacen_recepcion: 'HACIENDA (AGS)', lead_time_teñido_dias: 15, lead_time_transito_teh_dias: 5, unit: 'MTS', notes: 'Tipo A: Liso - Polo premium' },
  { code: 'TEL-JER-01',  name: 'JERSEY 100% ALGODÓN PEINADO 180G', type: 'TELA', comportamiento_tela: 'LISO', origen_fabricacion: 'BASE_CRUDA_TEÑIBLE', almacen_recepcion: 'HACIENDA (AGS)', lead_time_teñido_dias: 15, lead_time_transito_teh_dias: 5, unit: 'MTS', notes: 'Tipo A: Liso - Playera cuello redondo' },
  { code: 'TEL-OXF-01',  name: 'OXFORD PINPOINT ALGODÓN 100%', type: 'TELA', comportamiento_tela: 'LISO', origen_fabricacion: 'BASE_CRUDA_TEÑIBLE', almacen_recepcion: 'PLANTA (TEH)', lead_time_teñido_dias: 15, lead_time_transito_teh_dias: 4, unit: 'MTS', notes: 'Tipo A: Liso - Camisa ejecutiva oxford' },

  // ── TELAS TIPO B: FANTASÍA (Producción Cero / Make-to-Order - Hilo Pre-teñido) ──
  { code: 'TEL-FAN-CUA', name: 'CUADRO', type: 'TELA', comportamiento_tela: 'FANTASIA', origen_fabricacion: 'BASE_FANTASIA_MTO', almacen_recepcion: 'PLANTA (TEH)', lead_time_produccion_dias: 50, lead_time_transito_teh_dias: 4, unit: 'MTS', notes: 'Tipo B: Fantasía - Hilos teñidos previo / Producción cero MTO en Guatemala' },
  { code: 'TEL-FAN-MIC', name: 'MICRO CUADRO', type: 'TELA', comportamiento_tela: 'FANTASIA', origen_fabricacion: 'BASE_FANTASIA_MTO', almacen_recepcion: 'PLANTA (TEH)', lead_time_produccion_dias: 50, lead_time_transito_teh_dias: 4, unit: 'MTS', notes: 'Tipo B: Fantasía - Hilos teñidos previo / Producción cero MTO en Guatemala' },
  { code: 'TEL-FAN-RAY', name: 'RAYA', type: 'TELA', comportamiento_tela: 'FANTASIA', origen_fabricacion: 'BASE_FANTASIA_MTO', almacen_recepcion: 'PLANTA (TEH)', lead_time_produccion_dias: 50, lead_time_transito_teh_dias: 4, unit: 'MTS', notes: 'Tipo B: Fantasía - Hilos teñidos previo / Producción cero MTO en Guatemala' },
  { code: 'TEL-FAN-MRA', name: 'MICRO RAYA', type: 'TELA', comportamiento_tela: 'FANTASIA', origen_fabricacion: 'BASE_FANTASIA_MTO', almacen_recepcion: 'PLANTA (TEH)', lead_time_produccion_dias: 50, lead_time_transito_teh_dias: 4, unit: 'MTS', notes: 'Tipo B: Fantasía - Hilos teñidos previo / Producción cero MTO en Guatemala' },
  { code: 'TEL-MEZ-DEN', name: 'MEZCLILLA', type: 'TELA', comportamiento_tela: 'FANTASIA', origen_fabricacion: 'BASE_FANTASIA_MTO', almacen_recepcion: 'PLANTA (TEH)', lead_time_produccion_dias: 50, lead_time_transito_teh_dias: 4, unit: 'MTS', notes: 'Tipo B: Fantasía - Denim teñido índigo en urdido / Producción cero MTO en Guatemala' },
  { code: 'TEL-MEZ-14',  name: 'MEZCLILLA DENIM 14 OZ TRABAJO RUDO', type: 'TELA', comportamiento_tela: 'FANTASIA', origen_fabricacion: 'BASE_FANTASIA_MTO', almacen_recepcion: 'PLANTA (TEH)', lead_time_produccion_dias: 50, lead_time_transito_teh_dias: 4, unit: 'MTS', notes: 'Tipo B: Fantasía - Denim industrial' },

  // ── OTRAS TELAS Y FORROS ──
  { code: 'TEL-FOR-01', name: 'FORRO DE BOLSILLOS POPELINA ALGODÓN', type: 'TELA', comportamiento_tela: 'LISO', origen_fabricacion: 'BASE_CRUDA_TEÑIBLE', almacen_recepcion: 'PLANTA (TEH)', unit: 'MTS', notes: 'Fondos de bolsa pantalón' },
  { code: 'TEL-FOR-02', name: 'FORRO TAFETA POLIÉSTER 100%', type: 'TELA', comportamiento_tela: 'LISO', origen_fabricacion: 'BASE_CRUDA_TEÑIBLE', almacen_recepcion: 'PLANTA (TEH)', unit: 'MTS', notes: 'Forro interior saco/chaleco' },
  { code: 'TEL-RIB-01', name: 'RIB 1X1 ALGODÓN ELASTANO CUELLOS', type: 'TELA', comportamiento_tela: 'LISO', origen_fabricacion: 'BASE_CRUDA_TEÑIBLE', almacen_recepcion: 'HACIENDA (AGS)', unit: 'MTS', notes: 'Rib puños y pretinas' },

  // ── AVÍOS (PZAS / CONOS / JUEGOS) ──
  { code: 'AVI-BOT-14', name: 'BOTÓN PASTA 14L CAMISERO 4 ORIFICIOS', type: 'AVÍO', unit: 'PZAS', notes: 'Puño y cuello camisa' },
  { code: 'AVI-BOT-16', name: 'BOTÓN NACARADO 16L FRENTE CAMISA', type: 'AVÍO', unit: 'PZAS', notes: 'Frente camisería fina' },
  { code: 'AVI-BOT-18', name: 'BOTÓN PASTA 18L PECHERA POLO', type: 'AVÍO', unit: 'PZAS', notes: 'Pechera polo estándar' },
  { code: 'AVI-BOT-24', name: 'BOTÓN PASTA 24L SACO / CHAQUETA', type: 'AVÍO', unit: 'PZAS', notes: 'Frente chaleco/saco' },
  { code: 'AVI-BOT-MET', name: 'BOTÓN METAL TROQUELADO PANTALÓN', type: 'AVÍO', unit: 'PZA', notes: 'Cintura pantalón caballero' },
  { code: 'AVI-BOT-DAM', name: 'BOTÓN METÁLICO DAMA 20L', type: 'AVÍO', unit: 'PZA', notes: 'Cintura pantalón dama' },
  { code: 'AVI-BOT-PRE', name: 'BOTÓN DE PRESIÓN METÁLICO 15MM', type: 'AVÍO', unit: 'JUEGO', notes: 'Chamarra / Overol' },
  { code: 'AVI-CIE-03', name: 'CIERRE NYLON ESPIRAL #3 BOLSILLO', type: 'AVÍO', unit: 'PZA', notes: 'Bolsillo secreto/trasero' },
  { code: 'AVI-CIE-04', name: 'CIERRE LATÓN DAMA #4 PANTALÓN', type: 'AVÍO', unit: 'PZA', notes: 'Bragueta pantalón dama' },
  { code: 'AVI-CIE-05', name: 'CIERRE METÁLICO LATÓN #5 BRAGUETA', type: 'AVÍO', unit: 'PZA', notes: 'Bragueta pantalón caballero' },
  { code: 'AVI-CIE-INV', name: 'CIERRE INVISIBLE 20CM DAMA', type: 'AVÍO', unit: 'PZA', notes: 'Costado blusa/falda' },
  { code: 'AVI-CIE-TRA', name: 'CIERRE TRACTOR PLÁSTICO #5 SUDADERA', type: 'AVÍO', unit: 'PZA', notes: 'Frente sudadera abierta' },
  { code: 'AVI-CIE-TR8', name: 'CIERRE TRACTOR PLÁSTICO #8 RUDO', type: 'AVÍO', unit: 'PZA', notes: 'Chamarra industrial' },
  { code: 'AVI-CP-01', name: 'CUELLO Y PUÑOS TEJIDOS RIB 1X1', type: 'AVÍO', unit: 'JUEGO', notes: 'Polo juego completo' },
  { code: 'AVI-CUE-01', name: 'CUELLO TEJIDO POLO INDIVIDUAL', type: 'AVÍO', unit: 'PZA', notes: 'Cuello tejido' },
  { code: 'AVI-PUN-01', name: 'PUÑOS TEJIDOS POLO (PAR)', type: 'AVÍO', unit: 'PAR', notes: 'Puños polo' },
  { code: 'AVI-ENT-01', name: 'ENTRETELA FUSIONABLE CUELLO/PUÑO PESADA', type: 'AVÍO', unit: 'MTS', notes: 'Refuerzo camisería' },
  { code: 'AVI-ENT-02', name: 'ENTRETELA FUSIONABLE LIVIANA PECHERA', type: 'AVÍO', unit: 'MTS', notes: 'Refuerzo ligero' },
  { code: 'AVI-ENT-PRE', name: 'ENTRETELA DE PRETINA PREFORMADA', type: 'AVÍO', unit: 'MTS', notes: 'Cintura pantalón' },
  { code: 'AVI-ETI-01', name: 'ETIQUETA MARCA / TALLA TEJIDA ESPALDA', type: 'AVÍO', unit: 'PZA', notes: 'Centro espalda' },
  { code: 'AVI-ETI-02', name: 'ETIQUETA SATÍN AIRMAN PECHERA INTERIOR', type: 'AVÍO', unit: 'PZA', notes: 'Pechera interior' },
  { code: 'AVI-ETI-CUI', name: 'ETIQUETA CUIDADO Y COMPOSICIÓN IMPRESA', type: 'AVÍO', unit: 'PZA', notes: 'Costado interior' },
  { code: 'AVI-ETI-COL', name: 'ETIQUETA COLGANTE CARTÓN HANGTAG AIRMAN', type: 'AVÍO', unit: 'PZA', notes: 'Empaque final' },
  { code: 'AVI-HIL-40', name: 'HILO 40/2 POLIÉSTER ALTA TENACIDAD', type: 'AVÍO', unit: 'CONO', notes: 'Armado general confección' },
  { code: 'AVI-HIL-20', name: 'HILO 20/3 PESPUNTE GRUESO MEZCLILLA', type: 'AVÍO', unit: 'CONO', notes: 'Pespuntes decorativos' },
  { code: 'AVI-HIL-70', name: 'HILO 70/2 HILVÁN / OJAL FINO', type: 'AVÍO', unit: 'CONO', notes: 'Ojales y detalles' },
  { code: 'AVI-ELA-25', name: 'ELÁSTICO PLANO 25MM CINTURA', type: 'AVÍO', unit: 'MTS', notes: 'Bermuda / Pants' },
  { code: 'AVI-ELA-40', name: 'ELÁSTICO PLANO REFORZADO 40MM', type: 'AVÍO', unit: 'MTS', notes: 'Cintura reforzada' },
  { code: 'AVI-VEL-20', name: 'VELCRO GANCHO Y FELPA 20MM', type: 'AVÍO', unit: 'MTS', notes: 'Bolsillos cargo' },
  { code: 'AVI-BRO-01', name: 'BROCHE METÁLICO GAFETE PANTALÓN', type: 'AVÍO', unit: 'JUEGO', notes: 'Pretina de vestir' },
  { code: 'AVI-COR-01', name: 'CORDÓN AJUSTADOR ALGODÓN CON PUNTERA', type: 'AVÍO', unit: 'PZA', notes: 'Capucha sudadera / pants' },
  { code: 'AVI-REJ-01', name: 'REMACHES METÁLICOS ESQUINAS BOLSAS', type: 'AVÍO', unit: 'PZAS', notes: 'Refuerzo mezclilla' }
]

// Presets de curvas de tallas según género y categoría
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
  ALFANUMERICA_COMPLETA: {
    label: 'Alfanumérica Completa (XC a 5X)',
    gender: 'UNISEX',
    sizes: [...CURVA_SUPERIORES]
  }
}

// Función para calcular consumos promedio y rangos de una corrida completa
export const calculateMaterialAverages = (bom) => {
  if (!bom || !bom.materials) return []
  const sizes = bom.sizes && bom.sizes.length > 0 ? bom.sizes : ['UN']
  const consumptions = bom.size_consumptions || {}

  return bom.materials.map(m => {
    const matKey = m.code || m.id || m.name
    let sum = 0
    let count = 0
    let min = Infinity
    let max = -Infinity

    sizes.forEach(sz => {
      const val = consumptions[sz]?.[matKey] !== undefined
        ? Number(consumptions[sz][matKey])
        : Number(m.consumption || 1)
      if (!isNaN(val) && val !== null) {
        sum += val
        count++
        if (val < min) min = val
        if (val > max) max = val
      }
    })

    const avg = count > 0 ? (sum / count) : Number(m.consumption || 1)
    return {
      ...m,
      avg_consumption: Number(avg.toFixed(3)),
      min_consumption: min !== Infinity ? Number(min.toFixed(3)) : avg,
      max_consumption: max !== -Infinity ? Number(max.toFixed(3)) : avg,
      total_curve_consumption: Number(sum.toFixed(3)),
      size_count: sizes.length
    }
  })
}

export default function KanbanMasterConfig({ canEdit = true, showMessage }) {
  const [subTab, setSubTab] = useState('boms') // 'boms' | 'thresholds' | 'suppliers' | 'routing' | 'erp_sync'
  const [loading, setLoading] = useState(false)

  // ── State for BOMs ──
  const [boms, setBoms] = useState([])
  const [bomSearch, setBomSearch] = useState('')
  const [bomFilterGender, setBomFilterGender] = useState('ALL')
  const [selectedBomModal, setSelectedBomModal] = useState(null) // null or { isNew: bool, data: {...} }

  // ── State for Min/Max Thresholds ──
  const [thresholds, setThresholds] = useState([])
  const [threshSearch, setThreshSearch] = useState('')
  const [threshFilterWh, setThreshFilterWh] = useState('ALL')
  const [editingThresh, setEditingThresh] = useState(null)

  // ── State for Suppliers (Maquileros, Telas, Avíos) ──
  const [suppliers, setSuppliers] = useState([])
  const [supplierModal, setSupplierModal] = useState(null)
  const [supplierFilterType, setSupplierFilterType] = useState('ALL') // 'ALL' | 'MAQUILERO' | 'TELA' | 'AVÍO'
  const [supplierSearch, setSupplierSearch] = useState('')

  // ── State for Multidirectional Routing ──
  const [routingRules, setRoutingRules] = useState([])
  const [savingRouting, setSavingRouting] = useState(false)

  // ── State for Weekly ERP Sync ──
  const [erpStock, setErpStock] = useState([])
  const [erpSearch, setErpSearch] = useState('')
  const [erpCategoryFilter, setErpCategoryFilter] = useState('ALL')
  const [lastSyncInfo, setLastSyncInfo] = useState(null)
  const [dragActive, setDragActive] = useState(false)

  // ── State for Global Safety Stock Days & Lead Time Simulator ──
  const [globalSafetyDays, setGlobalSafetyDays] = useState(30)
  const [simulatorModalItem, setSimulatorModalItem] = useState(null)

  // Real-time Firestore Listeners
  useEffect(() => {
    // 0. Global Parameters (Safety Days)
    const unsubGlobal = onSnapshot(doc(db, 'kanban_global_config', 'parameters'), (d) => {
      if (d.exists()) {
        const data = d.data()
        if (data.safety_stock_days) setGlobalSafetyDays(Number(data.safety_stock_days))
      }
    })

    // 1. BOMs
    const unsubBoms = onSnapshot(collection(db, 'kanban_boms'), (snap) => {
      const list = []
      snap.forEach(d => list.push({ id: d.id, ...d.data() }))
      if (list.length === 0) {
        seedSampleBoms()
      } else {
        setBoms(list)
      }
    })

    // 2. Thresholds
    const unsubThresh = onSnapshot(collection(db, 'kanban_thresholds'), (snap) => {
      const list = []
      snap.forEach(d => list.push({ id: d.id, ...d.data() }))
      if (list.length === 0) {
        seedSampleThresholds()
      } else {
        setThresholds(list)
      }
    })

    // 3. Suppliers
    const unsubSuppliers = onSnapshot(collection(db, 'kanban_suppliers'), (snap) => {
      const list = []
      snap.forEach(d => list.push({ id: d.id, ...d.data() }))
      if (list.length === 0) {
        seedSampleSuppliers()
      } else {
        setSuppliers(list)
      }
    })

    // 4. Routing
    const unsubRouting = onSnapshot(collection(db, 'kanban_routing'), (snap) => {
      const list = []
      snap.forEach(d => list.push({ id: d.id, ...d.data() }))
      if (list.length === 0) {
        seedSampleRouting()
      } else {
        setRoutingRules(list)
      }
    })

    // 5. ERP Inventory
    const unsubErp = onSnapshot(collection(db, 'kanban_erp_sync'), (snap) => {
      const list = []
      snap.forEach(d => list.push({ id: d.id, ...d.data() }))
      if (list.length === 0) {
        seedSampleErpSync()
      } else {
        setErpStock(list)
      }
    })

    // 6. Last ERP Sync Metadata
    const unsubMeta = onSnapshot(doc(db, 'kanban_meta', 'last_erp_sync'), (d) => {
      if (d.exists()) {
        setLastSyncInfo(d.data())
      }
    })

    return () => {
      unsubGlobal()
      unsubBoms()
      unsubThresh()
      unsubSuppliers()
      unsubRouting()
      unsubErp()
      unsubMeta()
    }
  }, [])

  // Sample data seeding helpers for instant local testing with granular sizes and exact raw material codes
  const seedSampleBoms = async () => {
    const samples = [
      {
        code: 'PMZ001',
        description: 'PLAYERA POLO MANGA CORTA AIRMAN',
        category: 'POLO',
        gender: 'CABALLERO',
        sizes: ['XC', 'CH', 'M', 'G', 'XG', '2X', '3X', '4X', '5X'],
        materials: [
          { type: 'TELA', name: 'PIQUÉ ALGODÓN 100% 220G PEINADO', code: 'TEL-PIQ-01', unit: 'MTS', notes: 'Cuerpo y mangas' },
          { type: 'AVÍO', name: 'CUELLO Y PUÑOS TEJIDOS RIB 1X1', code: 'AVI-CP-01', unit: 'JUEGO', notes: 'Rib 1x1' },
          { type: 'AVÍO', name: 'BOTÓN PASTA 18L PECHERA POLO', code: 'AVI-BOT-18', unit: 'PZAS', notes: 'Pechera' },
          { type: 'AVÍO', name: 'ETIQUETA MARCA / TALLA TEJIDA ESPALDA', code: 'AVI-ETI-01', unit: 'PZA', notes: 'Costura centro espalda' },
          { type: 'AVÍO', name: 'HILO 40/2 POLIÉSTER ALTA TENACIDAD', code: 'AVI-HIL-40', unit: 'CONO', notes: 'Armado general' }
        ],
        size_consumptions: {
          'XC': { 'TEL-PIQ-01': 1.00, 'AVI-CP-01': 1.0, 'AVI-BOT-18': 3, 'AVI-ETI-01': 1, 'AVI-HIL-40': 0.03 },
          'CH': { 'TEL-PIQ-01': 1.08, 'AVI-CP-01': 1.0, 'AVI-BOT-18': 3, 'AVI-ETI-01': 1, 'AVI-HIL-40': 0.03 },
          'M':  { 'TEL-PIQ-01': 1.15, 'AVI-CP-01': 1.0, 'AVI-BOT-18': 3, 'AVI-ETI-01': 1, 'AVI-HIL-40': 0.04 },
          'G':  { 'TEL-PIQ-01': 1.25, 'AVI-CP-01': 1.0, 'AVI-BOT-18': 3, 'AVI-ETI-01': 1, 'AVI-HIL-40': 0.04 },
          'XG': { 'TEL-PIQ-01': 1.35, 'AVI-CP-01': 1.0, 'AVI-BOT-18': 3, 'AVI-ETI-01': 1, 'AVI-HIL-40': 0.04 },
          '2X': { 'TEL-PIQ-01': 1.50, 'AVI-CP-01': 1.0, 'AVI-BOT-18': 3, 'AVI-ETI-01': 1, 'AVI-HIL-40': 0.05 },
          '3X': { 'TEL-PIQ-01': 1.65, 'AVI-CP-01': 1.0, 'AVI-BOT-18': 3, 'AVI-ETI-01': 1, 'AVI-HIL-40': 0.05 },
          '4X': { 'TEL-PIQ-01': 1.80, 'AVI-CP-01': 1.0, 'AVI-BOT-18': 3, 'AVI-ETI-01': 1, 'AVI-HIL-40': 0.06 },
          '5X': { 'TEL-PIQ-01': 1.95, 'AVI-CP-01': 1.0, 'AVI-BOT-18': 3, 'AVI-ETI-01': 1, 'AVI-HIL-40': 0.06 }
        },
        updated_at: new Date().toISOString()
      },
      {
        code: 'PAN003',
        description: 'PANTALÓN GABARDINA CASUAL AIRMAN',
        category: 'PANTALONES',
        gender: 'CABALLERO',
        sizes: ['28', '30', '32', '34', '36', '38', '40', '42', '44'],
        materials: [
          { type: 'TELA', name: 'GABARDINA 8.5 OZ ALGODÓN 100%', code: 'TEL-GAB-01', unit: 'MTS', notes: 'Cuerpo completo' },
          { type: 'TELA', name: 'FORRO DE BOLSILLOS POPELINA ALGODÓN', code: 'TEL-FOR-01', unit: 'MTS', notes: 'Bolsas delanteras' },
          { type: 'AVÍO', name: 'CIERRE METÁLICO LATÓN #5 BRAGUETA', code: 'AVI-CIE-05', unit: 'PZA', notes: 'Bragueta' },
          { type: 'AVÍO', name: 'BOTÓN METAL TROQUELADO PANTALÓN', code: 'AVI-BOT-MET', unit: 'PZA', notes: 'Cintura' }
        ],
        size_consumptions: {
          '28': { 'TEL-GAB-01': 1.30, 'TEL-FOR-01': 0.35, 'AVI-CIE-05': 1, 'AVI-BOT-MET': 1 },
          '30': { 'TEL-GAB-01': 1.35, 'TEL-FOR-01': 0.35, 'AVI-CIE-05': 1, 'AVI-BOT-MET': 1 },
          '32': { 'TEL-GAB-01': 1.40, 'TEL-FOR-01': 0.35, 'AVI-CIE-05': 1, 'AVI-BOT-MET': 1 },
          '34': { 'TEL-GAB-01': 1.45, 'TEL-FOR-01': 0.35, 'AVI-CIE-05': 1, 'AVI-BOT-MET': 1 },
          '36': { 'TEL-GAB-01': 1.52, 'TEL-FOR-01': 0.35, 'AVI-CIE-05': 1, 'AVI-BOT-MET': 1 },
          '38': { 'TEL-GAB-01': 1.60, 'TEL-FOR-01': 0.35, 'AVI-CIE-05': 1, 'AVI-BOT-MET': 1 },
          '40': { 'TEL-GAB-01': 1.70, 'TEL-FOR-01': 0.38, 'AVI-CIE-05': 1, 'AVI-BOT-MET': 1 },
          '42': { 'TEL-GAB-01': 1.80, 'TEL-FOR-01': 0.38, 'AVI-CIE-05': 1, 'AVI-BOT-MET': 1 },
          '44': { 'TEL-GAB-01': 1.90, 'TEL-FOR-01': 0.38, 'AVI-CIE-05': 1, 'AVI-BOT-MET': 1 }
        },
        updated_at: new Date().toISOString()
      },
      {
        code: 'PAND01',
        description: 'PANTALÓN DAMA STRETCH AIRMAN',
        category: 'PANTALONES',
        gender: 'DAMA',
        sizes: ['3', '5', '7', '9', '11', '13', '15', '17'],
        materials: [
          { type: 'TELA', name: 'GABARDINA STRETCH DAMA CONFORT', code: 'TEL-GAB-DAM', unit: 'MTS', notes: 'Cuerpo y pretina' },
          { type: 'TELA', name: 'FORRO TAFETA POLIÉSTER 100%', code: 'TEL-FOR-02', unit: 'MTS', notes: 'Bolsas secretas' },
          { type: 'AVÍO', name: 'CIERRE LATÓN DAMA #4 PANTALÓN', code: 'AVI-CIE-04', unit: 'PZA', notes: 'Bragueta frontal' },
          { type: 'AVÍO', name: 'BOTÓN METÁLICO DAMA 20L', code: 'AVI-BOT-DAM', unit: 'PZA', notes: 'Pretina' }
        ],
        size_consumptions: {
          '3':  { 'TEL-GAB-DAM': 1.20, 'TEL-FOR-02': 0.30, 'AVI-CIE-04': 1, 'AVI-BOT-DAM': 1 },
          '5':  { 'TEL-GAB-DAM': 1.25, 'TEL-FOR-02': 0.30, 'AVI-CIE-04': 1, 'AVI-BOT-DAM': 1 },
          '7':  { 'TEL-GAB-DAM': 1.30, 'TEL-FOR-02': 0.30, 'AVI-CIE-04': 1, 'AVI-BOT-DAM': 1 },
          '9':  { 'TEL-GAB-DAM': 1.38, 'TEL-FOR-02': 0.30, 'AVI-CIE-04': 1, 'AVI-BOT-DAM': 1 },
          '11': { 'TEL-GAB-DAM': 1.45, 'TEL-FOR-02': 0.30, 'AVI-CIE-04': 1, 'AVI-BOT-DAM': 1 },
          '13': { 'TEL-GAB-DAM': 1.55, 'TEL-FOR-02': 0.35, 'AVI-CIE-04': 1, 'AVI-BOT-DAM': 1 },
          '15': { 'TEL-GAB-DAM': 1.65, 'TEL-FOR-02': 0.35, 'AVI-CIE-04': 1, 'AVI-BOT-DAM': 1 },
          '17': { 'TEL-GAB-DAM': 1.75, 'TEL-FOR-02': 0.35, 'AVI-CIE-04': 1, 'AVI-BOT-DAM': 1 }
        },
        updated_at: new Date().toISOString()
      },
      {
        code: 'CMZ002',
        description: 'CAMISA DE VESTIR SLIM FIT POPELINA',
        category: 'CAMISAS',
        gender: 'CABALLERO',
        sizes: ['CH', 'M', 'G', 'XG', '2X'],
        materials: [
          { type: 'TELA', name: 'POPELINA STRETCH 97/3 SPANDEX', code: 'TEL-POP-02', unit: 'MTS', notes: 'Cuerpo, cuello y mangas' },
          { type: 'AVÍO', name: 'BOTÓN NACARADO 16L FRENTE CAMISA', code: 'AVI-BOT-16', unit: 'PZAS', notes: 'Frente y puños' },
          { type: 'AVÍO', name: 'ENTRETELA FUSIONABLE CUELLO/PUÑO PESADA', code: 'AVI-ENT-01', unit: 'MTS', notes: 'Refuerzo cuello/puño' },
          { type: 'AVÍO', name: 'ETIQUETA SATÍN AIRMAN PECHERA INTERIOR', code: 'AVI-ETI-02', unit: 'PZA', notes: 'Pechera interior' }
        ],
        size_consumptions: {
          'CH': { 'TEL-POP-02': 1.55, 'AVI-BOT-16': 9, 'AVI-ENT-01': 0.22, 'AVI-ETI-02': 1 },
          'M':  { 'TEL-POP-02': 1.65, 'AVI-BOT-16': 9, 'AVI-ENT-01': 0.25, 'AVI-ETI-02': 1 },
          'G':  { 'TEL-POP-02': 1.75, 'AVI-BOT-16': 9, 'AVI-ENT-01': 0.25, 'AVI-ETI-02': 1 },
          'XG': { 'TEL-POP-02': 1.85, 'AVI-BOT-16': 9, 'AVI-ENT-01': 0.28, 'AVI-ETI-02': 1 },
          '2X': { 'TEL-POP-02': 1.95, 'AVI-BOT-16': 9, 'AVI-ENT-01': 0.30, 'AVI-ETI-02': 1 }
        },
        updated_at: new Date().toISOString()
      }
    ]
    for (const b of samples) {
      await setDoc(doc(db, 'kanban_boms', b.code), b)
    }
  }

  const seedSampleThresholds = async () => {
    const samples = [
      { code: 'PMZ001', description: 'PLAYERA POLO AIRMAN', talla: 'CH', warehouse: 'MEXICO', min_stock: 30, max_stock: 120, safety_stock: 15 },
      { code: 'PMZ001', description: 'PLAYERA POLO AIRMAN', talla: 'M',  warehouse: 'MEXICO', min_stock: 50, max_stock: 200, safety_stock: 25 },
      { code: 'PMZ001', description: 'PLAYERA POLO AIRMAN', talla: 'G',  warehouse: 'MEXICO', min_stock: 40, max_stock: 160, safety_stock: 20 },
      { code: 'PMZ001', description: 'PLAYERA POLO AIRMAN', talla: 'M',  warehouse: 'MONTERREY', min_stock: 35, max_stock: 140, safety_stock: 15 },
      { code: 'CMZ002', description: 'CAMISA POPELINA SLIM', talla: 'M', warehouse: 'MEXICO', min_stock: 25, max_stock: 100, safety_stock: 10 },
      { code: 'CMZ002', description: 'CAMISA POPELINA SLIM', talla: 'G', warehouse: 'MEXICO', min_stock: 25, max_stock: 100, safety_stock: 10 },
      { code: 'PAN003', description: 'PANTALÓN GABARDINA CABALLERO', talla: '32', warehouse: 'MEXICO', min_stock: 30, max_stock: 110, safety_stock: 15 },
      { code: 'PAN003', description: 'PANTALÓN GABARDINA CABALLERO', talla: '34', warehouse: 'MEXICO', min_stock: 30, max_stock: 110, safety_stock: 15 },
      { code: 'PAND01', description: 'PANTALÓN DAMA STRETCH',        talla: '7',  warehouse: 'MEXICO', min_stock: 20, max_stock: 80,  safety_stock: 10 },
      { code: 'PAND01', description: 'PANTALÓN DAMA STRETCH',        talla: '9',  warehouse: 'MEXICO', min_stock: 25, max_stock: 90,  safety_stock: 10 },
    ]
    for (const t of samples) {
      const id = `${t.code}_${t.talla}_${t.warehouse}`
      await setDoc(doc(db, 'kanban_thresholds', id), { ...t, updated_at: new Date().toISOString() })
    }
  }

  const seedSampleSuppliers = async () => {
    const samples = [
      {
        id: 'SUP-GTM-01',
        type: 'TELA',
        name: 'TEXTILES DEL PACÍFICO S.A. (MOLINO GUATEMALA)',
        contact: 'Ing. Rodrigo Castillo',
        phone: '+502 2388-9900',
        email: 'pedidos@textilespacifico.gt',
        address: 'Km 24 Carretera al Pacífico, Villa Nueva, Guatemala',
        specialty: 'Gabardina Isabel, Hawa Elastano, Warp Pique, Cleveland, Cuadros, Rayas y Mezclilla',
        origin_country: 'GUATEMALA',
        weekly_capacity: 20000,
        daily_capacity: 4000,
        mill_loom_monthly_capacity: 80000,
        lead_time_days: 18, // Default general
        lead_time_liso_days: 18, // Teñido desde stock crudo greige + Tránsito
        lead_time_fantasia_days: 55, // Producción completa MTO (Hilo + Tejido + Acabado + Tránsito)
        lead_time_post_weaving_days: 14, // Días tras "Salida de Tejido" (Acabado + Aduana + Tránsito a México)
        logistics_days: 4,
        status: 'ACTIVO',
        notes: 'Molino textil principal de hilatura y tejeduría en Guatemala. Maneja stock en crudo para Lisos y telares MTO para Fantasías.'
      },
      {
        id: 'SUP-001',
        type: 'MAQUILERO',
        name: 'CONFECCIONES Y MAQUILAS DEL NORTE',
        contact: 'Ing. Carlos Mendoza',
        phone: '81-8392-1100',
        email: 'cmendoza@maquilasnorte.com',
        address: 'Av. Industrial 402, Monterrey, N.L.',
        specialty: 'Playeras Polo y Cuello Redondo',
        origin_country: 'MÉXICO',
        weekly_capacity: 5000,
        daily_capacity: 1000,
        lead_time_days: 7,
        logistics_days: 2,
        status: 'ACTIVO',
        notes: 'Taller principal de confección polo en Monterrey'
      },
      {
        id: 'SUP-002',
        type: 'MAQUILERO',
        name: 'TALLERES TEXTILES PUEBLA',
        contact: 'Lic. Martha Juárez',
        phone: '22-2244-8899',
        email: 'mjuarez@textilespuebla.mx',
        address: 'Parque Industrial 2000, Puebla, Pue.',
        specialty: 'Camisería Fina y Popelina',
        origin_country: 'MÉXICO',
        weekly_capacity: 3500,
        daily_capacity: 700,
        lead_time_days: 10,
        logistics_days: 1,
        status: 'ACTIVO',
        notes: 'Especialista en camisas con vivos y detalles'
      },
      {
        id: 'SUP-003',
        type: 'MAQUILERO',
        name: 'MAQUILADORA GABARDINAS DEL BAJÍO',
        contact: 'Roberto Garza',
        phone: '47-7123-4567',
        email: 'rgarza@gabardinasbajio.com',
        address: 'Blvd. Aeropuerto 1500, León, Gto.',
        specialty: 'Pantalones y Gabardinas Pesadas',
        origin_country: 'MÉXICO',
        weekly_capacity: 4000,
        daily_capacity: 800,
        lead_time_days: 12,
        logistics_days: 2,
        status: 'ACTIVO',
        notes: 'Línea de confección y presillado pesado'
      },
      {
        id: 'SUP-004',
        type: 'TELA',
        name: 'TELAS INDUSTRIALES DE MÉXICO S.A. DE C.V.',
        contact: 'Ing. Fernando Valdés',
        phone: '55-5341-9900',
        email: 'ventas@telasindustriales.mx',
        address: 'Calz. Vallejo 1100, CDMX',
        specialty: 'Gabardina 8.5 oz, Mezclilla 14 oz, Piqué 100% Algodón, Popelina Stretch',
        origin_country: 'MÉXICO',
        weekly_capacity: 25000,
        daily_capacity: 5000,
        lead_time_days: 5,
        lead_time_liso_days: 5,
        lead_time_fantasia_days: 25,
        lead_time_post_weaving_days: 3,
        logistics_days: 1,
        status: 'ACTIVO',
        notes: 'Proveedor principal de rollos de gabardina y tejido de punto peinado nacional'
      },
      {
        id: 'SUP-005',
        type: 'AVÍO',
        name: 'DISTRIBUIDORA NACIONAL DE AVÍOS Y FORNITURAS',
        contact: 'Lic. Sofía Alemán',
        phone: '33-3619-7700',
        email: 'saleman@aviosnacionales.com',
        address: 'Zona Industrial 3, Guadalajara, Jal.',
        specialty: 'Cierres Latón #5, Botones Metal Troquelados, Elásticos 40mm, Hilos 40/2',
        origin_country: 'MÉXICO',
        weekly_capacity: 50000,
        daily_capacity: 10000,
        lead_time_days: 3,
        logistics_days: 1,
        status: 'ACTIVO',
        notes: 'Suministro de cierres, botones, broches y etiquetas tejidas por millar'
      }
    ]
    for (const s of samples) {
      await setDoc(doc(db, 'kanban_suppliers', s.id), s)
    }
  }

  const seedSampleRouting = async () => {
    const samples = [
      {
        destination: 'MEXICO',
        primary_origin: 'PLANTA',
        primary_percentage: 70,
        secondary_origin: 'MTY',
        secondary_percentage: 30,
        mode: 'COMBINADO',
        notes: 'CDMX se surte simultáneamente de PLANTA (70%) y MTY (30%)'
      },
      {
        destination: 'MONTERREY',
        primary_origin: 'PLANTA',
        primary_percentage: 100,
        secondary_origin: 'MATRIZ',
        secondary_percentage: 0,
        mode: 'DIRECTO',
        notes: 'MTY se surte preferentemente de PLANTA directa'
      },
      {
        destination: 'MATRIZ',
        primary_origin: 'PLANTA',
        primary_percentage: 100,
        secondary_origin: 'NINGUNO',
        secondary_percentage: 0,
        mode: 'DIRECTO',
        notes: 'Matriz almacén central desde producción'
      }
    ]
    for (const r of samples) {
      await setDoc(doc(db, 'kanban_routing', r.destination), r)
    }
  }

  const seedSampleErpSync = async () => {
    const samples = [
      { code: 'PMZ001', description: 'PLAYERA POLO MANGA CORTA AIRMAN', talla: 'CH', cost: 165.0, category: 'POLO', subcategory: 'MANGA CORTA', stocks: { MATRIZ: 20, PLANTA: 120, MEXICO: 45, MONTERREY: 30 } },
      { code: 'PMZ001', description: 'PLAYERA POLO MANGA CORTA AIRMAN', talla: 'M',  cost: 165.0, category: 'POLO', subcategory: 'MANGA CORTA', stocks: { MATRIZ: 35, PLANTA: 180, MEXICO: 50, MONTERREY: 35 } },
      { code: 'PMZ001', description: 'PLAYERA POLO MANGA CORTA AIRMAN', talla: 'G',  cost: 165.0, category: 'POLO', subcategory: 'MANGA CORTA', stocks: { MATRIZ: 25, PLANTA: 140, MEXICO: 40, MONTERREY: 25 } },
      { code: 'PMZ001', description: 'PLAYERA POLO MANGA CORTA AIRMAN', talla: 'XG', cost: 175.0, category: 'POLO', subcategory: 'MANGA CORTA', stocks: { MATRIZ: 15, PLANTA: 90,  MEXICO: 25, MONTERREY: 15 } },
      { code: 'PAN003', description: 'PANTALÓN GABARDINA CASUAL AIRMAN', talla: '30', cost: 285.0, category: 'PANTALONES', subcategory: 'GABARDINA', stocks: { MATRIZ: 20, PLANTA: 80,  MEXICO: 30, MONTERREY: 20 } },
      { code: 'PAN003', description: 'PANTALÓN GABARDINA CASUAL AIRMAN', talla: '32', cost: 285.0, category: 'PANTALONES', subcategory: 'GABARDINA', stocks: { MATRIZ: 30, PLANTA: 110, MEXICO: 30, MONTERREY: 25 } },
      { code: 'PAN003', description: 'PANTALÓN GABARDINA CASUAL AIRMAN', talla: '34', cost: 285.0, category: 'PANTALONES', subcategory: 'GABARDINA', stocks: { MATRIZ: 30, PLANTA: 110, MEXICO: 30, MONTERREY: 25 } },
      { code: 'PAND01', description: 'PANTALÓN DAMA STRETCH AIRMAN',    talla: '7',  cost: 275.0, category: 'PANTALONES', subcategory: 'STRETCH DAMA', stocks: { MATRIZ: 15, PLANTA: 65,  MEXICO: 20, MONTERREY: 15 } },
      { code: 'PAND01', description: 'PANTALÓN DAMA STRETCH AIRMAN',    talla: '9',  cost: 275.0, category: 'PANTALONES', subcategory: 'STRETCH DAMA', stocks: { MATRIZ: 20, PLANTA: 85,  MEXICO: 25, MONTERREY: 20 } },
      { code: 'CMZ002', description: 'CAMISA DE VESTIR SLIM FIT POPELINA', talla: 'M', cost: 220.0, category: 'CAMISAS', subcategory: 'SLIM FIT', stocks: { MATRIZ: 25, PLANTA: 100, MEXICO: 25, MONTERREY: 20 } },
      { code: 'CMZ002', description: 'CAMISA DE VESTIR SLIM FIT POPELINA', talla: 'G', cost: 220.0, category: 'CAMISAS', subcategory: 'SLIM FIT', stocks: { MATRIZ: 25, PLANTA: 100, MEXICO: 25, MONTERREY: 20 } }
    ]

    let totalUnits = 0
    for (const s of samples) {
      for (const wh of ['MATRIZ', 'PLANTA', 'MEXICO', 'MONTERREY']) {
        const id = `${s.code}_${s.talla}_${wh}`
        const qty = s.stocks[wh] || 0
        totalUnits += qty
        await setDoc(doc(db, 'kanban_erp_sync', id), {
          code: s.code,
          description: s.description,
          talla: s.talla,
          warehouse: wh,
          stock: qty,
          cost: s.cost,
          category: s.category,
          subcategory: s.subcategory,
          sync_timestamp: new Date().toISOString()
        })
      }
    }

    const meta = {
      date: new Date().toISOString(),
      record_count: samples.length,
      total_units: totalUnits,
      filename: 'VENTAS_POR_SEMANA_ERP.xlsx',
      columns_detected: ['CODIGO', 'DESCRIPCION', 'TALLA', 'MATRIZ', 'PLANTA', 'MEXICO (CDMX)', 'MONTERREY (MTY)', 'COSTO', 'CATEGORIA', 'SUBCATEGORIA']
    }
    await setDoc(doc(db, 'kanban_meta', 'last_erp_sync'), meta)
    setLastSyncInfo(meta)
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // ── BOM Handlers (Guardar Matriz por Talla y Código Padre) ──
  // ═════════════════════════════════════════════════════════════════════════════
  const handleSaveBom = async (bomData) => {
    if (!canEdit) return showMessage('error', 'No tienes permisos de edición.')
    if (!bomData.code?.trim()) return showMessage('error', 'El CÓDIGO INTERNO PADRE de la prenda es obligatorio.')
    if (!bomData.gender) return showMessage('error', 'El campo GÉNERO es obligatorio.')
    if (!bomData.category) return showMessage('error', 'La CATEGORÍA es obligatoria.')
    setLoading(true)
    try {
      const cleanCode = bomData.code.toUpperCase().trim()
      await setDoc(doc(db, 'kanban_boms', cleanCode), {
        ...bomData,
        code: cleanCode,
        updated_at: new Date().toISOString()
      })
      showMessage('success', `BOM MATRIX ${cleanCode} (${bomData.gender}) GUARDADA CON ÉXITO`)
      setSelectedBomModal(null)
    } catch (e) {
      console.error(e)
      showMessage('error', 'Error al guardar la BOM: ' + e.message)
    } finally {
      setLoading(false)
    }
  }

  const handleDeleteBom = async (code) => {
    if (!canEdit) return showMessage('error', 'No tienes permisos de edición.')
    if (!window.confirm(`¿Estás seguro de eliminar la Lista de Materiales (BOM) para el código padre ${code}?`)) return
    setLoading(true)
    try {
      await deleteDoc(doc(db, 'kanban_boms', code))
      showMessage('success', `BOM ${code} ELIMINADA`)
    } catch (e) {
      console.error(e)
      showMessage('error', 'Error al eliminar BOM')
    } finally {
      setLoading(false)
    }
  }

  const handleImportBomsExcel = (e) => {
    if (!canEdit) return showMessage('error', 'No tienes permisos de edición.')
    const file = e.target.files?.[0]
    if (!file) return
    setLoading(true)
    const reader = new FileReader()
    reader.onload = async (evt) => {
      try {
        const bstr = evt.target.result
        const wb = XLSX.read(bstr, { type: 'binary' })
        const ws = wb.Sheets[wb.SheetNames[0]]
        const rows = XLSX.utils.sheet_to_json(ws)

        // Group rows by Codigo Padre
        const grouped = {}
        rows.forEach(r => {
          const code = String(r['Codigo_Interno_Padre'] || r['Codigo_Padre'] || r['Codigo'] || r['CÓDIGO'] || r['SKU_Padre'] || '').trim().toUpperCase()
          if (!code) return
          if (!grouped[code]) {
            grouped[code] = {
              code,
              description: String(r['Descripcion'] || r['DESCRIPCIÓN'] || '').toUpperCase(),
              category: String(r['Categoria'] || r['CATEGORÍA'] || 'GENERAL').toUpperCase(),
              gender: String(r['Genero'] || r['GÉNERO'] || r['GENERO'] || 'CABALLERO').toUpperCase(),
              sizes: [],
              materials: [],
              size_consumptions: {}
            }
          }

          const talla = String(r['Talla'] || r['TALLA'] || r['Size'] || 'M').trim().toUpperCase()
          if (!grouped[code].sizes.includes(talla)) {
            grouped[code].sizes.push(talla)
          }

          const matCode = String(r['Codigo_Interno_Insumo'] || r['Codigo_Insumo'] || r['CODIGO_INSUMO'] || r['SKU_Insumo'] || '').trim().toUpperCase()
          const matName = String(r['Descripcion_Insumo'] || r['Insumo'] || r['Nombre_Insumo'] || r['INSUMO'] || matCode).trim().toUpperCase()

          if (matCode || matName) {
            const effectiveCode = matCode || `INS-${matName.slice(0, 8)}`
            const exists = grouped[code].materials.find(m => m.code === effectiveCode)
            if (!exists) {
              grouped[code].materials.push({
                type: String(r['Tipo_Insumo'] || r['Tipo'] || r['TIPO'] || 'TELA').toUpperCase(),
                name: matName,
                code: effectiveCode,
                unit: String(r['Unidad'] || r['UNIDAD'] || 'MTS').toUpperCase(),
                notes: r['Notas'] || r['NOTAS'] || ''
              })
            }

            const consumptionVal = parseFloat(r['Consumo_Exacto_Talla'] || r['Consumo'] || r['CONSUMO'] || 1)
            if (!grouped[code].size_consumptions[talla]) {
              grouped[code].size_consumptions[talla] = {}
            }
            grouped[code].size_consumptions[talla][effectiveCode] = consumptionVal
          }
        })

        for (const code in grouped) {
          await setDoc(doc(db, 'kanban_boms', code), {
            ...grouped[code],
            updated_at: new Date().toISOString()
          })
        }

        showMessage('success', `${Object.keys(grouped).length} BOMs IMPORTADAS CON ÉXITO`)
      } catch (err) {
        console.error(err)
        showMessage('error', 'Error al procesar archivo de BOMs: ' + err.message)
      } finally {
        setLoading(false)
      }
    }
    reader.readAsBinaryString(file)
  }

  const handleExportBoms = () => {
    const flatRows = []
    boms.forEach(b => {
      const sizes = b.sizes && b.sizes.length > 0 ? b.sizes : ['UN']
      const consumptions = b.size_consumptions || {}

      if (b.materials && b.materials.length > 0) {
        sizes.forEach(sz => {
          b.materials.forEach(m => {
            const matKey = m.code || m.id || m.name
            const exactCons = consumptions[sz]?.[matKey] !== undefined ? consumptions[sz][matKey] : m.consumption || 1
            flatRows.push({
              'Codigo_Interno_Padre': b.code,
              'Descripcion_Prenda': b.description,
              'Categoria': b.category || 'GENERAL',
              'Genero': b.gender || 'CABALLERO',
              'Talla': sz,
              'Tipo_Insumo': m.type,
              'Codigo_Interno_Insumo': m.code,
              'Descripcion_Insumo': m.name,
              'Consumo_Exacto_Talla': exactCons,
              'Unidad': m.unit,
              'Notas': m.notes || ''
            })
          })
        })
      } else {
        flatRows.push({
          'Codigo_Interno_Padre': b.code,
          'Descripcion_Prenda': b.description,
          'Categoria': b.category || 'GENERAL',
          'Genero': b.gender || 'CABALLERO',
          'Talla': 'UN',
          'Tipo_Insumo': 'N/A',
          'Codigo_Interno_Insumo': '',
          'Descripcion_Insumo': 'SIN INSUMOS',
          'Consumo_Exacto_Talla': 0,
          'Unidad': '',
          'Notas': ''
        })
      }
    })
    const ws = XLSX.utils.json_to_sheet(flatRows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'BOMs_Matriz_Kanban')
    XLSX.writeFile(wb, `BOMs_Matriz_CodigosInternos_Kanban_${new Date().toISOString().slice(0, 10)}.xlsx`)
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // ── Min/Max & Dynamic ROP Threshold Handlers ──
  // ═════════════════════════════════════════════════════════════════════════════
  const handleSaveGlobalSafetyDays = async (val) => {
    if (!canEdit) return showMessage('error', 'No tienes permisos de edición.')
    const num = Math.max(1, parseInt(val) || 30)
    try {
      await setDoc(doc(db, 'kanban_global_config', 'parameters'), {
        safety_stock_days: num,
        updated_at: new Date().toISOString(),
        updated_by: 'Planeación Antigravity'
      }, { merge: true })
      setGlobalSafetyDays(num)
      showMessage('success', `POLÍTICA GLOBAL ACTUALIZADA: ${num} DÍAS DE COBERTURA DE SEGURIDAD (${(num / 30).toFixed(1)} MESES)`)
    } catch (e) {
      console.error(e)
      showMessage('error', 'Error al guardar política de cobertura: ' + e.message)
    }
  }

  const handleSaveThresholdInline = async (thresh) => {
    if (!canEdit) return showMessage('error', 'No tienes permisos de edición.')
    try {
      await setDoc(doc(db, 'kanban_thresholds', thresh.id), {
        ...thresh,
        min_stock: parseInt(thresh.min_stock) || 0,
        max_stock: parseInt(thresh.max_stock) || 0,
        safety_stock: parseInt(thresh.safety_stock) || 0,
        safety_stock_days: parseInt(thresh.safety_stock_days) || globalSafetyDays,
        monthly_consumption: parseInt(thresh.monthly_consumption) || 120,
        updated_at: new Date().toISOString()
      }, { merge: true })
      showMessage('success', `UMBRALES DE ${thresh.code} (${thresh.talla} - ${thresh.warehouse}) ACTUALIZADOS`)
      setEditingThresh(null)
    } catch (e) {
      console.error(e)
      showMessage('error', 'Error al actualizar umbrales')
    }
  }

  const handleImportThresholdsExcel = (e) => {
    if (!canEdit) return showMessage('error', 'No tienes permisos de edición.')
    const file = e.target.files?.[0]
    if (!file) return
    setLoading(true)
    const reader = new FileReader()
    reader.onload = async (evt) => {
      try {
        const bstr = evt.target.result
        const wb = XLSX.read(bstr, { type: 'binary' })
        const ws = wb.Sheets[wb.SheetNames[0]]
        const rows = XLSX.utils.sheet_to_json(ws)

        let count = 0
        for (const r of rows) {
          const code = String(r['Codigo'] || r['CÓDIGO'] || r['Code'] || '').trim().toUpperCase()
          const talla = String(r['Talla'] || r['TALLA'] || r['Size'] || 'UN').trim().toUpperCase()
          const rawWh = String(r['Almacen'] || r['ALMACEN'] || r['SUCURSAL'] || 'MEXICO').trim()
          const wh = normalizeWarehouse(rawWh)
          if (!code) continue

          const id = `${code}_${talla}_${wh}`
          await setDoc(doc(db, 'kanban_thresholds', id), {
            code,
            description: String(r['Descripcion'] || r['DESCRIPCIÓN'] || '').toUpperCase(),
            talla,
            warehouse: wh,
            min_stock: parseInt(r['Stock_Minimo'] || r['MIN'] || r['Minimo'] || 10),
            max_stock: parseInt(r['Stock_Maximo'] || r['MAX'] || r['Maximo'] || 50),
            safety_stock: parseInt(r['Stock_Seguridad'] || r['SEGURIDAD'] || 5),
            updated_at: new Date().toISOString()
          })
          count++
        }

        showMessage('success', `${count} NIVELES MIN/MAX IMPORTADOS CON ÉXITO`)
      } catch (err) {
        console.error(err)
        showMessage('error', 'Error al importar umbrales: ' + err.message)
      } finally {
        setLoading(false)
      }
    }
    reader.readAsBinaryString(file)
  }

  const handleExportThresholds = () => {
    const ws = XLSX.utils.json_to_sheet(thresholds.map(t => ({
      'Codigo': t.code,
      'Descripcion': t.description,
      'Talla': t.talla,
      'Almacen': t.warehouse,
      'Stock_Minimo': t.min_stock,
      'Stock_Maximo': t.max_stock,
      'Stock_Seguridad': t.safety_stock || 0,
      'Ultima_Modificacion': t.updated_at
    })))
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Min_Max_Kanban')
    XLSX.writeFile(wb, `Umbrales_Min_Max_Kanban_${new Date().toISOString().slice(0, 10)}.xlsx`)
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // ── Supplier Handlers ──
  // ═════════════════════════════════════════════════════════════════════════════
  const handleSaveSupplier = async (supData) => {
    if (!canEdit) return showMessage('error', 'No tienes permisos de edición.')
    if (!supData.name?.trim()) return showMessage('error', 'El nombre del proveedor es obligatorio.')
    setLoading(true)
    try {
      const id = supData.id || `SUP-${Date.now().toString().slice(-6)}`
      await setDoc(doc(db, 'kanban_suppliers', id), {
        ...supData,
        id,
        weekly_capacity: parseInt(supData.weekly_capacity) || 0,
        daily_capacity: parseInt(supData.daily_capacity) || 0,
        mill_loom_monthly_capacity: parseInt(supData.mill_loom_monthly_capacity) || 0,
        lead_time_days: parseInt(supData.lead_time_days) || 7,
        lead_time_liso_days: parseInt(supData.lead_time_liso_days) || parseInt(supData.lead_time_days) || 18,
        lead_time_fantasia_days: parseInt(supData.lead_time_fantasia_days) || 55,
        lead_time_post_weaving_days: parseInt(supData.lead_time_post_weaving_days) || 14,
        logistics_days: parseInt(supData.logistics_days) || 1,
        origin_country: supData.origin_country || 'MÉXICO',
        status: supData.status || 'ACTIVO',
        updated_at: new Date().toISOString()
      })
      showMessage('success', `PROVEEDOR ${supData.name} GUARDADO`)
      setSupplierModal(null)
    } catch (e) {
      console.error(e)
      showMessage('error', 'Error al guardar proveedor')
    } finally {
      setLoading(false)
    }
  }

  const handleDeleteSupplier = async (id, name) => {
    if (!canEdit) return showMessage('error', 'No tienes permisos de edición.')
    if (!window.confirm(`¿Eliminar proveedor ${name}?`)) return
    try {
      await deleteDoc(doc(db, 'kanban_suppliers', id))
      showMessage('success', 'PROVEEDOR ELIMINADO')
    } catch (e) {
      showMessage('error', 'Error al eliminar proveedor')
    }
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // ── Multidirectional Routing Handlers ──
  // ═════════════════════════════════════════════════════════════════════════════
  const handleSaveRouting = async (destination, rule) => {
    if (!canEdit) return showMessage('error', 'No tienes permisos de edición.')
    setSavingRouting(true)
    try {
      await setDoc(doc(db, 'kanban_routing', destination), {
        ...rule,
        destination,
        updated_at: new Date().toISOString()
      })
      showMessage('success', `LÓGICA DE RUTEO PARA ${destination} ACTUALIZADA EN TIEMPO REAL`)
    } catch (e) {
      showMessage('error', 'Error al guardar ruteo')
    } finally {
      setSavingRouting(false)
    }
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // ── Weekly ERP Inventory Sync Handlers ──
  // ═════════════════════════════════════════════════════════════════════════════
  const handleProcessErpFile = async (file) => {
    if (!canEdit) return showMessage('error', 'No tienes permisos de edición.')
    if (!file) return
    setLoading(true)
    const reader = new FileReader()
    reader.onload = async (evt) => {
      try {
        const bstr = evt.target.result
        const wb = XLSX.read(bstr, { type: 'binary' })
        const ws = wb.Sheets[wb.SheetNames[0]]
        const data = XLSX.utils.sheet_to_json(ws)

        let parsedSkus = 0
        let totalUnits = 0
        const batchMap = {}

        data.forEach(row => {
          // 1. Mandatory Core Headers
          const code = String(row['CODIGO'] || row['Codigo'] || row['CÓDIGO'] || row['CODIGO_INTERNO'] || row['SKU'] || '').trim().toUpperCase()
          const description = String(row['DESCRIPCION'] || row['DESCRIPCIÓN'] || row['Descripcion'] || row['Nombre'] || '').trim().toUpperCase()
          const talla = String(row['TALLA'] || row['Talla'] || row['MEDIDA'] || row['Size'] || 'UN').trim().toUpperCase()
          const cost = parseFloat(row['COSTO'] || row['Costo'] || row['COSTO_UNITARIO'] || 0) || 0
          const category = String(row['CATEGORIA'] || row['CATEGORÍA'] || row['Categoria'] || 'GENERAL').trim().toUpperCase()
          const subcategory = String(row['SUBCATEGORIA'] || row['SUBCATEGORÍA'] || row['Subcategoria'] || '').trim().toUpperCase()

          if (!code) return

          // 2. Multi-Warehouse Columns (Matriz, Planta, México (CDMX), Monterrey (MTY))
          const stockMatriz = parseInt(row['MATRIZ'] || row['Matriz'] || row['ALMACEN_MATRIZ'] || 0) || 0
          const stockPlanta = parseInt(row['PLANTA'] || row['Planta'] || row['CEDIS_PLANTA'] || 0) || 0
          const stockMexico = parseInt(row['MEXICO (CDMX)'] || row['MEXICO'] || row['CDMX'] || row['México'] || row['MEXICO_CDMX'] || row['SUCURSAL_MEXICO'] || row['DF'] || 0) || 0
          const stockMonterrey = parseInt(row['MONTERREY (MTY)'] || row['MONTERREY'] || row['MTY'] || row['Monterrey'] || row['MONTERREY_MTY'] || row['SUCURSAL_MONTERREY'] || 0) || 0

          // Check if it's a flat single warehouse row fallback
          const rawWh = row['ALMACEN'] || row['Almacen'] || row['SUCURSAL']
          if (rawWh && (row['STOCK'] !== undefined || row['EXISTENCIA'] !== undefined)) {
            const whNorm = normalizeWarehouse(rawWh)
            const singleStock = parseInt(row['STOCK'] || row['EXISTENCIA'] || row['CANTIDAD'] || 0) || 0
            const key = `${code}_${talla}_${whNorm}`
            batchMap[key] = {
              code,
              description,
              talla,
              warehouse: whNorm,
              stock: singleStock,
              cost,
              category,
              subcategory,
              sync_timestamp: new Date().toISOString()
            }
            totalUnits += singleStock
          } else {
            // Save 4 warehouse entries for this SKU + Talla
            const warehousesData = [
              { wh: 'MATRIZ', qty: stockMatriz },
              { wh: 'PLANTA', qty: stockPlanta },
              { wh: 'MEXICO', qty: stockMexico },
              { wh: 'MONTERREY', qty: stockMonterrey }
            ]

            warehousesData.forEach(({ wh, qty }) => {
              const key = `${code}_${talla}_${wh}`
              batchMap[key] = {
                code,
                description,
                talla,
                warehouse: wh,
                stock: qty,
                cost,
                category,
                subcategory,
                sync_timestamp: new Date().toISOString()
              }
              totalUnits += qty
            })
          }

          parsedSkus++
        })

        // Save into Firestore
        for (const k in batchMap) {
          await setDoc(doc(db, 'kanban_erp_sync', k), batchMap[k])
        }

        const syncMeta = {
          date: new Date().toISOString(),
          record_count: parsedSkus,
          total_units: totalUnits,
          filename: file.name,
          columns_detected: ['CODIGO', 'DESCRIPCION', 'TALLA', 'MATRIZ', 'PLANTA', 'MEXICO (CDMX)', 'MONTERREY (MTY)', 'COSTO', 'CATEGORIA', 'SUBCATEGORIA']
        }
        await setDoc(doc(db, 'kanban_meta', 'last_erp_sync'), syncMeta)
        setLastSyncInfo(syncMeta)

        showMessage('success', `SINCRONIZACIÓN EXITOSA: ${parsedSkus} MODELOS/TALLAS (${totalUnits.toLocaleString()} PZAS EN 4 ALMACENES) ACTUALIZADOS DESDE ${file.name}`)
      } catch (err) {
        console.error(err)
        showMessage('error', 'Error al sincronizar archivo ERP: ' + err.message)
      } finally {
        setLoading(false)
      }
    }
    reader.readAsBinaryString(file)
  }

  // Generate and download the official ERP Excel Template
  const handleDownloadErpTemplate = () => {
    const templateRows = [
      {
        'CODIGO': 'PMZ001',
        'DESCRIPCION': 'PLAYERA POLO MANGA CORTA AIRMAN',
        'TALLA': 'M',
        'MATRIZ': 35,
        'PLANTA': 180,
        'MEXICO (CDMX)': 50,
        'MONTERREY (MTY)': 35,
        'COSTO': 165.00,
        'CATEGORIA': 'POLO',
        'SUBCATEGORIA': 'MANGA CORTA'
      },
      {
        'CODIGO': 'PMZ001',
        'DESCRIPCION': 'PLAYERA POLO MANGA CORTA AIRMAN',
        'TALLA': 'G',
        'MATRIZ': 25,
        'PLANTA': 140,
        'MEXICO (CDMX)': 40,
        'MONTERREY (MTY)': 25,
        'COSTO': 165.00,
        'CATEGORIA': 'POLO',
        'SUBCATEGORIA': 'MANGA CORTA'
      },
      {
        'CODIGO': 'PAN003',
        'DESCRIPCION': 'PANTALÓN GABARDINA CASUAL AIRMAN',
        'TALLA': '32',
        'MATRIZ': 30,
        'PLANTA': 110,
        'MEXICO (CDMX)': 30,
        'MONTERREY (MTY)': 25,
        'COSTO': 285.00,
        'CATEGORIA': 'PANTALONES',
        'SUBCATEGORIA': 'GABARDINA'
      },
      {
        'CODIGO': 'PAND01',
        'DESCRIPCION': 'PANTALÓN DAMA STRETCH AIRMAN',
        'TALLA': '7',
        'MATRIZ': 15,
        'PLANTA': 65,
        'MEXICO (CDMX)': 20,
        'MONTERREY (MTY)': 15,
        'COSTO': 275.00,
        'CATEGORIA': 'PANTALONES',
        'SUBCATEGORIA': 'STRETCH DAMA'
      },
      {
        'CODIGO': 'CMZ002',
        'DESCRIPCION': 'CAMISA DE VESTIR SLIM FIT POPELINA',
        'TALLA': 'M',
        'MATRIZ': 25,
        'PLANTA': 100,
        'MEXICO (CDMX)': 25,
        'MONTERREY (MTY)': 20,
        'COSTO': 220.00,
        'CATEGORIA': 'CAMISAS',
        'SUBCATEGORIA': 'SLIM FIT'
      }
    ]

    const ws = XLSX.utils.json_to_sheet(templateRows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Inventario_ERP')
    XLSX.writeFile(wb, `Plantilla_Oficial_ERP_Kanban_${new Date().toISOString().slice(0, 10)}.xlsx`)
  }

  // Filtered Lists
  const filteredBoms = boms.filter(b => {
    const matchSearch = (b.code || '').toLowerCase().includes(bomSearch.toLowerCase()) ||
                        (b.description || '').toLowerCase().includes(bomSearch.toLowerCase()) ||
                        (b.category || '').toLowerCase().includes(bomSearch.toLowerCase())
    const matchGender = bomFilterGender === 'ALL' || b.gender === bomFilterGender
    return matchSearch && matchGender
  })

  const filteredThresholds = thresholds.filter(t => {
    const matchSearch = (t.code || '').toLowerCase().includes(threshSearch.toLowerCase()) ||
                        (t.description || '').toLowerCase().includes(threshSearch.toLowerCase()) ||
                        (t.talla || '').toLowerCase().includes(threshSearch.toLowerCase())
    const matchWh = threshFilterWh === 'ALL' || t.warehouse === threshFilterWh
    return matchSearch && matchWh
  })

  // Filtered Suppliers by Type (Maquilero, Tela, Avío) and Search
  const filteredSuppliers = suppliers.filter(s => {
    const matchSearch = (s.name || '').toLowerCase().includes(supplierSearch.toLowerCase()) ||
                        (s.specialty || '').toLowerCase().includes(supplierSearch.toLowerCase()) ||
                        (s.contact || '').toLowerCase().includes(supplierSearch.toLowerCase()) ||
                        (s.phone || '').toLowerCase().includes(supplierSearch.toLowerCase()) ||
                        (s.email || '').toLowerCase().includes(supplierSearch.toLowerCase())
    const sType = s.type || 'MAQUILERO'
    const matchType = supplierFilterType === 'ALL' || sType === supplierFilterType
    return matchSearch && matchType
  })

  // Group ERP items by (code + talla) for the Multi-Warehouse Consolidated Matrix View
  const erpGroupedMatrix = React.useMemo(() => {
    const map = {}
    erpStock.forEach(item => {
      const groupKey = `${item.code}_${item.talla}`
      if (!map[groupKey]) {
        map[groupKey] = {
          code: item.code,
          description: item.description,
          talla: item.talla,
          category: item.category || 'GENERAL',
          subcategory: item.subcategory || '',
          cost: item.cost || 0,
          sync_timestamp: item.sync_timestamp,
          stocks: {
            MATRIZ: 0,
            PLANTA: 0,
            MEXICO: 0,
            MONTERREY: 0
          }
        }
      }
      const whNorm = normalizeWarehouse(item.warehouse)
      map[groupKey].stocks[whNorm] = Number(item.stock || 0)
      if (item.cost && !map[groupKey].cost) map[groupKey].cost = item.cost
      if (item.category && map[groupKey].category === 'GENERAL') map[groupKey].category = item.category
      if (item.subcategory && !map[groupKey].subcategory) map[groupKey].subcategory = item.subcategory
      if (item.sync_timestamp) map[groupKey].sync_timestamp = item.sync_timestamp
    })

    return Object.values(map).map(row => {
      const total = (row.stocks.MATRIZ || 0) + (row.stocks.PLANTA || 0) + (row.stocks.MEXICO || 0) + (row.stocks.MONTERREY || 0)
      return { ...row, totalStock: total }
    })
  }, [erpStock])

  const filteredErpMatrix = React.useMemo(() => {
    return erpGroupedMatrix.filter(row => {
      const matchSearch = (row.code || '').toLowerCase().includes(erpSearch.toLowerCase()) ||
                          (row.description || '').toLowerCase().includes(erpSearch.toLowerCase()) ||
                          (row.talla || '').toLowerCase().includes(erpSearch.toLowerCase()) ||
                          (row.category || '').toLowerCase().includes(erpSearch.toLowerCase()) ||
                          (row.subcategory || '').toLowerCase().includes(erpSearch.toLowerCase())
      const matchCat = erpCategoryFilter === 'ALL' || row.category === erpCategoryFilter
      return matchSearch && matchCat
    })
  }, [erpGroupedMatrix, erpSearch, erpCategoryFilter])

  // Extract unique categories for filter
  const uniqueCategories = React.useMemo(() => {
    const set = new Set()
    erpGroupedMatrix.forEach(r => { if (r.category) set.add(r.category) })
    return Array.from(set)
  }, [erpGroupedMatrix])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }} className="animate-fade-in">
      {/* Sub-Navigation */}
      <div style={{
        display: 'flex',
        gap: '0.5rem',
        background: 'rgba(255,255,255,0.03)',
        padding: '0.35rem',
        borderRadius: '1.25rem',
        border: '1px solid rgba(255,255,255,0.06)',
        overflowX: 'auto'
      }}>
        {[
          { id: 'boms', label: '1. LISTAS DE MATERIALES (BOM)', icon: <Layers size={16} /> },
          { id: 'thresholds', label: '2. UMBRALES MIN / MAX', icon: <Sliders size={16} /> },
          { id: 'suppliers', label: '3. CATÁLOGO DE PROVEEDORES', icon: <Users size={16} /> },
          { id: 'routing', label: '4. RUTEO MULTIDIRECCIONAL', icon: <Truck size={16} /> },
          { id: 'erp_sync', label: '5. SINCRONIZACIÓN ERP', icon: <RefreshCw size={16} /> },
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setSubTab(tab.id)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              padding: '0.75rem 1.25rem',
              borderRadius: '0.875rem',
              fontSize: '0.7rem',
              fontWeight: 900,
              cursor: 'pointer',
              border: 'none',
              background: subTab === tab.id ? 'linear-gradient(135deg, #0284c7, #0369a1)' : 'transparent',
              color: subTab === tab.id ? 'white' : '#94a3b8',
              boxShadow: subTab === tab.id ? '0 4px 14px rgba(2, 132, 199, 0.4)' : 'none',
              transition: 'all 0.2s',
              whiteSpace: 'nowrap'
            }}
          >
            {tab.icon}
            <span>{tab.label}</span>
          </button>
        ))}
      </div>

      {/* ══════════════════════════════════════════════════════════════════════════ */}
      {/* ── TAB 1: BOMs (Listas de Materiales por Código Interno Padre y Género) ── */}
      {/* ══════════════════════════════════════════════════════════════════════════ */}
      {subTab === 'boms' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          {/* Action Bar */}
          <div className="glass" style={{ padding: '1.25rem 1.5rem', borderRadius: '1.25rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flex: 1, minWidth: '320px', flexWrap: 'wrap' }}>
              <div style={{ position: 'relative', width: '100%', maxWidth: '340px' }}>
                <Search size={16} style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: '#64748b' }} />
                <input
                  type="text"
                  placeholder="BUSCAR BOM POR CÓDIGO INTERNO O NOMBRE..."
                  value={bomSearch}
                  onChange={(e) => setBomSearch(e.target.value)}
                  style={{
                    width: '100%',
                    background: 'rgba(0,0,0,0.3)',
                    border: '1px solid rgba(255,255,255,0.08)',
                    borderRadius: '0.875rem',
                    padding: '0.65rem 1rem 0.65rem 2.5rem',
                    color: 'white',
                    fontSize: '0.75rem',
                    outline: 'none',
                    textTransform: 'uppercase'
                  }}
                />
              </div>

              {/* Gender Filter */}
              <select
                value={bomFilterGender}
                onChange={(e) => setBomFilterGender(e.target.value)}
                style={{
                  background: 'rgba(0,0,0,0.3)',
                  border: '1px solid rgba(255,255,255,0.08)',
                  borderRadius: '0.875rem',
                  padding: '0.65rem 0.85rem',
                  color: 'white',
                  fontSize: '0.72rem',
                  outline: 'none',
                  cursor: 'pointer'
                }}
              >
                <option value="ALL">TODOS LOS GÉNEROS</option>
                <option value="CABALLERO">👔 CABALLERO</option>
                <option value="DAMA">👗 DAMA</option>
                <option value="UNISEX">⚥ UNISEX</option>
              </select>

              <span style={{ fontSize: '0.65rem', fontWeight: 800, color: '#0ea5e9', background: 'rgba(14, 165, 233, 0.1)', padding: '0.4rem 0.8rem', borderRadius: '999px', border: '1px solid rgba(14, 165, 233, 0.2)' }}>
                {filteredBoms.length} MODELOS PADRE REGISTRADOS
              </span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <button
                onClick={() => setSelectedBomModal({
                  isNew: true,
                  data: {
                    code: '',
                    description: '',
                    category: 'PANTALONES',
                    gender: 'CABALLERO',
                    sizes: ['28', '30', '32', '34', '36', '38', '40', '42', '44'],
                    materials: [
                      { type: 'TELA', name: 'GABARDINA 8.5 OZ ALGODÓN 100%', code: 'TEL-GAB-01', unit: 'MTS', notes: '' },
                      { type: 'AVÍO', name: 'CIERRE METÁLICO LATÓN #5 BRAGUETA', code: 'AVI-CIE-05', unit: 'PZA', notes: '' },
                      { type: 'AVÍO', name: 'BOTÓN METAL TROQUELADO PANTALÓN', code: 'AVI-BOT-MET', unit: 'PZA', notes: '' }
                    ],
                    size_consumptions: {}
                  }
                })}
                disabled={!canEdit}
                style={{
                  background: '#0284c7',
                  color: 'white',
                  border: 'none',
                  padding: '0.65rem 1.15rem',
                  borderRadius: '0.75rem',
                  fontWeight: 900,
                  fontSize: '0.7rem',
                  cursor: canEdit ? 'pointer' : 'not-allowed',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.4rem',
                  boxShadow: '0 4px 12px rgba(2, 132, 199, 0.4)'
                }}
              >
                <Plus size={16} /> NUEVA BOM MANUAL (MATRIZ)
              </button>

              <label style={{
                background: 'rgba(255,255,255,0.05)',
                color: 'white',
                border: '1px solid rgba(255,255,255,0.1)',
                padding: '0.65rem 1.15rem',
                borderRadius: '0.75rem',
                fontWeight: 800,
                fontSize: '0.7rem',
                cursor: canEdit ? 'pointer' : 'not-allowed',
                display: 'flex',
                alignItems: 'center',
                gap: '0.4rem'
              }}>
                <Upload size={14} /> IMPORTAR EXCEL
                <input type="file" hidden accept=".xlsx,.csv" onChange={handleImportBomsExcel} disabled={!canEdit} />
              </label>

              <button
                onClick={handleExportBoms}
                style={{
                  background: 'rgba(255,255,255,0.05)',
                  color: '#94a3b8',
                  border: '1px solid rgba(255,255,255,0.1)',
                  padding: '0.65rem 1rem',
                  borderRadius: '0.75rem',
                  fontWeight: 800,
                  fontSize: '0.7rem',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.4rem'
                }}
              >
                <Download size={14} /> EXPORTAR MATRIZ
              </button>
            </div>
          </div>

          {/* BOMs Grid Cards - Showing Master SKU Code, Gender & Estimated Average Consumption */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(380px, 1fr))', gap: '1.25rem' }}>
            {filteredBoms.map(bom => {
              const avgMaterials = calculateMaterialAverages(bom)
              const genderColor = bom.gender === 'DAMA' ? '#ec4899' : bom.gender === 'UNISEX' ? '#8b5cf6' : '#0ea5e9'
              const genderBg = bom.gender === 'DAMA' ? 'rgba(236, 72, 153, 0.15)' : bom.gender === 'UNISEX' ? 'rgba(139, 92, 246, 0.15)' : 'rgba(14, 165, 233, 0.15)'
              const genderIcon = bom.gender === 'DAMA' ? '👗' : bom.gender === 'UNISEX' ? '⚥' : '👔'

              return (
                <div
                  key={bom.code}
                  className="glass"
                  style={{
                    borderRadius: '1.25rem',
                    padding: '1.5rem',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '1rem',
                    position: 'relative',
                    border: '1px solid rgba(255,255,255,0.07)',
                    cursor: 'pointer',
                    transition: 'transform 0.15s, border-color 0.15s'
                  }}
                  onClick={() => setSelectedBomModal({ isNew: false, data: { ...bom } })}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                      <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center', flexWrap: 'wrap' }}>
                        {/* Gender Badge */}
                        <span style={{
                          fontSize: '0.62rem',
                          fontWeight: 900,
                          color: genderColor,
                          background: genderBg,
                          padding: '0.2rem 0.55rem',
                          borderRadius: '0.45rem',
                          border: `1px solid ${genderColor}33`,
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '0.25rem'
                        }}>
                          <span>{genderIcon}</span>
                          <span>{bom.gender || 'CABALLERO'}</span>
                        </span>

                        {/* Category Badge */}
                        <span style={{ fontSize: '0.6rem', fontWeight: 900, color: '#94a3b8', background: 'rgba(255,255,255,0.05)', padding: '0.2rem 0.55rem', borderRadius: '0.45rem' }}>
                          {bom.category || 'GENERAL'}
                        </span>

                        {/* Sizes Count Badge */}
                        <span style={{ fontSize: '0.58rem', fontWeight: 800, color: '#38bdf8', background: 'rgba(56, 189, 248, 0.08)', padding: '0.2rem 0.5rem', borderRadius: '0.45rem' }}>
                          {bom.sizes?.length || 0} Tallas
                        </span>
                      </div>

                      {/* Código Interno Padre (SKU) & Descripción */}
                      <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.5rem', marginTop: '0.45rem' }}>
                        <span style={{ fontSize: '0.6rem', fontWeight: 900, color: '#64748b', textTransform: 'uppercase' }}>CÓDIGO PADRE:</span>
                        <h4 style={{ fontSize: '1.25rem', fontWeight: 900, color: 'white', fontFamily: 'monospace', letterSpacing: '0.04em' }}>
                          {bom.code}
                        </h4>
                      </div>
                      <p style={{ fontSize: '0.72rem', color: '#94a3b8', marginTop: '0.1rem' }}>
                        {bom.description}
                      </p>
                    </div>

                    <div style={{ display: 'flex', gap: '0.35rem' }} onClick={(e) => e.stopPropagation()}>
                      <button
                        onClick={() => setSelectedBomModal({ isNew: false, data: { ...bom } })}
                        disabled={!canEdit}
                        title="Editar Matriz de BOM por Talla"
                        style={{
                          background: 'rgba(59, 130, 246, 0.12)',
                          border: '1px solid rgba(59, 130, 246, 0.25)',
                          color: '#60a5fa',
                          borderRadius: '0.5rem',
                          padding: '0.45rem',
                          cursor: canEdit ? 'pointer' : 'not-allowed'
                        }}
                      >
                        <Edit3 size={14} />
                      </button>
                      <button
                        onClick={() => handleDeleteBom(bom.code)}
                        disabled={!canEdit}
                        title="Eliminar BOM"
                        style={{
                          background: 'rgba(239, 68, 68, 0.1)',
                          border: '1px solid rgba(239, 68, 68, 0.2)',
                          color: '#ef4444',
                          borderRadius: '0.5rem',
                          padding: '0.45rem',
                          cursor: canEdit ? 'pointer' : 'not-allowed'
                        }}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>

                  {/* Curva de Tallas Preview */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', overflowX: 'auto', padding: '0.3rem 0' }}>
                    <span style={{ fontSize: '0.55rem', fontWeight: 900, color: '#64748b', textTransform: 'uppercase', flexShrink: 0 }}>CURVA:</span>
                    {bom.sizes?.map((sz, idx) => (
                      <span key={idx} style={{
                        fontSize: '0.6rem',
                        fontWeight: 800,
                        background: 'rgba(255,255,255,0.04)',
                        border: '1px solid rgba(255,255,255,0.08)',
                        padding: '0.1rem 0.4rem',
                        borderRadius: '0.35rem',
                        color: '#cbd5e1'
                      }}>
                        {sz}
                      </span>
                    ))}
                  </div>

                  {/* Summary Materials Breakdown with Exact SKU Codes */}
                  <div style={{ background: 'rgba(0,0,0,0.3)', borderRadius: '0.875rem', padding: '0.75rem 1rem', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.62rem', fontWeight: 900, color: '#64748b', textTransform: 'uppercase' }}>
                      <span>Insumos / Códigos Internos ({bom.materials?.length || 0})</span>
                      <span title="Consumo promedio ponderado de 1 prenda a lo largo de toda la corrida">
                        CONSUMO ESTIMADO (PROMEDIO CORRIDA)
                      </span>
                    </div>

                    {avgMaterials && avgMaterials.length > 0 ? (
                      avgMaterials.map((m, i) => (
                        <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.7rem', borderTop: '1px solid rgba(255,255,255,0.03)', paddingTop: '0.35rem' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            <span style={{
                              fontSize: '0.55rem',
                              fontWeight: 900,
                              padding: '0.1rem 0.35rem',
                              borderRadius: '0.3rem',
                              background: m.type === 'TELA' ? 'rgba(59, 130, 246, 0.15)' : 'rgba(234, 179, 8, 0.15)',
                              color: m.type === 'TELA' ? '#60a5fa' : '#facc15'
                            }}>
                              {m.type}
                            </span>
                            <span style={{ color: '#38bdf8', fontFamily: 'monospace', fontWeight: 900, fontSize: '0.68rem' }}>
                              [{m.code}]
                            </span>
                            <span style={{ color: '#e2e8f0', fontWeight: 600 }}>{m.name}</span>
                          </div>

                          <div style={{ textAlign: 'right', flexShrink: 0 }}>
                            <span style={{ color: '#38bdf8', fontWeight: 900 }}>
                              {m.avg_consumption} {m.unit} <span style={{ fontSize: '0.55rem', color: '#94a3b8', fontWeight: 700 }}>Prom.</span>
                            </span>
                            {m.min_consumption !== m.max_consumption && (
                              <div style={{ fontSize: '0.55rem', color: '#64748b' }}>
                                ({m.min_consumption} - {m.max_consumption} {m.unit})
                              </div>
                            )}
                          </div>
                        </div>
                      ))
                    ) : (
                      <div style={{ fontSize: '0.68rem', color: '#64748b', textAlign: 'center', padding: '0.5rem' }}>
                        Sin insumos configurados. Pulsa para configurar la matriz por talla.
                      </div>
                    )}
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.6rem', color: '#64748b', borderTop: '1px solid rgba(255,255,255,0.04)', paddingTop: '0.5rem' }}>
                    <span>Haz clic para abrir el desglose granular por talla</span>
                    <span style={{ color: '#0ea5e9', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '0.2rem' }}>
                      MATRIZ BOM <ArrowRight size={12} />
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════════ */}
      {/* ── TAB 2: Umbrales Min / Max & ROP Dinámico (Días de Cobertura) ── */}
      {/* ══════════════════════════════════════════════════════════════════════════ */}
      {subTab === 'thresholds' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          {/* ── Global Safety Stock / Days of Coverage Policy Banner ── */}
          <div className="glass" style={{ padding: '1.25rem 1.5rem', borderRadius: '1.25rem', border: '1px solid rgba(56, 189, 248, 0.25)', display: 'flex', flexDirection: 'column', gap: '0.85rem', background: 'linear-gradient(135deg, rgba(15, 23, 42, 0.8), rgba(2, 6, 23, 0.9))' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem' }}>
              <div>
                <span style={{ fontSize: '0.62rem', fontWeight: 900, color: '#38bdf8', letterSpacing: '0.05em' }}>
                  🛡️ POLÍTICA DINÁMICA DE COBERTURA & CUMULATIVE LEAD TIME (CLT)
                </span>
                <h4 style={{ fontSize: '1rem', fontWeight: 900, color: 'white', marginTop: '0.2rem' }}>
                  STOCK DE SEGURIDAD GLOBAL: {globalSafetyDays} DÍAS ({(globalSafetyDays / 30).toFixed(1)} MESES DE CONSUMO PROMEDIO)
                </h4>
                <p style={{ fontSize: '0.68rem', color: '#94a3b8', margin: 0 }}>
                  El motor KANBAN sincroniza Guatemala y México calculando: <b>Punto de Reorden (ROP) = (Consumo Diario × CLT) + Stock de Seguridad</b>.
                </p>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '0.62rem', fontWeight: 800, color: '#64748b' }}>AJUSTE RÁPIDO:</span>
                {[
                  { days: 30, label: '30 DÍAS (1 MES)' },
                  { days: 45, label: '45 DÍAS (1.5 MESES)' },
                  { days: 60, label: '60 DÍAS (2 MESES)' }
                ].map(preset => (
                  <button
                    key={preset.days}
                    onClick={() => handleSaveGlobalSafetyDays(preset.days)}
                    disabled={!canEdit}
                    style={{
                      padding: '0.45rem 0.85rem',
                      borderRadius: '0.6rem',
                      fontSize: '0.68rem',
                      fontWeight: 900,
                      cursor: canEdit ? 'pointer' : 'not-allowed',
                      background: globalSafetyDays === preset.days ? '#0284c7' : 'rgba(255,255,255,0.05)',
                      color: globalSafetyDays === preset.days ? 'white' : '#94a3b8',
                      border: globalSafetyDays === preset.days ? '1px solid #38bdf8' : '1px solid rgba(255,255,255,0.1)'
                    }}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Action Bar */}
          <div className="glass" style={{ padding: '1.25rem 1.5rem', borderRadius: '1.25rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flex: 1, minWidth: '280px' }}>
              <div style={{ position: 'relative', width: '100%', maxWidth: '300px' }}>
                <Search size={16} style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: '#64748b' }} />
                <input
                  type="text"
                  placeholder="FILTRAR POR CÓDIGO O TALLA..."
                  value={threshSearch}
                  onChange={(e) => setThreshSearch(e.target.value)}
                  style={{
                    width: '100%',
                    background: 'rgba(0,0,0,0.3)',
                    border: '1px solid rgba(255,255,255,0.08)',
                    borderRadius: '0.875rem',
                    padding: '0.65rem 1rem 0.65rem 2.5rem',
                    color: 'white',
                    fontSize: '0.75rem',
                    outline: 'none',
                    textTransform: 'uppercase'
                  }}
                />
              </div>

              <select
                value={threshFilterWh}
                onChange={(e) => setThreshFilterWh(e.target.value)}
                style={{
                  background: 'rgba(0,0,0,0.3)',
                  border: '1px solid rgba(255,255,255,0.08)',
                  borderRadius: '0.875rem',
                  padding: '0.65rem 1rem',
                  color: 'white',
                  fontSize: '0.75rem',
                  outline: 'none',
                  cursor: 'pointer'
                }}
              >
                <option value="ALL">TODOS LOS ALMACENES</option>
                {WAREHOUSES.map(wh => <option key={wh} value={wh} style={{ background: '#0b0e14' }}>{wh}</option>)}
              </select>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <label style={{
                background: 'rgba(255,255,255,0.05)',
                color: 'white',
                border: '1px solid rgba(255,255,255,0.1)',
                padding: '0.65rem 1.15rem',
                borderRadius: '0.75rem',
                fontWeight: 800,
                fontSize: '0.7rem',
                cursor: canEdit ? 'pointer' : 'not-allowed',
                display: 'flex',
                alignItems: 'center',
                gap: '0.4rem'
              }}>
                <Upload size={14} /> IMPORTAR MIN/MAX
                <input type="file" hidden accept=".xlsx,.csv" onChange={handleImportThresholdsExcel} disabled={!canEdit} />
              </label>

              <button
                onClick={handleExportThresholds}
                style={{
                  background: 'rgba(255,255,255,0.05)',
                  color: '#94a3b8',
                  border: '1px solid rgba(255,255,255,0.1)',
                  padding: '0.65rem 1rem',
                  borderRadius: '0.75rem',
                  fontWeight: 800,
                  fontSize: '0.7rem',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.4rem'
                }}
              >
                <Download size={14} /> EXPORTAR
              </button>
            </div>
          </div>

          {/* Table with Quick Inline Edit & Dynamic ROP */}
          <div className="glass" style={{ borderRadius: '1.25rem', overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.75rem' }}>
              <thead>
                <tr style={{ background: 'rgba(255,255,255,0.02)', color: '#64748b', textAlign: 'left' }}>
                  <th style={{ padding: '1rem' }}>CÓDIGO & DESCRIPCIÓN</th>
                  <th style={{ padding: '1rem', textAlign: 'center' }}>TALLA</th>
                  <th style={{ padding: '1rem', textAlign: 'center' }}>DESTINO</th>
                  <th style={{ padding: '1rem', textAlign: 'center' }}>COBERTURA (DÍAS)</th>
                  <th style={{ padding: '1rem', textAlign: 'center' }}>PUNTO REORDEN (ROP)</th>
                  <th style={{ padding: '1rem', textAlign: 'center' }}>MÁXIMO (TECHO)</th>
                  <th style={{ padding: '1rem', textAlign: 'right' }}>AUDITORÍA / SIMULADOR</th>
                </tr>
              </thead>
              <tbody>
                {filteredThresholds.map(t => {
                  const isEditing = editingThresh?.id === t.id
                  const sDays = Number(t.safety_stock_days || globalSafetyDays || 30)
                  const mDemand = Number(t.monthly_consumption || (t.min_stock ? t.min_stock * 4 : 120))
                  const cdp = mDemand / 30
                  const isFan = (t.description || t.code || '').toUpperCase().includes('CUADRO') || (t.description || t.code || '').toUpperCase().includes('RAYA') || (t.description || t.code || '').toUpperCase().includes('MEZCLILLA')
                  const cltDays = isFan ? 64 : 29
                  const calculatedRop = Math.round((cdp * cltDays) + (cdp * sDays))

                  return (
                    <tr key={t.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)', color: 'white' }}>
                      <td style={{ padding: '1rem' }}>
                        <div style={{ fontWeight: 800, color: '#f1f5f9' }}>{t.code}</div>
                        <div style={{ fontSize: '0.65rem', color: '#64748b' }}>{t.description || 'Prenda Airman'}</div>
                      </td>
                      <td style={{ padding: '1rem', textAlign: 'center', fontWeight: 900 }}>
                        <span style={{ background: 'rgba(255,255,255,0.05)', padding: '0.2rem 0.5rem', borderRadius: '0.4rem' }}>
                          {t.talla}
                        </span>
                      </td>
                      <td style={{ padding: '1rem', textAlign: 'center' }}>
                        <span style={{ fontWeight: 800, color: '#38bdf8' }}>{t.warehouse}</span>
                      </td>

                      {/* Días de Cobertura Seguridad */}
                      <td style={{ padding: '1rem', textAlign: 'center' }}>
                        {isEditing ? (
                          <input
                            type="number"
                            value={editingThresh.safety_stock_days || globalSafetyDays}
                            onChange={(e) => setEditingThresh({ ...editingThresh, safety_stock_days: e.target.value })}
                            style={{ width: '65px', background: '#020617', border: '1px solid #0284c7', borderRadius: '0.5rem', padding: '0.3rem', color: '#f59e0b', fontWeight: 900, textAlign: 'center' }}
                          />
                        ) : (
                          <span style={{ fontWeight: 900, color: '#f59e0b', fontSize: '0.85rem' }}>{sDays} días</span>
                        )}
                      </td>

                      {/* Punto de Reorden Dinámico (ROP) */}
                      <td style={{ padding: '1rem', textAlign: 'center' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                          <span style={{ fontWeight: 900, color: '#22c55e', fontSize: '0.9rem' }}>
                            {t.min_stock ? Math.max(t.min_stock, calculatedRop) : calculatedRop} pzas
                          </span>
                          <span style={{ fontSize: '0.55rem', color: '#64748b' }}>
                            CLT: {cltDays}d + {sDays}d Cob.
                          </span>
                        </div>
                      </td>

                      {/* Stock Maximo */}
                      <td style={{ padding: '1rem', textAlign: 'center' }}>
                        {isEditing ? (
                          <input
                            type="number"
                            value={editingThresh.max_stock}
                            onChange={(e) => setEditingThresh({ ...editingThresh, max_stock: e.target.value })}
                            style={{ width: '70px', background: '#020617', border: '1px solid #0284c7', borderRadius: '0.5rem', padding: '0.3rem', color: '#22c55e', fontWeight: 900, textAlign: 'center' }}
                          />
                        ) : (
                          <span style={{ fontWeight: 900, color: '#22c55e', fontSize: '0.85rem' }}>{t.max_stock}</span>
                        )}
                      </td>

                      {/* Actions */}
                      <td style={{ padding: '1rem', textAlign: 'right' }}>
                        {isEditing ? (
                          <div style={{ display: 'flex', gap: '0.4rem', justifyContent: 'flex-end' }}>
                            <button
                              onClick={() => handleSaveThresholdInline(editingThresh)}
                              style={{ background: '#16a34a', color: 'white', border: 'none', padding: '0.35rem 0.75rem', borderRadius: '0.5rem', fontWeight: 900, fontSize: '0.65rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.2rem' }}
                            >
                              <Check size={12} /> GUARDAR
                            </button>
                            <button
                              onClick={() => setEditingThresh(null)}
                              style={{ background: 'rgba(255,255,255,0.05)', color: '#94a3b8', border: 'none', padding: '0.35rem 0.6rem', borderRadius: '0.5rem', fontWeight: 800, fontSize: '0.65rem', cursor: 'pointer' }}
                            >
                              CANCELAR
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => setEditingThresh({ ...t })}
                            disabled={!canEdit}
                            style={{
                              background: 'rgba(14, 165, 233, 0.1)',
                              border: '1px solid rgba(14, 165, 233, 0.25)',
                              color: '#38bdf8',
                              padding: '0.35rem 0.75rem',
                              borderRadius: '0.5rem',
                              fontWeight: 800,
                              fontSize: '0.65rem',
                              cursor: canEdit ? 'pointer' : 'not-allowed',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '0.3rem'
                            }}
                          >
                            <Edit3 size={12} /> EDITAR RÁPIDO
                          </button>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════════ */}
      {/* ── TAB 3: Catálogo de Proveedores (Maquileros, Telas y Avíos) ── */}
      {/* ══════════════════════════════════════════════════════════════════════════ */}
      {subTab === 'suppliers' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          {/* Top Filter and Action Bar */}
          <div className="glass" style={{ padding: '1.25rem 1.5rem', borderRadius: '1.25rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
            <div>
              <h3 style={{ fontSize: '1rem', fontWeight: 900, color: 'white', textTransform: 'uppercase' }}>
                DIRECTORIO DE PROVEEDORES (CONFECCIÓN, TELAS Y AVÍOS)
              </h3>
              <p style={{ fontSize: '0.7rem', color: '#94a3b8', marginTop: '0.2rem' }}>
                GESTIONA MAQUILEROS Y PROVEEDORES DE MATERIA PRIMA CON TIEMPOS DE PRODUCCIÓN, CONTACTO Y LOGÍSTICA.
              </p>
            </div>

            <button
              onClick={() => setSupplierModal({
                isNew: true,
                data: {
                  type: 'MAQUILERO',
                  name: '',
                  contact: '',
                  phone: '',
                  email: '',
                  address: '',
                  specialty: '',
                  weekly_capacity: 3000,
                  daily_capacity: 600,
                  lead_time_days: 7,
                  logistics_days: 1,
                  status: 'ACTIVO',
                  notes: ''
                }
              })}
              disabled={!canEdit}
              style={{
                background: '#0284c7',
                color: 'white',
                border: 'none',
                padding: '0.75rem 1.25rem',
                borderRadius: '0.75rem',
                fontWeight: 900,
                fontSize: '0.75rem',
                cursor: canEdit ? 'pointer' : 'not-allowed',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                boxShadow: '0 4px 14px rgba(2, 132, 199, 0.4)'
              }}
            >
              <Plus size={16} /> + REGISTRAR NUEVO PROVEEDOR
            </button>
          </div>

          {/* Search & Category Filter Chips */}
          <div className="glass" style={{ padding: '0.85rem 1.25rem', borderRadius: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '0.65rem', fontWeight: 900, color: '#64748b', marginRight: '0.25rem' }}>FILTRAR POR TIPO:</span>
              {[
                { id: 'ALL', label: `TODOS (${suppliers.length})` },
                { id: 'MAQUILERO', label: `👔 MAQUILEROS (${suppliers.filter(s => (s.type || 'MAQUILERO') === 'MAQUILERO').length})` },
                { id: 'TELA', label: `🧵 PROV. TELAS (${suppliers.filter(s => s.type === 'TELA').length})` },
                { id: 'AVÍO', label: `🔘 PROV. AVÍOS (${suppliers.filter(s => s.type === 'AVÍO').length})` }
              ].map(f => (
                <button
                  key={f.id}
                  onClick={() => setSupplierFilterType(f.id)}
                  style={{
                    padding: '0.4rem 0.85rem',
                    borderRadius: '0.5rem',
                    fontSize: '0.68rem',
                    fontWeight: 900,
                    border: 'none',
                    cursor: 'pointer',
                    background: supplierFilterType === f.id ? '#0284c7' : 'rgba(255,255,255,0.05)',
                    color: supplierFilterType === f.id ? 'white' : '#94a3b8',
                    transition: 'all 0.15s'
                  }}
                >
                  {f.label}
                </button>
              ))}
            </div>

            <div style={{ position: 'relative', width: '260px' }}>
              <Search size={14} style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: '#64748b' }} />
              <input
                type="text"
                placeholder="BUSCAR PROVEEDOR, CONTACTO O INSUMO..."
                value={supplierSearch}
                onChange={(e) => setSupplierSearch(e.target.value)}
                style={{
                  width: '100%',
                  background: 'rgba(0,0,0,0.3)',
                  border: '1px solid rgba(255,255,255,0.08)',
                  borderRadius: '0.65rem',
                  padding: '0.45rem 0.75rem 0.45rem 2.2rem',
                  color: 'white',
                  fontSize: '0.7rem',
                  outline: 'none',
                  textTransform: 'uppercase'
                }}
              />
            </div>
          </div>

          {/* Suppliers Cards Grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(350px, 1fr))', gap: '1.25rem' }}>
            {filteredSuppliers.map(s => {
              const isMaquila = !s.type || s.type === 'MAQUILERO'
              const isFabric = s.type === 'TELA'
              const isTrim = s.type === 'AVÍO'

              const badgeColor = isFabric ? '#38bdf8' : isTrim ? '#facc15' : '#818cf8'
              const badgeBg = isFabric ? 'rgba(56, 189, 248, 0.15)' : isTrim ? 'rgba(250, 204, 21, 0.15)' : 'rgba(129, 140, 248, 0.15)'
              const badgeBorder = isFabric ? 'rgba(56, 189, 248, 0.3)' : isTrim ? 'rgba(250, 204, 21, 0.3)' : 'rgba(129, 140, 248, 0.3)'
              const badgeLabel = isFabric ? '🧵 PROVEEDOR DE TELAS' : isTrim ? '🔘 PROVEEDOR DE AVÍOS' : '👔 MAQUILERO (CONFECCIÓN)'

              return (
                <div key={s.id} className="glass" style={{ borderRadius: '1.25rem', padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem', border: '1px solid rgba(255,255,255,0.06)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                      <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center', flexWrap: 'wrap' }}>
                        <span style={{ fontSize: '0.62rem', fontWeight: 900, padding: '0.2rem 0.55rem', borderRadius: '0.4rem', background: badgeBg, color: badgeColor, border: `1px solid ${badgeBorder}` }}>
                          {badgeLabel}
                        </span>
                        <span style={{ fontSize: '0.6rem', fontWeight: 900, padding: '0.2rem 0.5rem', borderRadius: '0.4rem', background: s.status === 'ACTIVO' ? 'rgba(34, 197, 94, 0.15)' : 'rgba(239, 68, 68, 0.15)', color: s.status === 'ACTIVO' ? '#22c55e' : '#ef4444' }}>
                          {s.status}
                        </span>
                      </div>

                      <h4 style={{ fontSize: '1rem', fontWeight: 900, color: 'white', marginTop: '0.5rem' }}>
                        {s.name}
                      </h4>
                      <p style={{ fontSize: '0.7rem', color: '#94a3b8', fontWeight: 700, marginTop: '0.15rem' }}>
                        {s.specialty || (isFabric ? 'Suministro de Telas' : isTrim ? 'Suministro de Avíos' : 'Confección General')}
                      </p>
                    </div>

                    <div style={{ display: 'flex', gap: '0.35rem' }}>
                      <button
                        onClick={() => setSupplierModal({ isNew: false, data: { ...s } })}
                        disabled={!canEdit}
                        style={{ background: 'rgba(59, 130, 246, 0.1)', border: '1px solid rgba(59, 130, 246, 0.2)', color: '#60a5fa', padding: '0.4rem', borderRadius: '0.5rem', cursor: canEdit ? 'pointer' : 'not-allowed' }}
                      >
                        <Edit3 size={14} />
                      </button>
                      <button
                        onClick={() => handleDeleteSupplier(s.id, s.name)}
                        disabled={!canEdit}
                        style={{ background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.2)', color: '#ef4444', padding: '0.4rem', borderRadius: '0.5rem', cursor: canEdit ? 'pointer' : 'not-allowed' }}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>

                  {/* Capacities & Lead Times */}
                  {isFabric ? (
                    <div style={{ background: 'rgba(0,0,0,0.3)', borderRadius: '0.75rem', padding: '0.85rem', display: 'flex', flexDirection: 'column', gap: '0.6rem', fontSize: '0.7rem' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(255,255,255,0.06)', paddingBottom: '0.4rem' }}>
                        <span style={{ color: '#38bdf8', fontWeight: 900, fontSize: '0.65rem' }}>
                          {s.origin_country === 'GUATEMALA' ? '🇬🇹 MOLINO GUATEMALA' : '🇲🇽 PROVEEDOR NACIONAL'}
                        </span>
                        <span style={{ color: '#cbd5e1', fontSize: '0.62rem' }}>
                          Telares: <strong>{s.mill_loom_monthly_capacity ? `${s.mill_loom_monthly_capacity.toLocaleString()} mts/mes` : 'N/A'}</strong>
                        </span>
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.5rem' }}>
                        <div>
                          <span style={{ color: '#22c55e', fontWeight: 800, fontSize: '0.58rem', display: 'block' }}>LISOS (CRUDO)</span>
                          <span style={{ color: '#22c55e', fontWeight: 900 }}>{s.lead_time_liso_days || 18} días</span>
                        </div>
                        <div>
                          <span style={{ color: '#f59e0b', fontWeight: 800, fontSize: '0.58rem', display: 'block' }}>FANTASÍAS (MTO)</span>
                          <span style={{ color: '#f59e0b', fontWeight: 900 }}>{s.lead_time_fantasia_days || 55} días</span>
                        </div>
                        <div>
                          <span style={{ color: '#c084fc', fontWeight: 800, fontSize: '0.58rem', display: 'block' }}>SALIDA TEJIDO</span>
                          <span style={{ color: '#c084fc', fontWeight: 900 }}>{s.lead_time_post_weaving_days || 14} días</span>
                        </div>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.62rem', color: '#94a3b8', borderTop: '1px solid rgba(255,255,255,0.04)', paddingTop: '0.35rem' }}>
                        <span>Tránsito Flete: <strong style={{ color: '#38bdf8' }}>{s.logistics_days || 1}d</strong></span>
                        <span>Capacidad Semanal: <strong style={{ color: '#f1f5f9' }}>{s.weekly_capacity?.toLocaleString() || 'N/A'} mts</strong></span>
                      </div>
                    </div>
                  ) : (
                    <div style={{ background: 'rgba(0,0,0,0.3)', borderRadius: '0.75rem', padding: '0.85rem', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', fontSize: '0.7rem' }}>
                      <div>
                        <span style={{ color: '#64748b', fontWeight: 800, fontSize: '0.58rem', display: 'block' }}>TIEMPO PRODUCCIÓN / CONFECCIÓN</span>
                        <span style={{ color: '#f59e0b', fontWeight: 900 }}>{s.lead_time_days || 7} días hábiles</span>
                      </div>
                      <div>
                        <span style={{ color: '#64748b', fontWeight: 800, fontSize: '0.58rem', display: 'block' }}>TIEMPO TRASLADO LOGÍSTICO</span>
                        <span style={{ color: '#38bdf8', fontWeight: 900 }}>{s.logistics_days || 1} días</span>
                      </div>
                      <div>
                        <span style={{ color: '#64748b', fontWeight: 800, fontSize: '0.58rem', display: 'block' }}>LEAD TIME TOTAL</span>
                        <span style={{ color: '#22c55e', fontWeight: 900 }}>{(s.lead_time_days || 7) + (s.logistics_days || 1)} días</span>
                      </div>
                      <div>
                        <span style={{ color: '#64748b', fontWeight: 800, fontSize: '0.58rem', display: 'block' }}>CAPACIDAD SEMANAL</span>
                        <span style={{ color: '#f1f5f9', fontWeight: 900 }}>{s.weekly_capacity?.toLocaleString() || 'N/A'} pzas</span>
                      </div>
                    </div>
                  )}

                  {/* Contact Info */}
                  <div style={{ fontSize: '0.68rem', color: '#94a3b8', display: 'flex', flexDirection: 'column', gap: '0.2rem', background: 'rgba(255,255,255,0.02)', padding: '0.6rem 0.8rem', borderRadius: '0.5rem' }}>
                    {s.contact && <div><strong style={{ color: '#e2e8f0' }}>Contacto:</strong> {s.contact}</div>}
                    {s.phone && <div><strong style={{ color: '#e2e8f0' }}>Teléfono:</strong> <span style={{ color: '#38bdf8', fontFamily: 'monospace' }}>{s.phone}</span></div>}
                    {s.email && <div><strong style={{ color: '#e2e8f0' }}>Correo:</strong> {s.email}</div>}
                    {s.address && <div><strong style={{ color: '#e2e8f0' }}>Dirección:</strong> {s.address}</div>}
                  </div>
                </div>
              )
            })}

            {filteredSuppliers.length === 0 && (
              <div style={{ gridColumn: '1 / -1', padding: '3rem', textAlign: 'center', color: '#64748b' }}>
                <p style={{ fontWeight: 800, textTransform: 'uppercase' }}>NO SE ENCONTRARON PROVEEDORES EN ESTA CATEGORÍA</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════════ */}
      {/* ── TAB 4: Ruteo Multidireccional en Tiempo Real ── */}
      {/* ══════════════════════════════════════════════════════════════════════════ */}
      {subTab === 'routing' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          <div className="glass" style={{ padding: '1.5rem', borderRadius: '1.25rem' }}>
            <h3 style={{ fontSize: '1rem', fontWeight: 900, color: 'white', textTransform: 'uppercase' }}>
              MATRIZ DE RUTEO Y REGLAS DE SURTIMIENTO COMBINADO
            </h3>
            <p style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: '0.25rem' }}>
              Define orígenes simultáneos para cada sucursal o CEDIS de destino (ejemplo: CDMX se surte simultáneamente de PLANTA y MTY).
            </p>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(350px, 1fr))', gap: '1.5rem' }}>
            {['MEXICO', 'MONTERREY', 'MATRIZ'].map(dest => {
              const rule = routingRules.find(r => r.destination === dest) || {
                destination: dest,
                primary_origin: 'PLANTA',
                primary_percentage: 100,
                secondary_origin: 'NINGUNO',
                secondary_percentage: 0,
                mode: 'DIRECTO',
                notes: ''
              }

              return (
                <div key={dest} className="glass" style={{ borderRadius: '1.25rem', padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(255,255,255,0.06)', paddingBottom: '0.75rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <Truck size={18} style={{ color: '#0ea5e9' }} />
                      <h4 style={{ fontSize: '1rem', fontWeight: 900, color: 'white' }}>DESTINO: {dest}</h4>
                    </div>
                    <span style={{ fontSize: '0.65rem', fontWeight: 900, color: '#38bdf8', background: 'rgba(14,165,233,0.1)', padding: '0.2rem 0.6rem', borderRadius: '0.4rem' }}>
                      {rule.mode || 'DIRECTO'}
                    </span>
                  </div>

                  {/* Primary Origin */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                    <label style={{ fontSize: '0.65rem', fontWeight: 800, color: '#94a3b8' }}>ORIGEN PRIMARIO</label>
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      <select
                        value={rule.primary_origin}
                        onChange={(e) => handleSaveRouting(dest, { ...rule, primary_origin: e.target.value })}
                        disabled={!canEdit || savingRouting}
                        style={{ flex: 2, background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '0.6rem', padding: '0.5rem', color: 'white', fontSize: '0.75rem' }}
                      >
                        {WAREHOUSES.map(wh => <option key={wh} value={wh} style={{ background: '#0b0e14' }}>{wh}</option>)}
                      </select>
                      <input
                        type="number"
                        min="0"
                        max="100"
                        value={rule.primary_percentage}
                        onChange={(e) => {
                          const val = parseInt(e.target.value) || 0
                          handleSaveRouting(dest, { ...rule, primary_percentage: val, secondary_percentage: Math.max(0, 100 - val) })
                        }}
                        disabled={!canEdit || savingRouting}
                        style={{ flex: 1, background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '0.6rem', padding: '0.5rem', color: '#38bdf8', fontWeight: 900, textAlign: 'center', fontSize: '0.75rem' }}
                      />
                      <span style={{ display: 'flex', alignItems: 'center', fontSize: '0.75rem', fontWeight: 800, color: '#64748b' }}>%</span>
                    </div>
                  </div>

                  {/* Secondary Origin */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                    <label style={{ fontSize: '0.65rem', fontWeight: 800, color: '#94a3b8' }}>ORIGEN SECUNDARIO / ALTERNO (COMBINADO)</label>
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      <select
                        value={rule.secondary_origin}
                        onChange={(e) => handleSaveRouting(dest, { ...rule, secondary_origin: e.target.value, mode: e.target.value === 'NINGUNO' ? 'DIRECTO' : 'COMBINADO' })}
                        disabled={!canEdit || savingRouting}
                        style={{ flex: 2, background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '0.6rem', padding: '0.5rem', color: 'white', fontSize: '0.75rem' }}
                      >
                        <option value="NINGUNO" style={{ background: '#0b0e14' }}>NINGUNO (SOLO PRIMARIO)</option>
                        {WAREHOUSES.filter(wh => wh !== dest).map(wh => <option key={wh} value={wh} style={{ background: '#0b0e14' }}>{wh}</option>)}
                      </select>
                      <input
                        type="number"
                        min="0"
                        max="100"
                        value={rule.secondary_percentage}
                        onChange={(e) => {
                          const val = parseInt(e.target.value) || 0
                          handleSaveRouting(dest, { ...rule, secondary_percentage: val, primary_percentage: Math.max(0, 100 - val), mode: val > 0 ? 'COMBINADO' : 'DIRECTO' })
                        }}
                        disabled={!canEdit || savingRouting || rule.secondary_origin === 'NINGUNO'}
                        style={{ flex: 1, background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '0.6rem', padding: '0.5rem', color: '#f59e0b', fontWeight: 900, textAlign: 'center', fontSize: '0.75rem' }}
                      />
                      <span style={{ display: 'flex', alignItems: 'center', fontSize: '0.75rem', fontWeight: 800, color: '#64748b' }}>%</span>
                    </div>
                  </div>

                  {/* Summary Bar */}
                  <div style={{ marginTop: '0.5rem' }}>
                    <div style={{ height: '8px', background: 'rgba(255,255,255,0.05)', borderRadius: '4px', overflow: 'hidden', display: 'flex' }}>
                      <div style={{ width: `${rule.primary_percentage}%`, background: '#0284c7', transition: 'width 0.3s' }} title={`Primario: ${rule.primary_origin} (${rule.primary_percentage}%)`} />
                      <div style={{ width: `${rule.secondary_percentage}%`, background: '#f59e0b', transition: 'width 0.3s' }} title={`Secundario: ${rule.secondary_origin} (${rule.secondary_percentage}%)`} />
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.6rem', color: '#64748b', marginTop: '0.35rem', fontWeight: 700 }}>
                      <span>{rule.primary_origin} ({rule.primary_percentage}%)</span>
                      <span>{rule.secondary_origin !== 'NINGUNO' ? `${rule.secondary_origin} (${rule.secondary_percentage}%)` : 'SIN REPARTO'}</span>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════════ */}
      {/* ── TAB 5: Sincronización Semanal de Inventario ERP (Mapeo Estricto) ── */}
      {/* ══════════════════════════════════════════════════════════════════════════ */}
      {subTab === 'erp_sync' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          {/* 1. Prominent Last Sync Status Banner */}
          <div className="glass" style={{
            padding: '1.5rem 1.75rem',
            borderRadius: '1.25rem',
            border: '1px solid rgba(14, 165, 233, 0.3)',
            background: 'linear-gradient(135deg, rgba(14, 165, 233, 0.08) 0%, rgba(2, 6, 23, 0.6) 100%)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '1.25rem'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
              <div style={{
                width: '52px',
                height: '52px',
                borderRadius: '1rem',
                background: 'rgba(14, 165, 233, 0.2)',
                border: '1px solid rgba(14, 165, 233, 0.4)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#38bdf8'
              }}>
                <Clock size={26} />
              </div>

              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
                  <span style={{
                    fontSize: '0.65rem',
                    fontWeight: 900,
                    color: '#22c55e',
                    background: 'rgba(34, 197, 94, 0.15)',
                    padding: '0.2rem 0.6rem',
                    borderRadius: '0.4rem',
                    border: '1px solid rgba(34, 197, 94, 0.3)',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.3rem'
                  }}>
                    <CheckCircle size={12} /> DATOS ERP EN LÍNEA
                  </span>
                  <span style={{ fontSize: '0.65rem', color: '#64748b', fontWeight: 800 }}>•</span>
                  <span style={{ fontSize: '0.7rem', color: '#94a3b8', fontWeight: 700 }}>
                    Archivo: <strong style={{ color: '#f1f5f9' }}>{lastSyncInfo?.filename || 'VENTAS_POR_SEMANA_ERP.xlsx'}</strong>
                  </span>
                </div>

                <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.6rem', marginTop: '0.35rem' }}>
                  <span style={{ fontSize: '0.68rem', fontWeight: 900, color: '#64748b', textTransform: 'uppercase' }}>
                    ÚLTIMA SINCRONIZACIÓN:
                  </span>
                  <h3 style={{ fontSize: '1.25rem', fontWeight: 900, color: 'white', letterSpacing: '0.02em' }}>
                    {lastSyncInfo?.date ? new Date(lastSyncInfo.date).toLocaleString('es-MX', { dateStyle: 'full', timeStyle: 'medium' }) : '21 de Agosto de 2026, 21:55:00'}
                  </h3>
                </div>
              </div>
            </div>

            {/* Quick Metrics & Download Template Button */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
              <div style={{ background: 'rgba(0,0,0,0.35)', padding: '0.6rem 1rem', borderRadius: '0.75rem', border: '1px solid rgba(255,255,255,0.06)', textAlign: 'center' }}>
                <span style={{ fontSize: '0.58rem', fontWeight: 800, color: '#64748b', display: 'block' }}>TOTAL SKUs</span>
                <span style={{ fontSize: '1.05rem', fontWeight: 900, color: '#38bdf8' }}>
                  {erpGroupedMatrix.length || lastSyncInfo?.record_count || 0}
                </span>
              </div>

              <div style={{ background: 'rgba(0,0,0,0.35)', padding: '0.6rem 1rem', borderRadius: '0.75rem', border: '1px solid rgba(255,255,255,0.06)', textAlign: 'center' }}>
                <span style={{ fontSize: '0.58rem', fontWeight: 800, color: '#64748b', display: 'block' }}>PIEZAS TOTALES</span>
                <span style={{ fontSize: '1.05rem', fontWeight: 900, color: '#22c55e' }}>
                  {erpGroupedMatrix.reduce((acc, curr) => acc + (curr.totalStock || 0), 0).toLocaleString()}
                </span>
              </div>

              <button
                onClick={handleDownloadErpTemplate}
                style={{
                  background: 'rgba(255,255,255,0.05)',
                  color: '#38bdf8',
                  border: '1px solid rgba(56, 189, 248, 0.3)',
                  padding: '0.75rem 1.25rem',
                  borderRadius: '0.75rem',
                  fontWeight: 900,
                  fontSize: '0.72rem',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.4rem',
                  transition: 'all 0.2s'
                }}
                title="Descargar plantilla oficial con encabezados exactos del ERP"
              >
                <Download size={15} /> DESCARGAR PLANTILLA ERP (.XLSX)
              </button>
            </div>
          </div>

          {/* 2. Drag and drop sync area with strict mandatory column chips */}
          <div
            onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
            onDragLeave={() => setDragActive(false)}
            onDrop={(e) => {
              e.preventDefault()
              setDragActive(false)
              if (e.dataTransfer.files && e.dataTransfer.files[0]) {
                handleProcessErpFile(e.dataTransfer.files[0])
              }
            }}
            className="glass"
            style={{
              padding: '2rem 2.5rem',
              borderRadius: '1.5rem',
              textAlign: 'center',
              border: dragActive ? '2px dashed #0ea5e9' : '2px dashed rgba(255,255,255,0.12)',
              background: dragActive ? 'rgba(14, 165, 233, 0.08)' : 'rgba(15, 23, 42, 0.4)',
              transition: 'all 0.2s'
            }}
          >
            <div style={{ width: '56px', height: '56px', borderRadius: '50%', background: 'rgba(14, 165, 233, 0.15)', color: '#0ea5e9', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 0.75rem' }}>
              <FileSpreadsheet size={28} />
            </div>
            <h3 style={{ fontSize: '1.15rem', fontWeight: 900, color: 'white', textTransform: 'uppercase' }}>
              ARRASTRA EL REPORTE SEMANAL DEL ERP
            </h3>
            <p style={{ fontSize: '0.75rem', color: '#94a3b8', maxWidth: '640px', margin: '0.35rem auto 1rem' }}>
              El motor KANBAN mapeará automáticamente las existencias individuales por almacén para detonar Hojas de Surtido y Órdenes de Producción exactas.
            </p>

            {/* Mandatory Columns Guide */}
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap', maxWidth: '850px', margin: '0 auto 1.5rem' }}>
              <span style={{ fontSize: '0.62rem', fontWeight: 900, color: '#64748b' }}>COLUMNAS OBLIGATORIAS:</span>
              {[
                { name: 'CODIGO', color: '#38bdf8' },
                { name: 'DESCRIPCION', color: '#94a3b8' },
                { name: 'TALLA', color: '#38bdf8' },
                { name: 'MATRIZ', color: '#e2e8f0' },
                { name: 'PLANTA', color: '#60a5fa' },
                { name: 'MEXICO (CDMX)', color: '#22c55e' },
                { name: 'MONTERREY (MTY)', color: '#f59e0b' },
                { name: 'COSTO', color: '#a855f7' },
                { name: 'CATEGORIA', color: '#94a3b8' },
                { name: 'SUBCATEGORIA', color: '#94a3b8' },
              ].map(c => (
                <span key={c.name} style={{
                  fontSize: '0.6rem',
                  fontWeight: 900,
                  fontFamily: 'monospace',
                  background: 'rgba(0,0,0,0.4)',
                  border: '1px solid rgba(255,255,255,0.08)',
                  padding: '0.2rem 0.5rem',
                  borderRadius: '0.35rem',
                  color: c.color
                }}>
                  {c.name}
                </span>
              ))}
            </div>

            <label style={{
              background: '#0284c7',
              color: 'white',
              padding: '0.75rem 1.75rem',
              borderRadius: '0.875rem',
              fontWeight: 900,
              fontSize: '0.75rem',
              cursor: canEdit ? 'pointer' : 'not-allowed',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.5rem',
              boxShadow: '0 4px 14px rgba(2, 132, 199, 0.4)'
            }}>
              <Upload size={16} /> CARGAR ARCHIVO EXCEL DEL ERP
              <input type="file" hidden accept=".xlsx,.xls,.csv" onChange={(e) => handleProcessErpFile(e.target.files?.[0])} disabled={!canEdit} />
            </label>
          </div>

          {/* 3. Consolidated Multi-Warehouse Inventory Matrix Table */}
          <div className="glass" style={{ borderRadius: '1.25rem', padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
              <div>
                <h4 style={{ fontSize: '0.95rem', fontWeight: 900, color: 'white', textTransform: 'uppercase' }}>
                  MATRIZ DE INVENTARIO CONSOLIDADO POR ALMACÉN (ERP)
                </h4>
                <p style={{ fontSize: '0.65rem', color: '#64748b', marginTop: '0.1rem' }}>
                  {filteredErpMatrix.length} MODELOS / TALLAS MAPEADOS • STOCK EN TIEMPO REAL PARA DISPARO DE REABASTECIMIENTO Y PRODUCCIÓN
                </p>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
                <div style={{ position: 'relative', width: '260px' }}>
                  <Search size={14} style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: '#64748b' }} />
                  <input
                    type="text"
                    placeholder="FILTRAR POR CÓDIGO O PRENDA..."
                    value={erpSearch}
                    onChange={(e) => setErpSearch(e.target.value)}
                    style={{
                      width: '100%',
                      background: 'rgba(0,0,0,0.3)',
                      border: '1px solid rgba(255,255,255,0.08)',
                      borderRadius: '0.75rem',
                      padding: '0.5rem 0.75rem 0.5rem 2.2rem',
                      color: 'white',
                      fontSize: '0.7rem',
                      outline: 'none',
                      textTransform: 'uppercase'
                    }}
                  />
                </div>

                <select
                  value={erpCategoryFilter}
                  onChange={(e) => setErpCategoryFilter(e.target.value)}
                  style={{
                    background: 'rgba(0,0,0,0.3)',
                    border: '1px solid rgba(255,255,255,0.08)',
                    borderRadius: '0.75rem',
                    padding: '0.5rem 0.85rem',
                    color: 'white',
                    fontSize: '0.7rem',
                    outline: 'none',
                    cursor: 'pointer'
                  }}
                >
                  <option value="ALL">TODAS LAS CATEGORÍAS</option>
                  {uniqueCategories.map(cat => <option key={cat} value={cat} style={{ background: '#0b0e14' }}>{cat}</option>)}
                </select>
              </div>
            </div>

            {/* Matrix Table with 4 Warehouse Stock Columns */}
            <div style={{ maxHeight: '460px', overflowY: 'auto', borderRadius: '0.875rem', border: '1px solid rgba(255,255,255,0.06)' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.72rem' }}>
                <thead>
                  <tr style={{ background: '#0b1120', color: '#64748b', textAlign: 'left', position: 'sticky', top: 0, zIndex: 10, borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                    <th style={{ padding: '0.85rem 1rem' }}>CÓDIGO INTERNO (SKU)</th>
                    <th style={{ padding: '0.85rem 1rem' }}>DESCRIPCIÓN DE PRENDA</th>
                    <th style={{ padding: '0.85rem 0.5rem', textAlign: 'center' }}>TALLA</th>
                    <th style={{ padding: '0.85rem 0.75rem', textAlign: 'center' }}>CATEGORÍA</th>
                    <th style={{ padding: '0.85rem 0.75rem', textAlign: 'center' }}>COSTO</th>
                    <th style={{ padding: '0.85rem 0.75rem', textAlign: 'center', color: '#e2e8f0' }}>MATRIZ</th>
                    <th style={{ padding: '0.85rem 0.75rem', textAlign: 'center', color: '#60a5fa' }}>PLANTA</th>
                    <th style={{ padding: '0.85rem 0.75rem', textAlign: 'center', color: '#22c55e' }}>MEXICO (CDMX)</th>
                    <th style={{ padding: '0.85rem 0.75rem', textAlign: 'center', color: '#f59e0b' }}>MONTERREY (MTY)</th>
                    <th style={{ padding: '0.85rem 1rem', textAlign: 'center', color: '#38bdf8' }}>TOTAL ERP</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredErpMatrix.map((item, idx) => (
                    <tr key={idx} style={{ borderBottom: '1px solid rgba(255,255,255,0.02)', color: '#e2e8f0' }}>
                      <td style={{ padding: '0.75rem 1rem', fontWeight: 900, color: '#38bdf8', fontFamily: 'monospace', fontSize: '0.78rem' }}>
                        {item.code}
                      </td>
                      <td style={{ padding: '0.75rem 1rem' }}>
                        <div style={{ fontWeight: 700, color: 'white' }}>{item.description || 'Prenda Airman'}</div>
                        {item.subcategory && <span style={{ fontSize: '0.6rem', color: '#64748b' }}>{item.subcategory}</span>}
                      </td>
                      <td style={{ padding: '0.75rem 0.5rem', textAlign: 'center' }}>
                        <span style={{ background: 'rgba(255,255,255,0.05)', color: '#38bdf8', padding: '0.2rem 0.5rem', borderRadius: '0.4rem', fontWeight: 900, border: '1px solid rgba(56,189,248,0.2)' }}>
                          {item.talla}
                        </span>
                      </td>
                      <td style={{ padding: '0.75rem 0.75rem', textAlign: 'center' }}>
                        <span style={{ fontSize: '0.62rem', fontWeight: 800, color: '#94a3b8', background: 'rgba(255,255,255,0.03)', padding: '0.2rem 0.5rem', borderRadius: '0.4rem' }}>
                          {item.category}
                        </span>
                      </td>
                      <td style={{ padding: '0.75rem 0.75rem', textAlign: 'center', fontFamily: 'monospace', fontWeight: 800, color: '#a855f7' }}>
                        ${item.cost ? Number(item.cost).toFixed(2) : '0.00'}
                      </td>

                      {/* Stock Matriz */}
                      <td style={{ padding: '0.75rem 0.75rem', textAlign: 'center', fontWeight: 800, color: item.stocks.MATRIZ > 0 ? '#e2e8f0' : '#475569' }}>
                        {item.stocks.MATRIZ || 0}
                      </td>

                      {/* Stock Planta */}
                      <td style={{ padding: '0.75rem 0.75rem', textAlign: 'center', fontWeight: 900, color: item.stocks.PLANTA > 0 ? '#60a5fa' : '#475569' }}>
                        {item.stocks.PLANTA || 0}
                      </td>

                      {/* Stock Mexico (CDMX) */}
                      <td style={{ padding: '0.75rem 0.75rem', textAlign: 'center', fontWeight: 900, color: item.stocks.MEXICO > 0 ? '#22c55e' : '#ef4444' }}>
                        {item.stocks.MEXICO || 0}
                      </td>

                      {/* Stock Monterrey (MTY) */}
                      <td style={{ padding: '0.75rem 0.75rem', textAlign: 'center', fontWeight: 900, color: item.stocks.MONTERREY > 0 ? '#f59e0b' : '#ef4444' }}>
                        {item.stocks.MONTERREY || 0}
                      </td>

                      {/* Total ERP */}
                      <td style={{ padding: '0.75rem 1rem', textAlign: 'center' }}>
                        <span style={{
                          background: item.totalStock > 0 ? 'rgba(34, 197, 94, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                          color: item.totalStock > 0 ? '#22c55e' : '#ef4444',
                          padding: '0.25rem 0.65rem',
                          borderRadius: '0.5rem',
                          fontWeight: 900,
                          fontSize: '0.75rem',
                          border: item.totalStock > 0 ? '1px solid rgba(34, 197, 94, 0.3)' : '1px solid rgba(239, 68, 68, 0.3)'
                        }}>
                          {item.totalStock.toLocaleString()} pzas
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>

                {/* Footer Totals */}
                <tfoot>
                  <tr style={{ background: '#0b1120', borderTop: '2px solid rgba(14, 165, 233, 0.4)', position: 'sticky', bottom: 0, zIndex: 10, fontWeight: 900 }}>
                    <td colSpan={5} style={{ padding: '0.85rem 1rem', color: '#38bdf8', textTransform: 'uppercase' }}>
                      TOTALES GENERALES CONSOLIDADOS ({filteredErpMatrix.length} MODELOS / TALLAS)
                    </td>
                    <td style={{ padding: '0.85rem 0.75rem', textAlign: 'center', color: '#e2e8f0' }}>
                      {filteredErpMatrix.reduce((acc, c) => acc + (c.stocks.MATRIZ || 0), 0).toLocaleString()}
                    </td>
                    <td style={{ padding: '0.85rem 0.75rem', textAlign: 'center', color: '#60a5fa' }}>
                      {filteredErpMatrix.reduce((acc, c) => acc + (c.stocks.PLANTA || 0), 0).toLocaleString()}
                    </td>
                    <td style={{ padding: '0.85rem 0.75rem', textAlign: 'center', color: '#22c55e' }}>
                      {filteredErpMatrix.reduce((acc, c) => acc + (c.stocks.MEXICO || 0), 0).toLocaleString()}
                    </td>
                    <td style={{ padding: '0.85rem 0.75rem', textAlign: 'center', color: '#f59e0b' }}>
                      {filteredErpMatrix.reduce((acc, c) => acc + (c.stocks.MONTERREY || 0), 0).toLocaleString()}
                    </td>
                    <td style={{ padding: '0.85rem 1rem', textAlign: 'center', color: '#22c55e', fontSize: '0.85rem' }}>
                      {filteredErpMatrix.reduce((acc, c) => acc + (c.totalStock || 0), 0).toLocaleString()} pzas
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════════ */}
      {/* ── MODAL: BOM Matrix Editor (Desglose Dinámico por Talla & Insumos) ── */}
      {/* ══════════════════════════════════════════════════════════════════════════ */}
      {selectedBomModal && (
        <BomMatrixEditorModal
          modalState={selectedBomModal}
          onClose={() => setSelectedBomModal(null)}
          onSave={handleSaveBom}
          loading={loading}
        />
      )}

      {/* ══════════════════════════════════════════════════════════════════════════ */}
      {/* ── MODAL: Supplier Editor (Agregar / Editar) ── */}
      {/* ══════════════════════════════════════════════════════════════════════════ */}
      {supplierModal && (
        <SupplierEditorModal
          modalState={supplierModal}
          onClose={() => setSupplierModal(null)}
          onSave={handleSaveSupplier}
          loading={loading}
        />
      )}

      {/* ══════════════════════════════════════════════════════════════════════════ */}
      {/* ── MODAL: Simulador de Cumulative Lead Time (CLT) & ROP Dinámico ── */}
      {/* ══════════════════════════════════════════════════════════════════════════ */}
      {simulatorModalItem && (
        <KanbanLeadTimeSimulatorModal
          item={simulatorModalItem}
          globalSafetyDays={globalSafetyDays}
          onClose={() => setSimulatorModalItem(null)}
        />
      )}
    </div>
  )
}

// ═════════════════════════════════════════════════════════════════════════════
// ── SUB-COMPONENTE: Pop-up de Edición de BOM en Matriz (Tallas x Insumos) ──
// ═════════════════════════════════════════════════════════════════════════════
function BomMatrixEditorModal({ modalState, onClose, onSave, loading }) {
  const initialData = modalState.data || {}

  const [form, setForm] = useState({
    code: initialData.code || '',
    description: initialData.description || '',
    category: initialData.category || 'PANTALONES',
    gender: initialData.gender || 'CABALLERO',
    sizes: initialData.sizes && initialData.sizes.length > 0
      ? [...initialData.sizes]
      : ['28', '30', '32', '34', '36', '38', '40', '42', '44'],
    materials: initialData.materials && initialData.materials.length > 0
      ? initialData.materials.map((m, idx) => ({ ...m, id: m.id || m.code || `m_${idx}` }))
      : [
          { id: 'm_0', type: 'TELA', name: 'GABARDINA 8.5 OZ ALGODÓN 100%', code: 'TEL-GAB-01', unit: 'MTS', notes: '' },
          { id: 'm_1', type: 'AVÍO', name: 'CIERRE METÁLICO LATÓN #5 BRAGUETA', code: 'AVI-CIE-05', unit: 'PZA', notes: '' }
        ],
    size_consumptions: initialData.size_consumptions ? JSON.parse(JSON.stringify(initialData.size_consumptions)) : {}
  })

  // State for new custom size input
  const [customSizeInput, setCustomSizeInput] = useState('')

  // State for adding raw material column modal & autocomplete search
  const [newMaterialModal, setNewMaterialModal] = useState(false)
  const [catalogSearch, setCatalogSearch] = useState('')
  const [catalogTypeFilter, setCatalogTypeFilter] = useState('ALL') // 'ALL' | 'TELA' | 'AVÍO'

  const [newMatForm, setNewMatForm] = useState({
    type: 'TELA',
    name: '',
    code: '',
    unit: 'MTS',
    notes: ''
  })

  // Set default size consumptions if empty
  useEffect(() => {
    setForm(prev => {
      const updatedConsumptions = { ...prev.size_consumptions }
      prev.sizes.forEach(sz => {
        if (!updatedConsumptions[sz]) updatedConsumptions[sz] = {}
        prev.materials.forEach(m => {
          const matKey = m.code || m.id || m.name
          if (updatedConsumptions[sz][matKey] === undefined) {
            updatedConsumptions[sz][matKey] = m.consumption || (m.type === 'TELA' ? 1.25 : 1)
          }
        })
      })
      return { ...prev, size_consumptions: updatedConsumptions }
    })
  }, [])

  // Presets change handler
  const handleApplyPreset = (presetKey) => {
    const preset = SIZE_PRESETS[presetKey]
    if (!preset) return

    setForm(prev => {
      const updatedConsumptions = { ...prev.size_consumptions }
      preset.sizes.forEach(sz => {
        if (!updatedConsumptions[sz]) updatedConsumptions[sz] = {}
        prev.materials.forEach(m => {
          const matKey = m.code || m.id || m.name
          if (updatedConsumptions[sz][matKey] === undefined) {
            const firstAvailable = Object.values(updatedConsumptions).find(c => c[matKey] !== undefined)?.[matKey]
            updatedConsumptions[sz][matKey] = firstAvailable !== undefined ? firstAvailable : (m.type === 'TELA' ? 1.25 : 1)
          }
        })
      })
      return {
        ...prev,
        gender: preset.gender !== 'UNISEX' ? preset.gender : prev.gender,
        sizes: [...preset.sizes],
        size_consumptions: updatedConsumptions
      }
    })
  }

  // Handle cell consumption change
  const handleCellChange = (size, matKey, value) => {
    const numVal = value === '' ? '' : parseFloat(value)
    setForm(prev => ({
      ...prev,
      size_consumptions: {
        ...prev.size_consumptions,
        [size]: {
          ...(prev.size_consumptions[size] || {}),
          [matKey]: numVal
        }
      }
    }))
  }

  // Quick replicate down: copy the value of a column in the first size to ALL other sizes
  const handleReplicateColumn = (matKey) => {
    const firstSize = form.sizes[0]
    if (!firstSize) return
    const valToCopy = form.size_consumptions[firstSize]?.[matKey]
    if (valToCopy === undefined || valToCopy === '') return

    setForm(prev => {
      const updated = { ...prev.size_consumptions }
      prev.sizes.forEach(sz => {
        if (!updated[sz]) updated[sz] = {}
        updated[sz][matKey] = valToCopy
      })
      return { ...prev, size_consumptions: updated }
    })
  }

  // Add custom size
  const handleAddCustomSize = (e) => {
    e.preventDefault()
    const clean = customSizeInput.trim().toUpperCase()
    if (!clean || form.sizes.includes(clean)) return

    setForm(prev => {
      const updatedConsumptions = { ...prev.size_consumptions }
      if (!updatedConsumptions[clean]) updatedConsumptions[clean] = {}
      prev.materials.forEach(m => {
        const matKey = m.code || m.id || m.name
        const firstAvailable = Object.values(updatedConsumptions).find(c => c[matKey] !== undefined)?.[matKey]
        updatedConsumptions[clean][matKey] = firstAvailable !== undefined ? firstAvailable : 1
      })
      return {
        ...prev,
        sizes: [...prev.sizes, clean],
        size_consumptions: updatedConsumptions
      }
    })
    setCustomSizeInput('')
  }

  // Remove size
  const handleRemoveSize = (sizeToRemove) => {
    if (form.sizes.length <= 1) return
    setForm(prev => ({
      ...prev,
      sizes: prev.sizes.filter(s => s !== sizeToRemove)
    }))
  }

  // Select material from Raw Materials Catalog autocomplete
  const handleSelectCatalogItem = (item) => {
    setNewMatForm({
      type: item.type,
      name: item.name,
      code: item.code,
      unit: item.unit,
      comportamiento_tela: item.comportamiento_tela || (item.type === 'TELA' ? 'LISO' : 'N/A'),
      notes: item.notes || ''
    })
  }

  // Add material column to the matrix
  const handleAddMaterialColumn = () => {
    if (!newMatForm.code.trim()) return
    const matCode = newMatForm.code.toUpperCase().trim()
    const matName = (newMatForm.name || matCode).toUpperCase().trim()
    const newId = `m_${matCode}`

    // Check if already in matrix
    if (form.materials.some(m => m.code === matCode)) {
      alert(`El código de insumo ${matCode} ya existe en esta matriz.`)
      return
    }

    const newMatObj = {
      id: newId,
      type: newMatForm.type,
      name: matName,
      code: matCode,
      comportamiento_tela: newMatForm.comportamiento_tela || (newMatForm.type === 'TELA' ? 'LISO' : 'N/A'),
      unit: newMatForm.unit.toUpperCase().trim() || (newMatForm.type === 'TELA' ? 'MTS' : 'PZAS'),
      notes: newMatForm.notes || ''
    }

    setForm(prev => {
      const updatedConsumptions = { ...prev.size_consumptions }
      prev.sizes.forEach(sz => {
        if (!updatedConsumptions[sz]) updatedConsumptions[sz] = {}
        updatedConsumptions[sz][matCode] = newMatForm.type === 'TELA' ? 1.30 : 1
      })
      return {
        ...prev,
        materials: [...prev.materials, newMatObj],
        size_consumptions: updatedConsumptions
      }
    })

    setNewMatForm({ type: 'AVÍO', name: '', code: '', unit: 'PZAS', comportamiento_tela: 'N/A', notes: '' })
    setCatalogSearch('')
    setNewMaterialModal(false)
  }

  // Remove material column
  const handleRemoveMaterialColumn = (matId, matCode) => {
    setForm(prev => ({
      ...prev,
      materials: prev.materials.filter(m => m.id !== matId && m.code !== matCode)
    }))
  }

  // Filtered raw materials in autocomplete picker
  const filteredCatalog = RAW_MATERIALS_CATALOG.filter(item => {
    const matchSearch = item.code.toLowerCase().includes(catalogSearch.toLowerCase()) ||
                        item.name.toLowerCase().includes(catalogSearch.toLowerCase())
    const matchType = catalogTypeFilter === 'ALL' || item.type === catalogTypeFilter
    return matchSearch && matchType
  })

  // Calculate live column averages for footer
  const columnAverages = form.materials.map(m => {
    const matKey = m.code || m.id || m.name
    let sum = 0
    let count = 0
    form.sizes.forEach(sz => {
      const val = form.size_consumptions[sz]?.[matKey]
      if (val !== undefined && val !== '' && !isNaN(Number(val))) {
        sum += Number(val)
        count++
      }
    })
    return {
      matKey,
      code: m.code,
      unit: m.unit,
      avg: count > 0 ? (sum / count).toFixed(3) : '0.000',
      total: sum.toFixed(2)
    }
  })

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(2, 6, 23, 0.92)', backdropFilter: 'blur(12px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1200, padding: '1.5rem'
    }}>
      <div style={{
        background: '#0b1120', border: '1px solid rgba(255,255,255,0.12)', borderRadius: '1.5rem',
        maxWidth: '1280px', width: '100%', maxHeight: '94vh', overflowY: 'auto', padding: '2rem',
        display: 'flex', flexDirection: 'column', gap: '1.5rem', position: 'relative',
        boxShadow: '0 25px 60px -15px rgba(0,0,0,0.8)'
      }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: '1.25rem' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.35rem' }}>
              <span style={{
                background: 'linear-gradient(135deg, #0284c7, #0369a1)',
                padding: '0.2rem 0.6rem',
                borderRadius: '0.4rem',
                fontSize: '0.65rem',
                fontWeight: 900,
                color: 'white',
                letterSpacing: '0.1em'
              }}>
                MATRIZ GRANULAR DE EXPLOSIÓN
              </span>
              <span style={{ fontSize: '0.7rem', color: '#64748b', fontWeight: 800 }}>•</span>
              <span style={{ fontSize: '0.7rem', color: '#38bdf8', fontWeight: 800 }}>
                CÓDIGOS INTERNOS EXACTOS (SKU PRODUCTO & INSUMOS)
              </span>
            </div>
            <h3 style={{ fontSize: '1.35rem', fontWeight: 900, color: 'white', textTransform: 'uppercase' }}>
              {modalState.isNew ? 'NUEVA LISTA DE MATERIALES (BOM MATRIX)' : `MATRIZ BOM: ${form.code}`}
            </h3>
            <p style={{ fontSize: '0.72rem', color: '#94a3b8', marginTop: '0.2rem' }}>
              Define el <strong>CÓDIGO INTERNO PADRE</strong> por género y asigna las materias primas vinculando sus <strong>CÓDIGOS INTERNOS EXACTOS</strong> para cruce automático con el ERP.
            </p>
          </div>

          <button onClick={onClose} style={{ background: 'rgba(255,255,255,0.05)', border: 'none', color: '#94a3b8', borderRadius: '0.5rem', padding: '0.5rem', cursor: 'pointer' }}>
            <X size={20} />
          </button>
        </div>

        {/* ── SECCIÓN 1: Identificadores Obligatorios (Código Padre, Género, Categoría, Descripción) ── */}
        <div style={{ display: 'grid', gridTemplateColumns: '1.3fr 2fr 1.2fr 1.2fr', gap: '1rem', background: 'rgba(255,255,255,0.02)', padding: '1.25rem', borderRadius: '1rem', border: '1px solid rgba(255,255,255,0.05)' }}>
          {/* CÓDIGO INTERNO PADRE */}
          <div>
            <label style={{ fontSize: '0.65rem', fontWeight: 900, color: '#38bdf8', display: 'block', marginBottom: '0.35rem' }}>
              CÓDIGO INTERNO PADRE (SKU) *
            </label>
            <input
              type="text"
              required
              disabled={!modalState.isNew}
              value={form.code}
              onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })}
              placeholder="EJ. PAN003 (CAB), PAND01 (DAM)"
              style={{
                width: '100%',
                background: '#020617',
                border: '1px solid rgba(56, 189, 248, 0.4)',
                borderRadius: '0.75rem',
                padding: '0.65rem',
                color: 'white',
                fontSize: '0.82rem',
                fontWeight: 900,
                fontFamily: 'monospace'
              }}
            />
          </div>

          {/* DESCRIPCIÓN */}
          <div>
            <label style={{ fontSize: '0.65rem', fontWeight: 800, color: '#94a3b8', display: 'block', marginBottom: '0.35rem' }}>
              DESCRIPCIÓN DE LA PRENDA *
            </label>
            <input
              type="text"
              required
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value.toUpperCase() })}
              placeholder="EJ. PANTALÓN GABARDINA CASUAL AIRMAN"
              style={{ width: '100%', background: '#020617', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '0.75rem', padding: '0.65rem', color: 'white', fontSize: '0.75rem' }}
            />
          </div>

          {/* GÉNERO (OBLIGATORIO) */}
          <div>
            <label style={{ fontSize: '0.65rem', fontWeight: 900, color: '#ec4899', display: 'block', marginBottom: '0.35rem' }}>
              GÉNERO *
            </label>
            <select
              value={form.gender}
              onChange={(e) => {
                const newGender = e.target.value
                setForm(prev => ({ ...prev, gender: newGender }))
                if (form.category === 'PANTALONES') {
                  if (newGender === 'CABALLERO') handleApplyPreset('PANTALON_CABALLERO')
                  else if (newGender === 'DAMA') handleApplyPreset('PANTALON_DAMA')
                }
              }}
              style={{ width: '100%', background: '#020617', border: '1px solid #ec4899', borderRadius: '0.75rem', padding: '0.65rem', color: 'white', fontSize: '0.75rem', fontWeight: 900, cursor: 'pointer' }}
            >
              <option value="CABALLERO">👔 CABALLERO</option>
              <option value="DAMA">👗 DAMA</option>
              <option value="UNISEX">⚥ UNISEX</option>
            </select>
          </div>

          {/* CATEGORÍA */}
          <div>
            <label style={{ fontSize: '0.65rem', fontWeight: 800, color: '#94a3b8', display: 'block', marginBottom: '0.35rem' }}>
              CATEGORÍA *
            </label>
            <select
              value={form.category}
              onChange={(e) => setForm({ ...form, category: e.target.value.toUpperCase() })}
              style={{ width: '100%', background: '#020617', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '0.75rem', padding: '0.65rem', color: 'white', fontSize: '0.75rem', cursor: 'pointer' }}
            >
              <option value="PANTALONES">PANTALONES</option>
              <option value="CAMISAS">CAMISAS</option>
              <option value="BLUSAS">BLUSAS</option>
              <option value="POLO">POLO</option>
              <option value="SUDADERAS">SUDADERAS</option>
              <option value="PLAYERAS">PLAYERAS</option>
              <option value="CHALECOS">CHALECOS</option>
              <option value="BERMUDAS">BERMUDAS</option>
              <option value="GENERAL">GENERAL</option>
            </select>
          </div>
        </div>

        {/* ── SECCIÓN 2: Presets Rápidos de Curvas de Tallas & Tallas Personalizadas ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', background: 'rgba(15, 23, 42, 0.5)', padding: '1rem 1.25rem', borderRadius: '1rem', border: '1px solid rgba(255,255,255,0.06)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Grid size={16} style={{ color: '#38bdf8' }} />
              <span style={{ fontSize: '0.75rem', fontWeight: 900, color: 'white', textTransform: 'uppercase' }}>
                CURVA DE TALLAS DINÁMICA ({form.sizes.length} TALLAS CONFIGURADAS)
              </span>
            </div>

            {/* Presets Helpers */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '0.6rem', color: '#64748b', fontWeight: 800 }}>CARGAR CURVA RÁPIDA:</span>
              <button
                type="button"
                onClick={() => handleApplyPreset('PANTALON_CABALLERO')}
                style={{ background: form.gender === 'CABALLERO' && form.category === 'PANTALONES' ? 'rgba(14, 165, 233, 0.25)' : 'rgba(255,255,255,0.04)', border: '1px solid rgba(14, 165, 233, 0.4)', color: '#38bdf8', padding: '0.3rem 0.6rem', borderRadius: '0.4rem', fontSize: '0.62rem', fontWeight: 800, cursor: 'pointer' }}
              >
                Pantalón Cab. (28-50)
              </button>
              <button
                type="button"
                onClick={() => handleApplyPreset('PANTALON_DAMA')}
                style={{ background: form.gender === 'DAMA' ? 'rgba(236, 72, 153, 0.25)' : 'rgba(255,255,255,0.04)', border: '1px solid rgba(236, 72, 153, 0.4)', color: '#f472b6', padding: '0.3rem 0.6rem', borderRadius: '0.4rem', fontSize: '0.62rem', fontWeight: 800, cursor: 'pointer' }}
              >
                Pantalón Dama (00-23)
              </button>
              <button
                type="button"
                onClick={() => handleApplyPreset('ALFANUMERICA_COMPLETA')}
                style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', color: '#cbd5e1', padding: '0.3rem 0.6rem', borderRadius: '0.4rem', fontSize: '0.62rem', fontWeight: 800, cursor: 'pointer' }}
              >
                Superiores (XC-5X)
              </button>
            </div>
          </div>

          {/* Current Sizes Chips & Custom Size Add */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
            {form.sizes.map((sz, idx) => (
              <div
                key={idx}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.3rem',
                  background: '#020617',
                  border: '1px solid rgba(56, 189, 248, 0.3)',
                  padding: '0.25rem 0.55rem',
                  borderRadius: '0.5rem',
                  fontSize: '0.72rem',
                  fontWeight: 900,
                  color: 'white'
                }}
              >
                <span>{sz}</span>
                {form.sizes.length > 1 && (
                  <button
                    type="button"
                    onClick={() => handleRemoveSize(sz)}
                    title={`Quitar talla ${sz}`}
                    style={{ background: 'none', border: 'none', color: '#ef4444', padding: '0 0.1rem', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
                  >
                    <X size={12} />
                  </button>
                )}
              </div>
            ))}

            {/* Input to add custom size */}
            <form onSubmit={handleAddCustomSize} style={{ display: 'flex', gap: '0.35rem', alignItems: 'center' }}>
              <input
                type="text"
                placeholder="+ TALLA (EJ. 46, 6X)"
                value={customSizeInput}
                onChange={(e) => setCustomSizeInput(e.target.value)}
                style={{
                  background: '#020617',
                  border: '1px dashed rgba(255,255,255,0.2)',
                  borderRadius: '0.5rem',
                  padding: '0.25rem 0.6rem',
                  color: '#38bdf8',
                  fontSize: '0.68rem',
                  width: '130px',
                  outline: 'none',
                  textTransform: 'uppercase',
                  fontWeight: 800
                }}
              />
              <button
                type="submit"
                style={{ background: '#0284c7', color: 'white', border: 'none', borderRadius: '0.5rem', padding: '0.3rem 0.6rem', fontSize: '0.65rem', fontWeight: 900, cursor: 'pointer' }}
              >
                AÑADIR
              </button>
            </form>
          </div>
        </div>

        {/* ── SECCIÓN 3: TABLA RESPONSIVA MATRIZ (JERARQUÍA: CATEGORÍA > CÓDIGO INTERNO > DESCRIPCIÓN) ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem' }}>
            <div>
              <h4 style={{ fontSize: '0.9rem', fontWeight: 900, color: '#38bdf8', textTransform: 'uppercase' }}>
                MATRIZ DE CONSUMOS POR TALLA & CÓDIGO DE INSUMO
              </h4>
              <p style={{ fontSize: '0.65rem', color: '#94a3b8' }}>
                Cada columna vincula el <strong>CÓDIGO INTERNO EXACTO</strong> de la materia prima. Usa <Copy size={11} style={{ display: 'inline' }} /> para replicar el consumo a toda la corrida.
              </p>
            </div>

            <button
              type="button"
              onClick={() => setNewMaterialModal(true)}
              style={{
                background: '#16a34a',
                color: 'white',
                border: 'none',
                padding: '0.55rem 1.15rem',
                borderRadius: '0.65rem',
                fontWeight: 900,
                fontSize: '0.72rem',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '0.4rem',
                boxShadow: '0 4px 12px rgba(22, 163, 74, 0.3)'
              }}
            >
              <Plus size={15} /> + AGREGAR CÓDIGO DE INSUMO (CATÁLOGO)
            </button>
          </div>

          {/* Dynamic Matrix Table */}
          <div style={{
            background: '#020617',
            borderRadius: '1rem',
            overflowX: 'auto',
            border: '1px solid rgba(255,255,255,0.08)',
            maxHeight: '460px'
          }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.75rem' }}>
              <thead>
                <tr style={{ background: '#0f172a', position: 'sticky', top: 0, zIndex: 10 }}>
                  {/* Sticky Talla Column */}
                  <th style={{
                    padding: '1rem',
                    textAlign: 'center',
                    background: '#0f172a',
                    position: 'sticky',
                    left: 0,
                    zIndex: 11,
                    borderRight: '1px solid rgba(255,255,255,0.1)',
                    width: '120px',
                    verticalAlign: 'bottom'
                  }}>
                    <span style={{ fontSize: '0.7rem', fontWeight: 900, color: 'white', textTransform: 'uppercase' }}>
                      TALLA (SKU)
                    </span>
                  </th>

                  {/* Material Columns with Explicit 3-Level Hierarchy */}
                  {form.materials.map((m, idx) => (
                    <th key={m.id || idx} style={{ padding: '0.75rem 0.85rem', textAlign: 'center', minWidth: '190px', borderRight: '1px solid rgba(255,255,255,0.04)' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.25rem', width: '100%' }}>
                        {/* 1. Categoría / Tipo Badge + Actions */}
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
                          <span style={{
                            fontSize: '0.55rem',
                            fontWeight: 900,
                            padding: '0.12rem 0.45rem',
                            borderRadius: '0.3rem',
                            letterSpacing: '0.05em',
                            background: m.type === 'TELA' ? 'rgba(14, 165, 233, 0.2)' : 'rgba(234, 179, 8, 0.2)',
                            color: m.type === 'TELA' ? '#38bdf8' : '#facc15',
                            border: m.type === 'TELA' ? '1px solid rgba(14, 165, 233, 0.35)' : '1px solid rgba(234, 179, 8, 0.35)'
                          }}>
                            {m.type}
                          </span>

                          <div style={{ display: 'flex', gap: '0.25rem' }}>
                            <button
                              type="button"
                              onClick={() => handleReplicateColumn(m.code || m.id || m.name)}
                              title="Replicar consumo a todas las tallas"
                              style={{ background: 'rgba(255,255,255,0.06)', border: 'none', color: '#38bdf8', padding: '0.2rem 0.35rem', borderRadius: '0.3rem', cursor: 'pointer', fontSize: '0.55rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '0.2rem' }}
                            >
                              <Copy size={10} /> Copiar ↓
                            </button>
                            <button
                              type="button"
                              onClick={() => handleRemoveMaterialColumn(m.id, m.code)}
                              title="Eliminar este insumo"
                              style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', padding: '0.1rem' }}
                            >
                              <X size={13} />
                            </button>
                          </div>
                        </div>

                        {/* 2. CÓDIGO INTERNO (SKU EXACTO MATERIA PRIMA) */}
                        <div style={{
                          fontFamily: 'monospace',
                          fontSize: '0.8rem',
                          fontWeight: 900,
                          color: m.type === 'TELA' ? '#60a5fa' : '#fde047',
                          letterSpacing: '0.04em',
                          background: 'rgba(0,0,0,0.4)',
                          padding: '0.2rem 0.5rem',
                          borderRadius: '0.4rem',
                          border: '1px solid rgba(255,255,255,0.08)',
                          width: '100%',
                          textAlign: 'center'
                        }}>
                          {m.code}
                        </div>

                        {/* 3. Descripción del material & Unidad */}
                        <span style={{ color: 'white', fontWeight: 800, fontSize: '0.68rem', textAlign: 'center', lineHeight: 1.2, marginTop: '0.1rem' }}>
                          {m.name}
                        </span>
                        <span style={{ fontSize: '0.58rem', color: '#94a3b8', fontWeight: 700 }}>
                          Unidad: <strong style={{ color: '#38bdf8' }}>{m.unit}</strong>
                        </span>
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>

              <tbody>
                {form.sizes.map((sz) => (
                  <tr key={sz} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                    {/* Sticky Size Column */}
                    <td style={{
                      padding: '0.65rem 1rem',
                      textAlign: 'center',
                      background: '#090d16',
                      position: 'sticky',
                      left: 0,
                      zIndex: 5,
                      borderRight: '1px solid rgba(255,255,255,0.1)',
                      fontWeight: 900,
                      color: '#f1f5f9'
                    }}>
                      <span style={{
                        background: 'rgba(14, 165, 233, 0.15)',
                        color: '#38bdf8',
                        padding: '0.25rem 0.6rem',
                        borderRadius: '0.4rem',
                        border: '1px solid rgba(14, 165, 233, 0.3)',
                        fontSize: '0.75rem'
                      }}>
                        TALLA {sz}
                      </span>
                    </td>

                    {/* Inputs for each material column */}
                    {form.materials.map((m, idx) => {
                      const matKey = m.code || m.id || m.name
                      const currentVal = form.size_consumptions[sz]?.[matKey] !== undefined ? form.size_consumptions[sz][matKey] : ''

                      return (
                        <td key={m.id || idx} style={{ padding: '0.5rem 0.85rem', textAlign: 'center', borderRight: '1px solid rgba(255,255,255,0.02)' }}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.35rem' }}>
                            <input
                              type="number"
                              step="0.001"
                              min="0"
                              placeholder="0.00"
                              value={currentVal}
                              onChange={(e) => handleCellChange(sz, matKey, e.target.value)}
                              style={{
                                width: '90px',
                                background: '#020617',
                                border: '1px solid rgba(255,255,255,0.12)',
                                borderRadius: '0.5rem',
                                padding: '0.4rem',
                                color: m.type === 'TELA' ? '#60a5fa' : '#facc15',
                                fontWeight: 900,
                                fontSize: '0.75rem',
                                textAlign: 'center',
                                outline: 'none'
                              }}
                            />
                            <span style={{ fontSize: '0.6rem', color: '#64748b', fontWeight: 800, width: '25px', textAlign: 'left' }}>
                              {m.unit}
                            </span>
                          </div>
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>

              {/* Summary Footer: Average and Total Run */}
              <tfoot>
                <tr style={{ background: '#0f172a', borderTop: '2px solid rgba(14, 165, 233, 0.4)', position: 'sticky', bottom: 0, zIndex: 10 }}>
                  <td style={{
                    padding: '0.85rem 1rem',
                    textAlign: 'center',
                    background: '#0f172a',
                    position: 'sticky',
                    left: 0,
                    zIndex: 11,
                    borderRight: '1px solid rgba(255,255,255,0.1)'
                  }}>
                    <div style={{ fontSize: '0.7rem', fontWeight: 900, color: '#38bdf8', textTransform: 'uppercase' }}>
                      PROMEDIO CORRIDA
                    </div>
                    <div style={{ fontSize: '0.55rem', color: '#94a3b8' }}>
                      (Para 1 prenda estimada)
                    </div>
                  </td>

                  {columnAverages.map((col, idx) => (
                    <td key={idx} style={{ padding: '0.75rem 0.85rem', textAlign: 'center', borderRight: '1px solid rgba(255,255,255,0.04)' }}>
                      <div style={{ fontSize: '0.85rem', fontWeight: 900, color: '#22c55e' }}>
                        {col.avg} {col.unit}
                      </div>
                      <div style={{ fontSize: '0.55rem', color: '#64748b' }}>
                        Total corrida: {col.total} {col.unit}
                      </div>
                    </td>
                  ))}
                </tr>
              </tfoot>
            </table>
          </div>
        </div>

        {/* ── MODAL INTERNO: Buscador Autocompletable de Códigos Internos de Materia Prima ── */}
        {newMaterialModal && (
          <div style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(8px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1300, padding: '1.5rem'
          }}>
            <div style={{
              background: '#0f172a', border: '1px solid rgba(56, 189, 248, 0.3)', borderRadius: '1.5rem',
              maxWidth: '680px', width: '100%', maxHeight: '90vh', overflowY: 'auto', padding: '2rem',
              display: 'flex', flexDirection: 'column', gap: '1.25rem', boxShadow: '0 20px 50px rgba(0,0,0,0.7)'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(255,255,255,0.06)', paddingBottom: '0.85rem' }}>
                <div>
                  <h4 style={{ fontSize: '1.1rem', fontWeight: 900, color: 'white', textTransform: 'uppercase' }}>
                    ASIGNAR MATERIA PRIMA POR CÓDIGO INTERNO (SKU)
                  </h4>
                  <p style={{ fontSize: '0.68rem', color: '#94a3b8', marginTop: '0.15rem' }}>
                    Busca en el catálogo maestro (+50 insumos) o escribe un código interno para cruce con ERP.
                  </p>
                </div>
                <button onClick={() => setNewMaterialModal(false)} style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer' }}>
                  <X size={20} />
                </button>
              </div>

              {/* Autocomplete Search Bar & Filters */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                <div style={{ position: 'relative', width: '100%' }}>
                  <Search size={16} style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: '#38bdf8' }} />
                  <input
                    type="text"
                    autoFocus
                    placeholder="BUSCAR POR CÓDIGO (EJ. TEL-GAB, AVI-BOT, AVI-CIE) O NOMBRE..."
                    value={catalogSearch}
                    onChange={(e) => setCatalogSearch(e.target.value)}
                    style={{
                      width: '100%',
                      background: '#020617',
                      border: '1px solid rgba(56, 189, 248, 0.35)',
                      borderRadius: '0.75rem',
                      padding: '0.75rem 1rem 0.75rem 2.6rem',
                      color: 'white',
                      fontSize: '0.8rem',
                      outline: 'none',
                      textTransform: 'uppercase',
                      fontWeight: 800
                    }}
                  />
                </div>

                <div style={{ display: 'flex', gap: '0.4rem' }}>
                  {[
                    { id: 'ALL', label: 'TODOS (+50 INSUMOS)' },
                    { id: 'TELA', label: 'SOLO TELAS (MTS)' },
                    { id: 'AVÍO', label: 'SOLO AVÍOS (PZAS/CONOS)' }
                  ].map(f => (
                    <button
                      key={f.id}
                      type="button"
                      onClick={() => setCatalogTypeFilter(f.id)}
                      style={{
                        padding: '0.35rem 0.75rem',
                        borderRadius: '0.4rem',
                        border: 'none',
                        fontSize: '0.62rem',
                        fontWeight: 900,
                        cursor: 'pointer',
                        background: catalogTypeFilter === f.id ? '#0284c7' : 'rgba(255,255,255,0.05)',
                        color: catalogTypeFilter === f.id ? 'white' : '#94a3b8'
                      }}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Quick Select Autocomplete List */}
              <div style={{ maxHeight: '180px', overflowY: 'auto', background: '#020617', borderRadius: '0.75rem', border: '1px solid rgba(255,255,255,0.08)', padding: '0.35rem' }}>
                {filteredCatalog.slice(0, 15).map(item => (
                  <div
                    key={item.code}
                    onClick={() => handleSelectCatalogItem(item)}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      padding: '0.5rem 0.75rem',
                      borderRadius: '0.5rem',
                      cursor: 'pointer',
                      background: newMatForm.code === item.code ? 'rgba(14, 165, 233, 0.18)' : 'transparent',
                      border: newMatForm.code === item.code ? '1px solid rgba(14, 165, 233, 0.4)' : '1px solid transparent',
                      transition: 'background 0.15s'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <span style={{
                        fontSize: '0.55rem',
                        fontWeight: 900,
                        padding: '0.1rem 0.35rem',
                        borderRadius: '0.3rem',
                        background: item.type === 'TELA' ? 'rgba(59, 130, 246, 0.2)' : 'rgba(234, 179, 8, 0.2)',
                        color: item.type === 'TELA' ? '#60a5fa' : '#facc15'
                      }}>
                        {item.type}
                      </span>
                      <span style={{ fontFamily: 'monospace', fontWeight: 900, color: '#38bdf8', fontSize: '0.75rem' }}>
                        {item.code}
                      </span>
                      <span style={{ color: 'white', fontSize: '0.72rem', fontWeight: 700 }}>
                        {item.name}
                      </span>
                    </div>

                    <span style={{ fontSize: '0.62rem', color: '#94a3b8', fontWeight: 800 }}>
                      {item.unit}
                    </span>
                  </div>
                ))}
              </div>

              {/* Selected / Custom Fields Preview */}
              <div style={{ background: 'rgba(255,255,255,0.03)', padding: '1rem', borderRadius: '0.875rem', border: '1px solid rgba(255,255,255,0.06)', display: 'grid', gridTemplateColumns: '120px 1.5fr 1fr 90px', gap: '0.75rem', alignItems: 'end' }}>
                <div>
                  <label style={{ fontSize: '0.6rem', color: '#94a3b8', fontWeight: 800, display: 'block', marginBottom: '0.25rem' }}>CATEGORÍA</label>
                  <select
                    value={newMatForm.type}
                    onChange={(e) => setNewMatForm({ ...newMatForm, type: e.target.value, unit: e.target.value === 'TELA' ? 'MTS' : 'PZAS' })}
                    style={{ width: '100%', background: '#020617', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '0.5rem', padding: '0.5rem', color: 'white', fontSize: '0.75rem' }}
                  >
                    <option value="TELA">TELA</option>
                    <option value="AVÍO">AVÍO</option>
                  </select>
                </div>

                <div>
                  <label style={{ fontSize: '0.6rem', color: '#38bdf8', fontWeight: 900, display: 'block', marginBottom: '0.25rem' }}>CÓDIGO INTERNO (SKU) *</label>
                  <input
                    type="text"
                    required
                    placeholder="Ej. TEL-GAB-01"
                    value={newMatForm.code}
                    onChange={(e) => setNewMatForm({ ...newMatForm, code: e.target.value.toUpperCase() })}
                    style={{ width: '100%', background: '#020617', border: '1px solid rgba(56, 189, 248, 0.4)', borderRadius: '0.5rem', padding: '0.5rem', color: 'white', fontSize: '0.75rem', fontFamily: 'monospace', fontWeight: 900 }}
                  />
                </div>

                <div>
                  <label style={{ fontSize: '0.6rem', color: '#94a3b8', fontWeight: 800, display: 'block', marginBottom: '0.25rem' }}>DESCRIPCIÓN MATERIA PRIMA *</label>
                  <input
                    type="text"
                    required
                    placeholder="Ej. Gabardina 8.5 oz Algodón"
                    value={newMatForm.name}
                    onChange={(e) => setNewMatForm({ ...newMatForm, name: e.target.value.toUpperCase() })}
                    style={{ width: '100%', background: '#020617', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '0.5rem', padding: '0.5rem', color: 'white', fontSize: '0.75rem' }}
                  />
                </div>

                <div>
                  <label style={{ fontSize: '0.6rem', color: '#94a3b8', fontWeight: 800, display: 'block', marginBottom: '0.25rem' }}>UNIDAD</label>
                  <input
                    type="text"
                    placeholder="MTS / PZAS"
                    value={newMatForm.unit}
                    onChange={(e) => setNewMatForm({ ...newMatForm, unit: e.target.value.toUpperCase() })}
                    style={{ width: '100%', background: '#020617', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '0.5rem', padding: '0.5rem', color: 'white', fontSize: '0.75rem', textAlign: 'center', fontWeight: 800 }}
                  />
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: '1rem' }}>
                <button
                  type="button"
                  onClick={() => setNewMaterialModal(false)}
                  style={{ padding: '0.65rem 1.25rem', background: 'transparent', border: '1px solid rgba(255,255,255,0.1)', color: '#94a3b8', borderRadius: '0.65rem', fontSize: '0.72rem', fontWeight: 800, cursor: 'pointer' }}
                >
                  CANCELAR
                </button>
                <button
                  type="button"
                  onClick={handleAddMaterialColumn}
                  disabled={!newMatForm.code.trim()}
                  style={{
                    padding: '0.65rem 1.75rem',
                    background: newMatForm.code.trim() ? '#16a34a' : 'rgba(255,255,255,0.05)',
                    color: 'white',
                    border: 'none',
                    borderRadius: '0.65rem',
                    fontSize: '0.75rem',
                    fontWeight: 900,
                    cursor: newMatForm.code.trim() ? 'pointer' : 'not-allowed',
                    boxShadow: newMatForm.code.trim() ? '0 4px 14px rgba(22, 163, 74, 0.4)' : 'none'
                  }}
                >
                  VINCULAR COLUMNA A LA MATRIZ
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Footer */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: '1.25rem' }}>
          <button onClick={onClose} style={{ padding: '0.75rem 1.5rem', background: 'transparent', border: '1px solid rgba(255,255,255,0.1)', color: '#94a3b8', borderRadius: '0.75rem', fontWeight: 800, fontSize: '0.75rem', cursor: 'pointer' }}>
            CANCELAR
          </button>
          <button
            onClick={() => onSave(form)}
            disabled={loading}
            style={{
              padding: '0.75rem 2rem',
              background: '#0284c7',
              color: 'white',
              border: 'none',
              borderRadius: '0.75rem',
              fontWeight: 900,
              fontSize: '0.8rem',
              cursor: 'pointer',
              boxShadow: '0 4px 14px rgba(2, 132, 199, 0.4)'
            }}
          >
            {loading ? 'GUARDANDO MATRIZ...' : 'GUARDAR LISTA DE MATERIALES (BOM)'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Sub-Modal Component for Supplier Editor ──
function SupplierEditorModal({ modalState, onClose, onSave, loading }) {
  const [form, setForm] = useState({
    id: modalState.data.id || '',
    type: modalState.data.type || 'MAQUILERO',
    name: modalState.data.name || '',
    contact: modalState.data.contact || '',
    phone: modalState.data.phone || '',
    email: modalState.data.email || '',
    address: modalState.data.address || '',
    specialty: modalState.data.specialty || '',
    origin_country: modalState.data.origin_country || (modalState.data.type === 'TELA' && (modalState.data.name || '').includes('GUATEMALA') ? 'GUATEMALA' : 'MÉXICO'),
    weekly_capacity: modalState.data.weekly_capacity || 3000,
    daily_capacity: modalState.data.daily_capacity || 600,
    mill_loom_monthly_capacity: modalState.data.mill_loom_monthly_capacity || 80000,
    lead_time_days: modalState.data.lead_time_days || 7,
    lead_time_liso_days: modalState.data.lead_time_liso_days || 18,
    lead_time_fantasia_days: modalState.data.lead_time_fantasia_days || 55,
    lead_time_post_weaving_days: modalState.data.lead_time_post_weaving_days || 14,
    logistics_days: modalState.data.logistics_days || 1,
    status: modalState.data.status || 'ACTIVO',
    notes: modalState.data.notes || ''
  })

  const isFabric = form.type === 'TELA'
  const isTrim = form.type === 'AVÍO'

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(2, 6, 23, 0.85)', backdropFilter: 'blur(10px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1200, padding: '1.5rem'
    }}>
      <div style={{
        background: '#0f172a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '1.5rem',
        maxWidth: '700px', width: '100%', maxHeight: '92vh', overflowY: 'auto', padding: '2rem', display: 'flex', flexDirection: 'column', gap: '1.25rem',
        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.7)'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: '1rem' }}>
          <div>
            <span style={{ fontSize: '0.65rem', fontWeight: 900, color: '#38bdf8', letterSpacing: '0.05em' }}>CONFIGURACIÓN DE CATÁLOGO MAESTRO & TIEMPOS MRP</span>
            <h3 style={{ fontSize: '1.1rem', fontWeight: 900, color: 'white', textTransform: 'uppercase', marginTop: '0.2rem' }}>
              {modalState.isNew ? 'ALTA DE NUEVO PROVEEDOR' : `EDITAR PROVEEDOR: ${form.name}`}
            </h3>
          </div>
          <button onClick={onClose} style={{ background: 'rgba(255,255,255,0.05)', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: '0.4rem', borderRadius: '0.5rem' }}>
            <X size={20} />
          </button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {/* Supplier Type Selection Buttons */}
          <div>
            <label style={{ fontSize: '0.65rem', fontWeight: 800, color: '#94a3b8', display: 'block', marginBottom: '0.4rem' }}>TIPO DE PROVEEDOR *</label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.65rem' }}>
              {[
                { id: 'MAQUILERO', label: '👔 MAQUILERO (CONFECCIÓN)', color: '#818cf8', bg: 'rgba(129, 140, 248, 0.15)', border: '#818cf8' },
                { id: 'TELA', label: '🧵 MOLINO / PROV. TELAS', color: '#38bdf8', bg: 'rgba(56, 189, 248, 0.15)', border: '#38bdf8' },
                { id: 'AVÍO', label: '🔘 PROVEEDOR DE AVÍOS', color: '#fbbf24', bg: 'rgba(251, 191, 36, 0.15)', border: '#fbbf24' }
              ].map(t => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setForm({ ...form, type: t.id })}
                  style={{
                    padding: '0.65rem 0.5rem',
                    borderRadius: '0.75rem',
                    fontSize: '0.7rem',
                    fontWeight: 900,
                    cursor: 'pointer',
                    background: form.type === t.id ? t.bg : 'rgba(255,255,255,0.03)',
                    color: form.type === t.id ? t.color : '#94a3b8',
                    border: form.type === t.id ? `2px solid ${t.border}` : '1px solid rgba(255,255,255,0.08)',
                    textAlign: 'center'
                  }}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '0.75rem' }}>
            <div>
              <label style={{ fontSize: '0.65rem', fontWeight: 800, color: '#94a3b8', display: 'block', marginBottom: '0.3rem' }}>NOMBRE O RAZÓN SOCIAL *</label>
              <input
                type="text"
                required
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value.toUpperCase() })}
                placeholder="EJ. TEXTILES DEL PACÍFICO (MOLINO GUATEMALA)"
                style={{ width: '100%', background: '#020617', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '0.75rem', padding: '0.65rem', color: 'white', fontSize: '0.75rem', fontWeight: 800 }}
              />
            </div>
            <div>
              <label style={{ fontSize: '0.65rem', fontWeight: 800, color: '#94a3b8', display: 'block', marginBottom: '0.3rem' }}>PAÍS DE ORIGEN</label>
              <select
                value={form.origin_country}
                onChange={(e) => setForm({ ...form, origin_country: e.target.value })}
                style={{ width: '100%', background: '#020617', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '0.75rem', padding: '0.65rem', color: '#38bdf8', fontWeight: 900, fontSize: '0.75rem' }}
              >
                <option value="GUATEMALA">🇬🇹 GUATEMALA (INTERNACIONAL)</option>
                <option value="MÉXICO">🇲🇽 MÉXICO (NACIONAL)</option>
                <option value="OTRO">🌐 OTRO PAÍS</option>
              </select>
            </div>
          </div>

          <div>
            <label style={{ fontSize: '0.65rem', fontWeight: 800, color: '#94a3b8', display: 'block', marginBottom: '0.3rem' }}>
              {isFabric ? 'CATÁLOGO DE TELAS SUMINISTRADAS / ESPECIALIDAD' : isTrim ? 'CATÁLOGO DE AVÍOS / FORNITURAS SUMINISTRADAS' : 'LÍNEA DE PRENDAS / ESPECIALIDAD'}
            </label>
            <input
              type="text"
              value={form.specialty}
              onChange={(e) => setForm({ ...form, specialty: e.target.value })}
              placeholder={isFabric ? 'Gabardina Isabel, Hawa Elastano, Warp Pique, Cuadros, Rayas...' : isTrim ? 'Cierres Latón, Botones Pasta, Elásticos...' : 'Polo, Pantalón Casual, Camisería...'}
              style={{ width: '100%', background: '#020617', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '0.75rem', padding: '0.65rem', color: 'white', fontSize: '0.75rem' }}
            />
          </div>

          {/* Lead Times Textiles Separados por Tipología */}
          {isFabric && (
            <div style={{ background: 'rgba(14, 165, 233, 0.05)', border: '1px solid rgba(14, 165, 233, 0.25)', borderRadius: '0.85rem', padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <span style={{ fontSize: '0.65rem', fontWeight: 900, color: '#38bdf8', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                ⏱ TIEMPOS DE ENTREGA TEXTIL (LEAD TIMES DIFERENCIADOS POR COMPORTAMIENTO)
              </span>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.75rem' }}>
                <div>
                  <label style={{ fontSize: '0.6rem', fontWeight: 800, color: '#22c55e', display: 'block', marginBottom: '0.2rem' }}>
                    🟢 LISOS DESDE CRUDO (DÍAS)
                  </label>
                  <input
                    type="number"
                    value={form.lead_time_liso_days}
                    onChange={(e) => setForm({ ...form, lead_time_liso_days: e.target.value })}
                    placeholder="18"
                    style={{ width: '100%', background: '#020617', border: '1px solid rgba(34, 197, 94, 0.4)', borderRadius: '0.5rem', padding: '0.5rem', color: '#22c55e', fontWeight: 900, fontSize: '0.75rem', textAlign: 'center' }}
                  />
                  <span style={{ fontSize: '0.55rem', color: '#64748b' }}>Teñido + Tránsito</span>
                </div>

                <div>
                  <label style={{ fontSize: '0.6rem', fontWeight: 800, color: '#f59e0b', display: 'block', marginBottom: '0.2rem' }}>
                    🟡 FANTASÍAS MTO (DÍAS)
                  </label>
                  <input
                    type="number"
                    value={form.lead_time_fantasia_days}
                    onChange={(e) => setForm({ ...form, lead_time_fantasia_days: e.target.value })}
                    placeholder="55"
                    style={{ width: '100%', background: '#020617', border: '1px solid rgba(245, 158, 11, 0.4)', borderRadius: '0.5rem', padding: '0.5rem', color: '#f59e0b', fontWeight: 900, fontSize: '0.75rem', textAlign: 'center' }}
                  />
                  <span style={{ fontSize: '0.55rem', color: '#64748b' }}>Hilado + Tejido + Acabado</span>
                </div>

                <div>
                  <label style={{ fontSize: '0.6rem', fontWeight: 800, color: '#c084fc', display: 'block', marginBottom: '0.2rem' }}>
                    🟣 POST "SALIDA TEJIDO" (DÍAS)
                  </label>
                  <input
                    type="number"
                    value={form.lead_time_post_weaving_days}
                    onChange={(e) => setForm({ ...form, lead_time_post_weaving_days: e.target.value })}
                    placeholder="14"
                    style={{ width: '100%', background: '#020617', border: '1px solid rgba(192, 132, 252, 0.4)', borderRadius: '0.5rem', padding: '0.5rem', color: '#c084fc', fontWeight: 900, fontSize: '0.75rem', textAlign: 'center' }}
                  />
                  <span style={{ fontSize: '0.55rem', color: '#64748b' }}>Acabado + Aduana + Tránsito</span>
                </div>
              </div>

              {/* Loom Capacity */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginTop: '0.25rem' }}>
                <div>
                  <label style={{ fontSize: '0.6rem', fontWeight: 800, color: '#94a3b8', display: 'block', marginBottom: '0.2rem' }}>CAPACIDAD TELARES (MTS/MES)</label>
                  <input
                    type="number"
                    value={form.mill_loom_monthly_capacity}
                    onChange={(e) => setForm({ ...form, mill_loom_monthly_capacity: e.target.value })}
                    placeholder="80000"
                    style={{ width: '100%', background: '#020617', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '0.5rem', padding: '0.5rem', color: 'white', fontSize: '0.75rem' }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: '0.6rem', fontWeight: 800, color: '#94a3b8', display: 'block', marginBottom: '0.2rem' }}>TIEMPO TRASLADO LOGÍSTICO (DÍAS)</label>
                  <input
                    type="number"
                    value={form.logistics_days}
                    onChange={(e) => setForm({ ...form, logistics_days: e.target.value })}
                    style={{ width: '100%', background: '#020617', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '0.5rem', padding: '0.5rem', color: '#38bdf8', fontWeight: 900, fontSize: '0.75rem' }}
                  />
                </div>
              </div>
            </div>
          )}

          {!isFabric && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
              <div>
                <label style={{ fontSize: '0.65rem', fontWeight: 800, color: '#f59e0b', display: 'block', marginBottom: '0.3rem' }}>
                  {isTrim ? 'LEAD TIME DESPACHO/PRODUCCIÓN (DÍAS)' : 'LEAD TIME CONFECCIÓN (DÍAS)'}
                </label>
                <input
                  type="number"
                  value={form.lead_time_days}
                  onChange={(e) => setForm({ ...form, lead_time_days: e.target.value })}
                  style={{ width: '100%', background: '#020617', border: '1px solid rgba(245, 158, 11, 0.4)', borderRadius: '0.75rem', padding: '0.65rem', color: '#f59e0b', fontWeight: 900, fontSize: '0.8rem' }}
                />
              </div>
              <div>
                <label style={{ fontSize: '0.65rem', fontWeight: 800, color: '#38bdf8', display: 'block', marginBottom: '0.3rem' }}>TIEMPO TRASLADO LOGÍSTICO (DÍAS)</label>
                <input
                  type="number"
                  value={form.logistics_days}
                  onChange={(e) => setForm({ ...form, logistics_days: e.target.value })}
                  style={{ width: '100%', background: '#020617', border: '1px solid rgba(56, 189, 248, 0.4)', borderRadius: '0.75rem', padding: '0.65rem', color: '#38bdf8', fontWeight: 900, fontSize: '0.8rem' }}
                />
              </div>
            </div>
          )}

          {/* Contact Details Grid */}
          <div style={{ background: 'rgba(0,0,0,0.25)', padding: '0.85rem', borderRadius: '0.85rem', display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
            <span style={{ fontSize: '0.62rem', fontWeight: 900, color: '#38bdf8' }}>INFORMACIÓN DE CONTACTO Y UBICACIÓN</span>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.65rem' }}>
              <div>
                <label style={{ fontSize: '0.6rem', fontWeight: 800, color: '#94a3b8', display: 'block', marginBottom: '0.2rem' }}>PERSONA DE CONTACTO</label>
                <input
                  type="text"
                  value={form.contact}
                  onChange={(e) => setForm({ ...form, contact: e.target.value })}
                  placeholder="Lic. / Ing. Encargado"
                  style={{ width: '100%', background: '#020617', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '0.5rem', padding: '0.5rem', color: 'white', fontSize: '0.7rem' }}
                />
              </div>
              <div>
                <label style={{ fontSize: '0.6rem', fontWeight: 800, color: '#94a3b8', display: 'block', marginBottom: '0.2rem' }}>TELÉFONO DIRECTO</label>
                <input
                  type="text"
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  placeholder="+502 / 55-1234-5678"
                  style={{ width: '100%', background: '#020617', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '0.5rem', padding: '0.5rem', color: 'white', fontSize: '0.7rem' }}
                />
              </div>
              <div>
                <label style={{ fontSize: '0.6rem', fontWeight: 800, color: '#94a3b8', display: 'block', marginBottom: '0.2rem' }}>CORREO ELECTRÓNICO</label>
                <input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  placeholder="ventas@proveedor.com"
                  style={{ width: '100%', background: '#020617', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '0.5rem', padding: '0.5rem', color: 'white', fontSize: '0.7rem' }}
                />
              </div>
            </div>
            <div>
              <label style={{ fontSize: '0.6rem', fontWeight: 800, color: '#94a3b8', display: 'block', marginBottom: '0.2rem' }}>DOMICILIO / CIUDAD / ESTADO</label>
              <input
                type="text"
                value={form.address}
                onChange={(e) => setForm({ ...form, address: e.target.value })}
                placeholder="Calle, Número, Parque Industrial, Ciudad..."
                style={{ width: '100%', background: '#020617', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '0.5rem', padding: '0.5rem', color: 'white', fontSize: '0.7rem' }}
              />
            </div>
          </div>

          <div>
            <label style={{ fontSize: '0.65rem', fontWeight: 800, color: '#94a3b8', display: 'block', marginBottom: '0.3rem' }}>NOTAS / CONDICIONES COMERCIALES</label>
            <textarea
              rows={2}
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              placeholder="Condiciones de pago, mínimos de compra, especificaciones técnicas de tela..."
              style={{ width: '100%', background: '#020617', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '0.75rem', padding: '0.65rem', color: 'white', fontSize: '0.75rem', resize: 'vertical' }}
            />
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: '1.25rem' }}>
          <button onClick={onClose} style={{ padding: '0.75rem 1.25rem', background: 'transparent', border: '1px solid rgba(255,255,255,0.1)', color: '#94a3b8', borderRadius: '0.75rem', fontWeight: 800, fontSize: '0.75rem', cursor: 'pointer' }}>
            CANCELAR
          </button>
          <button
            onClick={() => onSave(form)}
            disabled={loading}
            style={{
              padding: '0.75rem 1.75rem',
              background: '#0284c7',
              color: 'white',
              border: 'none',
              borderRadius: '0.75rem',
              fontWeight: 900,
              fontSize: '0.75rem',
              cursor: 'pointer',
              boxShadow: '0 4px 14px rgba(2, 132, 199, 0.4)'
            }}
          >
            {loading ? 'GUARDANDO...' : 'GUARDAR PROVEEDOR'}
          </button>
        </div>
      </div>
    </div>
  )
}
