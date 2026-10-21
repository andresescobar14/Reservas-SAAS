export type Company = {
  id: string;
  owner_id: string;
  name: string;
  timezone: string;
  subscription_status: "trial" | "active" | "past_due";
  trial_ends_at: string;
  created_at: string;
  updated_at: string;
};

export type Customer = {
  id: string;
  company_id: string;
  full_name: string;
  phone: string;
  created_at: string;
  updated_at: string;
};

export type Reservation = {
  id: string;
  company_id: string;
  customer_id: string;
  service: string;
  starts_at: string;
  ends_at: string;
  status: "confirmed" | "completed" | "cancelled";
  reminder_due_at: string;
  reminder_sent_at: string | null;
  created_at: string;
  updated_at: string;
};

export type Booking = Reservation & { customer: Customer };
export type ActionResult = { error?: string; errorCode?: string; success?: string };
export type EmailVerificationResult = ActionResult & {
  verifiedAt?: string;
  retryAfterSeconds?: number;
};

type Table<Row, Insert, Update> = {
  Row: Row;
  Insert: Insert;
  Update: Update;
  Relationships: [];
};

export type Database = {
  public: {
    Tables: {
      companies: Table<
        Company,
        Pick<Company, "owner_id" | "name">,
        Partial<Pick<Company, "name" | "timezone">>
      >;
      customers: Table<
        Customer,
        Pick<Customer, "company_id" | "full_name" | "phone">,
        Partial<Pick<Customer, "full_name" | "phone">>
      >;
      reservations: Table<
        Reservation,
        Pick<Reservation, "company_id" | "customer_id" | "service" | "starts_at" | "ends_at">,
        Partial<Pick<Reservation, "service" | "starts_at" | "ends_at" | "status">>
      >;
    };
    Views: Record<string, never>;
    Functions: {
      book_reservation: {
        Args: {
          p_company_id: string;
          p_full_name: string;
          p_phone: string;
          p_service: string;
          p_starts_at: string;
          p_ends_at: string;
        };
        Returns: string;
      };
      has_company_access: { Args: { target_company_id: string }; Returns: boolean };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
