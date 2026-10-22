// Demo data for a fresh install. Dates are relative to "now" so countdowns look live.
// All partner, dealer and person names are fictional.
import crypto from "node:crypto";
import type { Condition, DB, Item, Order, OrderGroup, Sale, User } from "./types";
import { addDays, sellerFee, suggestPrice, todayIST } from "./pricing";

const id = (p: string) => `${p}_${crypto.randomBytes(6).toString("base64url").replace(/[-_]/g, "x").toLowerCase()}`;
const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString();
const otp = () => String(crypto.randomInt(1000, 10000));

type ItemSpec = {
  title: string;
  category: string;
  brand?: string;
  ageMonths: number;
  condition: Condition;
  description: string;
  price?: number;
  stayInPlace?: boolean;
  lastDay?: boolean; // seller needs it until the leaving date
  certified?: boolean;
};

type SaleSpec = {
  seller: { name: string; phone: string; badge?: { partnerId: string; type: "college" | "company" | "coliving"; label: string } };
  slug: string;
  locality: string;
  leavingIn: number;
  listedDaysAgo: number;
  title: string;
  note: string;
  visibility?: "public" | "community";
  communityPartnerId?: string;
  boosted?: boolean;
  items: ItemSpec[];
};

export function buildSeed(): DB {
  const today = todayIST();
  const db: DB = {
    version: 1,
    users: [],
    partners: [
      { id: "p_greenleaf", slug: "greenleaf-coliving", name: "Greenleaf Co-living", type: "coliving", emailDomains: [], residentCode: "GREENLEAF-2026", localities: ["hsr-layout", "koramangala", "bellandur"], description: "Managed co-living across South-East Bengaluru. Residents list their move-out in one tap; new residents get Starter Kits on day one." },
      { id: "p_orbit", slug: "orbit-stays", name: "Orbit Stays", type: "coliving", emailDomains: [], residentCode: "ORBIT-RES", localities: ["marathahalli", "whitefield"], description: "PGs and co-living near the ORR and ITPL tech parks." },
      { id: "p_northstar", slug: "northstar-institute", name: "Northstar Institute of Technology", type: "college", emailDomains: ["northstar.edu.in"], localities: ["banashankari", "rr-nagar"], description: "Engineering campus in South Bengaluru. Move-Out Week runs every May." },
      { id: "p_southfield", slug: "southfield-business-school", name: "Southfield Business School", type: "college", emailDomains: ["sbs.ac.in"], localities: ["electronic-city", "btm-layout"], description: "MBA campus off Hosur Road with two intake cycles a year." },
      { id: "p_acme", slug: "acme-software-labs", name: "Acme Software Labs", type: "company", emailDomains: ["acmesoft.in"], localities: ["bellandur", "whitefield"], description: "Relocation help for new joiners and leavers, offered as an employee benefit." },
      { id: "p_lumen", slug: "lumen-analytics", name: "Lumen Analytics", type: "company", emailDomains: ["lumen.co.in"], localities: ["koramangala", "hsr-layout"], description: "Intern cohorts every January and July." },
    ],
    dealers: [
      { id: "d_lakshmi", name: "Sri Lakshmi Used Furniture", localities: ["hsr-layout", "koramangala", "btm-layout", "bellandur"], categories: ["bed", "mattress", "study_table", "chair", "office_chair", "sofa", "wardrobe", "shelf"], offerRatio: 0.45, referralRate: 0.08 },
      { id: "d_whitefield", name: "Whitefield Refurb Hub", localities: ["whitefield", "marathahalli", "bellandur", "indiranagar"], categories: ["fridge", "washing_machine", "sofa", "bed", "cooler", "microwave", "wardrobe"], offerRatio: 0.42, referralRate: 0.07 },
      { id: "d_renew", name: "ReNew Electronics", localities: ["*"], categories: ["tv", "monitor", "fridge", "washing_machine", "microwave", "induction", "fan", "cooler", "lamp"], offerRatio: 0.4, referralRate: 0.06 },
      { id: "d_campus", name: "Campus Kabadi Co.", localities: ["banashankari", "rr-nagar", "electronic-city", "btm-layout"], categories: ["*"], offerRatio: 0.35, referralRate: 0.05 },
    ],
    sales: [],
    items: [],
    orders: [],
    disputes: [],
    ratings: [],
    messages: [],
    dealerOffers: [],
    disposals: [],
    buyBackClaims: [],
    notifications: [],
    otps: [],
    serviceLeads: [],
    ledger: [],
  };

  const mkUser = (name: string, phone: string, extra: Partial<User> = {}): User => {
    const u: User = {
      id: id("u"), name, phone, role: "user", badges: [], credit: 0,
      referralCode: name.split(" ")[0].toUpperCase().replace(/[^A-Z]/g, "").slice(0, 6) + crypto.randomInt(10, 99),
      createdAt: daysAgo(30), ...extra,
    };
    db.users.push(u);
    return u;
  };

  mkUser("MoveOn Ops", "+919999999999", { role: "admin" });
  const aarav = mkUser("Aarav Mehta", "+919000000001", {
    upiId: "aarav@okbank",
    arrival: { moveInDate: addDays(today, 5), locality: "hsr-layout", budget: 15000, wants: ["mattress", "study_table", "fan", "cooler"] },
  });
  const buyer2 = mkUser("Divya Rao", "+919000000002");
  const buyer3 = mkUser("Rohan Iyer", "+919000000003");

  const specs: SaleSpec[] = [
    {
      seller: { name: "Priya Sharma", phone: "+919100000001", badge: { partnerId: "p_lumen", type: "company", label: "Lumen Analytics" } },
      slug: "priya-hsr", locality: "hsr-layout", leavingIn: 9, listedDaysAgo: 8, boosted: true,
      title: "Priya's HSR flat clear-out", note: "Moving to Pune for a new role. Everything is from a smoke-free 1BHK. Weekday evenings and weekends work for pickup.",
      items: [
        { title: "Wakefit queen bed with storage", category: "bed", brand: "Wakefit", ageMonths: 18, condition: "good", description: "Engineered wood, hydraulic storage. Easy to dismantle.", lastDay: true, stayInPlace: true, certified: true },
        { title: "Sleepwell orthopaedic mattress (queen)", category: "mattress", brand: "Sleepwell", ageMonths: 18, condition: "good", description: "Always used with a protector. No stains.", lastDay: true, certified: true },
        { title: "Study table with drawer", category: "study_table", ageMonths: 24, condition: "good", description: "100 × 50 cm, sturdy, minor scratches on top." },
        { title: "Featherlite ergonomic office chair", category: "office_chair", brand: "Featherlite", ageMonths: 14, condition: "like_new", description: "Mesh back, adjustable arms and lumbar support." },
        { title: "LG 190 L single-door fridge", category: "fridge", brand: "LG", ageMonths: 30, condition: "good", description: "Direct cool, 4-star. Works perfectly.", certified: true },
        { title: "Prestige induction cooktop", category: "induction", brand: "Prestige", ageMonths: 20, condition: "good", description: "2000 W with touch panel." },
        { title: "Kitchen starter set", category: "kitchen_set", ageMonths: 18, condition: "fair", description: "Pressure cooker, kadai, tawa, 2 pans, ladles." },
        { title: "Bucket, mug and bath stool", category: "bucket_set", ageMonths: 12, condition: "fair", description: "Clean and ready to use." },
      ],
    },
    {
      seller: { name: "Rahul Verma", phone: "+919100000002", badge: { partnerId: "p_greenleaf", type: "coliving", label: "Greenleaf Co-living" } },
      slug: "rahul-koramangala", locality: "koramangala", leavingIn: 4, listedDaysAgo: 15,
      title: "Rahul is leaving Koramangala", note: "Heading back to Delhi. Last-minute deals; everything must go by the weekend.",
      items: [
        { title: "3-seater fabric sofa", category: "sofa", ageMonths: 30, condition: "good", description: "Grey fabric, firm cushions. Fits through a standard door." },
        { title: "Mi 43\" smart TV", category: "tv", brand: "Mi", ageMonths: 36, condition: "good", description: "Android TV with remote and wall mount." },
        { title: "Samsung 23 L microwave", category: "microwave", brand: "Samsung", ageMonths: 28, condition: "good", description: "Solo microwave, works perfectly." },
        { title: "5-shelf bookrack", category: "shelf", ageMonths: 24, condition: "fair", description: "Metal frame, wooden shelves." },
        { title: "Floor lamp", category: "lamp", ageMonths: 20, condition: "good", description: "Warm white, foot switch." },
        { title: "Crompton pedestal fan", category: "fan", brand: "Crompton", ageMonths: 26, condition: "good", description: "3-speed, quiet." },
      ],
    },
    {
      seller: { name: "Sneha Kulkarni", phone: "+919100000003", badge: { partnerId: "p_acme", type: "company", label: "Acme Software Labs" } },
      slug: "sneha-bellandur", locality: "bellandur", leavingIn: 16, listedDaysAgo: 3,
      title: "Sneha's Bellandur move-out sale", note: "Transferring to the Hyderabad office. Pickup from a gated society; delivery preferred for big items.",
      items: [
        { title: "IFB 6 kg front-load washing machine", category: "washing_machine", brand: "IFB", ageMonths: 34, condition: "good", description: "Serviced in March. All programmes work.", certified: true },
        { title: "Single bed (solid wood)", category: "bed", ageMonths: 40, condition: "fair", description: "Sheesham frame, sturdy.", lastDay: true },
        { title: "Duroflex single mattress", category: "mattress", brand: "Duroflex", ageMonths: 22, condition: "good", description: "Medium firm.", lastDay: true },
        { title: "2-door wardrobe", category: "wardrobe", brand: "Godrej", ageMonths: 48, condition: "fair", description: "Steel almirah with locker.", stayInPlace: true },
        { title: "Dell 24\" monitor", category: "monitor", brand: "Dell", ageMonths: 26, condition: "like_new", description: "IPS, HDMI cable included." },
        { title: "Blackout curtains (4 panels)", category: "decor", ageMonths: 18, condition: "good", description: "Navy, 7 ft." },
      ],
    },
    {
      seller: { name: "Arjun Nair", phone: "+919100000004", badge: { partnerId: "p_orbit", type: "coliving", label: "Orbit Stays" } },
      slug: "arjun-marathahalli", locality: "marathahalli", leavingIn: 21, listedDaysAgo: 1,
      title: "Arjun's Marathahalli PG room", note: "Finishing my internship in June. Everything fits in an auto except the cooler.",
      items: [
        { title: "Symphony 40 L air cooler", category: "cooler", brand: "Symphony", ageMonths: 14, condition: "good", description: "Honeycomb pads replaced last month." },
        { title: "Plastic chair (set of 2)", category: "chair", brand: "Nilkamal", ageMonths: 10, condition: "good", description: "Stackable." },
        { title: "Foldable study table", category: "study_table", ageMonths: 12, condition: "like_new", description: "Wall-mounted folding table." },
        { title: "Btwin hybrid cycle", category: "cycle", brand: "Btwin", ageMonths: 20, condition: "good", description: "7-speed, new tyres." },
        { title: "Pigeon induction stove", category: "induction", brand: "Pigeon", ageMonths: 10, condition: "like_new", description: "Barely used." },
      ],
    },
    {
      seller: { name: "Meera Pillai", phone: "+919100000005", badge: { partnerId: "p_acme", type: "company", label: "Acme Software Labs" } },
      slug: "meera-whitefield", locality: "whitefield", leavingIn: 12, listedDaysAgo: 6, boosted: true,
      title: "Whitefield 2BHK — full household", note: "Relocating abroad. Full household; happy to sell the flat setup to the next tenant as-is.",
      items: [
        { title: "L-shaped sofa with ottoman", category: "sofa", brand: "Pepperfry", ageMonths: 26, condition: "good", description: "Beige fabric, 5-seater.", stayInPlace: true },
        { title: "Whirlpool 7 kg top-load washer", category: "washing_machine", brand: "Whirlpool", ageMonths: 40, condition: "good", description: "Fully automatic.", certified: true },
        { title: "Samsung 253 L double-door fridge", category: "fridge", brand: "Samsung", ageMonths: 38, condition: "good", description: "Frost-free, inverter.", certified: true },
        { title: "King bed with hydraulic storage", category: "bed", brand: "Urban Ladder", ageMonths: 30, condition: "like_new", description: "Walnut finish.", lastDay: true, stayInPlace: true, certified: true },
        { title: "Panasonic convection microwave", category: "microwave", brand: "Panasonic", ageMonths: 24, condition: "good", description: "27 L convection with grill." },
      ],
    },
    {
      seller: { name: "Karthik Reddy", phone: "+919100000006", badge: { partnerId: "p_northstar", type: "college", label: "Northstar Institute of Technology" } },
      slug: "karthik-banashankari", locality: "banashankari", leavingIn: 6, listedDaysAgo: 10,
      title: "Final-year hostel clear-out", note: "Graduating! Freshers, grab these before I leave.",
      items: [
        { title: "Single foam mattress", category: "mattress", ageMonths: 30, condition: "fair", description: "4 inch foam, washed cover.", lastDay: true },
        { title: "Engineering textbooks bundle", category: "books", ageMonths: 36, condition: "fair", description: "Maths, DSA, OS, DBMS, CN." },
        { title: "Table fan", category: "fan", brand: "Usha", ageMonths: 30, condition: "fair", description: "Works fine, a little noisy at speed 3." },
        { title: "Bucket and mug set", category: "bucket_set", ageMonths: 24, condition: "worn", description: "Usable." },
        { title: "Hero cycle", category: "cycle", brand: "Hero", ageMonths: 40, condition: "fair", description: "Single speed, basket included." },
      ],
    },
    {
      seller: { name: "Fatima Khan", phone: "+919100000007", badge: { partnerId: "p_southfield", type: "college", label: "Southfield Business School" } },
      slug: "fatima-btm", locality: "btm-layout", leavingIn: 25, listedDaysAgo: 2,
      title: "MBA grad leaving BTM", note: "Leaving after convocation. Bundle discount if you take 3+ items.",
      items: [
        { title: "Wakefit single mattress", category: "mattress", brand: "Wakefit", ageMonths: 20, condition: "good", description: "Memory foam, 5 inch.", lastDay: true },
        { title: "Compact study table", category: "study_table", brand: "Nilkamal", ageMonths: 20, condition: "good", description: "With bookshelf." },
        { title: "Cushioned study chair", category: "chair", ageMonths: 20, condition: "good", description: "Fabric seat, wooden frame." },
        { title: "Orient wall fan", category: "fan", brand: "Orient", ageMonths: 22, condition: "good", description: "Remote controlled." },
        { title: "Kitchen basics", category: "kitchen_set", brand: "Prestige", ageMonths: 20, condition: "good", description: "Cooker, pan, plates, glasses for two." },
        { title: "Bath basics", category: "bucket_set", ageMonths: 20, condition: "good", description: "Bucket, mug, stool, hangers." },
      ],
    },
    {
      seller: { name: "Vikram Bose", phone: "+919100000008" },
      slug: "vikram-indiranagar", locality: "indiranagar", leavingIn: 18, listedDaysAgo: 4,
      title: "Indiranagar apartment — premium pieces", note: "Contract ending; moving back to Singapore. Premium furniture, well cared for.",
      items: [
        { title: "Herman Miller Sayl chair", category: "office_chair", brand: "Herman Miller", ageMonths: 24, condition: "like_new", description: "Barely used, home office." },
        { title: "Sony Bravia 55\" 4K TV", category: "tv", brand: "Sony", ageMonths: 30, condition: "like_new", description: "With original box and remote." },
        { title: "Urban Ladder 3-seater sofa", category: "sofa", brand: "Urban Ladder", ageMonths: 36, condition: "good", description: "Leatherette, chocolate brown." },
        { title: "Designer floor lamp", category: "lamp", ageMonths: 24, condition: "like_new", description: "Arc lamp, marble base." },
      ],
    },
    {
      seller: { name: "Ananya Das", phone: "+919100000009", badge: { partnerId: "p_southfield", type: "college", label: "Southfield Business School" } },
      slug: "ananya-ecity", locality: "electronic-city", leavingIn: 8, listedDaysAgo: 5,
      visibility: "community", communityPartnerId: "p_southfield",
      title: "Southfield-only hostel sale", note: "Only for Southfield students — hand over at the hostel gate.",
      items: [
        { title: "Hostel mattress", category: "mattress", ageMonths: 22, condition: "good", description: "Coir + foam.", lastDay: true },
        { title: "Philips induction", category: "induction", brand: "Philips", ageMonths: 18, condition: "good", description: "With one compatible pan." },
        { title: "Cooking set for one", category: "kitchen_set", ageMonths: 22, condition: "fair", description: "Small cooker, pan, spatula." },
      ],
    },
  ];

  const itemsBySale = new Map<string, Item[]>();
  for (const spec of specs) {
    const seller = mkUser(spec.seller.name, spec.seller.phone, {
      upiId: `${spec.seller.name.split(" ")[0].toLowerCase()}@okbank`,
      badges: spec.seller.badge
        ? [{ type: spec.seller.badge.type, label: spec.seller.badge.label, partnerId: spec.seller.badge.partnerId, verifiedVia: spec.seller.badge.type === "coliving" ? "resident_code" : "email", verifiedAt: daysAgo(spec.listedDaysAgo + 1) }]
        : [],
    });
    const listedAt = daysAgo(spec.listedDaysAgo);
    const leavingDate = addDays(today, spec.leavingIn);
    const sale: Sale = {
      id: id("s"), slug: spec.slug, sellerId: seller.id, title: spec.title, locality: spec.locality,
      leavingDate, dropRatePerWeek: 0.1, visibility: spec.visibility ?? "public",
      communityPartnerId: spec.communityPartnerId, note: spec.note, status: "active", createdAt: listedAt,
      boostedUntil: spec.boosted ? new Date(Date.now() + 4 * 86_400_000).toISOString() : undefined,
      urgent: spec.leavingIn <= 5,
    };
    db.sales.push(sale);
    const items: Item[] = [];
    spec.items.forEach((it, i) => {
      const s = suggestPrice({ category: it.category, ageMonths: it.ageMonths, condition: it.condition, brand: it.brand });
      const item: Item = {
        id: id("i"), saleId: sale.id, sellerId: seller.id, title: it.title, category: it.category, brand: it.brand,
        ageMonths: it.ageMonths, condition: it.condition, description: it.description,
        photos: [`/api/placeholder/${it.category}?v=${i}`],
        listPrice: it.price ?? s.listPrice, floorPrice: Math.min(it.price ?? s.floorPrice, s.floorPrice),
        availableFrom: it.lastDay ? addDays(leavingDate, -1) : listedAt.slice(0, 10),
        stayInPlace: !!it.stayInPlace, status: "available", listedAt, certified: it.certified,
        passport: [{ at: listedAt, event: "listed", note: `Listed by ${seller.name.split(" ")[0]} in ${spec.locality}` }],
      };
      if (it.certified) item.passport.push({ at: listedAt, event: "certified", note: "Certified for buy-back after photo inspection" });
      items.push(item);
      db.items.push(item);
    });
    itemsBySale.set(spec.slug, items);
  }

  // ---- Historical and in-flight orders so dashboards and metrics have something to show ----
  const sellerOf = (it: Item) => db.users.find((u) => u.id === it.sellerId)!;
  const mkOrder = (buyer: User, items: Item[], opts: { daysAgo: number; state: "completed" | "held" | "disputed"; fulfilment?: "pickup" | "delivery" }) => {
    const bySeller = new Map<string, Item[]>();
    for (const it of items) bySeller.set(it.sellerId, [...(bySeller.get(it.sellerId) ?? []), it]);
    const groups: OrderGroup[] = [...bySeller.entries()].map(([sellerId, its]) => {
      const prices = Object.fromEntries(its.map((it) => [it.id, it.listPrice]));
      const subtotal = its.reduce((a, it) => a + it.listPrice, 0);
      const fee = its.reduce((a, it) => a + sellerFee(it.listPrice), 0);
      return {
        sellerId, saleId: its[0].saleId, itemIds: its.map((x) => x.id), prices, subtotal, sellerFee: fee, sellerPayout: subtotal - fee,
        handoverOtp: otp(), status: opts.state === "completed" ? "handed_over" : opts.state === "disputed" ? "disputed" : "held",
        handedOverAt: opts.state === "completed" ? daysAgo(opts.daysAgo - 1) : undefined, transferId: id("trf"),
      };
    });
    const itemsTotal = groups.reduce((a, g) => a + g.subtotal, 0);
    const bFee = Math.min(199, Math.max(29, Math.round(itemsTotal * 0.04)));
    const delivery = opts.fulfilment === "delivery";
    const deliveryFee = delivery ? 780 : 0;
    const order: Order = {
      id: id("o"), buyerId: buyer.id, createdAt: daysAgo(opts.daysAgo), status: opts.state === "completed" ? "completed" : "active",
      fulfilment: opts.fulfilment ?? "pickup", locality: "hsr-layout", itemsTotal, buyerFee: bFee, deliveryFee,
      deliveryPartnerCost: delivery ? 630 : 0, creditApplied: 0, total: itemsTotal + bFee + deliveryFee,
      slot: delivery ? { date: addDays(today, 1), window: "6–9 pm" } : undefined,
      payment: { provider: "mock", providerOrderId: id("mord"), paymentId: id("mpay"), paidAt: daysAgo(opts.daysAgo), refundedAmount: 0 },
      groups,
    };
    db.orders.push(order);
    for (const it of items) {
      it.status = opts.state === "completed" ? "sold" : "reserved";
      it.buyerId = buyer.id;
      it.soldPrice = it.listPrice;
      if (opts.state === "completed") {
        it.soldAt = daysAgo(opts.daysAgo - 1);
        it.passport.push({ at: it.soldAt, event: "sold", note: `Re-homed to ${buyer.name.split(" ")[0]}` });
      }
    }
    db.ledger.push({ id: id("l"), kind: "buyer_fee", amount: bFee, orderId: order.id, createdAt: order.createdAt });
    if (delivery) db.ledger.push({ id: id("l"), kind: "delivery_margin", amount: deliveryFee - order.deliveryPartnerCost, orderId: order.id, createdAt: order.createdAt });
    if (opts.state === "completed") {
      for (const g of groups) db.ledger.push({ id: id("l"), kind: "seller_fee", amount: g.sellerFee, orderId: order.id, createdAt: g.handedOverAt! });
    }
    return order;
  };

  const rahul = itemsBySale.get("rahul-koramangala")!;
  const priya = itemsBySale.get("priya-hsr")!;
  const karthik = itemsBySale.get("karthik-banashankari")!;
  const sneha = itemsBySale.get("sneha-bellandur")!;
  const meera = itemsBySale.get("meera-whitefield")!;

  const o1 = mkOrder(aarav, [rahul[5], rahul[3]], { daysAgo: 9, state: "completed", fulfilment: "delivery" });
  const o2 = mkOrder(buyer2, [karthik[1]], { daysAgo: 6, state: "completed" });
  mkOrder(buyer3, [rahul[2]], { daysAgo: 4, state: "completed" });
  mkOrder(aarav, [priya[5], priya[6]], { daysAgo: 1, state: "held" });
  const disputed = mkOrder(buyer3, [sneha[4]], { daysAgo: 2, state: "disputed" });
  // A certified item Aarav already owns, to show buy-back value in the dashboard.
  const owned = mkOrder(aarav, [meera[3]], { daysAgo: 5, state: "completed", fulfilment: "delivery" });

  db.disputes.push({
    id: id("dp"), orderId: disputed.id, sellerId: disputed.groups[0].sellerId, openedBy: buyer3.id,
    reason: "Monitor has a cluster of dead pixels in the corner that wasn't in the photos.", status: "open", createdAt: daysAgo(1),
  });
  db.ratings.push(
    { id: id("r"), orderId: o1.id, fromId: aarav.id, toId: sellerOf(rahul[5]).id, stars: 5, comment: "Smooth handover, exactly as described.", createdAt: daysAgo(8) },
    { id: id("r"), orderId: o2.id, fromId: buyer2.id, toId: sellerOf(karthik[1]).id, stars: 4, comment: "Books in decent shape.", createdAt: daysAgo(5) },
    { id: id("r"), orderId: owned.id, fromId: aarav.id, toId: sellerOf(meera[3]).id, stars: 5, comment: "Bed is like new. Meera helped dismantle it.", createdAt: daysAgo(4) },
  );
  const priyaUser = sellerOf(priya[0]);
  db.messages.push(
    { id: id("m"), threadId: `${db.orders[3].id}:${priyaUser.id}`, fromId: aarav.id, body: "Hi! Can I collect on Saturday around 11?", createdAt: daysAgo(1) },
    { id: id("m"), threadId: `${db.orders[3].id}:${priyaUser.id}`, fromId: priyaUser.id, body: "Saturday 11 works. I'm in Sector 2; the exact address is in your order.", createdAt: daysAgo(0.9) },
  );
  db.notifications.push(
    { id: id("n"), userId: priyaUser.id, text: "Aarav reserved 2 items from your sale. Meet, check the items, and ask for the handover OTP.", link: `/orders/${db.orders[3].id}`, read: false, createdAt: daysAgo(1) },
    { id: id("n"), userId: aarav.id, text: "Your order is paid and held safely. Share the OTP only after you've checked the items.", link: `/orders/${db.orders[3].id}`, read: false, createdAt: daysAgo(1) },
  );
  return db;
}
