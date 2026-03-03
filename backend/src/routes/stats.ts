import type { App } from '../index.js';
import type { FastifyRequest, FastifyReply } from 'fastify';
import { eq, and, count } from 'drizzle-orm';
import * as schema from '../db/schema/schema.js';

export function registerStatsRoutes(app: App) {
  const requireAuth = app.requireAuth();

  app.fastify.get('/api/stats/dashboard', {
    schema: {
      description: 'Get dashboard statistics for current user',
      tags: ['stats'],
      response: {
        200: {
          type: 'object',
          properties: {
            todayAppointments: { type: 'integer' },
            confirmedToday: { type: 'integer' },
            unconfirmedToday: { type: 'integer' },
            totalClients: { type: 'integer' },
            totalAppointments: { type: 'integer' },
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
      'Fetching dashboard stats'
    );

    const today = new Date().toISOString().split('T')[0];

    const [todayAppointmentsResult] = await app.db
      .select({ value: count() })
      .from(schema.appointments)
      .where(
        and(
          eq(schema.appointments.userId, session.user.id),
          eq(schema.appointments.date, today)
        )
      );

    const [confirmedTodayResult] = await app.db
      .select({ value: count() })
      .from(schema.appointments)
      .where(
        and(
          eq(schema.appointments.userId, session.user.id),
          eq(schema.appointments.date, today),
          eq(schema.appointments.status, 'confirmada')
        )
      );

    const [unconfirmedTodayResult] = await app.db
      .select({ value: count() })
      .from(schema.appointments)
      .where(
        and(
          eq(schema.appointments.userId, session.user.id),
          eq(schema.appointments.date, today),
          eq(schema.appointments.status, 'sin_confirmar')
        )
      );

    const [totalClientsResult] = await app.db
      .select({ value: count() })
      .from(schema.clients)
      .where(eq(schema.clients.userId, session.user.id));

    const [totalAppointmentsResult] = await app.db
      .select({ value: count() })
      .from(schema.appointments)
      .where(eq(schema.appointments.userId, session.user.id));

    const stats = {
      todayAppointments: todayAppointmentsResult.value,
      confirmedToday: confirmedTodayResult.value,
      unconfirmedToday: unconfirmedTodayResult.value,
      totalClients: totalClientsResult.value,
      totalAppointments: totalAppointmentsResult.value,
    };

    app.logger.info(
      { userId: session.user.id, stats },
      'Dashboard stats retrieved successfully'
    );

    return stats;
  });
}
