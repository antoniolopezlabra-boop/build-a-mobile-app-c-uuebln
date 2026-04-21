import type { App } from '../index.js';
import type { FastifyRequest, FastifyReply } from 'fastify';
import { eq } from 'drizzle-orm';
import * as schema from '../db/schema/schema.js';

// Precios actualizados Abr 2026:
//   Básico (interno: Gratuito) → $0 MXN
//   Premium (interno: Basico) → $399 MXN
//   Luxury (interno: Premium) → $799 MXN
const PLANS = {
  Básico: {
    price: '399.00',
    features: {
      appointmentsPerMonth: 'Unlimited',
      clients: 50,
      services: 10,
      reminders: false,
      customBranding: false,
    },
  },
  Premium: {
    price: '799.00',
    features: {
      appointmentsPerMonth: 'Unlimited',
      clients: 'Unlimited',
      services: 'Unlimited',
      reminders: true,
      customBranding: true,
    },
  },
};

export function registerSubscriptionRoutes(app: App) {
  const requireAuth = app.requireAuth();

  app.fastify.get('/api/subscription', {
    schema: {
      description: 'Get current subscription plan',
      tags: ['subscription'],
      response: {
        200: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            userId: { type: 'string' },
            planType: { type: 'string' },
            price: { type: 'string' },
            features: { type: 'object' },
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
      'Fetching subscription plan'
    );

    const subscription = await app.db.query.subscriptionPlans.findFirst({
      where: eq(schema.subscriptionPlans.userId, session.user.id),
    });

    if (!subscription) {
      // Return default Básico plan
      const defaultPlan = {
        id: 'default',
        userId: session.user.id,
        planType: 'Básico',
        price: PLANS.Básico.price,
        features: PLANS.Básico.features,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      app.logger.info(
        { userId: session.user.id },
        'Returning default Básico plan'
      );

      return defaultPlan;
    }

    app.logger.info(
      { userId: session.user.id, planType: subscription.planType },
      'Subscription plan retrieved successfully'
    );

    return subscription;
  });

  interface UpdateSubscriptionBody {
    planType: 'Básico' | 'Premium';
  }

  app.fastify.put('/api/subscription', {
    schema: {
      description: 'Update subscription plan',
      tags: ['subscription'],
      body: {
        type: 'object',
        required: ['planType'],
        properties: {
          planType: { type: 'string', enum: ['Básico', 'Premium'] },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            userId: { type: 'string' },
            planType: { type: 'string' },
            price: { type: 'string' },
            features: { type: 'object' },
            createdAt: { type: 'string', format: 'date-time' },
            updatedAt: { type: 'string', format: 'date-time' },
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
      },
    },
  }, async (
    request: FastifyRequest<{ Body: UpdateSubscriptionBody }>,
    reply: FastifyReply
  ) => {
    const session = await requireAuth(request, reply);
    if (!session) return;

    const { planType } = request.body;

    if (!Object.keys(PLANS).includes(planType)) {
      app.logger.warn(
        { userId: session.user.id, planType },
        'Invalid plan type'
      );
      return reply.status(400).send({ error: 'Invalid plan type' });
    }

    app.logger.info(
      { userId: session.user.id, planType },
      'Updating subscription plan'
    );

    const plan = PLANS[planType as keyof typeof PLANS];
    const existing = await app.db.query.subscriptionPlans.findFirst({
      where: eq(schema.subscriptionPlans.userId, session.user.id),
    });

    let result;
    if (existing) {
      const [updated] = await app.db
        .update(schema.subscriptionPlans)
        .set({
          planType,
          price: plan.price,
          features: plan.features,
          updatedAt: new Date(),
        })
        .where(eq(schema.subscriptionPlans.userId, session.user.id))
        .returning();

      result = updated;
    } else {
      const [created] = await app.db.insert(schema.subscriptionPlans).values({
        userId: session.user.id,
        planType,
        price: plan.price,
        features: plan.features,
      }).returning();

      result = created;
    }

    app.logger.info(
      { userId: session.user.id, planType },
      'Subscription plan updated successfully'
    );

    return result;
  });
}
