"""Local, fail-closed generator for the supplied NRA dec_audit.xsd.

No backend access, numbering, tax selection, currency conversion or submission.
"""
import argparse
import copy
import csv
from datetime import date
from decimal import Decimal, InvalidOperation
import hashlib
import json
from pathlib import Path
import re
import sys

from lxml import etree

XSD = Path(__file__).resolve().parent.parent / 'NRA_REFERENCE/official_xsd_xml/XSD_XML/dec_audit.xsd'
HEADER = ('eik', 'e_shop_n', 'domain_name', 'e_shop_type', 'creation_date', 'mon', 'god')
APPROVALS = ('reporting_currency', 'currency_policy_reference', 'tax_policy_reference',
             'document_numbering_reference', 'scope_reference', 'refund_review_reference')
ORDER = ('ord_n', 'ord_d', 'doc_n', 'doc_date', 'ord_total1', 'ord_disc', 'ord_vat', 'ord_total2', 'paym')
OPTIONAL = ('pos_n', 'trans_n', 'proc_id')
ARTICLE = ('art_name', 'art_quant', 'art_price', 'art_vat_rate', 'art_vat', 'art_sum')
REFUND = ('r_ord_n', 'r_amount', 'r_date', 'r_paym')
MONEY = {'ord_total1', 'ord_disc', 'ord_vat', 'ord_total2', 'art_quant', 'art_price', 'art_vat', 'art_sum', 'r_amount'}
INTEGER = {'e_shop_type', 'god', 'doc_n', 'paym', 'art_vat_rate', 'r_paym'}
DATES = {'creation_date', 'ord_d', 'doc_date', 'delivery_date', 'r_date'}


def load_json(path):
    with Path(path).open(encoding='utf-8-sig') as f:
        value = json.load(f, parse_float=Decimal)
    if not isinstance(value, dict):
        raise ValueError('Input/config must be a JSON object')
    return value


def load_input(path, config=None):
    if path is None:
        return load_json(config) if config else {}
    if Path(path).suffix.lower() == '.json':
        if config:
            raise ValueError('--config is only supported for CSV input')
        return load_json(path)
    if Path(path).suffix.lower() != '.csv':
        raise ValueError('Input must be .json or .csv')
    if not config:
        raise ValueError('CSV requires --config with header, approvals and reviewed refunds')
    data = load_json(config)
    if 'orders' in data:
        raise ValueError('CSV config must not also contain orders')
    grouped = {}
    with Path(path).open(encoding='utf-8-sig', newline='') as f:
        reader = csv.DictReader(f)
        if not reader.fieldnames or len(set(reader.fieldnames)) != len(reader.fieldnames):
            raise ValueError('CSV requires unique column names')
        for number, raw in enumerate(reader, start=2):
            if None in raw:
                raise ValueError(f'CSV row {number}: too many columns; quote decimal commas')
            row = {k: v.strip() if isinstance(v, str) else v for k, v in raw.items()}
            key = row.get('ord_n')
            if not key:
                raise ValueError(f'CSV row {number}: ord_n is required')
            order = {k: row[k] for k in (*ORDER, *OPTIONAL, 'delivery_date', 'currency') if k in row and row[k] != ''}
            article = {k: row[k] for k in ARTICLE if k in row}
            if key not in grouped:
                grouped[key] = {**order, 'articles': []}
            elif order != {k: v for k, v in grouped[key].items() if k != 'articles'}:
                raise ValueError(f'CSV row {number}: conflicting repeated order fields for {key}')
            grouped[key]['articles'].append(article)
    data['orders'] = list(grouped.values())
    return data


def normalize(data):
    """Normalize lexical forms, never derive financial or identity values."""
    issues = {}
    def visit(value, path='', key=''):
        if isinstance(value, dict):
            return {k: visit(v, f'{path}.{k}' if path else k, k) for k, v in value.items()}
        if isinstance(value, list):
            return [visit(v, f'{path}[{i}]') for i, v in enumerate(value)]
        if value is None or value == '':
            return value
        text = str(value).strip()
        if key in MONEY:
            try:
                if not re.fullmatch(r'[+-]?\d+(?:[.,]\d+)?', text):
                    raise InvalidOperation
                amount = Decimal(text.replace(',', '.'))
                if not amount.is_finite() or amount < 0 or amount != amount.quantize(Decimal('.01')):
                    raise InvalidOperation
                return format(amount, '.2f')
            except InvalidOperation:
                issues[path] = 'must be a nonnegative decimal with at most two fractional digits; no rounding'
        elif key in INTEGER:
            if not re.fullmatch(r'\d+', text):
                issues[path] = 'must be a supplied nonnegative integer'
            else:
                return str(int(text))
        elif key in DATES:
            try:
                if not re.fullmatch(r'\d{4}-\d{2}-\d{2}', text):
                    raise ValueError
                date.fromisoformat(text)
            except ValueError:
                issues[path] = 'must be a supplied ISO calendar date YYYY-MM-DD'
        return text
    return visit(data), issues


