CREATE TABLE "barber_links" (
    "code" TEXT NOT NULL,
    "barber_id" UUID NOT NULL,
    "used_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "barber_links_pkey" PRIMARY KEY ("code")
);

ALTER TABLE "barber_links" ADD CONSTRAINT "barber_links_barber_id_fkey" FOREIGN KEY ("barber_id") REFERENCES "barbers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
