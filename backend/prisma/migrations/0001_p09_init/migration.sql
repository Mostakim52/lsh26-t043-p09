-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "p09_workshop_users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "p09_workshop_users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "p09_auth_sessions" (
    "tokenHash" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "p09_auth_sessions_pkey" PRIMARY KEY ("tokenHash")
);

-- CreateTable
CREATE TABLE "p09_owners" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "area" TEXT NOT NULL,
    "since" TEXT NOT NULL,

    CONSTRAINT "p09_owners_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "p09_vehicles" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "make" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "plate" TEXT NOT NULL,
    "colour" TEXT NOT NULL,
    "bodyType" TEXT NOT NULL,
    "odometerKm" INTEGER NOT NULL,
    "odometerReadAt" TEXT NOT NULL,
    "avgKmPerDay" INTEGER NOT NULL,

    CONSTRAINT "p09_vehicles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "p09_service_items" (
    "id" TEXT NOT NULL,
    "vehicleId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "zone" TEXT NOT NULL,
    "cost" INTEGER NOT NULL,
    "ruleKind" TEXT NOT NULL,
    "dueDate" TEXT,
    "renewalMonths" INTEGER,
    "months" INTEGER,
    "lastDoneDate" TEXT,
    "intervalKm" INTEGER,
    "lastDoneOdometer" INTEGER,

    CONSTRAINT "p09_service_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "p09_service_records" (
    "id" TEXT NOT NULL,
    "vehicleId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "itemCode" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "odometer" INTEGER NOT NULL,
    "cost" INTEGER NOT NULL,
    "technician" TEXT NOT NULL,
    "notes" TEXT,

    CONSTRAINT "p09_service_records_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "p09_workshop_users_email_key" ON "p09_workshop_users"("email");

-- CreateIndex
CREATE INDEX "p09_auth_sessions_userId_idx" ON "p09_auth_sessions"("userId");

-- CreateIndex
CREATE INDEX "p09_vehicles_ownerId_idx" ON "p09_vehicles"("ownerId");

-- CreateIndex
CREATE INDEX "p09_service_items_vehicleId_idx" ON "p09_service_items"("vehicleId");

-- CreateIndex
CREATE UNIQUE INDEX "p09_service_items_vehicleId_code_key" ON "p09_service_items"("vehicleId", "code");

-- CreateIndex
CREATE INDEX "p09_service_records_vehicleId_idx" ON "p09_service_records"("vehicleId");

-- AddForeignKey
ALTER TABLE "p09_auth_sessions" ADD CONSTRAINT "p09_auth_sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "p09_workshop_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "p09_vehicles" ADD CONSTRAINT "p09_vehicles_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "p09_owners"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "p09_service_items" ADD CONSTRAINT "p09_service_items_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "p09_vehicles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "p09_service_records" ADD CONSTRAINT "p09_service_records_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "p09_vehicles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "p09_service_records" ADD CONSTRAINT "p09_service_records_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "p09_service_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

