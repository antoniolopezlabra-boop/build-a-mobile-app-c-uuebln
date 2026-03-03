import type { App } from '../index.js';
import type { FastifyRequest, FastifyReply } from 'fastify';
import { eq } from 'drizzle-orm';
import * as schema from '../db/schema/schema.js';

export function registerServicesRoutes(app: App) {
  const requireAuth = app.requireAuth();

  app.fastify.get('/api/services', {
    schema: {
      description: 'Get all services for current user',
      tags: ['services'],
      response: {
        200: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string', format: 'uuid' },
              userId: { type: 'string' },
              name: { type: 'string' },
              duration: { type: 'integer' },
              price: { type: ['string', 'null'] },
              description: { type: ['string', 'null'] },
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
      'Fetching all services'
    );

    const services = await app.db.query.services.findMany({
      where: eq(schema.services.userId, session.user.id),
    });

    app.logger.info(
      { userId: session.user.id, count: services.length },
      'Services retrieved successfully'
    );

    return services;
  });

  interface CreateServiceBody {
    name: string;
    duration: number;
    price?: string;
    description?: string;
  }

  app.fastify.post('/api/services', {
    schema: {
      description: 'Create a new service',
      tags: ['services'],
      body: {
        type: 'object',
        required: ['name', 'duration'],
        properties: {
          name: { type: 'string' },
          duration: { type: 'integer' },
          price: { type: 'string' },
          description: { type: 'string' },
        },
      },
      response: {
        201: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            userId: { type: 'string' },
            name: { type: 'string' },
            duration: { type: 'integer' },
            price: { type: ['string', 'null'] },
            description: { type: ['string', 'null'] },
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
    request: FastifyRequest<{ Body: CreateServiceBody }>,
    reply: FastifyReply
  ) => {
    const session = await requireAuth(request, reply);
    if (!session) return;

    app.logger.info(
      { userId: session.user.id, name: request.body.name },
      'Creating service'
    );

    const [service] = await app.db.insert(schema.services).values({
      userId: session.user.id,
      name: request.body.name,
      duration: request.body.duration,
      price: request.body.price || null,
      description: request.body.description || null,
    }).returning();

    app.logger.info(
      { serviceId: service.id },
      'Service created successfully'
    );

    return reply.status(201).send(service);
  });

  interface UpdateServiceBody {
    name?: string;
    duration?: number;
    price?: string;
    description?: string;
  }

  app.fastify.put('/api/services/:id', {
    schema: {
      description: 'Update a service',
      tags: ['services'],
      params: {
        type: 'object',
        required: ['id'],
        properties: {
          id: { type: 'string', format: 'uuid' },
        },
      },
      body: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          duration: { type: 'integer' },
          price: { type: 'string' },
          description: { type: 'string' },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            name: { type: 'string' },
            duration: { type: 'integer' },
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
        403: {
          type: 'object',
          properties: {
            error: { type: 'string' },
          },
        },
      },
    },
  }, async (
    request: FastifyRequest<{ Params: { id: string }; Body: UpdateServiceBody }>,
    reply: FastifyReply
  ) => {
    const session = await requireAuth(request, reply);
    if (!session) return;

    const { id } = request.params;

    app.logger.info(
      { userId: session.user.id, serviceId: id, body: request.body },
      'Updating service'
    );

    const service = await app.db.query.services.findFirst({
      where: eq(schema.services.id, id),
    });

    if (!service) {
      app.logger.warn(
        { serviceId: id },
        'Service not found'
      );
      return reply.status(404).send({ error: 'Service not found' });
    }

    if (service.userId !== session.user.id) {
      app.logger.warn(
        { serviceId: id, userId: session.user.id },
        'Unauthorized service access'
      );
      return reply.status(403).send({ error: 'Unauthorized' });
    }

    const updates: Record<string, unknown> = {};
    if (request.body.name !== undefined) updates.name = request.body.name;
    if (request.body.duration !== undefined) updates.duration = request.body.duration;
    if (request.body.price !== undefined) updates.price = request.body.price;
    if (request.body.description !== undefined) updates.description = request.body.description;

    const [updated] = await app.db
      .update(schema.services)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(schema.services.id, id))
      .returning();

    app.logger.info(
      { serviceId: id },
      'Service updated successfully'
    );

    return updated;
  });

  app.fastify.delete('/api/services/:id', {
    schema: {
      description: 'Delete a service',
      tags: ['services'],
      params: {
        type: 'object',
        required: ['id'],
        properties: {
          id: { type: 'string', format: 'uuid' },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
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
        403: {
          type: 'object',
          properties: {
            error: { type: 'string' },
          },
        },
      },
    },
  }, async (
    request: FastifyRequest<{ Params: { id: string } }>,
    reply: FastifyReply
  ) => {
    const session = await requireAuth(request, reply);
    if (!session) return;

    const { id } = request.params;

    app.logger.info(
      { userId: session.user.id, serviceId: id },
      'Deleting service'
    );

    const service = await app.db.query.services.findFirst({
      where: eq(schema.services.id, id),
    });

    if (!service) {
      app.logger.warn(
        { serviceId: id },
        'Service not found'
      );
      return reply.status(404).send({ error: 'Service not found' });
    }

    if (service.userId !== session.user.id) {
      app.logger.warn(
        { serviceId: id, userId: session.user.id },
        'Unauthorized service deletion'
      );
      return reply.status(403).send({ error: 'Unauthorized' });
    }

    await app.db.delete(schema.services).where(eq(schema.services.id, id));

    app.logger.info(
      { serviceId: id },
      'Service deleted successfully'
    );

    return { success: true };
  });
}
