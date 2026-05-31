import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

async function main() {
  console.log('🌱 Seeding Switch Shift...')

  const pass = await bcrypt.hash('demo123', 12)
  const adminPass = await bcrypt.hash('admin123', 12)

  // Admin — per-role schema: composite key (phone, role) matches the
  // @@unique on User.
  await prisma.user.upsert({
    where:  { phone_role: { phone: '9999999900', role: 'ADMIN' } },
    update: {},
    create: {
      name:     'Admin User',
      phone:    '9999999900',
      password: adminPass,
      role:     'ADMIN',
    },
  })

  // Founder admins — promoted by phone so they can log into ops / any app.
  for (const phone of ['9205617375', '8368828660']) {
    await prisma.user.upsert({
      where:  { phone_role: { phone, role: 'ADMIN' } },
      update: { role: 'ADMIN' },
      create: {
        name:     'Admin',
        phone,
        password: adminPass,
        role:     'ADMIN',
      },
    })
  }

  // Employer
  const employer = await prisma.user.upsert({
    where:  { phone_role: { phone: '9999999901', role: 'EMPLOYER' } },
    update: {},
    create: {
      name:     'Ravi Sharma',
      phone:    '9999999901',
      password: pass,
      role:     'EMPLOYER',
      employerProfile: {
        create: {
          companyName:  'TechMart Pvt Ltd',
          businessType: 'Retail',
          city:         'Gurgaon',
          lat:          28.4595,
          lng:          77.0266,
          totalShifts:  12,
          rating:       4.5,
        },
      },
    },
    include: { employerProfile: true },
  })

  // Workers
  const workerData = [
    { name: 'Amit Kumar',   phone: '9999999902', city: 'Gurgaon', lat: 28.4647, lng: 77.0339, rating: 4.8, shifts: 28, skills: ['Helper', 'Warehouse Worker'] },
    { name: 'Priya Mehta',  phone: '9999999903', city: 'Gurgaon', lat: 28.4536, lng: 77.0186, rating: 4.6, shifts: 15, skills: ['Shop Assistant', 'Kitchen Staff'] },
    { name: 'Rahul Singh',  phone: '9999999904', city: 'Gurgaon', lat: 28.4742, lng: 77.0490, rating: 4.3, shifts: 42, skills: ['Driver', 'Delivery Boy'] },
    { name: 'Deepak Verma', phone: '9999999905', city: 'Gurgaon', lat: 28.4421, lng: 77.0079, rating: 4.7, shifts: 8,  skills: ['Security Guard'] },
  ]

  for (const w of workerData) {
    await prisma.user.upsert({
      where:  { phone_role: { phone: w.phone, role: 'WORKER' } },
      update: {},
      create: {
        name:     w.name,
        phone:    w.phone,
        password: pass,
        role:     'WORKER',
        workerProfile: {
          create: {
            city:           w.city,
            lat:            w.lat,
            lng:            w.lng,
            rating:         w.rating,
            totalShifts:    w.shifts,
            totalEarnings:  w.shifts * 125 * 8,
            skills:         w.skills,
            kycStatus:      'APPROVED',
            aadhaarVerified: true,
            videoVerified:  true,
            isAvailable:    true,
          },
        },
      },
    })
  }

  // Sample shifts
  const ep = employer.employerProfile
  if (ep) {
    await prisma.shift.createMany({
      data: [
        {
          employerProfileId: ep.id,
          title:         'Warehouse Packers Needed',
          role:          'warehouseWorker',
          address:       'Udyog Vihar Phase 4, Gurgaon',
          city:          'Gurgaon',
          lat:           28.5021,
          lng:           77.0855,
          date:          new Date(Date.now() + 86400000),
          startTime:     '09:00',
          endTime:       '17:00',
          duration:      8,
          workersNeeded: 3,
          hourlyRate:    200,
          isUrgent:      true,
          urgentFee:     99,
          status:        'OPEN',
        },
        {
          employerProfileId: ep.id,
          title:         'Shop Assistant – Weekend',
          role:          'shopAssistant',
          address:       'MG Road, DLF Phase 1, Gurgaon',
          city:          'Gurgaon',
          lat:           28.4773,
          lng:           77.0762,
          date:          new Date(Date.now() + 172800000),
          startTime:     '11:00',
          endTime:       '19:00',
          duration:      8,
          workersNeeded: 2,
          hourlyRate:    200,
          isUrgent:      false,
          urgentFee:     0,
          status:        'OPEN',
        },
        {
          employerProfileId: ep.id,
          title:         'Office Helper – Half Day',
          role:          'helper',
          address:       'Cyber City, Gurgaon',
          city:          'Gurgaon',
          lat:           28.4949,
          lng:           77.0871,
          date:          new Date(Date.now() + 259200000),
          startTime:     '09:00',
          endTime:       '13:00',
          duration:      4,
          workersNeeded: 1,
          hourlyRate:    200,
          isUrgent:      false,
          urgentFee:     0,
          status:        'OPEN',
        },
      ],
    })
  }

  console.log('✅ Seed complete!')
  console.log('📱 Demo accounts:')
  console.log('   Admin:    9999999900 / admin123')
  console.log('   Employer: 9999999901 / demo123')
  console.log('   Worker:   9999999902 / demo123')
}

main()
  .catch(e => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
