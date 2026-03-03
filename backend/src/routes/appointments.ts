import type { App } from '../index.js';
import type { FastifyRequest, FastifyReply } from 'fastify';
import { eq, and } from 'drizzle-orm';
import * as schema from '../db/schema/schema.js';

export function registerAppointmentsRoutes(app: App) {
  const requireAuth = app.requireAuth();

  app.fastify.get('/api/appointments', {
    schema: {
      description: 'Get all appointments for current user with client details',
      tags: ['appointments'],
      response: {
        200: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string', format: 'uuid' },
              userId: { type: 'string' },
              clientId: { type: 'string', format: 'uuid' },
              date: { type: 'string' },
              time: { type: 'string' },
              service: { type: 'string' },
              status: { type: 'string' },
              notes: { type: ['string', 'null'] },
              client: {
                type: 'object',
                properties: {
                  id: { type: 'string', format: 'uuid' },
                  name: { type: 'string' },
                  phone: { type: 'string' },
                },
              },
              createdAt: { type: 'string', format: 'date-time' },
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
      'Fetching all appointments'
    );

    const appointments = await app.db.query.appointments.findMany({
      where: eq(schema.appointments.userId, session.user.id),
      with: {
        client: {
          columns: {
            id: true,
            name: true,
            phone: true,
          },
        },
      },
    });

    app.logger.info(
      { userId: session.user.id, count: appointments.length },
      'Appointments retrieved successfully'
    );

    return appointments;
  });

  app.fastify.get('/api/appointments/today', {
    schema: {
      description: "Get today's appointments for current user",
      tags: ['appointments'],
      response: {
        200: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string', format: 'uuid' },
              userId: { type: 'string' },
              clientId: { type: 'string', format: 'uuid' },
              date: { type: 'string' },
              time: { type: 'string' },
              service: { type: 'string' },
              status: { type: 'string' },
              notes: { type: ['string', 'null'] },
              client: {
                type: 'object',
                properties: {
                  id: { type: 'string', format: 'uuid' },
                  name: { type: 'string' },
                  phone: { type: 'string' },
                },
              },
              createdAt: { type: 'string', format: 'date-time' },
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

    const today = new Date().toISOString().split('T')[0];

    app.logger.info(
      { userId: session.user.id, date: today },
      'Fetching today appointments'
    );

    const appointments = await app.db.query.appointments.findMany({
      where: and(
        eq(schema.appointments.userId, session.user.id),
        eq(schema.appointments.date, today)
      ),
      with: {
        client: {
          columns: {
            id: true,
            name: true,
            phone: true,
          },
        },
      },
    });

    app.logger.info(
      { userId: session.user.id, date: today, count: appointments.length },
      'Today appointments retrieved successfully'
    );

    return appointments;
  });

  interface CreateAppointmentBody {
    clientId: string;
    date: string;
    time: string;
    service: string;
    status: string;
    notes?: string;
  }

  app.fastify.post('/api/appointments', {
    schema: {
      description: 'Create a new appointment',
      tags: ['appointments'],
      body: {
        type: 'object',
        required: ['clientId', 'date', 'time', 'service', 'status'],
        properties: {
          clientId: { type: 'string', format: 'uuid' },
          date: { type: 'string' },
          time: { type: 'string' },
          service: { type: 'string' },
          status: { type: 'string' },
          notes: { type: 'string' },
        },
      },
      response: {
        201: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            userId: { type: 'string' },
            clientId: { type: 'string', format: 'uuid' },
            date: { type: 'string' },
            time: { type: 'string' },
            service: { type: 'string' },
            status: { type: 'string' },
            notes: { type: ['string', 'null'] },
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
    request: FastifyRequest<{ Body: CreateAppointmentBody }>,
    reply: FastifyReply
  ) => {
    const session = await requireAuth(request, reply);
    if (!session) return;

    app.logger.info(
      { userId: session.user.id, clientId: request.body.clientId, date: request.body.date },
      'Creating appointment'
    );

    const [appointment] = await app.db.insert(schema.appointments).values({
      userId: session.user.id,
      clientId: request.body.clientId,
      date: request.body.date,
      time: request.body.time,
      service: request.body.service,
      status: request.body.status,
      notes: request.body.notes || null,
    }).returning();

    app.logger.info(
      { appointmentId: appointment.id },
      'Appointment created successfully'
    );

    return reply.status(201).send(appointment);
  });

  interface UpdateAppointmentBody {
    clientId?: string;
    date?: string;
    time?: string;
    service?: string;
    status?: string;
    notes?: string;
  }

  app.fastify.put('/api/appointments/:id', {
    schema: {
      description: 'Update an appointment',
      tags: ['appointments'],
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
          clientId: { type: 'string', format: 'uuid' },
          date: { type: 'string' },
          time: { type: 'string' },
          service: { type: 'string' },
          status: { type: 'string' },
          notes: { type: 'string' },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            userId: { type: 'string' },
            clientId: { type: 'string', format: 'uuid' },
            date: { type: 'string' },
            time: { type: 'string' },
            service: { type: 'string' },
            status: { type: 'string' },
            notes: { type: ['string', 'null'] },
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
    request: FastifyRequest<{ Params: { id: string }; Body: UpdateAppointmentBody }>,
    reply: FastifyReply
  ) => {
    const session = await requireAuth(request, reply);
    if (!session) return;

    const { id } = request.params;

    app.logger.info(
      { userId: session.user.id, appointmentId: id, body: request.body },
      'Updating appointment'
    );

    const appointment = await app.db.query.appointments.findFirst({
      where: eq(schema.appointments.id, id),
    });

    if (!appointment) {
      app.logger.warn(
        { appointmentId: id },
        'Appointment not found'
      );
      return reply.status(404).send({ error: 'Appointment not found' });
    }

    if (appointment.userId !== session.user.id) {
      app.logger.warn(
        { appointmentId: id, userId: session.user.id },
        'Unauthorized appointment access'
      );
      return reply.status(403).send({ error: 'Unauthorized' });
    }

    const updates: Record<string, unknown> = {};
    if (request.body.clientId !== undefined) updates.clientId = request.body.clientId;
    if (request.body.date !== undefined) updates.date = request.body.date;
    if (request.body.time !== undefined) updates.time = request.body.time;
    if (request.body.service !== undefined) updates.service = request.body.service;
    if (request.body.status !== undefined) updates.status = request.body.status;
    if (request.body.notes !== undefined) updates.notes = request.body.notes;

    const [updated] = await app.db
      .update(schema.appointments)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(schema.appointments.id, id))
      .returning();

    app.logger.info(
      { appointmentId: id },
      'Appointment updated successfully'
    );

    return updated;
  });

  app.fastify.delete('/api/appointments/:id', {
    schema: {
      description: 'Delete an appointment',
      tags: ['appointments'],
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
      { userId: session.user.id, appointmentId: id },
      'Deleting appointment'
    );

    const appointment = await app.db.query.appointments.findFirst({
      where: eq(schema.appointments.id, id),
    });

    if (!appointment) {
      app.logger.warn(
        { appointmentId: id },
        'Appointment not found'
      );
      return reply.status(404).send({ error: 'Appointment not found' });
    }

    if (appointment.userId !== session.user.id) {
      app.logger.warn(
        { appointmentId: id, userId: session.user.id },
        'Unauthorized appointment deletion'
      );
      return reply.status(403).send({ error: 'Unauthorized' });
    }

    await app.db.delete(schema.appointments).where(eq(schema.appointments.id, id));

    app.logger.info(
      { appointmentId: id },
      'Appointment deleted successfully'
    );

    return { success: true };
  });
}
