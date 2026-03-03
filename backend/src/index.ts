import { createApplication, createAuthMiddleware } from "@specific-dev/framework";
import cors from "@fastify/cors";
import * as appSchema from './db/schema/schema.js';
import * as authSchema from './db/schema/auth-schema.js';
import { registerAuthRoutes } from './routes/auth.js';
import { registerBusinessProfileRoutes } from './routes/business-profile.js';
import { registerAppointmentsRoutes } from './routes/appointments.js';
import { registerClientsRoutes } from './routes/clients.js';
import { registerServicesRoutes } from './routes/services.js';
import { registerBusinessHoursRoutes } from './routes/business-hours.js';
import { registerWhatsappConfigRoutes } from './routes/whatsapp-config.js';
import { registerSubscriptionRoutes } from './routes/subscription.js';
import { registerStatsRoutes } from './routes/stats.js';

const schema = { ...appSchema, ...authSchema };

export const app = await createApplication(schema);
export type App = typeof app;

// Configure CORS for mobile app and development
app.fastify.register(cors, {
  origin: [
    'https://vylta.expo.dev',
    /^exp:\/\//,
    'http://localhost:3000',
    'http://localhost:8081',
    'http://localhost:19006',
    'http://localhost:19007',
    /^http:\/\/localhost:\d+$/,
  ],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Origin'],
});

// Create auth hooks for handling signup with business profile creation
const afterHook = createAuthMiddleware(async (ctx) => {
  if (!ctx.path.includes('/sign-up')) return;

  const newUser = ctx.context.newSession?.user;
  const body = ctx.body as Record<string, unknown> | undefined;

  // Use provided businessName and businessType, or defaults
  const businessName = (body?.businessName as string) || 'Mi Negocio';
  const businessType = (body?.businessType as string) || 'Otro';

  if (newUser) {
    app.logger.info(
      { userId: newUser.id, businessName },
      'Creating business profile for new user'
    );

    try {
      await app.db.insert(appSchema.businessProfiles).values({
        userId: newUser.id,
        businessName,
        businessType,
      });

      app.logger.info(
        { userId: newUser.id },
        'Business profile created successfully'
      );
    } catch (error) {
      app.logger.error(
        { err: error, userId: newUser.id },
        'Failed to create business profile'
      );
    }
  }
});

app.withAuth({
  hooks: { after: afterHook },
  trustedOrigins: [
    'https://vylta.expo.dev',
    'exp://*',
    'http://localhost:3000',
    'http://localhost:8081',
    'http://localhost:19006',
    'http://localhost:19007',
  ],
});

app.withStorage();

// Register routes
registerAuthRoutes(app);
registerBusinessProfileRoutes(app);
registerClientsRoutes(app);
registerServicesRoutes(app);
registerBusinessHoursRoutes(app);
registerAppointmentsRoutes(app);
registerWhatsappConfigRoutes(app);
registerSubscriptionRoutes(app);
registerStatsRoutes(app);

await app.run();
app.logger.info('Application running');
