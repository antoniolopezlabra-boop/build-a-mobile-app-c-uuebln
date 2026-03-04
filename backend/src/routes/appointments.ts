import type { App } from '../index.js';
import type { FastifyRequest, FastifyReply } from 'fastify';
import { eq, and, gte, lt } from 'drizzle-orm';
import * as schema from '../db/schema/schema.js';

export function registerAppointmentsRoutes(app: App) {
  const requireAuth = app.requireAuth();

  function timeToMinutes(timeStr: string): number {
    const [hours, minutes] = timeStr.split(':').map(Number);
    return hours * 60 + minutes;
  }

  function addMinutes(timeStr: string, minutes: number): string {
    const total = timeToMinutes(timeStr) + minutes;
    const h = Math.floor(total / 60).toString().padStart(2, '0');
    const m = (total % 60).toString().padStart(2, '0');
    return `${h}:${m}`;
  }

  async function checkTimeConflict(userId: string, date: string, startTime: string, endTime: string, excludeId?: string): Promise<boolean> {
    const appointments = await app.db.query.appointments.findMany({
      where: and(eq(schema.appointments.userId, userId), eq(schema.appointments.date, date)),
    });
    return appointments.some(apt => {
      if (excludeId && apt.id === excludeId) return false;
      const aptStart = timeToMinutes(apt.startTime);
      const aptEnd = timeToMinutes(apt.endTime);
      const newStart = timeToMinutes(startTime);
      const newEnd = timeToMinutes(endTime);
      return newStart < aptEnd && newEnd > aptStart;
    });
  }

  // GET /api/appointments
  app.fastify.get('/api/appointments', {
    schema: {
      querystring: {
        type: 'object',
        properties: {
          date: { type: 'string' },
          month: { type: 'string' },
          week: { type: 'string' },
        },
      },
    },
  }, async (request: FastifyRequest<{ Querystring: { date?: string; month?: string; week?: string } }>, reply: FastifyReply) => {
    const session = await requireAuth(request, reply);
    if (!session) return;

    const { date, month, week } = request.query;
    let where = eq(schema.appointments.userId, session.user.id);

    if (date) {
      where = and(where, eq(schema.appointments.date, date));
    } else if (month) {
      const [year, monthStr] = month.split('-');
      where = and(where, gte(schema.appointments.date, `${year}-${monthStr}-01`), lt(schema.appointments.date, `${year}-${parseInt(monthStr) + 1}-01`));
    } else if (week) {
      const weekDate = new Date(week);
      const endDate = new Date(weekDate);
      endDate.setDate(endDate.getDate() + 7);
      where = and(where, gte(schema.appointments.date, week), lt(schema.appointments.date, endDate.toISOString().split('T')[0]));
    }

    const appointments = await app.db.query.appointments.findMany({
      where,
      with: { client: { columns: { name: true, phone: true } } },
      orderBy: (fields) => fields.startTime,
    });

    return appointments.map(apt => ({
      ...apt,
      time: apt.startTime,
      service: apt.serviceName,
    }));
  });

  // GET /api/appointments/today
  app.fastify.get('/api/appointments/today', {}, async (request: FastifyRequest, reply: FastifyReply) => {
    const session = await requireAuth(request, reply);
    if (!session) return;

    const today = new Date().toISOString().split('T')[0];
    const appointments = await app.db.query.appointments.findMany({
      where: and(eq(schema.appointments.userId, session.user.id), eq(schema.appointments.date, today)),
      with: { client: { columns: { name: true, phone: true } } },
      orderBy: (fields) => fields.startTime,
    });

    return appointments.map(apt => ({
      ...apt,
      time: apt.startTime,
      service: apt.serviceName,
    }));
  });

  // POST /api/appointments
  app.fastify.post('/api/appointments', {
    schema: {
      body: {
        type: 'object',
        required: ['clientId', 'date', 'time', 'service'],
        properties: {
          clientId: { type: 'string' },
          service: { type: 'string' },
          date: { type: 'string' },
          time: { type: 'string' },
          duration: { type: 'number' },
          notes: { type: 'string' },
          whatsappNotification: { type: 'boolean' },
        },
      },
    },
  }, async (request: FastifyRequest<{ Body: { clientId: string; service: string; date: string; time: string; duration?: number; notes?: string; whatsappNotification?: boolean } }>, reply: FastifyReply) => {
    const session = await requireAuth(request, reply);
    if (!session) return;

    const { clientId, service, date, time, duration = 30, notes, whatsappNotification } = request.body;
    const startTime = time;
    const endTime = addMinutes(time, duration);

    const hasConflict = await checkTimeConflict(session.user.id, date, startTime, endTime);
    if (hasConflict) {
      return reply.status(400).send({ error: 'El horario seleccionado ya está ocupado' });
    }

    const [appointment] = await app.db.insert(schema.appointments).values({
      userId: session.user.id,
      clientId,
      serviceId: '00000000-0000-0000-0000-000000000000',
      serviceName: service,
      date,
      startTime,
      endTime,
      notes: notes || null,
      whatsappNotification: whatsappNotification || false,
      status: 'Pendiente',
    }).returning();

    return reply.status(201).send({ ...appointment, time: appointment.startTime, service: appointment.serviceName });
  });

  // GET /api/appointments/:id
  app.fastify.get('/api/appointments/:id', {}, async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const session = await requireAuth(request, reply);
    if (!session) return;

    const appointment = await app.db.query.appointments.findFirst({
      where: and(eq(schema.appointments.id, request.params.id), eq(schema.appointments.userId, session.user.id)),
      with: { client: true },
    });

    if (!appointment) return reply.status(404).send({ error: 'Cita no encontrada' });
    return { ...appointment, time: appointment.startTime, service: appointment.serviceName };
  });

  // PATCH /api/appointments/:id/status
  app.fastify.patch('/api/appointments/:id/status', {
    schema: {
      body: {
        type: 'object',
        required: ['status'],
        properties: {
          status: { type: 'string' },
        },
      },
    },
  }, async (request: FastifyRequest<{ Params: { id: string }; Body: { status: string } }>, reply: FastifyReply) => {
    const session = await requireAuth(request, reply);
    if (!session) return;

    const appointment = await app.db.query.appointments.findFirst({ where: eq(schema.appointments.id, request.params.id) });
    if (!appointment) return reply.status(404).send({ error: 'Cita no encontrada' });
    if (appointment.userId !== session.user.id) return reply.status(403).send({ error: 'No autorizado' });

    const [updated] = await app.db.update(schema.appointments).set({ status: request.body.status, updatedAt: new Date() }).where(eq(schema.appointments.id, request.params.id)).returning();
    return updated;
  });

  // PATCH /api/appointments/:id/reschedule
  app.fastify.patch('/api/appointments/:id/reschedule', {
    schema: {
      body: {
        type: 'object',
        required: ['date', 'time'],
        properties: {
          date: { type: 'string' },
          time: { type: 'string' },
          duration: { type: 'number' },
        },
      },
    },
  }, async (request: FastifyRequest<{ Params: { id: string }; Body: { date: string; time: string; duration?: number } }>, reply: FastifyReply) => {
    const session = await requireAuth(request, reply);
    if (!session) return;

    const { date, time, duration = 30 } = request.body;
    const startTime = time;
    const endTime = addMinutes(time, duration);

    const appointment = await app.db.query.appointments.findFirst({ where: eq(schema.appointments.id, request.params.id) });
    if (!appointment) return reply.status(404).send({ error: 'Cita no encontrada' });
    if (appointment.userId !== session.user.id) return reply.status(403).send({ error: 'No autorizado' });

    const hasConflict = await checkTimeConflict(session.user.id, date, startTime, endTime, request.params.id);
    if (hasConflict) return reply.status(400).send({ error: 'El horario seleccionado ya está ocupado' });

    const [updated] = await app.db.update(schema.appointments).set({ date, startTime, endTime, status: 'Reagendada', updatedAt: new Date() }).where(eq(schema.appointments.id, request.params.id)).returning();
    return updated;
  });

  // DELETE /api/appointments/:id
  app.fastify.delete('/api/appointments/:id', {}, async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const session = await requireAuth(request, reply);
    if (!session) return;

    const appointment = await app.db.query.appointments.findFirst({ where: eq(schema.appointments.id, request.params.id) });
    if (!appointment) return reply.status(404).send({ error: 'Cita no encontrada' });
    if (appointment.userId !== session.user.id) return reply.status(403).send({ error: 'No autorizado' });

    await app.db.delete(schema.appointments).where(eq(schema.appointments.id, request.params.id));
    return { success: true };
  });
}
