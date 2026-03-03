import type { App } from '../index.js';
import type { FastifyRequest, FastifyReply } from 'fastify';
import { eq } from 'drizzle-orm';
import * as schema from '../db/schema/schema.js';

export function registerClientsRoutes(app: App) {
  const requireAuth = app.requireAuth();

  app.fastify.get('/api/clients', {
    schema: {
      description: 'Get all clients for current user',
      tags: ['clients'],
      response: {
        200: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string', format: 'uuid' },
              userId: { type: 'string' },
              name: { type: 'string' },
              phone: { type: 'string' },
              email: { type: ['string', 'null'] },
              notes: { type: ['string', 'null'] },
              lastVisit: { type: ['string', 'null'] },
              totalVisits: { type: 'integer' },
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
      'Fetching all clients'
    );

    const clients = await app.db.query.clients.findMany({
      where: eq(schema.clients.userId, session.user.id),
    });

    app.logger.info(
      { userId: session.user.id, count: clients.length },
      'Clients retrieved successfully'
    );

    return clients;
  });

  interface CreateClientBody {
    name: string;
    phone: string;
    email?: string;
    notes?: string;
  }

  app.fastify.post('/api/clients', {
    schema: {
      description: 'Create a new client',
      tags: ['clients'],
      body: {
        type: 'object',
        required: ['name', 'phone'],
        properties: {
          name: { type: 'string' },
          phone: { type: 'string' },
          email: { type: 'string' },
          notes: { type: 'string' },
        },
      },
      response: {
        201: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            userId: { type: 'string' },
            name: { type: 'string' },
            phone: { type: 'string' },
            email: { type: ['string', 'null'] },
            notes: { type: ['string', 'null'] },
            lastVisit: { type: ['string', 'null'] },
            totalVisits: { type: 'integer' },
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
    request: FastifyRequest<{ Body: CreateClientBody }>,
    reply: FastifyReply
  ) => {
    const session = await requireAuth(request, reply);
    if (!session) return;

    app.logger.info(
      { userId: session.user.id, name: request.body.name },
      'Creating client'
    );

    const [client] = await app.db.insert(schema.clients).values({
      userId: session.user.id,
      name: request.body.name,
      phone: request.body.phone,
      email: request.body.email || null,
      notes: request.body.notes || null,
    }).returning();

    app.logger.info(
      { clientId: client.id },
      'Client created successfully'
    );

    return reply.status(201).send(client);
  });

  interface UpdateClientBody {
    name?: string;
    phone?: string;
    email?: string;
    notes?: string;
  }

  app.fastify.put('/api/clients/:id', {
    schema: {
      description: 'Update a client',
      tags: ['clients'],
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
          phone: { type: 'string' },
          email: { type: 'string' },
          notes: { type: 'string' },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            userId: { type: 'string' },
            name: { type: 'string' },
            phone: { type: 'string' },
            email: { type: ['string', 'null'] },
            notes: { type: ['string', 'null'] },
            lastVisit: { type: ['string', 'null'] },
            totalVisits: { type: 'integer' },
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
        403: {
          type: 'object',
          properties: {
            error: { type: 'string' },
          },
        },
      },
    },
  }, async (
    request: FastifyRequest<{ Params: { id: string }; Body: UpdateClientBody }>,
    reply: FastifyReply
  ) => {
    const session = await requireAuth(request, reply);
    if (!session) return;

    const { id } = request.params;

    app.logger.info(
      { userId: session.user.id, clientId: id, body: request.body },
      'Updating client'
    );

    const client = await app.db.query.clients.findFirst({
      where: eq(schema.clients.id, id),
    });

    if (!client) {
      app.logger.warn(
        { clientId: id },
        'Client not found'
      );
      return reply.status(404).send({ error: 'Client not found' });
    }

    if (client.userId !== session.user.id) {
      app.logger.warn(
        { clientId: id, userId: session.user.id },
        'Unauthorized client access'
      );
      return reply.status(403).send({ error: 'Unauthorized' });
    }

    const updates: Record<string, unknown> = {};
    if (request.body.name !== undefined) updates.name = request.body.name;
    if (request.body.phone !== undefined) updates.phone = request.body.phone;
    if (request.body.email !== undefined) updates.email = request.body.email;
    if (request.body.notes !== undefined) updates.notes = request.body.notes;

    const [updated] = await app.db
      .update(schema.clients)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(schema.clients.id, id))
      .returning();

    app.logger.info(
      { clientId: id },
      'Client updated successfully'
    );

    return updated;
  });

  app.fastify.delete('/api/clients/:id', {
    schema: {
      description: 'Delete a client',
      tags: ['clients'],
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
      { userId: session.user.id, clientId: id },
      'Deleting client'
    );

    const client = await app.db.query.clients.findFirst({
      where: eq(schema.clients.id, id),
    });

    if (!client) {
      app.logger.warn(
        { clientId: id },
        'Client not found'
      );
      return reply.status(404).send({ error: 'Client not found' });
    }

    if (client.userId !== session.user.id) {
      app.logger.warn(
        { clientId: id, userId: session.user.id },
        'Unauthorized client deletion'
      );
      return reply.status(403).send({ error: 'Unauthorized' });
    }

    await app.db.delete(schema.clients).where(eq(schema.clients.id, id));

    app.logger.info(
      { clientId: id },
      'Client deleted successfully'
    );

    return { success: true };
  });
}
