-- Escrita a mano: drizzle agregaba user_id NOT NULL sin valor, y eso falla con datos cargados.
-- Orden: columnas vacías, dueño provisorio de los datos existentes, asignación, y recién ahí NOT NULL.
-- El dueño provisorio pasa a ser tuyo la primera vez que entrás con BACKUP_EMAIL y tu contraseña (src/lib/owner-claim.ts).
DROP TABLE "login_failures" CASCADE;--> statement-breakpoint
ALTER TABLE "categories" ADD COLUMN "user_id" integer;--> statement-breakpoint
ALTER TABLE "payment_methods" ADD COLUMN "user_id" integer;--> statement-breakpoint
ALTER TABLE "expenses" ADD COLUMN "user_id" integer;--> statement-breakpoint
ALTER TABLE "installment_plans" ADD COLUMN "user_id" integer;--> statement-breakpoint
ALTER TABLE "recurring_incomes" ADD COLUMN "user_id" integer;--> statement-breakpoint
ALTER TABLE "incomes" ADD COLUMN "user_id" integer;--> statement-breakpoint
ALTER TABLE "recurrings" ADD COLUMN "user_id" integer;--> statement-breakpoint
ALTER TABLE "recurring_payments" ADD COLUMN "user_id" integer;--> statement-breakpoint
ALTER TABLE "debts" ADD COLUMN "user_id" integer;--> statement-breakpoint
ALTER TABLE "debt_payments" ADD COLUMN "user_id" integer;--> statement-breakpoint
ALTER TABLE "wish_projects" ADD COLUMN "user_id" integer;--> statement-breakpoint
ALTER TABLE "wish_items" ADD COLUMN "user_id" integer;--> statement-breakpoint
ALTER TABLE "wish_steps" ADD COLUMN "user_id" integer;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "user_id" integer;--> statement-breakpoint
INSERT INTO "users" ("email", "password_hash")
SELECT 'dueno@nightspend.invalid', '!'
WHERE (EXISTS (SELECT 1 FROM "categories") OR EXISTS (SELECT 1 FROM "payment_methods") OR EXISTS (SELECT 1 FROM "expenses") OR EXISTS (SELECT 1 FROM "installment_plans") OR EXISTS (SELECT 1 FROM "recurring_incomes") OR EXISTS (SELECT 1 FROM "incomes") OR EXISTS (SELECT 1 FROM "recurrings") OR EXISTS (SELECT 1 FROM "recurring_payments") OR EXISTS (SELECT 1 FROM "debts") OR EXISTS (SELECT 1 FROM "debt_payments") OR EXISTS (SELECT 1 FROM "wish_projects") OR EXISTS (SELECT 1 FROM "wish_items") OR EXISTS (SELECT 1 FROM "wish_steps") OR EXISTS (SELECT 1 FROM "settings"))
  AND NOT EXISTS (SELECT 1 FROM "users" WHERE "email" = 'dueno@nightspend.invalid');--> statement-breakpoint
