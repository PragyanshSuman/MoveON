// Domain model for MoveOn. Everything persisted in the data store lives here.

export type ISODate = string; // "2026-06-30"
export type ISODateTime = string; // full ISO timestamp

export type BadgeType = "college" | "company" | "coliving";

export interface Badge {
  type: BadgeType;
  label: string;
  partnerId?: string;
  verifiedVia: "email" | "resident_code";
  verifiedAt: ISODateTime;
}

export interface User {
  id: string;
  phone: string; // E.164
  name: string;
  role: "user" | "admin";
  badges: Badge[];
  referralCode: string;
  referredBy?: string; // user id
  referralRewarded?: boolean;
  credit: number; // ₹ store credit from referrals
  upiId?: string; // payout destination
  razorpayAccountId?: string; // Razorpay Route linked account (acc_...)
  arrival?: ArrivalProfile; // newcomer profile used for Starter Kits and move-in alerts
  createdAt: ISODateTime;
}

export interface ArrivalProfile {
  moveInDate: ISODate;
  locality: string;
  budget: number;
  wants: string[]; // category ids to alert on
}

export type PartnerType = "coliving" | "college" | "company";

export interface Partner {
  id: string;
  slug: string;
  name: string;
  type: PartnerType;
  emailDomains: string[];
  residentCode?: string;
  localities: string[];
  description: string;
}

export interface Dealer {
  id: string;
  name: string;
  localities: string[];
  categories: string[]; // category ids, or "*"
  offerRatio: number; // share of current price the dealer bids
  referralRate: number; // MoveOn's referral fee on the dealer's purchase price
}

export type SaleVisibility = "public" | "community";

export interface Sale {
  id: string;
  slug: string;
  sellerId: string;
  title: string;
  locality: string; // locality slug
  leavingDate: ISODate;
  dropRatePerWeek: number; // countdown pricing, e.g. 0.10
  visibility: SaleVisibility;
  communityPartnerId?: string;
  note?: string;
  boostedUntil?: ISODateTime;
  urgent?: boolean;
  boostDue?: number; // boost fee, deducted from the seller's first payout
  nothingLeftBehindAt?: ISODateTime; // when the 5-day exit offers were sent
  status: "active" | "closed";
  createdAt: ISODateTime;
}

export type Condition = "like_new" | "good" | "fair" | "worn";

export type ItemStatus =
  | "available"
  | "reserved"
  | "sold"
  | "dealer"
  | "donated"
  | "recycled"
  | "withdrawn";

export interface Item {
  id: string;
  saleId: string;
  sellerId: string;
  title: string;
  category: string;
  brand?: string;
  ageMonths: number;
  condition: Condition;
  description: string;
  photos: string[]; // URLs
  listPrice: number;
  floorPrice: number;
  originalPrice?: number;
  availableFrom: ISODate; // seller can hand it over from this date
  stayInPlace: boolean; // can stay in the room for the next tenant
  status: ItemStatus;
  listedAt: ISODateTime;
  soldPrice?: number;
  soldAt?: ISODateTime;
  buyerId?: string;
  certified?: boolean; // eligible for buy-back guarantee
  aiGenerated?: boolean;
  boughtBackFor?: number; // set when MoveOn re-sells an item it bought back
  passport: PassportEntry[]; // item passport: ownership trail
}

export interface PassportEntry {
  at: ISODateTime;
  event: "listed" | "sold" | "bought_back" | "certified";
  note: string;
}

export type OrderStatus =
  | "pending_payment"
  | "active" // paid, at least one group still held
  | "completed"
  | "cancelled"
  | "refunded";

export type GroupStatus = "held" | "handed_over" | "refused" | "disputed";

export interface OrderGroup {
  sellerId: string;
  saleId: string;
  itemIds: string[];
  prices: Record<string, number>;
  subtotal: number;
  sellerFee: number;
  sellerPayout: number;
  handoverOtp: string;
  otpAttempts?: number;
  boostDeducted?: number; // boost fee taken from this payout
  status: GroupStatus;
  transferId?: string; // payment provider transfer held for this seller
  handedOverAt?: ISODateTime;
  refusedReason?: string;
}

export interface Order {
  id: string;
  buyerId: string;
  createdAt: ISODateTime;
  status: OrderStatus;
  fulfilment: "pickup" | "delivery";
  slot?: { date: ISODate; window: string };
  address?: string;
  locality: string;
  itemsTotal: number;
  buyerFee: number;
  deliveryFee: number;
  deliveryPartnerCost: number;
  creditApplied: number;
  total: number;
  payment: {
    provider: "mock" | "razorpay";
    providerOrderId?: string;
    paymentId?: string;
    paidAt?: ISODateTime;
    refundedAmount: number;
  };
  groups: OrderGroup[];
}

export interface Dispute {
  id: string;
  orderId: string;
  sellerId: string;
  openedBy: string;
  reason: string;
  status: "open" | "resolved_refund" | "resolved_release";
  resolutionNote?: string;
  createdAt: ISODateTime;
  resolvedAt?: ISODateTime;
}

export interface Rating {
  id: string;
  orderId: string;
  fromId: string;
  toId: string;
  stars: number;
  comment?: string;
  createdAt: ISODateTime;
}

export interface Message {
  id: string;
  threadId: string; // `${orderId}:${sellerId}`
  fromId: string;
  body: string;
  createdAt: ISODateTime;
}

export interface DealerOffer {
  id: string;
  itemId: string;
  dealerId: string;
  amount: number;
  createdAt: ISODateTime;
  expiresAt: ISODateTime;
  status: "open" | "accepted" | "declined" | "expired";
}

export interface Disposal {
  id: string;
  saleId: string;
  sellerId: string;
  itemIds: string[];
  kind: "donation" | "ewaste";
  partnerName: string;
  pickupDate: ISODate;
  status: "scheduled" | "completed";
  certificateNo: string;
  createdAt: ISODateTime;
}

export interface BuyBackClaim {
  id: string;
  itemId: string;
  userId: string;
  amount: number;
  status: "requested" | "completed";
  createdAt: ISODateTime;
}

export interface Notification {
  id: string;
  userId: string;
  text: string;
  link?: string;
  read: boolean;
  createdAt: ISODateTime;
}

export interface OtpChallenge {
  id: string;
  target: string; // phone or email
  purpose: "login" | "email_verify";
  codeHash: string;
  expiresAt: ISODateTime;
  attempts: number;
}

export type LedgerKind =
  | "seller_fee"
  | "buyer_fee"
  | "delivery_margin"
  | "boost"
  | "dealer_referral"
  | "buyback_margin"
  | "service_referral"
  | "refund_loss";

export interface ServiceLead {
  id: string;
  userId: string;
  service: "packers_movers" | "deep_cleaning" | "broadband_transfer";
  locality: string;
  date: ISODate;
  status: "new" | "booked" | "closed";
  createdAt: ISODateTime;
}

export interface LedgerEntry {
  id: string;
  kind: LedgerKind;
  amount: number;
  orderId?: string;
  ref?: string;
  createdAt: ISODateTime;
}

export interface DB {
  version: number;
  users: User[];
  partners: Partner[];
  dealers: Dealer[];
  sales: Sale[];
  items: Item[];
  orders: Order[];
  disputes: Dispute[];
  ratings: Rating[];
  messages: Message[];
  dealerOffers: DealerOffer[];
  disposals: Disposal[];
  buyBackClaims: BuyBackClaim[];
  notifications: Notification[];
  otps: OtpChallenge[];
  serviceLeads: ServiceLead[];
  ledger: LedgerEntry[];
}
