-- MoveOn production schema (Supabase / Postgres). Mirrors the collections in src/lib/types.ts so
-- src/lib/db.ts can be swapped for a Postgres-backed implementation without touching services.
-- Money is stored in whole rupees (integer), dates in IST calendar dates, timestamps in UTC.

create table partners (
  id text primary key,
  slug text unique not null,
  name text not null,
  type text not null check (type in ('coliving', 'college', 'company')),
  email_domains text[] not null default '{}',
  resident_code text unique,
  localities text[] not null default '{}',
  description text not null default ''
);

create table users (
  id text primary key,
  phone text unique not null,
  name text not null,
  role text not null default 'user' check (role in ('user', 'admin')),
  badges jsonb not null default '[]',            -- [{type,label,partnerId,verifiedVia,verifiedAt}]
  referral_code text unique not null,
  referred_by text references users(id),
  referral_rewarded boolean not null default false,
  credit integer not null default 0 check (credit >= 0),
  upi_id text,
  razorpay_account_id text,                       -- Razorpay Route linked account
  arrival jsonb,                                  -- {moveInDate,locality,budget,wants[]}
  created_at timestamptz not null default now()
);

create table dealers (
  id text primary key,
  name text not null,
  localities text[] not null,
  categories text[] not null,
  offer_ratio numeric(4,3) not null,
  referral_rate numeric(4,3) not null
);

create table sales (
  id text primary key,
  slug text unique not null,
  seller_id text not null references users(id),
  title text not null,
  locality text not null,
  leaving_date date not null,
  drop_rate_per_week numeric(4,3) not null default 0.10,
  visibility text not null default 'public' check (visibility in ('public', 'community')),
  community_partner_id text references partners(id),
  note text,
  boosted_until timestamptz,
  urgent boolean not null default false,
  boost_due integer not null default 0,
  nothing_left_behind_at timestamptz,
  status text not null default 'active' check (status in ('active', 'closed')),
  created_at timestamptz not null default now()
);
create unique index sales_one_active_per_seller on sales (seller_id) where status = 'active';
create index sales_locality_live on sales (locality, leaving_date) where status = 'active';

create table items (
  id text primary key,
  sale_id text not null references sales(id),
  seller_id text not null references users(id),
  title text not null,
  category text not null,
  brand text,
  age_months integer not null default 0,
  condition text not null check (condition in ('like_new', 'good', 'fair', 'worn')),
  description text not null default '',
  photos text[] not null default '{}',
  list_price integer not null check (list_price > 0),
  floor_price integer not null check (floor_price > 0 and floor_price <= list_price),
  original_price integer,
  available_from date not null,
  stay_in_place boolean not null default false,
  status text not null default 'available'
    check (status in ('available', 'reserved', 'sold', 'dealer', 'donated', 'recycled', 'withdrawn')),
  listed_at timestamptz not null default now(),
  sold_price integer,
  sold_at timestamptz,
  buyer_id text references users(id),
  certified boolean not null default false,
  ai_generated boolean not null default false,
  bought_back_for integer,
  passport jsonb not null default '[]'           -- item passport: [{at,event,note}]
);
create index items_live on items (category, status) where status = 'available';
create index items_sale on items (sale_id);

create table orders (
  id text primary key,
  buyer_id text not null references users(id),
  created_at timestamptz not null default now(),
  status text not null check (status in ('pending_payment', 'active', 'completed', 'cancelled', 'refunded')),
  fulfilment text not null check (fulfilment in ('pickup', 'delivery')),
  slot_date date,
  slot_window text,
  address text,                                   -- buyer, admin and delivery partner only
  locality text not null,
  items_total integer not null,
  buyer_fee integer not null,
  delivery_fee integer not null default 0,
  delivery_partner_cost integer not null default 0,
  credit_applied integer not null default 0,
  total integer not null,
  payment_provider text not null,
  provider_order_id text,
  payment_id text,
  paid_at timestamptz,
  refunded_amount integer not null default 0
);

