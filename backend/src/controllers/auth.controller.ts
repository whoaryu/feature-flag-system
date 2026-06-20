import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { getAdminRepo } from '../repositories';
import { AuthenticatedRequest } from '../middlewares/auth.middleware';

const JWT_SECRET = process.env.JWT_SECRET || 'feature-flag-system-secret-key-999';

export async function login(req: Request, res: Response) {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required.' });
  }

  try {
    const adminRepo = getAdminRepo();
    const admin = await adminRepo.getAdminByEmail(email);

    if (!admin) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    const isMatch = bcrypt.compareSync(password, admin.passwordHash);
    if (!isMatch) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    const token = jwt.sign(
      { id: admin.id, email: admin.email, name: admin.name },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.json({
      token,
      admin: {
        id: admin.id,
        email: admin.email,
        name: admin.name
      }
    });
  } catch (e: any) {
    res.status(500).json({ error: 'Server error during login.', details: e.message });
  }
}

export async function signup(req: Request, res: Response) {
  const { email, password, name } = req.body;

  if (!email || !password || !name) {
    return res.status(400).json({ error: 'Email, password, and name are required.' });
  }

  try {
    const adminRepo = getAdminRepo();
    const existing = await adminRepo.getAdminByEmail(email);
    if (existing) {
      return res.status(400).json({ error: 'Admin with this email already exists.' });
    }

    const adminId = 'admin-' + Math.random().toString(36).substr(2, 9);
    const passwordHash = bcrypt.hashSync(password, 10);

    const admin = await adminRepo.createAdmin({
      id: adminId,
      email,
      passwordHash,
      name
    });

    const token = jwt.sign(
      { id: admin.id, email: admin.email, name: admin.name },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.status(201).json({
      token,
      admin: {
        id: admin.id,
        email: admin.email,
        name: admin.name
      }
    });
  } catch (e: any) {
    res.status(500).json({ error: 'Server error during signup.', details: e.message });
  }
}

export async function getMe(req: AuthenticatedRequest, res: Response) {
  if (!req.admin) {
    return res.status(401).json({ error: 'Not authenticated.' });
  }
  res.json({ admin: req.admin });
}
