CREATE TABLE "business_hours" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"day_of_week" integer NOT NULL,
	"start_time" text NOT NULL,
	"end_time" text NOT NULL,
	"is_open" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "services" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"duration" integer NOT NULL,
	"price" text,
	"description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "appointments" ALTER COLUMN "status" SET DEFAULT 'Pendiente';--> statement-breakpoint
ALTER TABLE "appointments" ADD COLUMN "service_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "appointments" ADD COLUMN "start_time" text NOT NULL;--> statement-breakpoint
ALTER TABLE "appointments" ADD COLUMN "end_time" text NOT NULL;--> statement-breakpoint
ALTER TABLE "appointments" ADD COLUMN "whatsapp_notification" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "business_hours" ADD CONSTRAINT "business_hours_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "services" ADD CONSTRAINT "services_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_service_id_services_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."services"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointments" DROP COLUMN "time";--> statement-breakpoint
ALTER TABLE "appointments" DROP COLUMN "service";