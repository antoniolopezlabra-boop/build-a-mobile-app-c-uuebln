import type { App } from '../index.js';
import type { FastifyRequest, FastifyReply } from 'fastify';
import { eq } from 'drizzle-orm';
import * as schema from '../db/schema/schema.js';

export function registerBusinessProfileRoutes(app: App) {
  const requireAuth = app.requireAuth();

  app.fastify.get('/api/business-profile', {
    schema: {
      description: 'Get business profile for current user',
      tags: ['business-profile'],
      response: {
        200: {
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
        401: {
          type: 'object',
          properties: {
            error: { type: 'string' },
          },
        },
        404: {
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
      'Fetching business profile'
    );

    const profile = await app.db.query.businessProfiles.findFirst({
      where: eq(schema.businessProfiles.userId, session.user.id),
    });

    if (!profile) {
      app.logger.warn(
        { userId: session.user.id },
        'Business profile not found'
      );
      return reply.status(404).send({ error: 'Business profile not found' });
    }

    app.logger.info(
      { profileId: profile.id },
      'Business profile retrieved successfully'
    );

    return profile;
  });

  interface UpdateBusinessProfileBody {
    businessName?: string;
    businessType?: string;
  }

  app.fastify.put('/api/business-profile', {
    schema: {
      description: 'Update business profile for current user',
      tags: ['business-profile'],
      body: {
        type: 'object',
        properties: {
          businessName: { type: 'string' },
          businessType: { type: 'string' },
        },
      },
      response: {
        200: {
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
        401: {
          type: 'object',
          properties: {
            error: { type: 'string' },
          },
        },
      },
    },
  }, async (
    request: FastifyRequest<{ Body: UpdateBusinessProfileBody }>,
    reply: FastifyReply
  ) => {
    const session = await requireAuth(request, reply);
    if (!session) return;

    app.logger.info(
      { userId: session.user.id, body: request.body },
      'Updating business profile'
    );

    const existingProfile = await app.db.query.businessProfiles.findFirst({
      where: eq(schema.businessProfiles.userId, session.user.id),
    });

    let updated;
    if (existingProfile) {
      const updates: Record<string, unknown> = {};
      if (request.body.businessName !== undefined) {
        updates.businessName = request.body.businessName;
      }
      if (request.body.businessType !== undefined) {
        updates.businessType = request.body.businessType;
      }

      const [result] = await app.db
        .update(schema.businessProfiles)
        .set({ ...updates, updatedAt: new Date() })
        .where(eq(schema.businessProfiles.userId, session.user.id))
        .returning();

      updated = result;
    } else {
      // Create profile if it doesn't exist
      const [result] = await app.db
        .insert(schema.businessProfiles)
        .values({
          userId: session.user.id,
          businessName: request.body.businessName || 'My Business',
          businessType: request.body.businessType || 'Otro',
        })
        .returning();

      updated = result;
    }

    app.logger.info(
      { profileId: updated.id },
      'Business profile updated successfully'
    );

    return updated;
  });
}
