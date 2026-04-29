import { Request, Response, NextFunction } from 'express'
import multer from 'multer'
import path from 'path'
import fs from 'fs'
import pool from '../db/pool'
import { createError } from '../middleware/errorHandler'

const UPLOADS_DIR = path.join(__dirname, '../../uploads')
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true })

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOADS_DIR),
  filename: (_req, file, cb) => {
    const ext  = path.extname(file.originalname)
    const name = `${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`
    cb(null, name)
  },
})

const fileFilter = (_req: Request, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  const allowed = /jpeg|jpg|png|webp|gif|pdf/
  if (allowed.test(path.extname(file.originalname).toLowerCase())) {
    cb(null, true)
  } else {
    cb(new Error('Solo se permiten imágenes (jpg, png, webp, gif) o PDF'))
  }
}

export const upload = multer({ storage, fileFilter, limits: { fileSize: 10 * 1024 * 1024 } })

export async function getImagenes(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = req.params
    const { rows } = await pool.query(
      `SELECT * FROM oc_imagenes WHERE orden_compra_id = $1 ORDER BY tipo, created_at`,
      [id]
    )
    res.json({ data: rows })
  } catch (err) { next(err) }
}

export async function uploadImagen(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = req.params
    const tipo = (req.query.tipo as string) || 'material_recibido'
    if (!req.file) return next(createError('No se recibió ningún archivo', 400))

    const { rows } = await pool.query(
      `INSERT INTO oc_imagenes (orden_compra_id, tipo, filename, original_name)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [id, tipo, req.file.filename, req.file.originalname]
    )
    res.status(201).json({ data: rows[0], message: 'Imagen guardada' })
  } catch (err) { next(err) }
}

export async function deleteImagen(req: Request, res: Response, next: NextFunction) {
  try {
    const { imagenId } = req.params
    const { rows: [img] } = await pool.query(
      `DELETE FROM oc_imagenes WHERE id = $1 RETURNING *`, [imagenId]
    )
    if (!img) return next(createError('Imagen no encontrada', 404))

    const filePath = path.join(UPLOADS_DIR, img.filename)
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath)

    res.json({ message: 'Imagen eliminada' })
  } catch (err) { next(err) }
}
