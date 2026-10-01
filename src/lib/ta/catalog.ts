// Tactical Arbitrage — product catalog generator
// Generates deterministic, realistic (fictional) retailer + Amazon catalog data
// used by the seed script and by the scan engine when minting "new" deals.

import { rng } from './history';

export interface ProductSeedSpec {
  title: string;
  brand: string;
  category: string;
  upc: string;
  packCount: number;
  unitSize: string;
  listPrice: number;
  weightLb: number;
  dims: { lengthIn: number; widthIn: number; heightIn: number };
  hazmat: boolean;
  meltable: boolean;
  fragile: boolean;
}

interface BrandSpec {
  name: string;
  gated: boolean;
  ipClaim: boolean;
}

// Fictional-but-plausible brands. `gated` brands mirror real-world gating pain.
export const BRANDS: Record<string, BrandSpec[]> = {
  'Health & Household': [
    { name: 'NatureVital', gated: false, ipClaim: false },
    { name: 'WellCore Labs', gated: true, ipClaim: false },
    { name: 'PurePath Nutrition', gated: true, ipClaim: true },
    { name: 'DailyDose Health', gated: false, ipClaim: false },
    { name: 'BrightLife Wellness', gated: false, ipClaim: false },
  ],
  Beauty: [
    { name: 'Lumea Beauty', gated: false, ipClaim: false },
    { name: 'VelourSkin', gated: true, ipClaim: false },
    { name: 'GlowTheory', gated: false, ipClaim: true },
    { name: 'PetalFresh Co', gated: false, ipClaim: false },
  ],
  'Grocery & Gourmet': [
    { name: "Harvest & Hearth", gated: false, ipClaim: false },
    { name: 'Golden Valley Foods', gated: false, ipClaim: false },
    { name: 'Casa Verde Kitchen', gated: false, ipClaim: false },
    { name: 'PeakRoast Coffee', gated: true, ipClaim: false },
  ],
  'Toys & Games': [
    { name: 'PlayForge Toys', gated: false, ipClaim: false },
    { name: 'BrainBlox', gated: false, ipClaim: true },
    { name: 'WonderWorks Kids', gated: false, ipClaim: false },
    { name: 'Turbo Wheels', gated: true, ipClaim: false },
  ],
  'Home & Kitchen': [
    { name: 'Hearth & Haven', gated: false, ipClaim: false },
    { name: 'ChefCrafter', gated: false, ipClaim: false },
    { name: 'TidyNest Home', gated: false, ipClaim: false },
    { name: 'Lumina Living', gated: false, ipClaim: false },
  ],
  'Pet Supplies': [
    { name: 'PawPodium', gated: false, ipClaim: false },
    { name: 'FurBridge Pets', gated: false, ipClaim: false },
    { name: 'WhiskerWay', gated: false, ipClaim: false },
  ],
  Electronics: [
    { name: 'VoltEdge Tech', gated: false, ipClaim: false },
    { name: 'SonicPeak Audio', gated: false, ipClaim: true },
    { name: 'ChargeHub Pro', gated: false, ipClaim: false },
  ],
  'Sports & Outdoors': [
    { name: 'SummitLine Gear', gated: false, ipClaim: false },
    { name: 'FlexForm Fitness', gated: false, ipClaim: false },
    { name: 'TrailBlaze Outfitters', gated: false, ipClaim: false },
  ],
  'Office Products': [
    { name: 'DeskCraft Studio', gated: false, ipClaim: false },
    { name: 'InkBridge Supply', gated: false, ipClaim: false },
    { name: 'PaperTrail Co', gated: false, ipClaim: false },
  ],
};

interface TemplateSpec {
  patterns: string[]; // {n}=brand, {u}=unitSize, {p}=packCount
  listPrice: [number, number]; // min, max
  weightLb: [number, number];
  dims: [number, number, number];
  hazmat?: boolean;
  meltable?: boolean;
  fragile?: boolean;
  unitSizes: string[];
  packCounts: number[];
}

