-- ═══════════════════════════════════════════════════════════════════════
-- Freight Analytics — table setup
-- Run once in Supabase SQL editor. Safe to re-run (IF NOT EXISTS).
-- ═══════════════════════════════════════════════════════════════════════

-- Shipped orders with freight charged (from the ePIC FREIGHT CHARGED report)
CREATE TABLE IF NOT EXISTS freight_shipments (
  order_number    text PRIMARY KEY,
  customer_name   text,
  order_status    text,
  ship_via        text,            -- FEDXG / FEDXH / FEDEX1S / FEDEX2 / future UPS etc.
  carrier         text,            -- derived bucket: 'FedEx', 'UPS', ...
  date_shipped    date,
  qty_shipped     numeric DEFAULT 0,
  n_shipments     integer DEFAULT 0,   -- package count
  freight_charged numeric DEFAULT 0,   -- what we billed the customer
  updated_at      timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_freight_shipments_customer ON freight_shipments (customer_name);
CREATE INDEX IF NOT EXISTS idx_freight_shipments_date     ON freight_shipments (date_shipped);
CREATE INDEX IF NOT EXISTS idx_freight_shipments_carrier  ON freight_shipments (carrier);

-- Carrier invoice lines (from the FedEx Billing Online DETAIL csv export)
-- One row per (invoice, tracking). Adjustment lines on later invoices for the
-- same tracking land as separate rows — costs aggregate correctly per order.
CREATE TABLE IF NOT EXISTS freight_invoices (
  invoice_number  text NOT NULL,
  tracking_id     text NOT NULL,
  carrier         text DEFAULT 'FedEx',
  invoice_date    date,
  order_ref       text,            -- FedEx "Original Customer Reference" = our order number
  net_charge      numeric DEFAULT 0,
  service_type    text,
  shipment_date   date,
  rated_weight    numeric,
  pieces          integer,
  recipient_state text,
  recipient_zip   text,
  created_at      timestamptz DEFAULT now(),
  PRIMARY KEY (invoice_number, tracking_id)
);

CREATE INDEX IF NOT EXISTS idx_freight_invoices_order ON freight_invoices (order_ref);
CREATE INDEX IF NOT EXISTS idx_freight_invoices_date  ON freight_invoices (invoice_date);

-- Verify
SELECT 'freight_shipments' AS t, COUNT(*) FROM freight_shipments
UNION ALL
SELECT 'freight_invoices', COUNT(*) FROM freight_invoices;
