import speakeasy from 'speakeasy';
import QRCode from 'qrcode';
import crypto from 'crypto';
import db from '../db.js';

async function twoFaRoutes(fastify) {


	fastify.post('/enable', { preHandler: fastify.authenticate }, async (request, reply) => {
    console.log('2FA enable called, user:', JSON.stringify(request.user, null, 2));
    console.log('User object keys:', request.user ? Object.keys(request.user) : 'no user');
    
    if (!request.user || !request.user.id) {
      console.error('2FA enable: No user found in request. User object:', JSON.stringify(request.user, null, 2));
      return reply.status(400).send({ error: 'Authentication failed' });
    }
    
    const userId = request.user.id;
    const userName = request.user.name;

    // Generate secret
    const secret = speakeasy.generateSecret({
      name: `Trans_gh (${userName})`,
      issuer: 'Trans_gh'
    });

    // Generate backup codes (10 codes)
    const backupCodes = Array.from({ length: 10 }, () => 
      crypto.randomBytes(4).toString('hex').toUpperCase()
    );

    // Store secret temporarily (not enabled yet)
    db.prepare(
      'UPDATE users SET two_fa_secret = ?, two_fa_backup_codes = ?, two_fa_enabled = 0 WHERE id = ?'
    ).run(secret.base32, JSON.stringify(backupCodes), userId);

    // Generate QR code
    const qrCodeUrl = await QRCode.toDataURL(secret.otpauth_url);

    return {
      secret: secret.base32,
      qrCode: qrCodeUrl,
      backupCodes: backupCodes
    };
  });



  fastify.post('/verify-enable', { preHandler: fastify.authenticate }, async (request, reply) => {
    const userId = request.user.id;
    const { token } = request.body;

    if (!token) {
      return reply.status(400).send({ error: 'Token is required' });
    }

    const user = db.prepare('SELECT two_fa_secret FROM users WHERE id = ?').get(userId);
    
    if (!user || !user.two_fa_secret) {
      return reply.status(400).send({ error: '2FA not initialized' });
    }

    // Verify the token
    const verified = speakeasy.totp.verify({
      secret: user.two_fa_secret,
      encoding: 'base32',
      token: token,
      window: 2 // Allow 2 time steps in either direction
    });

    if (!verified) {
      return reply.status(401).send({ error: 'Invalid token' });
    }

    // Enable 2FA
    db.prepare('UPDATE users SET two_fa_enabled = 1 WHERE id = ?').run(userId);

    return { message: '2FA enabled successfully' };
  });




  fastify.post('/disable', { preHandler: fastify.authenticate }, async (request, reply) => {
    const userId = request.user.id;
    const { token, password } = request.body;

    if (!token || !password) {
      return reply.status(400).send({ error: 'Token and password are required' });
    }

    const user = db.prepare('SELECT two_fa_secret, two_fa_enabled, password FROM users WHERE id = ?').get(userId);
    
    if (!user || !user.two_fa_enabled) {
      return reply.status(400).send({ error: '2FA not enabled' });
    }

    // Verify password
    const bcrypt = await import('bcrypt');
    const isValidPass = bcrypt.compareSync(password, user.password);
    if (!isValidPass) {
      return reply.status(401).send({ error: 'Invalid password' });
    }

    // Verify 2FA token (TOTP or backup code)
    let verified = speakeasy.totp.verify({
      secret: user.two_fa_secret,
      encoding: 'base32',
      token: token,
      window: 2
    });

    // If TOTP fails, check backup codes
    if (!verified) {
      const userBackup = db.prepare('SELECT two_fa_backup_codes FROM users WHERE id = ?').get(userId);
      if (userBackup?.two_fa_backup_codes) {
        try {
          const backupCodes = JSON.parse(userBackup.two_fa_backup_codes);
          const codeIndex = backupCodes.indexOf(String(token).toUpperCase());
          if (codeIndex !== -1) {
            backupCodes.splice(codeIndex, 1);
            db.prepare('UPDATE users SET two_fa_backup_codes = ? WHERE id = ?').run(JSON.stringify(backupCodes), userId);
            verified = true;
          }
        } catch (_) {
          // Ignore malformed backup codes
        }
      }
    }

    if (!verified) {
      return reply.status(401).send({ error: 'Invalid token' });
    }

    // Disable 2FA
    db.prepare(
      'UPDATE users SET two_fa_enabled = 0, two_fa_secret = NULL, two_fa_backup_codes = NULL WHERE id = ?'
    ).run(userId);

    return { message: '2FA disabled successfully' };
  });

  // Verify 2FA token during login
  fastify.post('/verify', async (request, reply) => {
    const { userId, token } = request.body;

    if (!userId || !token) {
      return reply.status(400).send({ error: 'User ID and token are required' });
    }

    const user = db.prepare(
      'SELECT two_fa_secret, two_fa_enabled, two_fa_backup_codes FROM users WHERE id = ?'
    ).get(userId);

    if (!user || !user.two_fa_enabled) {
      return reply.status(400).send({ error: '2FA not enabled for this user' });
    }

    // Try TOTP verification first
    let verified = speakeasy.totp.verify({
      secret: user.two_fa_secret,
      encoding: 'base32',
      token: token,
      window: 2
    });

    // If TOTP fails, check backup codes
    if (!verified && user.two_fa_backup_codes) {
      const backupCodes = JSON.parse(user.two_fa_backup_codes);
      const codeIndex = backupCodes.indexOf(token.toUpperCase());
      
      if (codeIndex !== -1) {
        // Remove used backup code
        backupCodes.splice(codeIndex, 1);
        db.prepare(
          'UPDATE users SET two_fa_backup_codes = ? WHERE id = ?'
        ).run(JSON.stringify(backupCodes), userId);
        verified = true;
      }
    }

    if (!verified) {
      return reply.status(401).send({ error: 'Invalid token' });
    }

    return { message: '2FA verification successful' };
  });

  // Get 2FA status
  fastify.get('/status', { preHandler: fastify.authenticate }, async (request, reply) => {
    const userId = request.user.id;
    
    const user = db.prepare(
      'SELECT two_fa_enabled, two_fa_backup_codes FROM users WHERE id = ?'
    ).get(userId);

    const backupCodes = user.two_fa_backup_codes ? JSON.parse(user.two_fa_backup_codes) : [];

    return {
      enabled: Boolean(user.two_fa_enabled),
      backupCodesRemaining: backupCodes.length
    };
  });
}

export default twoFaRoutes;