export const TEMPLATES: Record<string, TemplateSpec[]> = {
  'Health & Household': [
    { patterns: ['{n} Magnesium Glycinate 400mg, {p}×{u}', '{n} Vitamin D3 + K2 Capsules, {p}×{u}', '{n} Omega-3 Fish Oil Softgels, {p}×{u}'], listPrice: [14, 42], weightLb: [0.6, 1.8], dims: [6, 3, 3], unitSizes: ['60ct', '120ct', '180ct'], packCounts: [1, 1, 2, 3] },
    { patterns: ['{n} Collagen Peptides Powder, {u}', '{n} Plant Protein Powder, {u}'], listPrice: [22, 48], weightLb: [1.5, 2.6], dims: [7, 6, 6], unitSizes: ['16oz', '20oz', '2lb'], packCounts: [1] },
    { patterns: ['{n} Whitening Toothpaste 3-Pack, {p}×{u}', '{n} Mouthwash Alcohol-Free, {u}'], listPrice: [8, 22], weightLb: [1.2, 2.4], dims: [8, 4, 3], unitSizes: ['6oz', '16oz'], packCounts: [1, 3, 4], fragile: false },
    { patterns: ['{n} Allergy Relief Tablets 365ct, {u}', '{n} Melatonin Gummies {u}'], listPrice: [11, 28], weightLb: [0.4, 1.1], dims: [5, 3, 2], unitSizes: ['90ct', '120ct', '180ct'], packCounts: [1] },
  ],
  Beauty: [
    { patterns: ['{n} Vitamin C Face Serum, {u}', '{n} Hyaluronic Acid Serum, {u}'], listPrice: [12, 34], weightLb: [0.3, 0.6], dims: [4.5, 1.5, 1.5], unitSizes: ['1oz', '2oz'], packCounts: [1, 2] },
    { patterns: ['{n} Argan Oil Shampoo & Conditioner Set', '{n} Biotin Shampoo for Thinning Hair, {u}'], listPrice: [16, 38], weightLb: [1.4, 2.2], dims: [8, 3.5, 3], unitSizes: ['12oz', '16oz'], packCounts: [1, 2] },
    { patterns: ['{n} Mineral Sunscreen SPF 50, {u}', '{n} Daily Facial Moisturizer SPF 30, {u}'], listPrice: [9, 26], weightLb: [0.4, 0.8], dims: [6, 2.5, 1.5], unitSizes: ['3oz', '5oz'], packCounts: [1, 2] },
    { patterns: ['{n} 12-Piece Makeup Brush Set', '{n} Eyeshadow Palette 18 Shades'], listPrice: [11, 30], weightLb: [0.6, 1.2], dims: [9, 5, 1.5], unitSizes: ['12pc', '18pc'], packCounts: [1], fragile: true },
  ],
  'Grocery & Gourmet': [
    { patterns: ['{n} Whole Bean Coffee Medium Roast, {u}', '{n} Cold Brew Concentrate, {u}'], listPrice: [12, 32], weightLb: [1, 2.4], dims: [6, 4, 4], unitSizes: ['12oz', '2lb', '32oz'], packCounts: [1, 2] },
    { patterns: ['{n} Organic Olive Oil Cold Pressed, {u}', '{n} Avocado Oil Spray, {u}'], listPrice: [10, 28], weightLb: [1.2, 2.5], dims: [9, 3.5, 3.5], unitSizes: ['500ml', '1L', '16oz'], packCounts: [1, 2], fragile: true },
    { patterns: ['{n} Protein Bars Variety Pack, {p}×{u}', '{n} Almond Flour Crackers, {p}×{u}'], listPrice: [14, 36], weightLb: [1.3, 3], dims: [10, 6, 4], unitSizes: ['1.4oz', '2oz'], packCounts: [6, 12, 18] },
    { patterns: ['{n} Sea Salt Caramels Gift Box', '{n} Dark Chocolate Assortment, {u}'], listPrice: [12, 30], weightLb: [0.8, 1.6], dims: [8, 6, 2.5], unitSizes: ['12oz', '1.5lb'], packCounts: [1], meltable: true, fragile: true },
  ],
  'Toys & Games': [
    { patterns: ['{n} STEM Building Blocks Set, {u}', '{n} Magnetic Tiles Classroom Pack, {u}'], listPrice: [24, 68], weightLb: [2, 5.5], dims: [12, 10, 4], unitSizes: ['100pc', '150pc', '210pc'], packCounts: [1] },
    { patterns: ['{n} Family Board Game — {u}', '{n} Card Game Party Edition'], listPrice: [14, 40], weightLb: [1, 2.8], dims: [11, 8, 2.5], unitSizes: ['2-6 players', '2-8 players'], packCounts: [1] },
    { patterns: ['{n} Remote Control Rock Crawler, 1:14 Scale', '{n} RC Stunt Car with LED Lights'], listPrice: [26, 72], weightLb: [2.2, 4.6], dims: [13, 8, 7], unitSizes: ['1:14', '1:16'], packCounts: [1], fragile: true },
    { patterns: ['{n} Plush Teddy Bear {u}', '{n} Stuffed Animal Collection {u}'], listPrice: [12, 36], weightLb: [0.8, 2.2], dims: [12, 9, 6], unitSizes: ['12in', '18in'], packCounts: [1, 2] },
  ],
  'Home & Kitchen': [
    { patterns: ['{n} Stainless Steel Insulated Tumbler, {u}', '{n} Glass Water Bottle with Sleeve, {u}'], listPrice: [14, 38], weightLb: [1, 2.4], dims: [10, 4, 4], unitSizes: ['24oz', '32oz', '40oz'], packCounts: [1, 2], fragile: true },
    { patterns: ['{n} Nonstick Cookware Set, {u}', '{n} Cast Iron Skillet Pre-Seasoned, {u}'], listPrice: [28, 89], weightLb: [4, 9], dims: [18, 11, 5], unitSizes: ['8pc', '10pc', '12in'], packCounts: [1] },
    { patterns: ['{n} Ceramic Dinnerware Set for 4', '{n} Stoneware Pasta Bowls, {p}-Pack'], listPrice: [26, 74], weightLb: [6, 12], dims: [13, 13, 8], unitSizes: ['16pc', '4pc'], packCounts: [1, 2], fragile: true },
    { patterns: ['{n} LED Desk Lamp with USB Port', '{n} Dimmable Floor Lamp, Modern'], listPrice: [22, 66], weightLb: [2, 6.5], dims: [14, 8, 6], unitSizes: ['10W', '14W'], packCounts: [1] },
  ],
  'Pet Supplies': [
    { patterns: ['{n} Orthopedic Dog Bed {u}', '{n} Calming Cat Bed Donut {u}'], listPrice: [24, 68], weightLb: [3, 7], dims: [24, 18, 6], unitSizes: ['Medium', 'Large', 'XL'], packCounts: [1] },
    { patterns: ['{n} Grain-Free Dog Treats, {u}', '{n} Freeze-Dried Salmon Bites, {u}'], listPrice: [12, 34], weightLb: [0.8, 2.2], dims: [8, 5, 3], unitSizes: ['8oz', '14oz', '1lb'], packCounts: [1, 2] },
    { patterns: ['{n} No-Pull Dog Harness with Leash', '{n} Reflective Cat Collar Set'], listPrice: [13, 32], weightLb: [0.6, 1.4], dims: [9, 7, 2], unitSizes: ['S-M', 'L-XL'], packCounts: [1] },
  ],
  Electronics: [
    { patterns: ['{n} Bluetooth Earbuds with Charging Case', '{n} Wireless Over-Ear Headphones'], listPrice: [28, 89], weightLb: [0.6, 1.6], dims: [7, 6, 3], unitSizes: ['BT 5.3', 'ANC'], packCounts: [1] },
    { patterns: ['{n} 65W GaN USB-C Charger, {u}', '{n} 20000mAh Power Bank {u}'], listPrice: [18, 52], weightLb: [0.5, 1.2], dims: [4, 3, 2], unitSizes: ['Dual Port', 'PD 3.0'], packCounts: [1] },
    { patterns: ['{n} LED Strip Lights 50ft, App Control', '{n} Smart Plug Mini 4-Pack'], listPrice: [15, 44], weightLb: [0.7, 1.8], dims: [6, 5, 2.5], unitSizes: ['50ft', '4pc'], packCounts: [1, 2] },
  ],
  'Sports & Outdoors': [
    { patterns: ['{n} Resistance Bands Set, {u}', '{n} Adjustable Dumbbell {u}'], listPrice: [16, 78], weightLb: [2, 12], dims: [14, 8, 5], unitSizes: ['5pc', '25lb', '55lb'], packCounts: [1] },
    { patterns: ['{n} Insulated Hiking Backpack {u}', '{n} Packable Daypack Water-Resistant'], listPrice: [24, 72], weightLb: [1.6, 4], dims: [14, 11, 6], unitSizes: ['35L', '45L'], packCounts: [1] },
    { patterns: ['{n} Camping Lantern Rechargeable, {p}-Pack', '{n} Paracord Survival Kit {u}'], listPrice: [12, 38], weightLb: [0.9, 2.6], dims: [6, 5, 4], unitSizes: ['1000lm', '12-in-1'], packCounts: [1, 2, 4] },
  ],
  'Office Products': [
    { patterns: ['{n} Ergonomic Mesh Office Chair', '{n} Standing Desk Converter {u}'], listPrice: [68, 220], weightLb: [12, 28], dims: [24, 20, 10], unitSizes: ['32in', '36in'], packCounts: [1] },
    { patterns: ['{n} Gel Pens Fine Point, {p}-Pack, {u}', '{n} Sticky Notes Cube Assorted, {p}×{u}'], listPrice: [8, 26], weightLb: [0.6, 2], dims: [7, 4, 2], unitSizes: ['0.5mm', '3x3in'], packCounts: [6, 12, 24] },
    { patterns: ['{n} Laptop Stand Aluminum Adjustable', '{n} Monitor Riser with Drawer'], listPrice: [16, 46], weightLb: [1.8, 5], dims: [12, 9, 3], unitSizes: ['10-17in'], packCounts: [1] },
  ],
};

