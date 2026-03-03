import type { App } from '../index.js';
import type { FastifyRequest, FastifyReply } from 'fastify';
import { eq, like, and, gte } from 'drizzle-orm';
import * as schema from '../db/schema/schema.js';

export function registerClientsRoutes(app: App) {
  const requireAuth = app.requireAuth();

  app.fastify.get('/api/clients', {
    schema: {
      description: 'Get all clients for current user, with optional search',
      tags: ['clients'],
      querystring: {
        type: 'object',
        properties: {
          search: { type: 'string', description: 'Search by client name' },
        },
      },
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
  }, async (
    request: FastifyRequest<{ Querystring: { search?: string } }>,
    reply: FastifyReply
  ) => {
    const session = await requireAuth(request, reply);
    if (!session) return;

    const search = request.query.search;

    app.logger.info(
      { userId: session.user.id, search },
      'Fetching clients'
    );

    let clients;
    if (search) {
      clients = await app.db.query.clients.findMany({
        where: and(
          eq(schema.clients.userId, session.user.id),
          like(schema.clients.name, `%${search}%`)
        ),
      });
    } else {
      clients = await app.db.query.clients.findMany({
        where: eq(schema.clients.userId, session.user.id),
      });
    }

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
    birthday?: string;
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
          birthday: { type: 'string' },
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
      birthday: request.body.birthday || null,
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
    birthday?: string;
    notes?: string;
    isActive?: boolean;
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
          birthday: { type: 'string' },
          notes: { type: 'string' },
          isActive: { type: 'boolean' },
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
    if (request.body.birthday !== undefined) updates.birthday = request.body.birthday;
    if (request.body.notes !== undefined) updates.notes = request.body.notes;
    if (request.body.isActive !== undefined) updates.isActive = request.body.isActive;

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

  app.fastify.get('/api/clients/inactive', {
    schema: {
      description: 'Get inactive clients (no visit in 90+ days)',
      tags: ['clients'],
      response: {
        200: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string', format: 'uuid' },
              name: { type: 'string' },
              phone: { type: 'string' },
              email: { type: ['string', 'null'] },
              lastVisit: { type: ['string', 'null'] },
              totalVisits: { type: 'integer' },
              daysSinceLastVisit: { type: 'integer' },
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
      'Fetching inactive clients'
    );

    const allClients = await app.db.query.clients.findMany({
      where: eq(schema.clients.userId, session.user.id),
    });

    const now = new Date();
    const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);

    const inactiveClients = allClients
      .filter(client => {
        if (!client.lastVisit) return true;
        const lastVisitDate = new Date(client.lastVisit);
        return lastVisitDate < ninetyDaysAgo;
      })
      .map(client => {
        const lastVisitDate = client.lastVisit ? new Date(client.lastVisit) : null;
        const daysSinceLastVisit = lastVisitDate
          ? Math.floor((now.getTime() - lastVisitDate.getTime()) / (24 * 60 * 60 * 1000))
          : -1;

        return {
          id: client.id,
          name: client.name,
          phone: client.phone,
          email: client.email,
          lastVisit: client.lastVisit,
          totalVisits: client.totalVisits,
          daysSinceLastVisit,
        };
      });

    app.logger.info(
      { userId: session.user.id, count: inactiveClients.length },
      'Inactive clients retrieved successfully'
    );

    return inactiveClients;
  });

  app.fastify.get('/api/clients/:id/appointments', {
    schema: {
      description: 'Get appointment history for a client',
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
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string', format: 'uuid' },
              date: { type: 'string' },
              startTime: { type: 'string' },
              endTime: { type: 'string' },
              service: { type: 'string' },
              status: { type: 'string' },
            },
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
  }, async (
    request: FastifyRequest<{ Params: { id: string } }>,
    reply: FastifyReply
  ) => {
    const session = await requireAuth(request, reply);
    if (!session) return;

    const { id } = request.params;

    app.logger.info(
      { userId: session.user.id, clientId: id },
      'Fetching client appointments'
    );

    const client = await app.db.query.clients.findFirst({
      where: and(
        eq(schema.clients.id, id),
        eq(schema.clients.userId, session.user.id)
      ),
    });

    if (!client) {
      app.logger.warn(
        { clientId: id },
        'Client not found'
      );
      return reply.status(404).send({ error: 'Client not found' });
    }

    const appointments = await app.db.query.appointments.findMany({
      where: eq(schema.appointments.clientId, id),
      with: {
        service: {
          columns: { name: true },
        },
      },
    });

    const result = appointments.map(apt => ({
      id: apt.id,
      date: apt.date,
      startTime: apt.startTime,
      endTime: apt.endTime,
      service: apt.service?.name || 'Unknown',
      status: apt.status,
    }));

    app.logger.info(
      { clientId: id, count: result.length },
      'Client appointments retrieved successfully'
    );

    return result;
  });

  app.fastify.get('/api/clients/:id/stats', {
    schema: {
      description: 'Get statistics for a client',
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
            totalAppointments: { type: 'integer' },
            attendanceRate: { type: 'number' },
            lastVisit: { type: ['string', 'null'] },
            noShowCount: { type: 'integer' },
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
  }, async (
    request: FastifyRequest<{ Params: { id: string } }>,
    reply: FastifyReply
  ) => {
    const session = await requireAuth(request, reply);
    if (!session) return;

    const { id } = request.params;

    app.logger.info(
      { userId: session.user.id, clientId: id },
      'Fetching client stats'
    );

    const client = await app.db.query.clients.findFirst({
      where: and(
        eq(schema.clients.id, id),
        eq(schema.clients.userId, session.user.id)
      ),
    });

    if (!client) {
      app.logger.warn(
        { clientId: id },
        'Client not found'
      );
      return reply.status(404).send({ error: 'Client not found' });
    }

    const appointments = await app.db.query.appointments.findMany({
      where: eq(schema.appointments.clientId, id),
    });

    const totalAppointments = appointments.length;
    const completedAppointments = appointments.filter(a => a.status === 'Completada').length;
    const noShowCount = appointments.filter(a => a.status === 'No-show').length;
    const attendanceRate = totalAppointments > 0
      ? ((completedAppointments / totalAppointments) * 100)
      : 0;

    const stats = {
      totalAppointments,
      attendanceRate: Math.round(attendanceRate * 100) / 100,
      lastVisit: client.lastVisit,
      noShowCount,
    };

    app.logger.info(
      { clientId: id, stats },
      'Client stats retrieved successfully'
    );

    return stats;
  });
}
