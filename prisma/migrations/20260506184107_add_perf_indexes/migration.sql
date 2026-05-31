-- CreateIndex
CREATE INDEX "Booking_paymentStatus_idx" ON "Booking"("paymentStatus");

-- CreateIndex
CREATE INDEX "Booking_status_createdAt_idx" ON "Booking"("status", "createdAt");

-- CreateIndex
CREATE INDEX "Booking_employerId_status_idx" ON "Booking"("employerId", "status");

-- CreateIndex
CREATE INDEX "Payment_status_createdAt_idx" ON "Payment"("status", "createdAt");

-- CreateIndex
CREATE INDEX "Payment_razorpayOrderId_idx" ON "Payment"("razorpayOrderId");

-- CreateIndex
CREATE INDEX "Payment_razorpayPaymentId_idx" ON "Payment"("razorpayPaymentId");

-- CreateIndex
CREATE INDEX "Shift_status_date_idx" ON "Shift"("status", "date");

-- CreateIndex
CREATE INDEX "Shift_employerProfileId_status_idx" ON "Shift"("employerProfileId", "status");

-- CreateIndex
CREATE INDEX "Shift_role_city_status_idx" ON "Shift"("role", "city", "status");

-- CreateIndex
CREATE INDEX "WorkerProfile_lastSeenAt_idx" ON "WorkerProfile"("lastSeenAt");

-- CreateIndex
CREATE INDEX "WorkerProfile_city_kycStatus_idx" ON "WorkerProfile"("city", "kycStatus");
