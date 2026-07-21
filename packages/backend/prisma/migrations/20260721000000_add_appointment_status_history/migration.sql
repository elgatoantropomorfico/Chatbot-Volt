-- CreateTable
CREATE TABLE "appointment_status_history" (
    "id" TEXT NOT NULL,
    "appointment_id" TEXT NOT NULL,
    "from_status" "AppointmentStatus",
    "to_status" "AppointmentStatus" NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'system',
    "changed_by_user_id" TEXT,
    "changed_by_name" TEXT,
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "appointment_status_history_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "appointment_status_history_appointment_id_created_at_idx" ON "appointment_status_history"("appointment_id", "created_at");

-- AddForeignKey
ALTER TABLE "appointment_status_history" ADD CONSTRAINT "appointment_status_history_appointment_id_fkey" FOREIGN KEY ("appointment_id") REFERENCES "appointments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
