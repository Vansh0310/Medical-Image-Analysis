import { Router } from 'express'
import { User } from '../models/User.js'
import { auth, hashPassword, comparePassword, signJwt } from '../auth/index.js'

const router = Router()
const DUMMY_USER = {
  id: 'dummy-user',
  name: 'Demo User',
  email: 'demo@mediscan.ai',
  password: 'demo123'
}

router.post('/register', async (req, res) => {
  try {
    const { name, email, password } = req.body || {}
    if (!name || !email || !password) {
      return res.status(400).json({ error: 'name, email, and password are required' })
    }
    
    console.log('Registration attempt for email:', email)
    
    const existing = await User.findOne({ email })
    if (existing) {
      console.log('Email already registered:', email)
      return res.status(409).json({ error: 'Email already registered' })
    }
    
    const passwordHash = await hashPassword(password)
    const user = await User.create({ name, email, passwordHash })
    console.log('User registered successfully:', user.email)
    return res.status(201).json({ id: user._id.toString(), name: user.name, email: user.email })
  } catch (err) {
    console.error('Registration error:', err)
    console.error('Error stack:', err.stack)
    return res.status(500).json({ error: err.message || 'Server error' })
  }
})

router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body || {}
    if (!email || !password) {
      return res.status(400).json({ error: 'email and password are required' })
    }
    
    console.log('Login attempt for email:', email)

    // Dev fallback login that bypasses DB user lookup.
    if (email === DUMMY_USER.email && password === DUMMY_USER.password) {
      const token = signJwt({ id: DUMMY_USER.id, email: DUMMY_USER.email })
      return res.json({
        token,
        user: { id: DUMMY_USER.id, name: DUMMY_USER.name, email: DUMMY_USER.email }
      })
    }
    
    const user = await User.findOne({ email })
    if (!user) {
      console.log('User not found for email:', email)
      return res.status(401).json({ error: 'Invalid credentials' })
    }
    
    const ok = await comparePassword(password, user.passwordHash)
    if (!ok) {
      console.log('Password mismatch for email:', email)
      return res.status(401).json({ error: 'Invalid credentials' })
    }
    
    const token = signJwt({ id: user._id.toString(), email: user.email })
    console.log('Login successful for user:', user.email)
    return res.json({ token, user: { id: user._id.toString(), name: user.name, email: user.email } })
  } catch (err) {
    console.error('Login error:', err)
    console.error('Error stack:', err.stack)
    return res.status(500).json({ error: err.message || 'Server error' })
  }
})

router.get('/me', auth(), async (req, res) => {
  return res.json({ user: req.user })
})

export default router


