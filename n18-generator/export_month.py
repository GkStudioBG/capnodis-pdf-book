"""Exports one month of issued N-18 sale documents from InsForge and builds the
monthly audit XML (Приложение № 38) with n18.py.

    python n18-generator/export_month.py 2026-11

Writes n18-generator/out/N18_<YYYY-MM>.input.json and N18_<YYYY-MM>.xml.
Nothing is submitted to НАП.
"""
import argparse
import json
from datetime import date
from pathlib import Path
import re
import shutil
import subprocess
import sys

import n18

HERE = Path(__file__).resolve().parent
CONFIG = HERE / 'capnodis.config.json'

DOCS_SQL = """
SELECT doc_number, order_number, transaction_ref, product_name, quantity, vat_rate,
       unit_price_net, subtotal_net, discount_net, vat_amount, total_gross, currency,
       stripe_account,
       to_char(issued_at AT TIME ZONE 'Europe/Sofia', 'YYYY-MM-DD') AS issued_on
FROM n18_documents
WHERE issued_at >= (timestamp '{start}' AT TIME ZONE 'Europe/Sofia')
  AND issued_at <  (timestamp '{end}' AT TIME ZONE 'Europe/Sofia')
ORDER BY doc_number
"""

REFUNDS_SQL = """
SELECT order_number, amount, to_char(refunded_on, 'YYYY-MM-DD') AS refunded_on, refund_method
FROM n18_refunds
WHERE refunded_on >= date '{start}' AND refunded_on < date '{end}'
ORDER BY refunded_on, order_number
"""


def query(sql):
    npx = shutil.which('npx') or shutil.which('npx.cmd')
    if not npx:
        raise RuntimeError('npx not found')
    result = subprocess.run([npx, '@insforge/cli', '--json', 'db', 'query', sql],
                            capture_output=True, text=True, encoding='utf-8', cwd=HERE.parent)
    if result.returncode != 0:
        raise RuntimeError(f'db query failed: {result.stderr.strip() or result.stdout.strip()}')
    return json.loads(result.stdout)['rows']


def money(value):
    return f'{float(value):.2f}'


def build_input(month, docs, refunds, config):
    year, mon = month.split('-')
    data = {
        'header': {**config['header'], 'creation_date': date.today().isoformat(), 'mon': mon, 'god': year},
        'approvals': config['approvals'],
        'orders': [],
        'refunds': [],
    }
    for d in docs:
        data['orders'].append({
            'ord_n': d['order_number'],
            'ord_d': d['issued_on'],
            'doc_n': str(d['doc_number']),
            'doc_date': d['issued_on'],
            'delivery_date': d['issued_on'],
            'currency': d['currency'],
            'ord_total1': money(d['subtotal_net']),
            'ord_disc': money(d['discount_net']),
            'ord_vat': money(d['vat_amount']),
            'ord_total2': money(d['total_gross']),
            'paym': config['paym'],
            'trans_n': d['transaction_ref'],
            'proc_id': d['stripe_account'] or config['proc_id'],
            'articles': [{
                'art_name': d['product_name'],
                'art_quant': money(d['quantity']),
                'art_price': money(d['unit_price_net']),
                'art_vat_rate': str(d['vat_rate']),
                'art_vat': money(d['vat_amount']),
                'art_sum': money(d['total_gross']),
            }],
        })
    for r in refunds:
        data['refunds'].append({
            'r_ord_n': r['order_number'],
            'r_amount': money(r['amount']),
            'r_date': r['refunded_on'],
            'r_paym': str(r['refund_method']),
        })
    return data


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('month', help='YYYY-MM')
    args = parser.parse_args(argv)
    if not re.fullmatch(r'\d{4}-(0[1-9]|1[0-2])', args.month):
        print('Month must be YYYY-MM', file=sys.stderr)
        return 1
    year, mon = map(int, args.month.split('-'))
    start = date(year, mon, 1)
    end = date(year + (mon == 12), mon % 12 + 1, 1)

    config = json.loads(CONFIG.read_text(encoding='utf-8'))
    docs = query(DOCS_SQL.format(start=start, end=end))
    refunds = query(REFUNDS_SQL.format(start=start, end=end))
    data = build_input(args.month, docs, refunds, config)

    out = HERE / 'out'
    out.mkdir(exist_ok=True)
    input_path = out / f'N18_{args.month}.input.json'
    xml_path = out / f'N18_{args.month}.xml'
    input_path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(f'{len(docs)} document(s), {len(refunds)} refund(s) -> {input_path}')
    if xml_path.exists():
        print(f'Output already exists, not overwriting: {xml_path}', file=sys.stderr)
        return 1
    return n18.main(['generate', '--input', str(input_path), '--output', str(xml_path)])


if __name__ == '__main__':
    sys.exit(main())
