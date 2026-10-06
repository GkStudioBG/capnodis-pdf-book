-- Наредба Н-18, чл. 52о: документ за регистриране на продажбата за capnodis.com.
-- Един общ брояч за целия магазин (Almendro + Frutales), 10-разряден номер,
-- нараства със стъпка 1. Документите са неизменяеми след издаване.

CREATE TABLE IF NOT EXISTS n18_counter (
  id smallint PRIMARY KEY CHECK (id = 1),
  last_doc_number bigint NOT NULL CHECK (last_doc_number >= 0 AND last_doc_number < 10000000000)
);
INSERT INTO n18_counter (id, last_doc_number) VALUES (1, 0) ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS n18_documents (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  doc_number       bigint NOT NULL UNIQUE CHECK (doc_number BETWEEN 1 AND 9999999999),
  doc_number_text  text GENERATED ALWAYS AS (lpad(doc_number::text, 10, '0')) STORED,
  issued_at        timestamptz NOT NULL DEFAULT now(),
  source           text NOT NULL CHECK (source IN ('almendro', 'frutales')),
  e_shop_number    text NOT NULL CHECK (length(e_shop_number) BETWEEN 1 AND 10),
  stripe_account   text,
  order_number     text NOT NULL UNIQUE,          -- уникален номер на клиентската поръчка (Stripe Checkout Session ID)
  transaction_ref  text NOT NULL,                 -- референтен номер на финансовата трансакция (Stripe PaymentIntent ID)
  payment_method   text NOT NULL,
  product_name     text NOT NULL,
  quantity         numeric(10,2) NOT NULL CHECK (quantity > 0),
  vat_rate         integer NOT NULL CHECK (vat_rate BETWEEN 0 AND 100),
  tax_group        text NOT NULL,
  currency         text NOT NULL,
  subtotal_gross   numeric(12,2) NOT NULL,        -- преди отстъпка, с ДДС
  unit_price_net   numeric(12,2) NOT NULL,        -- единична цена без ДДС, без отстъпка
  subtotal_net     numeric(12,2) NOT NULL,        -- ord_total1
  discount_net     numeric(12,2) NOT NULL,        -- ord_disc
  vat_amount       numeric(12,2) NOT NULL,        -- ord_vat
  total_gross      numeric(12,2) NOT NULL CHECK (total_gross > 0), -- ord_total2
  customer_email   text,
  qr_payload       text NOT NULL,
  view_token       text NOT NULL UNIQUE,
  CHECK (subtotal_net - discount_net + vat_amount = total_gross)
);

CREATE INDEX IF NOT EXISTS n18_documents_issued_at_idx ON n18_documents (issued_at);

-- Неизменяемост: издаден документ не се променя и не се изтрива.
CREATE OR REPLACE FUNCTION n18_documents_immutable() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'n18_documents are immutable (%)', TG_OP;
END $$;

DROP TRIGGER IF EXISTS n18_documents_no_change ON n18_documents;
CREATE TRIGGER n18_documents_no_change
  BEFORE UPDATE OR DELETE ON n18_documents
  FOR EACH ROW EXECUTE FUNCTION n18_documents_immutable();

-- Върнати суми (сторно) за раздел rorder на месечния XML.
CREATE TABLE IF NOT EXISTS n18_refunds (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number    text NOT NULL REFERENCES n18_documents (order_number),
  amount          numeric(12,2) NOT NULL CHECK (amount > 0),
  refunded_on     date NOT NULL,
  refund_method   integer NOT NULL CHECK (refund_method BETWEEN 1 AND 4), -- 2 = по карта
  stripe_refund_id text UNIQUE,
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- Издава документ атомарно и идемпотентно (повторно извикване за същата
-- поръчка връща вече издадения документ). Номерът и документът се записват в
-- една транзакция, затова при грешка няма „изгубен“ номер.
CREATE OR REPLACE FUNCTION n18_issue_document(
  p_source text,
  p_e_shop_number text,
  p_stripe_account text,
  p_order_number text,
  p_transaction_ref text,
  p_payment_method text,
  p_product_name text,
  p_quantity numeric,
  p_currency text,
  p_subtotal_gross numeric,
  p_total_gross numeric,
  p_vat_rate integer,
  p_tax_group text,
  p_customer_email text
) RETURNS n18_documents
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  doc n18_documents;
  next_number bigint;
  divisor numeric := 1 + p_vat_rate / 100.0;
  v_subtotal_net numeric(12,2) := round(p_subtotal_gross / divisor, 2);
  v_total_net numeric(12,2) := round(p_total_gross / divisor, 2);
  v_issued timestamptz := now();
  v_local timestamp := v_issued AT TIME ZONE 'Europe/Sofia';
BEGIN
  SELECT * INTO doc FROM n18_documents WHERE order_number = p_order_number;
  IF FOUND THEN RETURN doc; END IF;

  IF coalesce(p_e_shop_number, '') = '' THEN RAISE EXCEPTION 'e_shop_number required'; END IF;
  IF coalesce(p_transaction_ref, '') = '' THEN RAISE EXCEPTION 'transaction_ref required'; END IF;
  IF p_total_gross <= 0 OR p_subtotal_gross < p_total_gross THEN RAISE EXCEPTION 'invalid amounts'; END IF;

  UPDATE n18_counter SET last_doc_number = last_doc_number + 1 WHERE id = 1
    RETURNING last_doc_number INTO next_number;

  INSERT INTO n18_documents (
    doc_number, issued_at, source, e_shop_number, stripe_account, order_number, transaction_ref,
    payment_method, product_name, quantity, vat_rate, tax_group, currency,
    subtotal_gross, unit_price_net, subtotal_net, discount_net, vat_amount, total_gross,
    customer_email, qr_payload, view_token
  ) VALUES (
    next_number, v_issued, p_source, p_e_shop_number, p_stripe_account, p_order_number, p_transaction_ref,
    p_payment_method, p_product_name, p_quantity, p_vat_rate, p_tax_group, upper(p_currency),
    p_subtotal_gross, round(v_subtotal_net / p_quantity, 2), v_subtotal_net, v_subtotal_net - v_total_net,
    p_total_gross - v_total_net, p_total_gross,
    p_customer_email,
    -- Приложение № 18а, софтуер по чл. 52т:
    -- <номер на магазина>*<номер на поръчката>*<реф. номер на трансакцията>*<ГГГГ-ММ-ДД>*<ЧЧ:ММ:СС>*<сума>
    p_e_shop_number || '*' || p_order_number || '*' || p_transaction_ref || '*' ||
      to_char(v_local, 'YYYY-MM-DD') || '*' || to_char(v_local, 'HH24:MI:SS') || '*' ||
      to_char(p_total_gross, 'FM999999990.00'),
    replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '')
  ) RETURNING * INTO doc;

  RETURN doc;
END $$;

REVOKE ALL ON FUNCTION n18_issue_document(text, text, text, text, text, text, text, numeric, text, numeric, numeric, integer, text, text) FROM PUBLIC;

-- ENABLE без FORCE: anon няма достъп, admin ключът на edge функциите има (виж 20260530111706_fix-rls-force.sql).
ALTER TABLE n18_counter ENABLE ROW LEVEL SECURITY;
ALTER TABLE n18_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE n18_refunds ENABLE ROW LEVEL SECURITY;
