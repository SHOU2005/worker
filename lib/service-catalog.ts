// Service catalog: what each Switch service includes/excludes and what
// equipment the employer needs to provide. Drives the ServiceDetailSheet
// shown when an employer taps a service tile on the dashboard.
//
// Keep this catalog in sync with the ROLES record in app/employer/page.tsx.
// If a new service is added there, add an entry here too — the sheet falls
// back to a generic copy if missing.

export interface ServiceDef {
  id:        string
  title:     string
  cat:       string
  includes:  string[]
  excludes:  string[]
  equipment: string
}

const _CATALOG: Record<string, Omit<ServiceDef, 'id'>> = {
  'Maid': {
    title: 'Maid',
    cat:   'Cleaning',
    includes: [
      'Sweeping & mopping floors',
      'Dusting shelves, tables and decor',
      'Cleaning bathrooms and toilets',
      'Washing utensils and dishes',
      'Taking out the household trash',
    ],
    excludes: [
      'Deep cleaning of carpets or rugs',
      'Cleaning of high ceilings or chandeliers',
      'Use of unstable stools or ladders',
      'Window-pane cleaning above 6 ft',
      'Pet waste handling',
    ],
    equipment: 'Please provide a broom, mop, bucket and any cleaning agents you prefer.',
  },
  'Bathroom Package': {
    title: 'Bathroom Package',
    cat:   'Cleaning',
    includes: [
      'Tiles, walls and floor scrubbing',
      'Toilet seat and bowl deep clean',
      'Wash basin and mirror polish',
      'Tap, shower and fixtures wipe-down',
      'Drainage de-clogging (basic)',
    ],
    excludes: [
      'Heavy stain removal',
      'Replacement of broken fittings',
      'Pipe repairs or leak fixes',
      'Acid-wash cleaning',
    ],
    equipment: 'Please provide bathroom cleaning agents, brush, gloves and a bucket.',
  },
  'Cook': {
    title: 'Cook',
    cat:   'Domestic',
    includes: [
      'Cooking 2–3 meals (breakfast / lunch / dinner)',
      'Basic vegetable cutting and prep',
      'Indian, Continental or simple Chinese cuisine',
      'Kitchen counter clean-up after cooking',
      'Spice and ingredient handling',
    ],
    excludes: [
      'Grocery shopping',
      'Cleaning utensils in bulk (separate maid required)',
      'Specialised diets without prior intimation',
      'Heavy bartending or party prep',
    ],
    equipment: 'Please ensure groceries, spices and basic cookware are available.',
  },
  'Kitchen Helper': {
    title: 'Kitchen Helper',
    cat:   'Domestic',
    includes: [
      'Vegetable peeling, chopping and prep',
      'Utensil pre-soak and basic wash',
      'Assisting the main cook',
      'Pantry organisation',
      'Quick kitchen counter wipe',
    ],
    excludes: [
      'Full meal preparation',
      'Bartending or beverage prep',
      'Grocery procurement',
    ],
    equipment: 'Please provide knives, chopping boards and basic prep utensils.',
  },
  'Caretaker': {
    title: 'Caretaker',
    cat:   'Domestic',
    includes: [
      'Companionship for elders / babies',
      'Feeding, basic hygiene assistance',
      'Light meal heating and serving',
      'Medication reminders (no administration)',
      'Light tidying of the care area',
    ],
    excludes: [
      'Medical procedures or injections',
      'Heavy lifting of patients',
      'Diaper changing for adults (specify in advance)',
      'Overnight bathing assistance',
    ],
    equipment: 'Please provide any required medication, feeding supplies and emergency contacts.',
  },
  'Waiter': {
    title: 'Waiter',
    cat:   'Hospitality',
    includes: [
      'Greeting and seating guests',
      'Taking and serving orders',
      'Clearing tables between courses',
      'Drink serving (non-alcoholic by default)',
      'Coordinating with kitchen / bar',
    ],
    excludes: [
      'Alcohol bartending (book Bartender)',
      'Heavy event setup or breakdown',
      'Cash handling beyond billing',
    ],
    equipment: 'Please provide uniform shirts (if specific), trays and serving utensils.',
  },
  'Bartender': {
    title: 'Bartender',
    cat:   'Hospitality',
    includes: [
      'Cocktail and mocktail preparation',
      'Beer and wine service',
      'Bar setup and clean-up',
      'Inventory and pouring control',
      'Guest engagement',
    ],
    excludes: [
      'Procurement of alcohol or mixers',
      'Event-wide waitering (book Waiter)',
      'Selling alcohol on your behalf',
    ],
    equipment: 'Please provide alcohol, mixers, glassware, shaker and ice.',
  },
  'Security Guard': {
    title: 'Security Guard',
    cat:   'Security',
    includes: [
      'Entry / exit monitoring',
      'Guest verification',
      'Premises patrol on schedule',
      'Incident logging and reporting',
      'Coordinating with local authorities if needed',
    ],
    excludes: [
      'Armed security (separate process)',
      'Use of force beyond legal limits',
      'Personal bodyguard services',
    ],
    equipment: 'Please provide a torch and any premises-specific access cards.',
  },
  'Bouncer': {
    title: 'Bouncer',
    cat:   'Security',
    includes: [
      'Crowd control at the door',
      'Guest ID verification',
      'Diffusing minor scuffles',
      'Coordinating with venue security',
    ],
    excludes: [
      'Armed defence',
      'Off-premises escort',
      'Personal escort for guests',
    ],
    equipment: 'Please provide a guest list and venue layout briefing.',
  },
  'Driver': {
    title: 'Driver',
    cat:   'Transport',
    includes: [
      'Driving within city and intercity routes',
      'Vehicle pre-check (fuel, tyres, lights)',
      'Trip log maintenance',
      'Following traffic rules and speed limits',
      'Family / cargo handling assistance',
    ],
    excludes: [
      'Fuel costs',
      'Tolls and parking fees',
      'Vehicle maintenance / repairs',
      'Driving without valid insurance / RC papers',
    ],
    equipment: 'Please ensure the vehicle is fuelled, insured and has valid RC + PUC.',
  },
  'Promoter': {
    title: 'Promoter',
    cat:   'Labour',
    includes: [
      'In-store or event-floor promotion',
      'Flyer distribution',
      'Product demos to walk-ins',
      'Basic lead capture (paper or app)',
      'End-of-day report to employer',
    ],
    excludes: [
      'Hard-sell or contract signing',
      'Cash handling',
      'Travel between locations within booking',
    ],
    equipment: 'Please provide flyers, demo products and any uniform / branding.',
  },
  'General Helper': {
    title: 'General Helper',
    cat:   'Labour',
    includes: [
      'Lifting and shifting light loads',
      'Errands within the premises',
      'Assisting other staff on site',
      'Basic clean-up post-task',
      'Following site supervisor instructions',
    ],
    excludes: [
      'Lifting heavy machinery alone',
      'Operating power tools without training',
      'Working at heights above 6 ft',
    ],
    equipment: 'Please provide gloves, safety footwear and any task-specific tools.',
  },
  'Factory Helper': {
    title: 'Factory Helper',
    cat:   'Labour',
    includes: [
      'Material loading and unloading',
      'Assembly-line assistance',
      'Packaging and labelling',
      'Quality-check sorting',
      'Following SOPs and safety norms',
    ],
    excludes: [
      'Forklift / crane operation',
      'Chemical handling without PPE',
      'Hazardous waste disposal',
    ],
    equipment: 'Please provide PPE (helmet, gloves, safety shoes) and area briefing.',
  },
}

// Fallback so a missing service doesn't crash the sheet.
const FALLBACK: Omit<ServiceDef, 'id'> = {
  title: 'Service',
  cat:   'General',
  includes: [
    'On-time arrival',
    'Following your specific instructions',
    'Maintaining a professional attitude',
    'Reporting completion at the end of the shift',
  ],
  excludes: [
    'Tasks not communicated up-front',
    'Working beyond the booked duration without approval',
  ],
  equipment: 'Please provide any task-specific tools and a briefing on arrival.',
}

export function getService(name: string): ServiceDef {
  const def = _CATALOG[name] ?? FALLBACK
  return { id: name, ...def }
}

export function getServicesInCategory(cat: string, exclude?: string): ServiceDef[] {
  return Object.entries(_CATALOG)
    .filter(([name, s]) => s.cat === cat && name !== exclude)
    .map(([name, s]) => ({ id: name, ...s }))
}