export interface RetailerSeedSpec {
  name: string;
  domain: string;
  tier: 'A' | 'B' | 'C';
  cadenceHours: number;
  discountBias: number; // typical effective discount vs list
  skew: string[]; // categories this retailer over-indexes on (weights synthetic scan yield)
  notes?: string;
}

// Real US retail network (66 sites at launch — 18 Tier A / 33 Tier B / 15 Tier C).
// Mirrors the production crawl target list per PRD FR-1.1 (250 at launch → 1,200 by month 6);
// the demo generates synthetic catalog data locally and never contacts these domains.
export const RETAILERS: RetailerSeedSpec[] = [
  // ---------- Tier A — high velocity: clearance, deal pages, promo feeds (every 2-4h) ----------
  { name: 'Walmart', domain: 'walmart.com', tier: 'A', cadenceHours: 2, discountBias: 0.42, skew: ['Electronics', 'Toys & Games', 'Home & Kitchen', 'Grocery & Gourmet'], notes: 'Rollback + clearance feed churns fast' },
  { name: 'Best Buy', domain: 'bestbuy.com', tier: 'A', cadenceHours: 2, discountBias: 0.38, skew: ['Electronics'], notes: 'Open-box + deal of the day' },
  { name: 'Target', domain: 'target.com', tier: 'A', cadenceHours: 3, discountBias: 0.45, skew: ['Toys & Games', 'Beauty', 'Home & Kitchen'], notes: 'Post-holiday clearance cycles' },
  { name: 'Costco', domain: 'costco.com', tier: 'A', cadenceHours: 4, discountBias: 0.3, skew: ['Grocery & Gourmet', 'Office Products', 'Health & Household'], notes: 'Warehouse clearance + .97 price endings' },
  { name: "Sam's Club", domain: 'samsclub.com', tier: 'A', cadenceHours: 4, discountBias: 0.32, skew: ['Grocery & Gourmet', 'Office Products'] },
  { name: 'Home Depot', domain: 'homedepot.com', tier: 'A', cadenceHours: 4, discountBias: 0.4, skew: ['Home & Kitchen'], notes: 'Special buys of the week' },
  { name: "Lowe's", domain: 'lowes.com', tier: 'A', cadenceHours: 4, discountBias: 0.38, skew: ['Home & Kitchen'] },
  { name: 'Newegg', domain: 'newegg.com', tier: 'A', cadenceHours: 2, discountBias: 0.35, skew: ['Electronics'], notes: 'Shell shocker deals' },
  { name: 'GameStop', domain: 'gamestop.com', tier: 'A', cadenceHours: 3, discountBias: 0.45, skew: ['Electronics', 'Toys & Games'], notes: 'Clearance + collectibles' },
  { name: 'Walgreens', domain: 'walgreens.com', tier: 'A', cadenceHours: 2, discountBias: 0.5, skew: ['Health & Household', 'Beauty'], notes: 'Weekly clearance stickers' },
  { name: 'CVS', domain: 'cvs.com', tier: 'A', cadenceHours: 2, discountBias: 0.5, skew: ['Health & Household', 'Beauty'], notes: '75/90% off markdown cycles' },
  { name: "Kohl's", domain: 'kohls.com', tier: 'A', cadenceHours: 3, discountBias: 0.48, skew: ['Home & Kitchen', 'Beauty'] },
  { name: "Macy's", domain: 'macys.com', tier: 'A', cadenceHours: 3, discountBias: 0.5, skew: ['Home & Kitchen', 'Beauty'] },
  { name: "Dick's Sporting Goods", domain: 'dickssportinggoods.com', tier: 'A', cadenceHours: 3, discountBias: 0.4, skew: ['Sports & Outdoors'] },
  { name: 'PetSmart', domain: 'petsmart.com', tier: 'A', cadenceHours: 3, discountBias: 0.45, skew: ['Pet Supplies'] },
  { name: 'Chewy', domain: 'chewy.com', tier: 'A', cadenceHours: 4, discountBias: 0.35, skew: ['Pet Supplies'] },
  { name: 'Staples', domain: 'staples.com', tier: 'A', cadenceHours: 3, discountBias: 0.42, skew: ['Office Products'], notes: 'Clearance + bundle deals' },
  { name: 'Wayfair', domain: 'wayfair.com', tier: 'A', cadenceHours: 4, discountBias: 0.55, skew: ['Home & Kitchen'], notes: 'Daily flash sales' },

  // ---------- Tier B — full catalog (every 12-24h) ----------
  { name: 'Meijer', domain: 'meijer.com', tier: 'B', cadenceHours: 12, discountBias: 0.3, skew: ['Grocery & Gourmet', 'Home & Kitchen'] },
  { name: 'Kroger', domain: 'kroger.com', tier: 'B', cadenceHours: 12, discountBias: 0.32, skew: ['Grocery & Gourmet'] },
  { name: 'Albertsons', domain: 'albertsons.com', tier: 'B', cadenceHours: 18, discountBias: 0.3, skew: ['Grocery & Gourmet'] },
  { name: 'Safeway', domain: 'safeway.com', tier: 'B', cadenceHours: 18, discountBias: 0.3, skew: ['Grocery & Gourmet'] },
  { name: 'Fred Meyer', domain: 'fredmeyer.com', tier: 'B', cadenceHours: 24, discountBias: 0.28, skew: ['Grocery & Gourmet', 'Home & Kitchen'] },
  { name: 'H-E-B', domain: 'heb.com', tier: 'B', cadenceHours: 24, discountBias: 0.25, skew: ['Grocery & Gourmet'] },
  { name: 'Publix', domain: 'publix.com', tier: 'B', cadenceHours: 24, discountBias: 0.25, skew: ['Grocery & Gourmet'] },
  { name: 'Wegmans', domain: 'wegmans.com', tier: 'B', cadenceHours: 24, discountBias: 0.24, skew: ['Grocery & Gourmet'] },
  { name: 'Petco', domain: 'petco.com', tier: 'B', cadenceHours: 12, discountBias: 0.35, skew: ['Pet Supplies'] },
  { name: 'Pet Supplies Plus', domain: 'petsuppliesplus.com', tier: 'B', cadenceHours: 24, discountBias: 0.3, skew: ['Pet Supplies'] },
  { name: 'Tractor Supply', domain: 'tractorsupply.com', tier: 'B', cadenceHours: 18, discountBias: 0.3, skew: ['Pet Supplies', 'Sports & Outdoors'] },
  { name: "Blain's Farm & Fleet", domain: 'blains.com', tier: 'B', cadenceHours: 24, discountBias: 0.32, skew: ['Pet Supplies', 'Sports & Outdoors', 'Home & Kitchen'] },
  { name: 'REI', domain: 'rei.com', tier: 'B', cadenceHours: 18, discountBias: 0.28, skew: ['Sports & Outdoors'], notes: 'Outlet + Garage sale feed' },
  { name: 'Backcountry', domain: 'backcountry.com', tier: 'B', cadenceHours: 24, discountBias: 0.35, skew: ['Sports & Outdoors'] },
  { name: 'Academy Sports + Outdoors', domain: 'academy.com', tier: 'B', cadenceHours: 18, discountBias: 0.35, skew: ['Sports & Outdoors'] },
  { name: 'Bass Pro Shops', domain: 'basspro.com', tier: 'B', cadenceHours: 24, discountBias: 0.3, skew: ['Sports & Outdoors'] },
  { name: "Cabela's", domain: 'cabelas.com', tier: 'B', cadenceHours: 24, discountBias: 0.3, skew: ['Sports & Outdoors'] },
  { name: 'Ulta Beauty', domain: 'ulta.com', tier: 'B', cadenceHours: 12, discountBias: 0.35, skew: ['Beauty'], notes: 'Beauty cycles + sales events' },
  { name: 'Sephora', domain: 'sephora.com', tier: 'B', cadenceHours: 18, discountBias: 0.25, skew: ['Beauty'] },
  { name: 'Bath & Body Works', domain: 'bathandbodyworks.com', tier: 'B', cadenceHours: 12, discountBias: 0.5, skew: ['Beauty'], notes: 'Semi-annual 75% off' },
  { name: 'iHerb', domain: 'iherb.com', tier: 'B', cadenceHours: 12, discountBias: 0.3, skew: ['Health & Household'] },
  { name: 'Vitamin Shoppe', domain: 'vitaminshoppe.com', tier: 'B', cadenceHours: 18, discountBias: 0.4, skew: ['Health & Household'] },
  { name: 'GNC', domain: 'gnc.com', tier: 'B', cadenceHours: 24, discountBias: 0.45, skew: ['Health & Household'] },
  { name: 'Vitacost', domain: 'vitacost.com', tier: 'B', cadenceHours: 18, discountBias: 0.35, skew: ['Health & Household', 'Grocery & Gourmet'] },
  { name: 'B&H Photo', domain: 'bhphotovideo.com', tier: 'B', cadenceHours: 24, discountBias: 0.2, skew: ['Electronics'], notes: 'Deal zone feed' },
  { name: 'Micro Center', domain: 'microcenter.com', tier: 'B', cadenceHours: 24, discountBias: 0.35, skew: ['Electronics'] },
  { name: 'Adorama', domain: 'adorama.com', tier: 'B', cadenceHours: 24, discountBias: 0.32, skew: ['Electronics'] },
  { name: 'Overstock', domain: 'overstock.com', tier: 'B', cadenceHours: 12, discountBias: 0.5, skew: ['Home & Kitchen'] },
  { name: 'Bed Bath & Beyond', domain: 'bedbathandbeyond.com', tier: 'B', cadenceHours: 18, discountBias: 0.42, skew: ['Home & Kitchen'] },
  { name: 'Big Lots', domain: 'biglots.com', tier: 'B', cadenceHours: 12, discountBias: 0.5, skew: ['Home & Kitchen', 'Grocery & Gourmet'], notes: 'Closeout chain' },
  { name: 'Office Depot', domain: 'officedepot.com', tier: 'B', cadenceHours: 18, discountBias: 0.38, skew: ['Office Products'] },
  { name: 'LEGO Shop', domain: 'lego.com', tier: 'B', cadenceHours: 24, discountBias: 0.25, skew: ['Toys & Games'] },
  { name: 'Fat Brain Toys', domain: 'fatbraintoys.com', tier: 'B', cadenceHours: 24, discountBias: 0.3, skew: ['Toys & Games'] },
  { name: 'Woot!', domain: 'woot.com', tier: 'B', cadenceHours: 12, discountBias: 0.55, skew: ['Electronics', 'Home & Kitchen'], notes: 'Daily deal drops' },

  // ---------- Tier C — long-tail (weekly) ----------
  { name: 'JCPenney', domain: 'jcpenney.com', tier: 'C', cadenceHours: 168, discountBias: 0.45, skew: ['Home & Kitchen', 'Beauty'] },
  { name: "Boscov's", domain: 'boscovs.com', tier: 'C', cadenceHours: 168, discountBias: 0.4, skew: ['Home & Kitchen', 'Beauty'], notes: 'Layout change broke adapter — repair scheduled' },
  { name: 'Von Maur', domain: 'vonmaur.com', tier: 'C', cadenceHours: 168, discountBias: 0.3, skew: ['Beauty'] },
  { name: 'Bealls', domain: 'bealls.com', tier: 'C', cadenceHours: 168, discountBias: 0.42, skew: ['Home & Kitchen', 'Beauty'] },
  { name: 'Belk', domain: 'belk.com', tier: 'C', cadenceHours: 168, discountBias: 0.45, skew: ['Home & Kitchen', 'Beauty'] },
  { name: 'Nordstrom Rack', domain: 'nordstromrack.com', tier: 'C', cadenceHours: 168, discountBias: 0.5, skew: ['Beauty'] },
  { name: 'Sierra', domain: 'sierra.com', tier: 'C', cadenceHours: 168, discountBias: 0.5, skew: ['Sports & Outdoors'] },
  { name: "Sportsman's Guide", domain: 'sportsmansguide.com', tier: 'C', cadenceHours: 168, discountBias: 0.45, skew: ['Sports & Outdoors'] },
  { name: 'Rural King', domain: 'ruralking.com', tier: 'C', cadenceHours: 168, discountBias: 0.35, skew: ['Pet Supplies', 'Grocery & Gourmet'] },
  { name: 'Fleet Farm', domain: 'fleetfarm.com', tier: 'C', cadenceHours: 168, discountBias: 0.35, skew: ['Sports & Outdoors', 'Pet Supplies'] },
  { name: 'Costco Business Center', domain: 'business.costco.com', tier: 'C', cadenceHours: 168, discountBias: 0.28, skew: ['Office Products', 'Grocery & Gourmet'] },
  { name: 'Thrive Market', domain: 'thrivemarket.com', tier: 'C', cadenceHours: 168, discountBias: 0.35, skew: ['Grocery & Gourmet', 'Health & Household'] },
  { name: 'Grove Collaborative', domain: 'grove.com', tier: 'C', cadenceHours: 168, discountBias: 0.4, skew: ['Health & Household', 'Beauty'] },
  { name: 'Hasbro Pulse', domain: 'hasbropulse.com', tier: 'C', cadenceHours: 168, discountBias: 0.3, skew: ['Toys & Games'] },
  { name: 'Mattel Creations', domain: 'mattel.com', tier: 'C', cadenceHours: 168, discountBias: 0.28, skew: ['Toys & Games'] },
];

