CREATE TABLE "recurring_incomes" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"amount" bigint NOT NULL,
	"currency" text DEFAULT 'ARS' NOT NULL,
	"pay_day" integer NOT NULL,
	"next_month" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
ALTER TABLE "incomes" ADD COLUMN "recurring_income_id" integer;--> statement-breakpoint
ALTER TABLE "incomes" ADD COLUMN "period" text;--> statement-breakpoint
ALTER TABLE "incomes" ADD CONSTRAINT "incomes_recurring_income_id_recurring_incomes_id_fk" FOREIGN KEY ("recurring_income_id") REFERENCES "public"."recurring_incomes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "incomes" ADD CONSTRAINT "incomes_recurring_income_id_period_unique" UNIQUE("recurring_income_id","period");