UPDATE "categories" SET "user_id" = (SELECT "id" FROM "users" WHERE "email" = 'dueno@nightspend.invalid') WHERE "user_id" IS NULL;--> statement-breakpoint
UPDATE "payment_methods" SET "user_id" = (SELECT "id" FROM "users" WHERE "email" = 'dueno@nightspend.invalid') WHERE "user_id" IS NULL;--> statement-breakpoint
UPDATE "expenses" SET "user_id" = (SELECT "id" FROM "users" WHERE "email" = 'dueno@nightspend.invalid') WHERE "user_id" IS NULL;--> statement-breakpoint
UPDATE "installment_plans" SET "user_id" = (SELECT "id" FROM "users" WHERE "email" = 'dueno@nightspend.invalid') WHERE "user_id" IS NULL;--> statement-breakpoint
UPDATE "recurring_incomes" SET "user_id" = (SELECT "id" FROM "users" WHERE "email" = 'dueno@nightspend.invalid') WHERE "user_id" IS NULL;--> statement-breakpoint
UPDATE "incomes" SET "user_id" = (SELECT "id" FROM "users" WHERE "email" = 'dueno@nightspend.invalid') WHERE "user_id" IS NULL;--> statement-breakpoint
UPDATE "recurrings" SET "user_id" = (SELECT "id" FROM "users" WHERE "email" = 'dueno@nightspend.invalid') WHERE "user_id" IS NULL;--> statement-breakpoint
UPDATE "recurring_payments" SET "user_id" = (SELECT "id" FROM "users" WHERE "email" = 'dueno@nightspend.invalid') WHERE "user_id" IS NULL;--> statement-breakpoint
UPDATE "debts" SET "user_id" = (SELECT "id" FROM "users" WHERE "email" = 'dueno@nightspend.invalid') WHERE "user_id" IS NULL;--> statement-breakpoint
UPDATE "debt_payments" SET "user_id" = (SELECT "id" FROM "users" WHERE "email" = 'dueno@nightspend.invalid') WHERE "user_id" IS NULL;--> statement-breakpoint
UPDATE "wish_projects" SET "user_id" = (SELECT "id" FROM "users" WHERE "email" = 'dueno@nightspend.invalid') WHERE "user_id" IS NULL;--> statement-breakpoint
UPDATE "wish_items" SET "user_id" = (SELECT "id" FROM "users" WHERE "email" = 'dueno@nightspend.invalid') WHERE "user_id" IS NULL;--> statement-breakpoint
UPDATE "wish_steps" SET "user_id" = (SELECT "id" FROM "users" WHERE "email" = 'dueno@nightspend.invalid') WHERE "user_id" IS NULL;--> statement-breakpoint
UPDATE "settings" SET "user_id" = (SELECT "id" FROM "users" WHERE "email" = 'dueno@nightspend.invalid') WHERE "user_id" IS NULL;--> statement-breakpoint
ALTER TABLE "categories" ALTER COLUMN "user_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "payment_methods" ALTER COLUMN "user_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "expenses" ALTER COLUMN "user_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "installment_plans" ALTER COLUMN "user_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "recurring_incomes" ALTER COLUMN "user_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "incomes" ALTER COLUMN "user_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "recurrings" ALTER COLUMN "user_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "recurring_payments" ALTER COLUMN "user_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "debts" ALTER COLUMN "user_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "debt_payments" ALTER COLUMN "user_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "wish_projects" ALTER COLUMN "user_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "wish_items" ALTER COLUMN "user_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "wish_steps" ALTER COLUMN "user_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "settings" ALTER COLUMN "user_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "categories" DROP CONSTRAINT "categories_name_unique";--> statement-breakpoint
ALTER TABLE "payment_methods" DROP CONSTRAINT "payment_methods_name_unique";--> statement-breakpoint
ALTER TABLE "settings" DROP CONSTRAINT "settings_pkey";--> statement-breakpoint
DROP INDEX "expenses_date_idx";--> statement-breakpoint
DROP INDEX "incomes_date_idx";--> statement-breakpoint
ALTER TABLE "settings" ADD CONSTRAINT "settings_user_id_key_pk" PRIMARY KEY("user_id","key");--> statement-breakpoint
ALTER TABLE "categories" ADD CONSTRAINT "categories_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_methods" ADD CONSTRAINT "payment_methods_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "installment_plans" ADD CONSTRAINT "installment_plans_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurring_incomes" ADD CONSTRAINT "recurring_incomes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "incomes" ADD CONSTRAINT "incomes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurrings" ADD CONSTRAINT "recurrings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurring_payments" ADD CONSTRAINT "recurring_payments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "debts" ADD CONSTRAINT "debts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "debt_payments" ADD CONSTRAINT "debt_payments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wish_projects" ADD CONSTRAINT "wish_projects_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wish_items" ADD CONSTRAINT "wish_items_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wish_steps" ADD CONSTRAINT "wish_steps_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "settings" ADD CONSTRAINT "settings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "expenses_user_date_idx" ON "expenses" USING btree ("user_id","date");--> statement-breakpoint
CREATE INDEX "incomes_user_date_idx" ON "incomes" USING btree ("user_id","date");--> statement-breakpoint
CREATE INDEX "debt_payments_user_idx" ON "debt_payments" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "debts_user_idx" ON "debts" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "installment_plans_user_idx" ON "installment_plans" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "recurring_incomes_user_idx" ON "recurring_incomes" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "recurring_payments_user_idx" ON "recurring_payments" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "recurrings_user_idx" ON "recurrings" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "wish_items_user_idx" ON "wish_items" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "wish_projects_user_idx" ON "wish_projects" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "wish_steps_user_idx" ON "wish_steps" USING btree ("user_id");--> statement-breakpoint
ALTER TABLE "categories" ADD CONSTRAINT "categories_user_name_unique" UNIQUE("user_id","name");--> statement-breakpoint
ALTER TABLE "payment_methods" ADD CONSTRAINT "payment_methods_user_name_unique" UNIQUE("user_id","name");