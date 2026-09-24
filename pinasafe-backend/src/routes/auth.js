const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const { getClient } = require('../config/database');
const { validateRegister, validateLogin } = require('../middleware/validation');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

router.post('/register', validateRegister, async (req, res) => {
  try {
    const { email, password, name, phone, address } = req.body;
    const supabase = getClient();

    const { data: existingUser } = await supabase
      .from('users')
      .select('id')
      .eq('email', email.toLowerCase())
      .maybeSingle();

    if (existingUser) {
      return res.status(409).json({ error: 'Email already registered' });
    }

    const hashedPassword = await bcrypt.hash(password, 12);
    const userId = uuidv4();

    const { error: insertError } = await supabase
      .from('users')
      .insert({
        id: userId,
        email: email.toLowerCase(),
        password_hash: hashedPassword,
        name,
        role: 'citizen',
        phone: phone || null,
        address: address || null,
        verified: false,
        must_change_password: false,
      });

    if (insertError) {
      console.error('User insert error:', insertError);
      return res.status(500).json({ error: 'Registration failed' });
    }

    await supabase
      .from('system_alerts')
      .insert({
        id: uuidv4(),
        type: 'community',
        title: '👋 Welcome to PinaSafe!',
        description: `Welcome ${name}! You are now connected to the emergency response system. Stay safe and stay informed.`,
        priority: 'low',
        location: 'System',
        affected_areas: ['New Users'],
        created_by: userId
      });

    const token = jwt.sign(
      { userId, email: email.toLowerCase(), role: 'citizen' },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    );

    const { data: user } = await supabase
      .from('users')
      .select('id, email, name, role, phone, address, verified, created_at')
      .eq('id', userId)
      .single();

    res.status(201).json({
      message: 'User registered successfully',
      user,
      token
    });

  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Registration failed' });
  }
});

router.post('/login', validateLogin, async (req, res) => {
  try {
    const { email, password } = req.body;
    const supabase = getClient();

    const { data: user, error } = await supabase
      .from('users')
      .select('*')
      .eq('email', email.toLowerCase())
      .maybeSingle();

    if (!user) {
      console.log('Login attempt with invalid email:', email);
      console.log('Supabase error:', error);
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const isValidPassword = await bcrypt.compare(password, user.password_hash);

    console.log('Password validation result for', email, ':', isValidPassword);

    if (!isValidPassword) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    if (user.role === 'responder' || user.role === 'admin') {
      const { data: personnel } = await supabase
        .from('personnel')
        .select('team_id')
        .eq('user_id', user.id)
        .maybeSingle();

      if (personnel && personnel.team_id) {
        user.team_id = personnel.team_id;
      }
    }

    const token = jwt.sign(
      { userId: user.id, email: user.email, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    );

    delete user.password_hash;

    res.json({
      message: 'Login successful',
      user,
      token,
      mustChangePassword: user.must_change_password === true
    });

  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Login failed' });
  }
});

router.post('/refresh', authenticateToken, async (req, res) => {
  try {
    const { user } = req;

    const token = jwt.sign(
      { userId: user.id, email: user.email, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    );

    res.json({
      message: 'Token refreshed successfully',
      token
    });

  } catch (error) {
    console.error('Token refresh error:', error);
    res.status(500).json({ error: 'Token refresh failed' });
  }
});

router.post('/change-password', authenticateToken, async (req, res) => {
  try {
    const { newPassword } = req.body;
    const supabase = getClient();

    const hashed = await bcrypt.hash(newPassword, 12);

    const { error } = await supabase
      .from("users")
      .update({
        password_hash: hashed,
        must_change_password: false
      })
      .eq("id", req.user.id);

    if (error) {
      console.error("Password change error:", error);
      return res.status(500).json({ error: "Failed to change password" });
    }

    res.json({ message: "Password changed successfully" });

  } catch (error) {
    console.error("Change password error:", error);
    res.status(500).json({ error: "Failed to change password" });
  }
});

router.post('/logout', authenticateToken, (req, res) => {
  res.json({ message: 'Logout successful' });
});

router.get('/me', authenticateToken, (req, res) => {
  res.json({ user: req.user });
});

module.exports = router;
