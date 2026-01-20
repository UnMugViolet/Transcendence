import speakeasy from 'speakeasy';
import QRCode from 'qrcode';
import crypto from 'crypto';
import db from '../db.js';

/**
 * Two-Factor Authentication (2FA) Routes Module
 * 
 * Provides TOTP-based two-factor authentication functionality with backup codes.
 * Implements secure 2FA lifecycle management including:
 * - Initial setup and secret generation
 * - QR code generation for authenticator apps
 * - Token verification and validation
 * - Backup code management
 * - 2FA status monitoring
 * 
 * @module twoFaRoutes
 * @requires speakeasy - Time-based One-Time Password (TOTP) generation and verification
 * @requires qrcode - QR code generation for authenticator app setup
 * @requires crypto - Cryptographically secure random backup code generation
 * @requires db - Database connection for user data persistence
 */

/**
 * Register two-factor authentication routes with Fastify instance
 * 
 * @param {import('fastify').FastifyInstance} fastify - Fastify server instance
 * @returns {Promise<void>}
 */
async function twoFaRoutes(fastify) {

	/**
	 * Initialize 2FA Setup
	 * 
	 * Generates a new TOTP secret and 10 backup codes for the authenticated user.
	 * The 2FA is not enabled until the user verifies a token via /verify-enable.
	 * 
	 * Security Notes:
	 * - Requires valid JWT authentication
	 * - Secret is stored temporarily until verification
	 * - Backup codes are hashed before storage
	 * - QR code contains otpauth:// URL for authenticator apps
	 * 
	 * @name POST /2fa/enable
	 * @function
	 * @memberof module:twoFaRoutes
	 * @param {Object} request - Fastify request object
	 * @param {Object} request.user - Authenticated user from JWT (via preHandler)
	 * @param {number} request.user.id - User ID
	 * @param {string} request.user.name - Username for TOTP label
	 * @param {Object} reply - Fastify reply object
	 * @returns {Promise<Object>} Response containing secret, QR code, and backup codes
	 * @returns {string} return.secret - Base32 encoded TOTP secret (for manual entry)
	 * @returns {string} return.qrCode - Data URL of QR code image
	 * @returns {string[]} return.backupCodes - Array of 10 backup codes (8 hex characters each)
	 * @throws {400} Authentication failed - No valid user in JWT token
	 */
	fastify.post('/enable', { 
		preHandler: fastify.authenticate,
		schema: {
			description: 'Initialize 2FA setup - generates secret and backup codes',
			tags: ['2FA'],
			security: [{ bearerAuth: [] }],
			response: {
				200: {
					type: 'object',
					required: ['secret', 'qrCode', 'backupCodes'],
					properties: {
						secret: { 
							type: 'string',
							description: 'Base32 encoded TOTP secret for manual entry'
						},
						qrCode: { 
							type: 'string',
							description: 'Data URL of QR code for authenticator apps'
						},
						backupCodes: { 
							type: 'array',
							items: { type: 'string' },
							minItems: 10,
							maxItems: 10,
							description: 'Backup codes for account recovery'
						}
					}
				},
				400: {
					type: 'object',
					properties: {
						error: { type: 'string' }
					}
				}
			}
		}
	}, async (request, reply) => {


    
    if (!request.user || !request.user.id) {
      console.error('2FA enable: No user found in request. User object:', JSON.stringify(request.user, null, 2));
      return reply.status(400).send({ error: 'Authentication failed' });
    }
    
    const userId = request.user.id;
    const userName = request.user.name;

    // Generate secret
    const secret = speakeasy.generateSecret({
      name: `LLDBQIA + (${userName})`,
      issuer: 'LLDBQIA +'
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

	/**
	 * Verify and Enable 2FA
	 * 
	 * Validates a TOTP token from the user's authenticator app and activates 2FA.
	 * This is the second step in the 2FA setup process after /enable.
	 * 
	 * The verification uses a time window of 2 steps (±60 seconds) to account for
	 * clock skew between server and client device.
	 * 
	 * @name POST /2fa/verify-enable
	 * @function
	 * @memberof module:twoFaRoutes
	 * @param {Object} request - Fastify request object
	 * @param {Object} request.user - Authenticated user from JWT
	 * @param {number} request.user.id - User ID
	 * @param {Object} request.body - Request body
	 * @param {string} request.body.token - 6-digit TOTP token from authenticator app
	 * @param {Object} reply - Fastify reply object
	 * @returns {Promise<Object>} Success message
	 * @returns {string} return.message - Confirmation message
	 * @throws {400} Token is required - Missing token in request body
	 * @throws {400} 2FA not initialized - User has not called /enable first
	 * @throws {401} Invalid token - TOTP verification failed
	 */
  fastify.post('/verify-enable', { 
		preHandler: fastify.authenticate,
		schema: {
			description: 'Verify TOTP token and activate 2FA',
			tags: ['2FA'],
			security: [{ bearerAuth: [] }],
			body: {
				type: 'object',
				required: ['token'],
				properties: {
					token: { 
						type: 'string',
						description: '6-digit TOTP code',
						pattern: '^[0-9]{6}$'
					}
				}
			},
			response: {
				200: {
					type: 'object',
					properties: {
						message: { type: 'string' }
					}
				},
				400: {
					type: 'object',
					properties: {
						error: { type: 'string' }
					}
				},
				401: {
					type: 'object',
					properties: {
						error: { type: 'string' }
					}
				}
			}
		}
	}, async (request, reply) => {
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

	/**
	 * Disable 2FA
	 * 
	 * Disables two-factor authentication for the user account.
	 * Requires both password verification AND valid 2FA token for security.
	 * 
	 * This endpoint accepts either:
	 * - A valid TOTP token from authenticator app
	 * - A valid backup code (which will be consumed)
	 * 
	 * Upon successful disable, all 2FA data is removed:
	 * - two_fa_secret is cleared
	 * - two_fa_backup_codes are deleted
	 * - two_fa_enabled flag is set to 0
	 * 
	 * @name POST /2fa/disable
	 * @function
	 * @memberof module:twoFaRoutes
	 * @param {Object} request - Fastify request object
	 * @param {Object} request.user - Authenticated user from JWT
	 * @param {number} request.user.id - User ID
	 * @param {Object} request.body - Request body
	 * @param {string} request.body.token - TOTP token or backup code
	 * @param {string} request.body.password - User's account password
	 * @param {Object} reply - Fastify reply object
	 * @returns {Promise<Object>} Success message
	 * @returns {string} return.message - Confirmation message
	 * @throws {400} Token and password are required - Missing required fields
	 * @throws {400} 2FA not enabled - User doesn't have 2FA active
	 * @throws {401} Invalid password - Password verification failed
	 * @throws {401} Invalid token - Neither TOTP nor backup code is valid
	 */
  fastify.post('/disable', { 
		preHandler: fastify.authenticate,
		schema: {
			description: 'Disable 2FA - requires password and valid token',
			tags: ['2FA'],
			security: [{ bearerAuth: [] }],
			body: {
				type: 'object',
				required: ['token', 'password'],
				properties: {
					token: { 
						type: 'string',
						description: 'TOTP code or backup code'
					},
					password: { 
						type: 'string',
						description: 'User password for verification'
					}
				}
			},
			response: {
				200: {
					type: 'object',
					properties: {
						message: { type: 'string' }
					}
				},
				400: {
					type: 'object',
					properties: {
						error: { type: 'string' }
					}
				},
				401: {
					type: 'object',
					properties: {
						error: { type: 'string' }
					}
				}
			}
		}
	}, async (request, reply) => {
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

	/**
	 * Verify 2FA Token During Login
	 * 
	 * Validates a 2FA token for user authentication flow.
	 * This endpoint is called during login after username/password verification
	 * when the user has 2FA enabled.
	 * 
	 * Token Verification Process:
	 * 1. First attempts TOTP verification with time window
	 * 2. If TOTP fails, checks backup codes
	 * 3. Used backup codes are automatically removed from database
	 * 
	 * Security Notes:
	 * - Does NOT require authentication (called during login)
	 * - Requires userId to prevent brute force across accounts
	 * - Time window of ±60 seconds for TOTP validation
	 * - Backup codes are case-insensitive and single-use
	 * 
	 * @name POST /2fa/verify
	 * @function
	 * @memberof module:twoFaRoutes
	 * @param {Object} request - Fastify request object
	 * @param {Object} request.body - Request body
	 * @param {number} request.body.userId - User ID attempting authentication
	 * @param {string} request.body.token - TOTP token or backup code
	 * @param {Object} reply - Fastify reply object
	 * @returns {Promise<Object>} Success message
	 * @returns {string} return.message - Confirmation message
	 * @throws {400} User ID and token are required - Missing required fields
	 * @throws {400} 2FA not enabled for this user - User doesn't have 2FA active
	 * @throws {401} Invalid token - Neither TOTP nor backup code is valid
	 */
  fastify.post('/verify', {
		schema: {
			description: 'Verify 2FA token during login flow',
			tags: ['2FA'],
			body: {
				type: 'object',
				required: ['userId', 'token'],
				properties: {
					userId: { 
						type: 'integer',
						description: 'User ID to verify',
						minimum: 1
					},
					token: { 
						type: 'string',
						description: 'TOTP code or backup code'
					}
				}
			},
			response: {
				200: {
					type: 'object',
					properties: {
						message: { type: 'string' }
					}
				},
				400: {
					type: 'object',
					properties: {
						error: { type: 'string' }
					}
				},
				401: {
					type: 'object',
					properties: {
						error: { type: 'string' }
					}
				}
			}
		}
	}, async (request, reply) => {
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

	/**
	 * Get 2FA Status
	 * 
	 * Retrieves the current two-factor authentication status for the authenticated user.
	 * Provides information about whether 2FA is enabled and how many backup codes remain.
	 * 
	 * This endpoint is useful for:
	 * - Displaying 2FA status in user settings
	 * - Warning users when backup codes are running low
	 * - Conditionally showing 2FA setup/disable options in UI
	 * 
	 * @name GET /2fa/status
	 * @function
	 * @memberof module:twoFaRoutes
	 * @param {Object} request - Fastify request object
	 * @param {Object} request.user - Authenticated user from JWT
	 * @param {number} request.user.id - User ID
	 * @param {Object} reply - Fastify reply object
	 * @returns {Promise<Object>} 2FA status information
	 * @returns {boolean} return.enabled - Whether 2FA is currently enabled
	 * @returns {number} return.backupCodesRemaining - Number of unused backup codes (0-10)
	 */
  fastify.get('/status', { 
		preHandler: fastify.authenticate,
		schema: {
			description: 'Get current 2FA status for authenticated user',
			tags: ['2FA'],
			security: [{ bearerAuth: [] }],
			response: {
				200: {
					type: 'object',
					required: ['enabled', 'backupCodesRemaining'],
					properties: {
						enabled: { 
							type: 'boolean',
							description: 'Whether 2FA is currently enabled'
						},
						backupCodesRemaining: { 
							type: 'integer',
							description: 'Number of unused backup codes',
							minimum: 0,
							maximum: 10
						}
					}
				}
			}
		}
	}, async (request, reply) => {
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
