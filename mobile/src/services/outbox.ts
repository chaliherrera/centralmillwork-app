// ─────────────────────────────────────────────────────────────────────────────
// Outbox — cola de escrituras de obra que sobrevive a la falta de señal.
// ─────────────────────────────────────────────────────────────────────────────
// Estrategia (análisis Fable): las escrituras de OBRA (check-in, instalar ítem,
// punch, reporte de daño, firma) se intentan directo; si no hay señal (sin
// respuesta / timeout) se ENCOLAN en SQLite y un worker las reenvía en orden al
// reconectar. Cada acción lleva un client_id (idempotency key) → un reenvío no
// duplica (el backend hace ON CONFLICT). NO se encolan compras (van solo con red).
//
// FIFO por proyecto: el check-in tiene que llegar antes que "instalar" (el backend
// bloquea por predecesores). Si una acción falla con error REAL del server (4xx/5xx),
// se marca 'error' y se bloquea ese proyecto (no se saltea) para que el usuario decida.
// ─────────────────────────────────────────────────────────────────────────────

import * as SQLite from 'expo-sqlite'
import * as FileSystem from 'expo-file-system/legacy'
import NetInfo from '@react-native-community/netinfo'
import { AppState } from 'react-native'
import { api } from './api'

export interface OutboxAction {
  id: string                 // = client_id (idempotency key)
  kind: string               // checkin | avance | instalar | punch_crear | punch_resolver | signoff | reporte
  proyecto_id: number        // para FIFO por proyecto (0 = sin proyecto)
  endpoint: string           // path relativo del POST
  file_field: string | null  // 'foto' | 'archivo' | 'firma'
  file_uri: string | null    // uri local del archivo (se persiste al encolar)
  fields: Record<string, string>
  created_at: number
}

interface Row {
  id: string; kind: string; proyecto_id: number; endpoint: string
  file_field: string | null; file_uri: string | null; fields: string
  estado: string; intentos: number; error: string | null; created_at: number
}

const MULTIPART = { headers: { 'Content-Type': 'multipart/form-data' }, timeout: 60000 }

// ── DB (lazy) ────────────────────────────────────────────────────────────────
let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null
async function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (!dbPromise) {
    dbPromise = SQLite.openDatabaseAsync('outbox.db').then(async (db) => {
      await db.execAsync(`CREATE TABLE IF NOT EXISTS outbox (
        id TEXT PRIMARY KEY, kind TEXT NOT NULL, proyecto_id INTEGER NOT NULL DEFAULT 0,
        endpoint TEXT NOT NULL, file_field TEXT, file_uri TEXT, fields TEXT NOT NULL,
        estado TEXT NOT NULL DEFAULT 'pendiente', intentos INTEGER NOT NULL DEFAULT 0,
        error TEXT, created_at INTEGER NOT NULL
      );`)
      return db
    })
  }
  return dbPromise
}

// ── Suscripción (para el badge de la UI) ─────────────────────────────────────
type Listener = () => void
const listeners = new Set<Listener>()
export function subscribe(l: Listener): () => void { listeners.add(l); return () => { listeners.delete(l) } }
function notify() { listeners.forEach((l) => { try { l() } catch { /* noop */ } }) }

// ── Helpers ──────────────────────────────────────────────────────────────────
// Copia la foto a documentDirectory (persistente) — la cache del SO se puede purgar.
async function persistPhoto(uri: string | null): Promise<string | null> {
  if (!uri) return null
  const docDir = FileSystem.documentDirectory
  if (!docDir || uri.startsWith(docDir)) return uri
  const ext = (uri.split('/').pop()?.split('.').pop() || 'jpg').split('?')[0]
  const dest = `${docDir}outbox_${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`
  try { await FileSystem.copyAsync({ from: uri, to: dest }); return dest } catch { return uri }
}

