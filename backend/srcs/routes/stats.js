import { getUserStats } from '../services/stats-service.js';

const errorResponseSchema = {
  type: 'object',
  properties: {
    success: { type: 'boolean' },
    error: { type: 'string' }
  }
};

export default async function statsRoutes(fastify) {
  fastify.get('/me', {
    preHandler: [fastify.authenticate],
    schema: {
      description: 'Get statistics for the current user',
      tags: ['Stats'],
      security: [{ bearerAuth: [] }],
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            data: {
              type: 'object',
              properties: {
                totalGames: { type: 'integer', description: 'Total number of games played' },
                wins: { type: 'integer', description: 'Number of games won' },
                losses: { type: 'integer', description: 'Number of games lost' },
                winRate: { type: 'number', description: 'Win rate percentage' },
                avgScore: { type: 'number', description: 'Average score per game' },
                recentMatches: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      match_id: { type: 'integer' },
                      opponent_name: { type: 'string' },
                      user_score: { type: 'integer' },
                      opponent_score: { type: 'integer' },
                      result: { type: 'string', enum: ['win', 'loss'] },
                      created_at: { type: 'integer' }
                    }
                  }
                }
              }
            }
          }
        },
        401: errorResponseSchema,
        500: errorResponseSchema
      }
    }
  }, async (request, reply) => {
    try {
      const userId = request.user.id;  // maintenant request.user est garanti
      const stats = getUserStats(userId);

      return {
        success: true,
        data: stats
      };
    } catch (err) {
      console.error('Error fetching stats:', err);
      return reply.code(500).send({ success: false, error: 'Internal Server Error' });
    }
  });
}
