import type { App } from '../index.js';
import type { FastifyRequest, FastifyReply } from 'fastify';
import { eq, and } from 'drizzle-orm';
import * as schema from '../db/schema/schema.js';

export function registerBusinessHoursRoutes(app: App) {
  const requireAuth = app.requireAuth();

  app.fastify.get('/api/business-hours', {
    schema: {
      description: 'Get business hours for current user',
      tags: ['business-hours'],
      response: {
        200: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string', format: 'uuid' },
              userId: { type: 'string' },
              dayOfWeek: { type: 'integer' },
              startTime: { type: 'string' },
              endTime: { type: 'string' },
              isOpen: { type: 'boolean' },
              createdAt: { type: 'string', format: 'date-time' },
              updatedAt: { type: 'string', format: 'date-time' },
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
      'Fetching business hours'
    );

    const hours = await app.db.query.businessHours.findMany({
      where: eq(schema.businessHours.userId, session.user.id),
    });

    app.logger.info(
      { userId: session.user.id, count: hours.length },
      'Business hours retrieved successfully'
    );

    return hours;
  });

  interface SetBusinessHoursBody {
    dayOfWeek: number;
    startTime: string;
    endTime: string;
    isOpen: boolean;
  }

  app.fastify.put('/api/business-hours/:dayOfWeek', {
    schema: {
      description: 'Set business hours for a specific day',
      tags: ['business-hours'],
      params: {
        type: 'object',
        required: ['dayOfWeek'],
        properties: {
          dayOfWeek: { type: 'integer', description: '0-6 (Sunday-Saturday)' },
        },
      },
      body: {
        type: 'object',
        required: ['startTime', 'endTime', 'isOpen'],
        properties: {
          startTime: { type: 'string', description: 'HH:MM format' },
          endTime: { type: 'string', description: 'HH:MM format' },
          isOpen: { type: 'boolean' },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            dayOfWeek: { type: 'integer' },
            startTime: { type: 'string' },
            endTime: { type: 'string' },
            isOpen: { type: 'boolean' },
          },
        },
        401: {
          type: 'object',
          properties: {
            error: { type: 'string' },
          },
        },
        400: {
          type: 'object',
          properties: {
            error: { type: 'string' },
          },
        },
      },
    },
  }, async (
    request: FastifyRequest<{ Params: { dayOfWeek: string }; Body: SetBusinessHoursBody }>,
    reply: FastifyReply
  ) => {
    const session = await requireAuth(request, reply);
    if (!session) return;

    const dayOfWeek = parseInt(request.params.dayOfWeek);

    if (dayOfWeek < 0 || dayOfWeek > 6) {
      return reply.status(400).send({ error: 'dayOfWeek must be between 0 and 6' });
    }

    app.logger.info(
      { userId: session.user.id, dayOfWeek, body: request.body },
      'Setting business hours'
    );

    // Find existing entry for this day
    const existing = await app.db.query.businessHours.findFirst({
      where: and(
        eq(schema.businessHours.userId, session.user.id),
        eq(schema.businessHours.dayOfWeek, dayOfWeek)
      ),
    });

    let result;
    if (existing) {
      const [updated] = await app.db
        .update(schema.businessHours)
        .set({
          startTime: request.body.startTime,
          endTime: request.body.endTime,
          isOpen: request.body.isOpen,
          updatedAt: new Date(),
        })
        .where(eq(schema.businessHours.id, existing.id))
        .returning();

      result = updated;
    } else {
      const [created] = await app.db.insert(schema.businessHours).values({
        userId: session.user.id,
        dayOfWeek,
        startTime: request.body.startTime,
        endTime: request.body.endTime,
        isOpen: request.body.isOpen,
      }).returning();

      result = created;
    }

    app.logger.info(
      { userId: session.user.id, dayOfWeek },
      'Business hours updated successfully'
    );

    return result;
  });
}
