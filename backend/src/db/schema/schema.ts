import { pgTable, uuid, text, timestamp, integer, boolean } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { user } from './auth-schema.js';

export const businessProfiles = pgTable('business_profiles', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: text('user_id').notNull().unique().references(() => user.id, { onDelete: 'cascade' }),
  businessName: text('business_name').notNull(),
  businessType: text('business_type').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().$onUpdate(() => new Date()).notNull(),
});

export const services = pgTable('services', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  duration: integer('duration').notNull(), // in minutes
  price: text('price'),
  description: text('description'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().$onUpdate(() => new Date()).notNull(),
});

export const clients = pgTable('clients', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  phone: text('phone').notNull(),
  email: text('email'),
  notes: text('notes'),
  lastVisit: text('last_visit'),
  totalVisits: integer('total_visits').default(0).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().$onUpdate(() => new Date()).notNull(),
});

export const appointments = pgTable('appointments', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  clientId: uuid('client_id').notNull().references(() => clients.id, { onDelete: 'cascade' }),
  serviceId: uuid('service_id').notNull().references(() => services.id, { onDelete: 'restrict' }),
  date: text('date').notNull(),
  startTime: text('start_time').notNull(),
  endTime: text('end_time').notNull(),
  notes: text('notes'),
  whatsappNotification: boolean('whatsapp_notification').default(false).notNull(),
  status: text('status').notNull().default('Pendiente'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().$onUpdate(() => new Date()).notNull(),
});

export const businessHours = pgTable('business_hours', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  dayOfWeek: integer('day_of_week').notNull(), // 0-6, Sunday-Saturday
  startTime: text('start_time').notNull(),
  endTime: text('end_time').notNull(),
  isOpen: boolean('is_open').default(true).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().$onUpdate(() => new Date()).notNull(),
});

export const appointmentsRelations = relations(appointments, ({ one }) => ({
  client: one(clients, {
    fields: [appointments.clientId],
    references: [clients.id],
  }),
  service: one(services, {
    fields: [appointments.serviceId],
    references: [services.id],
  }),
}));

export const clientsRelations = relations(clients, ({ many }) => ({
  appointments: many(appointments),
}));

export const servicesRelations = relations(services, ({ many }) => ({
  appointments: many(appointments),
}));