export interface GeneratedListing {
  asin: string;
  title: string;
  brand: string;
  category: string;
  buyBox: number;
  listPrice: number;
  bsr: number;
  fbaOffers: number;
  fbmOffers: number;
  gated: boolean;
  hazmat: boolean;
  meltable: boolean;
  fragile: boolean;
  ipClaim: boolean;
  amazonRetail: boolean;
  sizeTier: string;
  weightLb: number;
  dims: { lengthIn: number; widthIn: number; heightIn: number };
  upc: string;
  packCount: number;
  unitSize: string;
}

let upcCounter = 100000000000;
function nextUpc(rand: () => number): string {
  upcCounter += 1 + Math.floor(rand() * 97);
  return String(upcCounter);
}

/** Generate the Amazon-side catalog: `perCategory` listings per category. */
export function generateListings(seed = 42, perCategory = 14): GeneratedListing[] {
  const rand = rng(seed);
  const out: GeneratedListing[] = [];
  let asinN = 1000;

  for (const [category, templates] of Object.entries(TEMPLATES)) {
    const brands = BRANDS[category] ?? [];
    for (let i = 0; i < perCategory; i++) {
      const t = templates[Math.floor(rand() * templates.length)];
      const brand = brands[Math.floor(rand() * brands.length)];
      const packCount = t.packCounts[Math.floor(rand() * t.packCounts.length)];
      const unitSize = t.unitSizes[Math.floor(rand() * t.unitSizes.length)];
      const pattern = t.patterns[Math.floor(rand() * t.patterns.length)];
      const title = pattern
        .replace('{n}', brand.name)
        .replace('{p}', String(packCount))
        .replace('{u}', unitSize);

      const scale = packCount > 1 ? 1 + (packCount - 1) * 0.55 : 1;
      const listPrice = round2((t.listPrice[0] + rand() * (t.listPrice[1] - t.listPrice[0])) * Math.min(scale, 1.9));
      const weightLb = round2((t.weightLb[0] + rand() * (t.weightLb[1] - t.weightLb[0])) * Math.min(scale, 1.8) * 10) / 10;
      const dims = {
        lengthIn: round1(t.dims[0] * (1 + (rand() - 0.5) * 0.3)),
        widthIn: round1(t.dims[1] * (1 + (rand() - 0.5) * 0.3)),
        heightIn: round1(t.dims[2] * (1 + (rand() - 0.5) * 0.3)),
      };

      // BSR: log-uniform 300..900k, weighted lower for cheaper items
      const bsr = Math.round(Math.exp(Math.log(300) + rand() * (Math.log(900000) - Math.log(300))));
      const fbaOffers = 0 + Math.floor(rand() * 14);
      const fbmOffers = Math.floor(rand() * 8);
      const amazonRetail = rand() < 0.22;

      out.push({
        asin: `B0C${String(asinN++).padStart(7, '0')}`,
        title,
        brand: brand.name,
        category,
        buyBox: listPrice,
        listPrice,
        bsr,
        fbaOffers,
        fbmOffers,
        gated: brand.gated,
        hazmat: !!t.hazmat,
        meltable: !!t.meltable,
        fragile: !!t.fragile,
        ipClaim: brand.ipClaim && rand() < 0.5,
        amazonRetail,
        sizeTier: 'SMALL_STANDARD', // classified properly at seed time via profit engine
        weightLb,
        dims,
        upc: nextUpc(rand),
        packCount,
        unitSize,
      });
    }
  }
  return out;
}

