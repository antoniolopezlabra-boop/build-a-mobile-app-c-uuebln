import type { App } from '../index.js';
import type { FastifyRequest, FastifyReply } from 'fastify';
import { eq } from 'drizzle-orm';
import * as schema from '../db/schema/schema.js';

export function registerAuthRoutes(app: App) {
  const requireAuth = app.requireAuth();

  app.fastify.get('/api/auth/me', {
    schema: {
      description: 'Get current user info with business profile',
      tags: ['auth'],
      response: {
        200: {
          type: 'object',
          properties: {
            user: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                name: { type: 'string' },
                email: { type: 'string' },
                emailVerified: { type: 'boolean' },
                image: { type: ['string', 'null'] },
                createdAt: { type: 'string', format: 'date-time' },
                updatedAt: { type: 'string', format: 'date-time' },
              },
            },
            businessProfile: {
              type: 'object',
              properties: {
                id: { type: 'string', format: 'uuid' },
                userId: { type: 'string' },
                businessName: { type: 'string' },
                businessType: { type: 'string' },
                createdAt: { type: 'string', format: 'date-time' },
                updatedAt: { type: 'string', format: 'date-time' },
              },
            },
          },
        },
        401: {
          type: 'object',
          properties: {
            error: { type: 'string' },
          },
        },
      },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const session = await requireAuth(request, reply);
    if (!session) return;

    app.logger.info(
      { userId: session.user.id },
      'Fetching current user info with business profile'
    );

    const businessProfile = await app.db.query.businessProfiles.findFirst({
      where: eq(schema.businessProfiles.userId, session.user.id),
    });

    app.logger.info(
      { userId: session.user.id },
      'Current user info retrieved successfully'
    );

    return {
      user: session.user,
      businessProfile: businessProfile || null,
    };
  });
}
