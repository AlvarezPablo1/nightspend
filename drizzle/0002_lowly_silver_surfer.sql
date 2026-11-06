ALTER TABLE "installment_plans" ADD COLUMN "other_person" text;--> statement-breakpoint
ALTER TABLE "installment_plans" ADD COLUMN "debt_id" integer;--> statement-breakpoint
ALTER TABLE "installment_plans" ADD CONSTRAINT "installment_plans_debt_id_debts_id_fk" FOREIGN KEY ("debt_id") REFERENCES "public"."debts"("id") ON DELETE set null ON UPDATE no action;