export interface GeneratedRetailProduct {
  retailerIdx: number;
  sku: string;
  title: string;
  brand: string;
  category: string;
  price: number;
  listPrice: number;
  couponPct: number;
  upc: string;
  packCount: number;
  unitSize: string;
}

export interface MintedScanProduct extends GeneratedRetailProduct {
  /** ASIN this SKU resolves to (null → no viable match this run) */
  matchedAsin: string | null;
  matchMethod: 'GTIN' | 'FUZZY';
  matchConfidence: number;
}

/** Fresh product minted by a live scan run, with its simulated match result.
 *  Pool priority: scan-set category filter > retailer category skew > anything. */
export function mintScanProduct(
  listings: GeneratedListing[],
  skew: string[] | null,
  categoryFilter: string[] | null,
  seed: number
): MintedScanProduct {
  const rand = rng(seed);
  let pool = listings;
  if (categoryFilter && categoryFilter.length > 0) {
    const filtered = listings.filter((l) => categoryFilter.includes(l.category));
    if (filtered.length > 0) pool = filtered;
  } else if (skew && skew.length > 0) {
    const skewed = listings.filter((l) => skew.includes(l.category));
    if (skewed.length > 0) pool = skewed;
  }
  const listing = pool[Math.floor(rand() * pool.length)];
  const templates = TEMPLATES[listing.category];
  const t = templates[Math.floor(rand() * templates.length)];
  const brand = (BRANDS[listing.category] ?? []).find((b) => b.name === listing.brand) ?? BRANDS[listing.category][0];
  const pattern = t.patterns[Math.floor(rand() * t.patterns.length)];
  const packCount = rand() < 0.7 ? listing.packCount : t.packCounts[Math.floor(rand() * t.packCounts.length)];
  const unitSize = rand() < 0.7 ? listing.unitSize : t.unitSizes[Math.floor(rand() * t.unitSizes.length)];
  const title = pattern.replace('{n}', brand.name).replace('{p}', String(packCount)).replace('{u}', unitSize);

  // ~62% resolve by GTIN (exact); the rest fuzzy-match with a calibrated confidence
  const roll = rand();
  let matchedAsin: string | null = listing.asin;
  let matchMethod: 'GTIN' | 'FUZZY' = 'GTIN';
  let matchConfidence = 1;
  if (roll < 0.62) {
    matchedAsin = listing.asin;
  } else if (roll < 0.94) {
    // fuzzy auto-accept (>=0.97) or review queue (0.85-0.96)
    matchedAsin = rand() < 0.45 ? listing.asin : rand() < 0.6 ? listing.asin : null;
    matchMethod = 'FUZZY';
    matchConfidence = Math.round((0.82 + rand() * 0.17) * 100) / 100;
    if (matchedAsin && matchConfidence < 0.97) matchedAsin = listing.asin; // review-queue matches still point at the ASIN
    if (!matchedAsin) matchConfidence = Math.round((0.6 + rand() * 0.24) * 100) / 100; // rejected
  } else {
    matchedAsin = null;
    matchMethod = 'FUZZY';
    matchConfidence = Math.round((0.55 + rand() * 0.29) * 100) / 100;
  }

  const discount = 0.34 + rand() * 0.34;
  const price = round2(listing.listPrice * (1 - discount));
  return {
    retailerIdx: 0, // resolved by the scan engine from the job's retailer
    sku: `SKU-${(200000 + Math.floor(rand() * 799999)).toString()}`,
    title,
    brand: brand.name,
    category: listing.category,
    price: Math.max(2.5, price),
    listPrice: listing.listPrice,
    couponPct: rand() < 0.25 ? [5, 10, 15, 20][Math.floor(rand() * 4)] : 0,
    upc: roll < 0.62 ? listing.upc : `9${String(80000000000 + Math.floor(rand() * 9999999999))}`,
    packCount,
    unitSize,
    matchedAsin,
    matchMethod,
    matchConfidence,
  };
}

