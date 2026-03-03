import type { App } from '../index.js';
import type { FastifyRequest, FastifyReply } from 'fastify';
import { eq } from 'drizzle-orm';
import * as schema from '../db/schema/schema.js';

export function registerWhatsappConfigRoutes(app: App) {
  const requireAuth = app.requireAuth();

  app.fastify.get('/api/whatsapp-config', {
    schema: {
      description: 'Get WhatsApp configuration for current user',
      tags: ['whatsapp'],
      response: {
        200: {
          type: ['object', 'null'],
          properties: {
            id: { type: 'string', format: 'uuid' },
            userId: { type: 'string' },
            apiKey: { type: ['string', 'null'] },
            phoneNumber: { type: ['string', 'null'] },
            isConnected: { type: 'boolean' },
            reminder24h: { type: 'boolean' },
            reminder2h: { type: 'boolean' },
            confirmationOnBooking: { type: 'boolean' },
            waitlistNotification: { type: 'boolean' },
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
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const session = await requireAuth(request, reply);
    if (!session) return;

    app.logger.info(
      { userId: session.user.id },
      'Fetching WhatsApp config'
    );

    const config = await app.db.query.whatsappConfig.findFirst({
      where: eq(schema.whatsappConfig.userId, session.user.id),
    });

    app.logger.info(
      { userId: session.user.id, configExists: !!config },
      'WhatsApp config retrieved successfully'
    );

    return config || null;
  });

  interface UpdateWhatsappConfigBody {
    apiKey?: string;
    phoneNumber?: string;
    isConnected?: boolean;
    reminder24h?: boolean;
    reminder2h?: boolean;
    confirmationOnBooking?: boolean;
    waitlistNotification?: boolean;
  }

  app.fastify.put('/api/whatsapp-config', {
    schema: {
      description: 'Create or update WhatsApp configuration',
      tags: ['whatsapp'],
      body: {
        type: 'object',
        properties: {
          apiKey: { type: 'string' },
          phoneNumber: { type: 'string' },
          isConnected: { type: 'boolean' },
          reminder24h: { type: 'boolean' },
          reminder2h: { type: 'boolean' },
          confirmationOnBooking: { type: 'boolean' },
          waitlistNotification: { type: 'boolean' },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            userId: { type: 'string' },
            apiKey: { type: ['string', 'null'] },
            phoneNumber: { type: ['string', 'null'] },
            isConnected: { type: 'boolean' },
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
    request: FastifyRequest<{ Body: UpdateWhatsappConfigBody }>,
    reply: FastifyReply
  ) => {
    const session = await requireAuth(request, reply);
    if (!session) return;

    app.logger.info(
      { userId: session.user.id, body: request.body },
      'Updating WhatsApp config'
    );

    const existing = await app.db.query.whatsappConfig.findFirst({
      where: eq(schema.whatsappConfig.userId, session.user.id),
    });

    const updates: Record<string, unknown> = {};
    if (request.body.apiKey !== undefined) updates.apiKey = request.body.apiKey;
    if (request.body.phoneNumber !== undefined) updates.phoneNumber = request.body.phoneNumber;
    if (request.body.isConnected !== undefined) updates.isConnected = request.body.isConnected;
    if (request.body.reminder24h !== undefined) updates.reminder24h = request.body.reminder24h;
    if (request.body.reminder2h !== undefined) updates.reminder2h = request.body.reminder2h;
    if (request.body.confirmationOnBooking !== undefined) updates.confirmationOnBooking = request.body.confirmationOnBooking;
    if (request.body.waitlistNotification !== undefined) updates.waitlistNotification = request.body.waitlistNotification;

    let result;
    if (existing) {
      const [updated] = await app.db
        .update(schema.whatsappConfig)
        .set({ ...updates, updatedAt: new Date() })
        .where(eq(schema.whatsappConfig.userId, session.user.id))
        .returning();

      result = updated;
    } else {
      const [created] = await app.db.insert(schema.whatsappConfig).values({
        userId: session.user.id,
        apiKey: request.body.apiKey || null,
        phoneNumber: request.body.phoneNumber || null,
        isConnected: request.body.isConnected || false,
        reminder24h: request.body.reminder24h || false,
        reminder2h: request.body.reminder2h || false,
        confirmationOnBooking: request.body.confirmationOnBooking || false,
        waitlistNotification: request.body.waitlistNotification || false,
      }).returning();

      result = created;
    }

    app.logger.info(
      { userId: session.user.id },
      'WhatsApp config updated successfully'
    );

    return result;
  });

  interface VerifyWhatsappBody {
    apiKey: string;
    phoneNumber: string;
  }

  app.fastify.post('/api/whatsapp-config/verify', {
    schema: {
      description: 'Verify WhatsApp 360dialog connection',
      tags: ['whatsapp'],
      body: {
        type: 'object',
        required: ['apiKey', 'phoneNumber'],
        properties: {
          apiKey: { type: 'string' },
          phoneNumber: { type: 'string' },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            message: { type: 'string' },
          },
        },
        400: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            message: { type: 'string' },
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
    request: FastifyRequest<{ Body: VerifyWhatsappBody }>,
    reply: FastifyReply
  ) => {
    const session = await requireAuth(request, reply);
    if (!session) return;

    const { apiKey, phoneNumber } = request.body;

    app.logger.info(
      { userId: session.user.id, phoneNumber },
      'Verifying WhatsApp connection'
    );

    // Simulated verification - in production, would call 360dialog API
    if (!apiKey || apiKey.length < 10) {
      app.logger.warn(
        { userId: session.user.id },
        'Invalid API key format'
      );
      return reply.status(400).send({
        success: false,
        message: 'Invalid API key format',
      });
    }

    if (!phoneNumber || phoneNumber.length < 10) {
      app.logger.warn(
        { userId: session.user.id },
        'Invalid phone number format'
      );
      return reply.status(400).send({
        success: false,
        message: 'Invalid phone number format',
      });
    }

    // In production, would verify against 360dialog API
    app.logger.info(
      { userId: session.user.id },
      'WhatsApp connection verified successfully'
    );

    return {
      success: true,
      message: 'WhatsApp connection verified successfully',
    };
  });
}
