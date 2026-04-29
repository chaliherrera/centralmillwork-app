import { Request, Response, NextFunction } from 'express'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import pool from '../db/pool'
import { createError } from '../middleware/errorHandler'

export async function login(req: Request, res: Response, next: NextFunction) {
  try {
    const { email, password } = req.body
    if (!email || !password) return next(createError('Email y password requeridos', 400))

    const { rows: [user] } = await pool.query(
      `SELECT id, nombre, email, password_hash, rol, activo FROM usuarios WHERE email = $1`,
      [String(email).toLowerCase().trim()]
    )
    if (!user || !user.activo) return next(createError('Credenciales inválidas', 401))

    const valid = await bcrypt.compare(String(password), user.password_hash)
    if (!valid) return next(createError('Credenciales inválidas', 401))

    const token = jwt.sign(
      { id: user.id, email: user.email, rol: user.rol },
      process.env.JWT_SECRET!,
      { expiresIn: (process.env.JWT_EXPIRES_IN ?? '8h') as jwt.SignOptions['expiresIn'] }
    )

    const { password_hash: _ph, ...userData } = user
    res.json({ token, user: userData })
  } catch (err) { next(err) }
}

export async function me(req: Request, res: Response, next: NextFunction) {
  try {
    const { rows: [user] } = await pool.query(
      `SELECT id, nombre, email, rol, activo, created_at, updated_at FROM usuarios WHERE id = $1`,
      [req.user!.id]
    )
    if (!user) return next(createError('Usuario no encontrado', 404))
    res.json({ data: user })
  } catch (err) { next(err) }
}

export function logout(_req: Request, res: Response) {
  res.json({ message: 'Sesión cerrada' })
}
