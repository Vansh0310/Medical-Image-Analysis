import { Router } from 'express'
import { User } from '../models/User.js'
import { auth, hashPassword, comparePassword, signJwt } from '../auth/index.js'

const router = Router()

router.post('/register', async (req, res) => {
  try {
    const { name, email, password } = req.body || {}
    if (!name || !email || !password) {
      return res.status(400).json({ error: 'name, email, and password are required' })
    }
    const existing = await User.findOne({ email })
    if (existing) {
      return res.status(409).json({ error: 'Email already registered' })
    }
    const passwordHash = await hashPassword(password)
    const user = await User.create({ name, email, passwordHash })
    return res.status(201).json({ id: user._id.toString(), name: user.name, email: user.email })
  } catch (err) {
    return res.status(500).json({ error: 'Server error' })
  }
})

router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body || {}
    if (!email || !password) {
      return res.status(400).json({ error: 'email and password are required' })
    }
    const user = await User.findOne({ email })
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' })
    }
    const ok = await comparePassword(password, user.passwordHash)
    if (!ok) {
      return res.status(401).json({ error: 'Invalid credentials' })
    }
    const token = signJwt({ id: user._id.toString(), email: user.email })
    return res.json({ token, user: { id: user._id.toString(), name: user.name, email: user.email } })
  } catch (err) {
    return res.status(500).json({ error: 'Server error' })
  }
})

router.get('/me', auth(), async (req, res) => {
  return res.json({ user: req.user })
})

export default router