function buildForm(fields: Record<string, string>, fileField: string | null, fileUri: string | null): FormData {
  const fd = new FormData()
  for (const k of Object.keys(fields)) fd.append(k, fields[k])
  if (fileField && fileUri) {
    const name = fileUri.split('/').pop() || 'file'
    const ext = (name.split('.').pop() || 'jpg').toLowerCase()
    const type = ext === 'png' ? 'image/png' : ext === 'pdf' ? 'application/pdf' : 'image/jpeg'
    fd.append(fileField, { uri: fileUri, name, type } as any)
  }
  return fd
}

// ── API pública ───────────────────────────────────────────────────────────────

// Intenta enviar directo; si no hay señal, encola. Devuelve queued=true si quedó
// en la cola. Un error REAL del server (con respuesta) se propaga (no se encola).
export async function submitAction(a: OutboxAction): Promise<{ queued: boolean; data?: any }> {
  try {
    const { data } = await api.post(a.endpoint, buildForm(a.fields, a.file_field, a.file_uri), MULTIPART)
    return { queued: false, data }
  } catch (err: any) {
    if (err?.response) throw err          // el server respondió (4xx/5xx) → error real
    await enqueue(a)                       // sin respuesta = offline/timeout → encolar
    return { queued: true }
  }
}

export async function enqueue(a: OutboxAction): Promise<void> {
  const db = await getDb()
  const fileUri = await persistPhoto(a.file_uri)
  await db.runAsync(
    `INSERT OR IGNORE INTO outbox (id, kind, proyecto_id, endpoint, file_field, file_uri, fields, created_at)
     VALUES (?,?,?,?,?,?,?,?)`,
    a.id, a.kind, a.proyecto_id, a.endpoint, a.file_field, fileUri, JSON.stringify(a.fields), a.created_at
  )
  notify()
}

let flushing = false
export async function flush(): Promise<void> {
  if (flushing) return
  flushing = true
  try {
    const db = await getDb()
    const rows = await db.getAllAsync<Row>(`SELECT * FROM outbox ORDER BY created_at ASC, rowid ASC`)
    const bloqueados = new Set<number>()   // proyectos con un error real (preservar FIFO)
    for (const r of rows) {
      if (bloqueados.has(r.proyecto_id)) continue
      try {
        await api.post(r.endpoint, buildForm(JSON.parse(r.fields), r.file_field, r.file_uri), MULTIPART)
        await db.runAsync(`DELETE FROM outbox WHERE id = ?`, r.id)
        if (r.file_uri) FileSystem.deleteAsync(r.file_uri, { idempotent: true }).catch(() => {})
        notify()
      } catch (err: any) {
        if (!err?.response) break            // sigue sin señal → cortar el flush entero
        await db.runAsync(
          `UPDATE outbox SET estado='error', intentos=intentos+1, error=? WHERE id=?`,
          String(err?.response?.data?.message || err.message || 'error'), r.id)
        bloqueados.add(r.proyecto_id)         // bloquear el proyecto, no saltear
        notify()
      }
    }
  } finally {
    flushing = false
  }
}

export interface OutboxState { pendientes: number; errores: number }
export async function getState(): Promise<OutboxState> {
  const db = await getDb()
  const r = await db.getFirstAsync<{ pend: number; err: number }>(
    `SELECT SUM(CASE WHEN estado='error' THEN 0 ELSE 1 END) AS pend,
            SUM(CASE WHEN estado='error' THEN 1 ELSE 0 END) AS err FROM outbox`)
  return { pendientes: r?.pend ?? 0, errores: r?.err ?? 0 }
}

// Reintentar los que quedaron en 'error' (el usuario toca "reintentar").
export async function retryErrors(): Promise<void> {
  const db = await getDb()
  await db.runAsync(`UPDATE outbox SET estado='pendiente' WHERE estado='error'`)
  notify()
  flush()
}

// ── Worker: dispara flush al recuperar red y al volver a foreground ───────────
let started = false
export function startOutboxWorker(): void {
  if (started) return
  started = true
  NetInfo.addEventListener((s) => { if (s.isConnected && s.isInternetReachable !== false) flush() })
  AppState.addEventListener('change', (s) => { if (s === 'active') flush() })
  flush()
}
