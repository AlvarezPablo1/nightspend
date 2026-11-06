CREATE TABLE "categories" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"monthly_budget" bigint,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"archived" boolean DEFAULT false NOT NULL,
	CONSTRAINT "categories_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "debt_payments" (
	"id" serial PRIMARY KEY NOT NULL,
	"debt_id" integer NOT NULL,
	"date" date NOT NULL,
	"amount" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "debts" (
	"id" serial PRIMARY KEY NOT NULL,
	"direction" text NOT NULL,
	"person" text NOT NULL,
	"concept" text,
	"amount" bigint NOT NULL,
	"currency" text DEFAULT 'ARS' NOT NULL,
	"note" text
);
--> statement-breakpoint
CREATE TABLE "expenses" (
	"id" serial PRIMARY KEY NOT NULL,
	"date" date NOT NULL,
	"description" text NOT NULL,
	"category_id" integer NOT NULL,
	"payment_method_id" integer,
	"amount" bigint NOT NULL,
	"currency" text DEFAULT 'ARS' NOT NULL,
	"rate" numeric(14, 4),
	"amount_ars" bigint NOT NULL,
	"installments" integer DEFAULT 1 NOT NULL,
	"note" text,
	"source" text DEFAULT 'manual' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "incomes" (
	"id" serial PRIMARY KEY NOT NULL,
	"date" date NOT NULL,
	"description" text NOT NULL,
	"type" text NOT NULL,
	"amount" bigint NOT NULL,
	"currency" text DEFAULT 'ARS' NOT NULL,
	"rate" numeric(14, 4),
	"amount_ars" bigint NOT NULL,
	"note" text
);
--> statement-breakpoint
CREATE TABLE "installment_plans" (
	"id" serial PRIMARY KEY NOT NULL,
	"expense_id" integer,
	"description" text NOT NULL,
	"payment_method_id" integer,
	"total_amount" bigint,
	"currency" text DEFAULT 'ARS' NOT NULL,
	"installments" integer NOT NULL,
	"first_month" text NOT NULL,
	"note" text,
	CONSTRAINT "installment_plans_expense_id_unique" UNIQUE("expense_id")
);
--> statement-breakpoint
CREATE TABLE "login_failures" (
	"id" serial PRIMARY KEY NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payment_methods" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"type" text NOT NULL,
	"archived" boolean DEFAULT false NOT NULL,
	CONSTRAINT "payment_methods_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "recurring_payments" (
	"id" serial PRIMARY KEY NOT NULL,
	"recurring_id" integer NOT NULL,
	"period" text NOT NULL,
	"paid_on" date NOT NULL,
	"amount" bigint NOT NULL,
	"expense_id" integer,
	CONSTRAINT "recurring_payments_recurring_id_period_unique" UNIQUE("recurring_id","period")
);
--> statement-breakpoint
CREATE TABLE "recurrings" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"amount" bigint NOT NULL,
	"currency" text DEFAULT 'ARS' NOT NULL,
	"category_id" integer NOT NULL,
	"payment_method_id" integer,
	"frequency" text NOT NULL,
	"due_day" integer,
	"due_month" integer,
	"due_note" text,
	"creates_expense" boolean DEFAULT true NOT NULL,
	"active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "wish_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"project_id" integer,
	"name" text NOT NULL,
	"estimated_price" bigint,
	"currency" text DEFAULT 'ARS' NOT NULL,
	"saved" bigint DEFAULT 0 NOT NULL,
	"priority" text DEFAULT 'media' NOT NULL,
	"link" text,
	"note" text,
	"purchased_expense_id" integer,
	"purchased_on" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "wish_projects" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "wish_steps" (
	"id" serial PRIMARY KEY NOT NULL,
	"item_id" integer NOT NULL,
	"text" text NOT NULL,
	"done" boolean DEFAULT false NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "debt_payments" ADD CONSTRAINT "debt_payments_debt_id_debts_id_fk" FOREIGN KEY ("debt_id") REFERENCES "public"."debts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_payment_method_id_payment_methods_id_fk" FOREIGN KEY ("payment_method_id") REFERENCES "public"."payment_methods"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "installment_plans" ADD CONSTRAINT "installment_plans_expense_id_expenses_id_fk" FOREIGN KEY ("expense_id") REFERENCES "public"."expenses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "installment_plans" ADD CONSTRAINT "installment_plans_payment_method_id_payment_methods_id_fk" FOREIGN KEY ("payment_method_id") REFERENCES "public"."payment_methods"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurring_payments" ADD CONSTRAINT "recurring_payments_recurring_id_recurrings_id_fk" FOREIGN KEY ("recurring_id") REFERENCES "public"."recurrings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurring_payments" ADD CONSTRAINT "recurring_payments_expense_id_expenses_id_fk" FOREIGN KEY ("expense_id") REFERENCES "public"."expenses"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurrings" ADD CONSTRAINT "recurrings_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurrings" ADD CONSTRAINT "recurrings_payment_method_id_payment_methods_id_fk" FOREIGN KEY ("payment_method_id") REFERENCES "public"."payment_methods"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wish_items" ADD CONSTRAINT "wish_items_project_id_wish_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."wish_projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wish_items" ADD CONSTRAINT "wish_items_purchased_expense_id_expenses_id_fk" FOREIGN KEY ("purchased_expense_id") REFERENCES "public"."expenses"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wish_steps" ADD CONSTRAINT "wish_steps_item_id_wish_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."wish_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "expenses_date_idx" ON "expenses" USING btree ("date");--> statement-breakpoint
CREATE INDEX "incomes_date_idx" ON "incomes" USING btree ("date");