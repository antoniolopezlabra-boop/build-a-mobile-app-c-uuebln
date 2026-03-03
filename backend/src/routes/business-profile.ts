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
    address?: string;
    phone?: string;
    alternativePhone?: string;
    logoUrl?: string;
    weeklySchedule?: Record<string, unknown>;
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
          address: { type: 'string' },
          phone: { type: 'string' },
          alternativePhone: { type: 'string' },
          logoUrl: { type: 'string' },
          weeklySchedule: { type: 'object' },
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
      if (request.body.address !== undefined) {
        updates.address = request.body.address;
      }
      if (request.body.phone !== undefined) {
        updates.phone = request.body.phone;
      }
      if (request.body.alternativePhone !== undefined) {
        updates.alternativePhone = request.body.alternativePhone;
      }
      if (request.body.logoUrl !== undefined) {
        updates.logoUrl = request.body.logoUrl;
      }
      if (request.body.weeklySchedule !== undefined) {
        updates.weeklySchedule = request.body.weeklySchedule;
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
          address: request.body.address || null,
          phone: request.body.phone || null,
          alternativePhone: request.body.alternativePhone || null,
          logoUrl: request.body.logoUrl || null,
          weeklySchedule: request.body.weeklySchedule || null,
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

  app.fastify.post('/api/business-profile/upload-logo', {
    schema: {
      description: 'Upload business logo',
      tags: ['business-profile'],
      response: {
        200: {
          type: 'object',
          properties: {
            logoUrl: { type: 'string' },
          },
        },
        400: {
          type: 'object',
          properties: {
            error: { type: 'string' },
          },
        },
        401: {
          type: 'object',
          properties: {
            error: { type: 'string' },
          },
        },
        413: {
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
      'Uploading business logo'
    );

    const data = await request.file({ limits: { fileSize: 5 * 1024 * 1024 } }); // 5MB limit
    if (!data) {
      app.logger.warn(
        { userId: session.user.id },
        'No file provided for logo upload'
      );
      return reply.status(400).send({ error: 'No file provided' });
    }

    let buffer: Buffer;
    try {
      buffer = await data.toBuffer();
    } catch (err) {
      app.logger.error(
        { err, userId: session.user.id },
        'File too large for logo upload'
      );
      return reply.status(413).send({ error: 'File too large' });
    }

    const logoKey = `logos/${session.user.id}-${Date.now()}-${data.filename}`;

    try {
      const uploadedKey = await app.storage.upload(logoKey, buffer);
      const { url } = await app.storage.getSignedUrl(uploadedKey);

      app.logger.info(
        { userId: session.user.id, logoKey: uploadedKey },
        'Logo uploaded successfully'
      );

      return { logoUrl: url };
    } catch (error) {
      app.logger.error(
        { err: error, userId: session.user.id },
        'Failed to upload logo'
      );
      throw error;
    }
  });
}
