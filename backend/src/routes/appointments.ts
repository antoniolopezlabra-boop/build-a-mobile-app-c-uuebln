import type { App } from '../index.js';
import type { FastifyRequest, FastifyReply } from 'fastify';
import { eq, and, gte, lte, lt, gt } from 'drizzle-orm';
import * as schema from '../db/schema/schema.js';

export function registerAppointmentsRoutes(app: App) {
  const requireAuth = app.requireAuth();

  // Helper function to format time as HH:MM
  function formatTime(date: Date): string {
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    return `${hours}:${minutes}`;
  }

  // Helper function to convert HH:MM string to minutes since midnight
  function timeToMinutes(timeStr: string): number {
    const [hours, minutes] = timeStr.split(':').map(Number);
    return hours * 60 + minutes;
  }

  // Helper function to get business hours for a user
  async function getBusinessHours(userId: string) {
    const hours = await app.db.query.businessHours.findMany({
      where: eq(schema.businessHours.userId, userId),
    });

    // Default business hours: 9 AM to 6 PM, Monday to Friday
    const defaultHours: Record<number, { start: string; end: string } | null> = {
      0: null, // Sunday closed
      1: { start: '09:00', end: '18:00' }, // Monday
      2: { start: '09:00', end: '18:00' }, // Tuesday
      3: { start: '09:00', end: '18:00' }, // Wednesday
      4: { start: '09:00', end: '18:00' }, // Thursday
      5: { start: '09:00', end: '18:00' }, // Friday
      6: null, // Saturday closed
    };

    if (hours.length === 0) {
      return defaultHours;
    }

    const hoursByDay: Record<number, { start: string; end: string } | null> = {};
    for (let i = 0; i < 7; i++) {
      const dayHours = hours.find(h => h.dayOfWeek === i);
      if (dayHours) {
        if (dayHours.isOpen) {
          hoursByDay[i] = { start: dayHours.startTime, end: dayHours.endTime };
        } else {
          hoursByDay[i] = null;
        }
      } else {
        // Use default hours for days not explicitly set
        hoursByDay[i] = defaultHours[i];
      }
    }
    return hoursByDay;
  }

  // Helper function to check time conflicts
  async function checkTimeConflict(
    userId: string,
    date: string,
    startTime: string,
    endTime: string,
    excludeId?: string
  ): Promise<boolean> {
    const appointments = await app.db.query.appointments.findMany({
      where: and(
        eq(schema.appointments.userId, userId),
        eq(schema.appointments.date, date)
      ),
    });

    return appointments.some(apt => {
      if (excludeId && apt.id === excludeId) return false;

      const aptStartMinutes = timeToMinutes(apt.startTime);
      const aptEndMinutes = timeToMinutes(apt.endTime);
      const newStartMinutes = timeToMinutes(startTime);
      const newEndMinutes = timeToMinutes(endTime);

      // Check if there's an overlap
      return (newStartMinutes < aptEndMinutes && newEndMinutes > aptStartMinutes);
    });
  }

  // Helper function to validate business hours
  async function validateBusinessHours(
    userId: string,
    date: string,
    startTime: string,
    endTime: string
  ): Promise<{ valid: boolean; error?: string }> {
    const businessHours = await getBusinessHours(userId);

    // Get day of week (0-6)
    const dateObj = new Date(date);
    const dayOfWeek = dateObj.getUTCDay();

    const dayHours = businessHours[dayOfWeek];
    if (!dayHours) {
      return { valid: false, error: 'Business is closed on this day' };
    }

    if (startTime < dayHours.start || endTime > dayHours.end) {
      return {
        valid: false,
        error: `Appointment must be within business hours: ${dayHours.start} - ${dayHours.end}`
      };
    }

    return { valid: true };
  }

  app.fastify.get('/api/appointments', {
    schema: {
      description: 'Get appointments with optional filtering by date, month, or week',
      tags: ['appointments'],
      querystring: {
        type: 'object',
        properties: {
          date: { type: 'string', description: 'Filter by specific date (YYYY-MM-DD)' },
          month: { type: 'string', description: 'Filter by month (YYYY-MM)' },
          week: { type: 'string', description: 'Filter by week starting date (YYYY-MM-DD)' },
        },
      },
      response: {
        200: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string', format: 'uuid' },
              clientId: { type: 'string', format: 'uuid' },
              serviceId: { type: 'string', format: 'uuid' },
              date: { type: 'string' },
              startTime: { type: 'string' },
              endTime: { type: 'string' },
              status: { type: 'string' },
              notes: { type: ['string', 'null'] },
              whatsappNotification: { type: 'boolean' },
              client: {
                type: 'object',
                properties: {
                  name: { type: 'string' },
                },
              },
              service: {
                type: 'object',
                properties: {
                  name: { type: 'string' },
                },
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
  }, async (
    request: FastifyRequest<{ Querystring: { date?: string; month?: string; week?: string } }>,
    reply: FastifyReply
  ) => {
    const session = await requireAuth(request, reply);
    if (!session) return;

    const { date, month, week } = request.query;

    app.logger.info(
      { userId: session.user.id, date, month, week },
      'Fetching appointments'
    );

    let where = eq(schema.appointments.userId, session.user.id);

    if (date) {
      where = and(where, eq(schema.appointments.date, date));
    } else if (month) {
      const [year, monthStr] = month.split('-');
      where = and(
        where,
        gte(schema.appointments.date, `${year}-${monthStr}-01`),
        lt(schema.appointments.date, `${year}-${parseInt(monthStr) + 1}-01`)
      );
    } else if (week) {
      const weekDate = new Date(week);
      const endDate = new Date(weekDate);
      endDate.setDate(endDate.getDate() + 7);

      where = and(
        where,
        gte(schema.appointments.date, week),
        lt(schema.appointments.date, endDate.toISOString().split('T')[0])
      );
    }

    const appointments = await app.db.query.appointments.findMany({
      where,
      with: {
        client: { columns: { name: true } },
        service: { columns: { name: true } },
      },
      orderBy: (fields) => fields.startTime,
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
              clientId: { type: 'string', format: 'uuid' },
              serviceId: { type: 'string', format: 'uuid' },
              date: { type: 'string' },
              startTime: { type: 'string' },
              endTime: { type: 'string' },
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
      orderBy: (fields) => fields.startTime,
    });

    app.logger.info(
      { userId: session.user.id, count: appointments.length },
      'Today appointments retrieved successfully'
    );

    return appointments;
  });

  interface CreateAppointmentBody {
    clientId: string;
    serviceId: string;
    date: string;
    startTime: string;
    endTime: string;
    notes?: string;
    whatsappNotification?: boolean;
  }

  app.fastify.post('/api/appointments', {
    schema: {
      description: 'Create a new appointment with conflict and business hours validation',
      tags: ['appointments'],
      body: {
        type: 'object',
        required: ['clientId', 'serviceId', 'date', 'startTime', 'endTime'],
        properties: {
          clientId: { type: 'string', format: 'uuid' },
          serviceId: { type: 'string', format: 'uuid' },
          date: { type: 'string' },
          startTime: { type: 'string' },
          endTime: { type: 'string' },
          notes: { type: 'string' },
          whatsappNotification: { type: 'boolean' },
        },
      },
      response: {
        201: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            clientId: { type: 'string', format: 'uuid' },
            serviceId: { type: 'string', format: 'uuid' },
            date: { type: 'string' },
            startTime: { type: 'string' },
            endTime: { type: 'string' },
            status: { type: 'string' },
            notes: { type: ['string', 'null'] },
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
    request: FastifyRequest<{ Body: CreateAppointmentBody }>,
    reply: FastifyReply
  ) => {
    const session = await requireAuth(request, reply);
    if (!session) return;

    const { clientId, serviceId, date, startTime, endTime, notes, whatsappNotification } = request.body;

    app.logger.info(
      { userId: session.user.id, clientId, date, startTime },
      'Creating appointment'
    );

    // Validate business hours
    const hoursValidation = await validateBusinessHours(session.user.id, date, startTime, endTime);
    if (!hoursValidation.valid) {
      app.logger.warn(
        { userId: session.user.id, error: hoursValidation.error },
        'Business hours validation failed'
      );
      return reply.status(400).send({ error: hoursValidation.error });
    }

    // Check for time conflicts
    const hasConflict = await checkTimeConflict(session.user.id, date, startTime, endTime);
    if (hasConflict) {
      app.logger.warn(
        { userId: session.user.id, date, startTime, endTime },
        'Time conflict detected'
      );
      return reply.status(400).send({ error: 'Time slot already booked' });
    }

    try {
      const [appointment] = await app.db.insert(schema.appointments).values({
        userId: session.user.id,
        clientId,
        serviceId,
        date,
        startTime,
        endTime,
        notes: notes || null,
        whatsappNotification: whatsappNotification || false,
        status: 'Pendiente',
      }).returning();

      app.logger.info(
        { appointmentId: appointment.id },
        'Appointment created successfully'
      );

      return reply.status(201).send(appointment);
    } catch (error) {
      app.logger.error(
        { err: error, clientId, serviceId },
        'Failed to create appointment'
      );
      throw error;
    }
  });

  app.fastify.get('/api/appointments/:id', {
    schema: {
      description: 'Get appointment details',
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
            id: { type: 'string', format: 'uuid' },
            clientId: { type: 'string', format: 'uuid' },
            serviceId: { type: 'string', format: 'uuid' },
            date: { type: 'string' },
            startTime: { type: 'string' },
            endTime: { type: 'string' },
            status: { type: 'string' },
            notes: { type: ['string', 'null'] },
            client: { type: 'object' },
            service: { type: 'object' },
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
      { userId: session.user.id, appointmentId: id },
      'Fetching appointment details'
    );

    const appointment = await app.db.query.appointments.findFirst({
      where: and(
        eq(schema.appointments.id, id),
        eq(schema.appointments.userId, session.user.id)
      ),
      with: {
        client: true,
        service: true,
      },
    });

    if (!appointment) {
      app.logger.warn(
        { appointmentId: id },
        'Appointment not found'
      );
      return reply.status(404).send({ error: 'Appointment not found' });
    }

    app.logger.info(
      { appointmentId: id },
      'Appointment details retrieved successfully'
    );

    return appointment;
  });

  interface UpdateStatusBody {
    status: string;
  }

  app.fastify.patch('/api/appointments/:id/status', {
    schema: {
      description: 'Update appointment status',
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
        required: ['status'],
        properties: {
          status: { type: 'string', enum: ['Confirmada', 'Cancelada', 'Completada', 'No-show'] },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            status: { type: 'string' },
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
    request: FastifyRequest<{ Params: { id: string }; Body: UpdateStatusBody }>,
    reply: FastifyReply
  ) => {
    const session = await requireAuth(request, reply);
    if (!session) return;

    const { id } = request.params;
    const { status } = request.body;

    app.logger.info(
      { userId: session.user.id, appointmentId: id, status },
      'Updating appointment status'
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

    const [updated] = await app.db
      .update(schema.appointments)
      .set({ status, updatedAt: new Date() })
      .where(eq(schema.appointments.id, id))
      .returning();

    app.logger.info(
      { appointmentId: id, status },
      'Appointment status updated successfully'
    );

    return updated;
  });

  interface RescheduleBody {
    date: string;
    startTime: string;
    endTime: string;
  }

  app.fastify.patch('/api/appointments/:id/reschedule', {
    schema: {
      description: 'Reschedule appointment with conflict and business hours validation',
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
        required: ['date', 'startTime', 'endTime'],
        properties: {
          date: { type: 'string' },
          startTime: { type: 'string' },
          endTime: { type: 'string' },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            status: { type: 'string' },
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
        400: {
          type: 'object',
          properties: {
            error: { type: 'string' },
          },
        },
      },
    },
  }, async (
    request: FastifyRequest<{ Params: { id: string }; Body: RescheduleBody }>,
    reply: FastifyReply
  ) => {
    const session = await requireAuth(request, reply);
    if (!session) return;

    const { id } = request.params;
    const { date, startTime, endTime } = request.body;

    app.logger.info(
      { userId: session.user.id, appointmentId: id, date, startTime },
      'Rescheduling appointment'
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

    // Validate business hours
    const hoursValidation = await validateBusinessHours(session.user.id, date, startTime, endTime);
    if (!hoursValidation.valid) {
      app.logger.warn(
        { userId: session.user.id, error: hoursValidation.error },
        'Business hours validation failed'
      );
      return reply.status(400).send({ error: hoursValidation.error });
    }

    // Check for time conflicts (excluding current appointment)
    const hasConflict = await checkTimeConflict(session.user.id, date, startTime, endTime, id);
    if (hasConflict) {
      app.logger.warn(
        { appointmentId: id, date, startTime, endTime },
        'Time conflict detected'
      );
      return reply.status(400).send({ error: 'Time slot already booked' });
    }

    const [updated] = await app.db
      .update(schema.appointments)
      .set({
        date,
        startTime,
        endTime,
        status: 'Reagendada',
        updatedAt: new Date(),
      })
      .where(eq(schema.appointments.id, id))
      .returning();

    app.logger.info(
      { appointmentId: id },
      'Appointment rescheduled successfully'
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

  interface AvailableSlotsQuery {
    date: string;
    serviceId: string;
  }

  app.fastify.get('/api/appointments/available-slots', {
    schema: {
      description: 'Get available time slots for a given date and service',
      tags: ['appointments'],
      querystring: {
        type: 'object',
        required: ['date', 'serviceId'],
        properties: {
          date: { type: 'string', description: 'Date in YYYY-MM-DD format' },
          serviceId: { type: 'string', format: 'uuid', description: 'Service ID' },
        },
      },
      response: {
        200: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              startTime: { type: 'string' },
              endTime: { type: 'string' },
              available: { type: 'boolean' },
            },
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
    request: FastifyRequest<{ Querystring: AvailableSlotsQuery }>,
    reply: FastifyReply
  ) => {
    const session = await requireAuth(request, reply);
    if (!session) return;

    const { date, serviceId } = request.query;

    app.logger.info(
      { userId: session.user.id, date, serviceId },
      'Fetching available slots'
    );

    // Get service duration
    const service = await app.db.query.services.findFirst({
      where: eq(schema.services.id, serviceId),
    });

    if (!service) {
      return reply.status(400).send({ error: 'Service not found' });
    }

    // Get business hours for the day
    const businessHours = await getBusinessHours(session.user.id);
    const dateObj = new Date(date);
    const dayOfWeek = dateObj.getUTCDay();
    const dayHours = businessHours[dayOfWeek];

    if (!dayHours) {
      return reply.status(400).send({ error: 'Business is closed on this day' });
    }

    // Get existing appointments for the day
    const appointments = await app.db.query.appointments.findMany({
      where: and(
        eq(schema.appointments.userId, session.user.id),
        eq(schema.appointments.date, date)
      ),
    });

    // Generate 30-minute slots
    const slots = [];
    let currentTime = new Date(`2000-01-01T${dayHours.start}:00`);
    const endTime = new Date(`2000-01-01T${dayHours.end}:00`);

    while (currentTime < endTime) {
      const slotStart = formatTime(currentTime);
      const slotEndDate = new Date(currentTime.getTime() + service.duration * 60000);
      const slotEnd = formatTime(slotEndDate);

      if (slotEndDate <= endTime) {
        // Check for conflicts using minute-based comparison
        const slotStartMinutes = timeToMinutes(slotStart);
        const slotEndMinutes = timeToMinutes(slotEnd);

        const isAvailable = !appointments.some(apt => {
          const aptStartMinutes = timeToMinutes(apt.startTime);
          const aptEndMinutes = timeToMinutes(apt.endTime);
          return slotStartMinutes < aptEndMinutes && slotEndMinutes > aptStartMinutes;
        });

        slots.push({
          startTime: slotStart,
          endTime: slotEnd,
          available: isAvailable,
        });
      }

      currentTime.setMinutes(currentTime.getMinutes() + 30);
    }

    app.logger.info(
      { userId: session.user.id, slotsCount: slots.length },
      'Available slots retrieved successfully'
    );

    return slots;
  });
}
