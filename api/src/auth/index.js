import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { env } from '../config/env.js'

const DEFAULT_EXPIRY = '7d'

export async function hashPassword(plain) {
  const salt = await bcrypt.genSalt(10)
  return bcrypt.hash(plain, salt)
}

export function comparePassword(plain, hash) {
  return bcrypt.compare(plain, hash)
}

export function signJwt(payload, options = {}) {
  const { expiresIn = DEFAULT_EXPIRY } = options
  return jwt.sign(payload, env.jwtSecret, { algorithm: 'HS256', expiresIn })
}

export function auth() {
  return (req, res, next) => {
    const header = req.headers['authorization'] || ''
    const [scheme, token] = header.split(' ')
    if (scheme !== 'Bearer' || !token) {
      return res.status(401).json({ error: 'Unauthorized' })
    }
    try {
      const decoded = jwt.verify(token, env.jwtSecret, { algorithms: ['HS256'] })
      req.user = { id: decoded.id, email: decoded.email }
      return next()
    } catch (err) {
      return res.status(401).json({ error: 'Unauthorized' })
    }
  }
}


