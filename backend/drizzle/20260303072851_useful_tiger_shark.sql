CREATE TABLE "subscription_plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"plan_type" text DEFAULT 'Básico' NOT NULL,
	"price" text NOT NULL,
	"features" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "subscription_plans_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "whatsapp_config" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"api_key" text,
	"phone_number" text,
	"is_connected" boolean DEFAULT false NOT NULL,
	"reminder_24h" boolean DEFAULT false NOT NULL,
	"reminder_2h" boolean DEFAULT false NOT NULL,
	"confirmation_on_booking" boolean DEFAULT false NOT NULL,
	"waitlist_notification" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "whatsapp_config_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
ALTER TABLE "business_profiles" ADD COLUMN "address" text;--> statement-breakpoint
ALTER TABLE "business_profiles" ADD COLUMN "phone" text;--> statement-breakpoint
ALTER TABLE "business_profiles" ADD COLUMN "alternative_phone" text;--> statement-breakpoint
ALTER TABLE "business_profiles" ADD COLUMN "logo_url" text;--> statement-breakpoint
ALTER TABLE "business_profiles" ADD COLUMN "weekly_schedule" jsonb;--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "birthday" text;--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "is_active" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "subscription_plans" ADD CONSTRAINT "subscription_plans_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "whatsapp_config" ADD CONSTRAINT "whatsapp_config_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;