/** Generate retailer SKUs from the same templates, weighted by each retailer's category skew
 *  (Best Buy yields Electronics, Chewy yields Pet Supplies...), some matching by GTIN, some fuzzy-only. */
export function generateRetailProducts(
  listings: GeneratedListing[],
  retailerSpecs: { skew: string[] }[],
  seed = 7,
  perRetailer = 16
): { products: GeneratedRetailProduct[]; gtinMap: Map<string, string> } {
  const rand = rng(seed);
  const gtinMap = new Map<string, string>(); // product upc → listing asin (exact matches)
  const products: GeneratedRetailProduct[] = [];

  // precompute per-retailer candidate pools (skew-weighted) once
  const pools = retailerSpecs.map((spec) => {
    const skewed = spec.skew.length > 0 ? listings.filter((l) => spec.skew.includes(l.category)) : [];
    return { skewed, all: listings };
  });

  for (let r = 0; r < retailerSpecs.length; r++) {
    const { skewed, all } = pools[r];
    for (let i = 0; i < perRetailer; i++) {
      // ~72% of a retailer's SKUs come from its category skew, the rest from anything
      const useSkew = skewed.length > 0 && rand() < 0.72;
      const pool = useSkew ? skewed : all;
      const listing = pool[Math.floor(rand() * pool.length)];
      const templates = TEMPLATES[listing.category];
      const t = templates[Math.floor(rand() * templates.length)];
      const brand = (BRANDS[listing.category] ?? []).find((b) => b.name === listing.brand) ?? BRANDS[listing.category][0];
      const pattern = t.patterns[Math.floor(rand() * t.patterns.length)];
      const packCount = rand() < 0.75 ? listing.packCount : t.packCounts[Math.floor(rand() * t.packCounts.length)];
      const unitSize = rand() < 0.75 ? listing.unitSize : t.unitSizes[Math.floor(rand() * t.unitSizes.length)];
      const title = pattern.replace('{n}', brand.name).replace('{p}', String(packCount)).replace('{u}', unitSize);

      const exactMatch = rand() < 0.55;
      const upc = exactMatch ? listing.upc : nextUpc(rand);
      if (exactMatch) gtinMap.set(upc, listing.asin);

      const scale = packCount > listing.packCount ? 1 + (packCount - listing.packCount) * 0.5 : 1;
      // deep retail discounts are the OA lifeblood (PRD §2: clearance economics)
      const discount = 0.32 + rand() * 0.36; // 32%..68% off list
      const price = round2(listing.listPrice * (1 - discount) * Math.min(scale, 1.6));

      products.push({
        retailerIdx: r,
        sku: `${['SKU', 'SKU', 'ITM'][Math.floor(rand() * 3)]}-${(100000 + Math.floor(rand() * 899999)).toString()}`,
        title,
        brand: brand.name,
        category: listing.category,
        price: Math.max(2.5, price),
        listPrice: listing.listPrice,
        couponPct: rand() < 0.22 ? [5, 10, 15, 20][Math.floor(rand() * 4)] : 0,
        upc,
        packCount,
        unitSize,
      });
    }
  }
  return { products, gtinMap };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
