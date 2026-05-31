#!/usr/bin/env bash
# Switch App — one-shot setup script
set -e

echo ""
echo "╔══════════════════════════════════════╗"
echo "║         Switch App Setup             ║"
echo "╚══════════════════════════════════════╝"
echo ""

# 1. Install dependencies
echo "📦 Installing dependencies..."
npm install

# 2. Copy .env if it doesn't exist
if [ ! -f .env ]; then
  echo "📋 Creating .env from .env.example..."
  cp .env.example .env
  echo ""
  echo "⚠️  Fill in .env before continuing:"
  echo "    DATABASE_URL     — PostgreSQL connection string"
  echo "    JWT_SECRET       — run: node -e \"console.log(require('crypto').randomBytes(64).toString('hex'))\""
  echo ""
  echo "  OTP (choose one):"
  echo "    Option A — Twilio SMS:"
  echo "      TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER"
  echo "      (leave empty to print OTP to terminal in dev mode)"
  echo ""
  echo "    Option B — Firebase Phone Auth (hearus-4f2fe project):"
  echo "      NEXT_PUBLIC_FIREBASE_AUTH_API_KEY  — from Firebase Console → hearus-4f2fe → Project Settings → General → Web app"
  echo "      (authDomain and projectId already default to hearus-4f2fe)"
  echo ""
  echo "  Push notifications (optional):"
  echo "    FIREBASE_SERVER_KEY, NEXT_PUBLIC_FIREBASE_VAPID_KEY"
  echo "    (leave empty to log notifications to terminal)"
  echo ""
  read -p "Press Enter after editing .env to continue..." _
fi

# 3. Generate Prisma client
echo "🔧 Generating Prisma client..."
npx prisma generate

# 4. Push schema to database
echo "🗄️  Pushing schema to database..."
npx prisma db push

# 5. Seed demo data
echo "🌱 Seeding demo data..."
npm run db:seed 2>/dev/null || npx ts-node --compiler-options '{"module":"CommonJS"}' prisma/seed.ts

echo ""
echo "✅ Setup complete!"
echo ""
echo "Demo accounts:"
echo "  Employer : +91 9999999901"
echo "  Worker   : +91 9999999902"
echo "  Admin    : +91 9999999900"
echo ""
echo "  OTP will be printed to this terminal (dev mode) unless Twilio/Firebase is configured."
echo ""
echo "Start the app:"
echo "  npm run dev"
echo ""