def review(data):
    data, issues = normalize(data)
    def required(obj, keys, path):
        if not isinstance(obj, dict):
            issues[path] = 'must be an object'
            obj = {}
        for key in keys:
            if obj.get(key) is None or obj.get(key) == '':
                issues[f'{path}.{key}'] = 'required supplied value; no default'
        return obj
    header = required(data.get('header'), HEADER, 'header')
    approvals = required(data.get('approvals'), APPROVALS, 'approvals')
    currency = approvals.get('reporting_currency')
    if currency and not re.fullmatch(r'[A-Z]{3}', currency):
        issues['approvals.reporting_currency'] = 'must be an explicitly approved uppercase currency code'
    period = f"{header.get('god')}-{header.get('mon')}"
    orders = data.get('orders')
    if not isinstance(orders, list) or not orders:
        issues['orders'] = 'at least one supplied delivered order required by this XSD; empty periods need separate guidance'
        orders = []
    ids, documents = set(), set()
    for i, value in enumerate(orders):
        path = f'orders[{i}]'
        order = required(value, (*ORDER, 'delivery_date', 'articles'), path)
        for key, seen in [('ord_n', ids), ('doc_n', documents)]:
            if order.get(key) in seen:
                issues[f'{path}.{key}'] = 'duplicate supplied identifier'
            seen.add(order.get(key))
        if order.get('doc_n') == '0':
            issues[f'{path}.doc_n'] = 'official document number must be positive'
        if order.get('delivery_date') and not order['delivery_date'].startswith(period + '-'):
            issues[f'{path}.delivery_date'] = 'delivery must belong to the explicitly selected reporting month'
        if order.get('currency') and order['currency'] != currency:
            issues[f'{path}.currency'] = 'amounts must already be in approved reporting currency; conversion is unsupported'
        articles = order.get('articles')
        if not isinstance(articles, list) or not articles:
            issues[f'{path}.articles'] = 'at least one supplied article required'
            articles = []
        for j, article in enumerate(articles):
            required(article, ARTICLE, f'{path}.articles[{j}]')
            if isinstance(article, dict) and article.get('art_quant') == '0.00':
                issues[f'{path}.articles[{j}].art_quant'] = 'delivered quantity must be positive'
        if not any(k.startswith(path + '.') for k in issues):
            d = lambda k: Decimal(order[k])
            if d('ord_total1') - d('ord_disc') + d('ord_vat') != d('ord_total2'):
                issues[f'{path}.ord_total2'] = 'total mismatch: ord_total1 - ord_disc + ord_vat must equal ord_total2'
            if sum(Decimal(a['art_sum']) for a in articles) != d('ord_total2'):
                issues[f'{path}.articles'] = 'article totals must equal supplied order total with VAT'
            if sum(Decimal(a['art_vat']) for a in articles) != d('ord_vat'):
                issues[f'{path}.ord_vat'] = 'article VAT totals must equal supplied order VAT'
            base = sum(Decimal(a['art_quant']) * Decimal(a['art_price']) for a in articles)
            if abs(base - d('ord_total1')) > Decimal('.01'):
                issues[f'{path}.ord_total1'] = 'unit prices times quantities must reconcile to undiscounted order total within 0.01'
    refunds = data.get('refunds')
    if not isinstance(refunds, list):
        issues['refunds'] = 'supply reviewed refund list, explicitly [] when none'
        refunds = []
    for i, value in enumerate(refunds):
        path = f'refunds[{i}]'
        refund = required(value, REFUND, path)
        if refund.get('r_date') and not refund['r_date'].startswith(period + '-'):
            issues[f'{path}.r_date'] = 'refund date must belong to reporting month'
    # XSD supplies exact names, nesting, lengths, enumerations and date/number constraints.
    if not issues:
        xml = build_xml(data)
        schema = etree.XMLSchema(etree.parse(str(XSD), secure_parser()))
        if not schema.validate(xml):
            for i, error in enumerate(schema.error_log):
                issues[f'xsd[{i}]'] = error.message
    return data, issues


