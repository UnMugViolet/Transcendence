import { getUserStats } from '../services/stats-service.js';

export default async function statsRoutes(fastify) {
  fastify.get('/me', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    try {
      const userId = request.user.id;
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