create table order_groups (
  order_id text not null references orders(id),
  seller_id text not null references users(id),
  sale_id text not null references sales(id),
  item_ids text[] not null,
  prices jsonb not null,                          -- {itemId: price at checkout}
  subtotal integer not null,
  seller_fee integer not null,
  seller_payout integer not null,
  boost_deducted integer,
  handover_otp text not null,                     -- shown only to the buyer
  otp_attempts integer not null default 0,
  status text not null check (status in ('held', 'handed_over', 'refused', 'disputed')),
  transfer_id text,                               -- Razorpay Route transfer, on hold until handover
  handed_over_at timestamptz,
  refused_reason text,
  primary key (order_id, seller_id)
);

create table disputes (
  id text primary key,
  order_id text not null references orders(id),
  seller_id text not null references users(id),
  opened_by text not null references users(id),
  reason text not null,
  status text not null check (status in ('open', 'resolved_refund', 'resolved_release')),
  resolution_note text,
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

create table ratings (
  id text primary key,
  order_id text not null references orders(id),
  from_id text not null references users(id),
  to_id text not null references users(id),
  stars smallint not null check (stars between 1 and 5),
  comment text,
  created_at timestamptz not null default now(),
  unique (order_id, from_id, to_id)
);

create table messages (
  id text primary key,
  thread_id text not null,                        -- `${orderId}:${sellerId}`
  from_id text not null references users(id),
  body text not null,                             -- contact details already masked
  created_at timestamptz not null default now()
);
create index messages_thread on messages (thread_id, created_at);

create table dealer_offers (
  id text primary key,
  item_id text not null references items(id),
  dealer_id text not null references dealers(id),
  amount integer not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  status text not null check (status in ('open', 'accepted', 'declined', 'expired'))
);

create table disposals (
  id text primary key,
  sale_id text not null references sales(id),
  seller_id text not null references users(id),
  item_ids text[] not null,
  kind text not null check (kind in ('donation', 'ewaste')),
  partner_name text not null,
  pickup_date date not null,
  status text not null check (status in ('scheduled', 'completed')),
  certificate_no text unique not null,
  created_at timestamptz not null default now()
);

create table buy_back_claims (
  id text primary key,
  item_id text not null references items(id),
  user_id text not null references users(id),
  amount integer not null,
  status text not null check (status in ('requested', 'completed')),
  created_at timestamptz not null default now()
);

create table notifications (
  id text primary key,
  user_id text not null references users(id),
  text text not null,
  link text,
  read boolean not null default false,
  created_at timestamptz not null default now()
);
create index notifications_user on notifications (user_id, created_at desc);

create table otp_challenges (
  id text primary key,
  target text not null,
  purpose text not null check (purpose in ('login', 'email_verify')),
  code_hash text not null,
  expires_at timestamptz not null,
  attempts integer not null default 0
);

create table service_leads (
  id text primary key,
  user_id text not null references users(id),
  service text not null check (service in ('packers_movers', 'deep_cleaning', 'broadband_transfer')),
  locality text not null,
  date date not null,
  status text not null check (status in ('new', 'booked', 'closed')),
  created_at timestamptz not null default now()
);

create table ledger (
  id text primary key,
  kind text not null check (kind in ('seller_fee', 'buyer_fee', 'delivery_margin', 'boost', 'dealer_referral',
                                     'buyback_margin', 'service_referral', 'refund_loss')),
  amount integer not null,
  order_id text references orders(id),
  ref text,
  created_at timestamptz not null default now()
);

-- The app queries Postgres from the server only. Enable RLS so nothing is readable with the anon
-- key, and add explicit policies before exposing any table to the browser.
alter table users enable row level security;
alter table orders enable row level security;
alter table order_groups enable row level security;
alter table messages enable row level security;
alter table notifications enable row level security;
alter table otp_challenges enable row level security;