def secure_parser():
    return etree.XMLParser(resolve_entities=False, no_network=True, load_dtd=False)


def build_xml(data):
    root = etree.Element('audit')
    def fields(parent, obj, names):
        for name in names:
            if name in obj and obj[name] is not None and obj[name] != '':
                etree.SubElement(parent, name).text = str(obj[name])
    fields(root, data['header'], HEADER)
    orders = etree.SubElement(root, 'order')
    for order in data['orders']:
        node = etree.SubElement(orders, 'orderenum')
        fields(node, order, ORDER[:4])
        articles = etree.SubElement(node, 'art')
        for article in order['articles']:
            fields(etree.SubElement(articles, 'artenum'), article, ARTICLE)
        fields(node, order, (*ORDER[4:], *OPTIONAL))
    refunds = data['refunds']
    etree.SubElement(root, 'r_ord').text = str(len({r['r_ord_n'] for r in refunds}))
    if refunds:
        returns = etree.SubElement(root, 'rorder')
        for refund in refunds:
            fields(etree.SubElement(returns, 'rorderenum'), refund, REFUND)
    etree.SubElement(root, 'r_total').text = format(sum((Decimal(r['r_amount']) for r in refunds), Decimal('0')), '.2f')
    return root


def template(data):
    result = copy.deepcopy(data)
    for name, keys in [('header', HEADER), ('approvals', APPROVALS)]:
        if not isinstance(result.get(name), dict):
            result[name] = {}
        for key in keys:
            result[name].setdefault(key, None)
    result.setdefault('orders', [])
    result.setdefault('refunds', None)
    for order in result['orders'] if isinstance(result['orders'], list) else []:
        if isinstance(order, dict):
            for key in (*ORDER, 'delivery_date'):
                order.setdefault(key, None)
            order.setdefault('articles', [])
            for article in order['articles'] if isinstance(order['articles'], list) else []:
                if isinstance(article, dict):
                    for key in ARTICLE:
                        article.setdefault(key, None)
    return result


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('command', choices=('prepare', 'generate', 'validate'))
    parser.add_argument('--input', type=Path)
    parser.add_argument('--config', type=Path)
    parser.add_argument('--output', type=Path)
    args = parser.parse_args(argv)
    try:
        if args.command == 'validate':
            if not args.input or args.config or args.output:
                raise ValueError('validate requires --input XML and no config/output')
            doc = etree.parse(str(args.input), secure_parser())
            if doc.docinfo.doctype:
                raise ValueError('DOCTYPE is not supported')
            etree.XMLSchema(etree.parse(str(XSD), secure_parser())).assertValid(doc)
            print('XSD valid only; accounting correctness and submission acceptance are not established.')
            return 0
        if not args.output:
            raise ValueError('--output is required')
        if args.output.exists():
            raise ValueError(f'Output already exists; choose a new path: {args.output}')
        if args.command == 'generate' and not args.input:
            raise ValueError('generate requires --input')
        data, issues = review(load_input(args.input, args.config))
        if args.command == 'prepare':
            payload = {'status': 'blocked' if issues else 'ready_for_local_generation',
                       'issues': issues, 'input': template(data),
                       'schema': {'path': str(XSD), 'sha256': hashlib.sha256(XSD.read_bytes()).hexdigest()},
                       'note': 'No XML generated. Old XSD monetary documentation says BGN; accountant must confirm reporting currency/policy.'}
            with args.output.open('x', encoding='utf-8') as f:
                json.dump(payload, f, ensure_ascii=False, indent=2, default=str)
                f.write('\n')
            print(f'Prepared review report: {args.output}; {len(issues)} blocking issue(s).')
            return 0
        if issues:
            print(json.dumps({'status': 'blocked', 'issues': issues}, ensure_ascii=True, indent=2), file=sys.stderr)
            return 1
        payload = etree.tostring(build_xml(data), encoding='UTF-8', xml_declaration=True, pretty_print=True)
        # Validate the serialized bytes too, before opening any output file.
        etree.XMLSchema(etree.parse(str(XSD), secure_parser())).assertValid(etree.fromstring(payload, secure_parser()))
        with args.output.open('xb') as f:
            f.write(payload)
        print(f'Generated local XSD-validated XML: {args.output}. Not submitted.')
        return 0
    except (ValueError, OSError, etree.LxmlError, InvalidOperation, TypeError, KeyError) as error:
        print(f'Blocked: {error}', file=sys.stderr)
        return 1


if __name__ == '__main__':
    sys.exit(main())
