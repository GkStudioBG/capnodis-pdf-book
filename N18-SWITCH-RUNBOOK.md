# Превключване към Н-18 и новия Stripe акаунт

Всичко по-долу е подготвено локално. Нищо не е deploy-нато и сайтът работи
както досега. Превключването се прави **след като НАП даде уникалния номер на
електронния магазин**.

## Какво е подготвено

| Част | Файл | Какво прави |
|---|---|---|
| База данни | `migrations/20261006120000_n18-sale-documents.sql` | Брояч за 10-разрядния номер (общ за Almendro и Frutales), неизменяема таблица `n18_documents`, таблица `n18_refunds`, функция `n18_issue_document` (атомарна и идемпотентна) |
| Документ за клиента | `functions/n18-document.ts` | Страница с документа по чл. 52о: продавач, номер, поръчка, трансакция, данъчна група Б (20%), основа/ДДС/общо, начин на плащане, QR код по Приложение № 18а |
| Доставка Almendro | `functions/stripe-order-handler.ts` | Издава документ преди имейла и добавя линк към него; търси сесията първо в новия акаунт, после в стария |
| Доставка Frutales | `functions/frutales-delivery.ts` | Същото за Frutales (кодът е изтеглен от deploy-натата версия и разширен) |
| Месечен XML | `n18-generator/export_month.py` + `capnodis.config.json` | Чете документите за месеца и генерира XML по официалната XSD (Приложение № 38) |
| Stripe продукти | `scripts/stripe-capnodis-setup.mjs` | Създава 2 продукта, цени (19,90 € с ДДС), 2 Payment Link-а и тестов промокод в новия акаунт |

Документите се издават **само когато е зададен секретът `N18_SHOP_NUMBER`**.
Без него функциите работят точно както преди.

ДДС: българско, 20%, данъчна група Б. Цената 19,90 € е с ДДС:
основа 16,58 € + ДДС 3,32 €. При промокод сумата се изчислява от реално платеното.
Поръчки с 0 € (100% промокод) не получават документ, защото няма плащане с карта.

## Стъпки

### Днес (без да се променя сайтът)

1. В Stripe → акаунт **Capnodis** → Developers → API keys: създай **Secret key**.
   Запиши го като InsForge секрет (не го поставяй в чат):
   ```
   npx @insforge/cli secrets add STRIPE_CAPNODIS_SECRET_KEY <ключът>
   ```
2. Създай продуктите и линковете в новия акаунт:
   ```
   STRIPE_CAPNODIS_SECRET_KEY=<ключът> node scripts/stripe-capnodis-setup.mjs
   ```
   Добави получените `payment_link`, `price` и `product` ID-та в:
   - `functions/stripe-order-handler.ts` → `CAPNODIS_PAYMENT_LINKS`
   - `functions/frutales-delivery.ts` → `LINKS`, `PRICES`, `PRODUCTS`
3. Приложи миграцията (само създава нови таблици; не засяга текущите):
   ```
   npx @insforge/cli db import migrations/20261006120000_n18-sale-documents.sql
   ```
4. Deploy на функциите. Безопасно е: без `N18_SHOP_NUMBER` не се издават документи,
   а без линковете на сайта няма плащания в новия акаунт.
   ```
   npx @insforge/cli functions deploy n18-document --file functions/n18-document.ts
   npx @insforge/cli functions deploy stripe-order-handler --file functions/stripe-order-handler.ts
   npx @insforge/cli functions deploy frutales-delivery --file functions/frutales-delivery.ts
   ```

### Когато НАП даде номера

5. Webhooks в акаунта **Capnodis** (Developers → Webhooks), събитие `checkout.session.completed`:
   - `https://je8fwbkk.eu-central.insforge.app/functions/stripe-order-handler`
   - `https://je8fwbkk.eu-central.insforge.app/functions/frutales-delivery?action=webhook`
     (+ `checkout.session.async_payment_succeeded`). Signing secret-ът му → секрет
     `FRUTALES_STRIPE_WEBHOOK_SECRET_CAPNODIS`.
6. Секрет с номера от НАП:
   ```
   npx @insforge/cli secrets add N18_SHOP_NUMBER <номерът>
   ```
   и същият номер в `n18-generator/capnodis.config.json` → `header.e_shop_n`.
7. Смени линковете на сайта към новите Payment Link URL-и:
   `script.js` (`checkoutUrl`), `index.html` (`.button-primary`) и страницата `/frutales/`.
8. Тест с промокод `TEST100CAP` (доставката) и една реална покупка с карта (документът).
   Провери: имейл с PDF + „Documento de venta Nº 0000000001“, страницата на документа, QR кода.
9. Деактивирай старите Payment Link-ове в акаунта INFINITY CREATIVE LTD.

### Всеки месец (до 15-о число)

```
python n18-generator/export_month.py 2026-11
```
Резултатът е `n18-generator/out/N18_2026-11.xml`, валидиран срещу официалната XSD.
Счетоводителят го подава в НАП.

При връщане на сума: ред в `n18_refunds` (номер на поръчката, сума, дата, начин 2 = по карта),
за да влезе в раздела за върнати поръчки в XML-а.
